/**
 * Kebijakan tanda tangan di perangkat pengguna (SIGNING_MODE=client).
 *
 * Backend mengirim pesan Fabric utuh untuk ditandatangani. Supaya perangkat
 * tidak menjadi "mesin tanda tangan buta" bagi backend yang dibobol, pesan
 * dibaca dulu di sini:
 *   - proposal fungsi baca (daftar, detail, audit)      => ditandatangani
 *   - proposal fungsi tulis (buka, daftar, revisi, ...) => hanya jika cocok dengan
 *     "niat" yang didaftarkan halaman saat user menekan tombol (fungsi + argumen,
 *     termasuk hash file yang dihitung di perangkat)
 *   - envelope transaksi / cek status commit            => hanya untuk txId yang
 *     proposalnya sudah disetujui di atas
 *   - selain itu                                        => ditolak
 *
 * Modul ini murni (tanpa DOM/storage) supaya bisa diuji dari Node.
 */

export const READ_FNS = new Set([
  'ListDocuments',
  'ListDocumentsPage',
  'GetDocument',
  'GetAuditTrail',
  'GetAllAuditLogs',
  'GetAllAuditLogsPage',
  'GetDocumentHistory',
]);

export interface Call {
  channel: string;
  txId: string;
  chaincode: string;
  fn: string;
  args: string[];
}

/** Niat user. `null` pada args = nilai apa pun (mis. docId yang dibuat server). */
export interface Intent {
  fn: string;
  args: (string | null)[];
  exp: number;
}

export interface Approved {
  fn: string;
  args: string[];
  exp: number;
}

export interface SignState {
  intents: Intent[];
  approved: Record<string, Approved>;
}

export interface Decision {
  ok: boolean;
  reason: string;
  state: SignState;
}

export const INTENT_TTL_MS = 2 * 60_000;
const APPROVED_TTL_MS = 10 * 60_000;
const ENDORSER_TRANSACTION = 3;
const HEX64 = /^[a-f0-9]{64}$/;

// --------------------------------------------------------------- protobuf

class Refuse extends Error {}

type Value = Uint8Array | bigint;
type Fields = Map<number, Value[]>;

/** Pembaca protobuf minimal. null = bukan protobuf yang sah (parser Fabric juga akan gagal). */
function parse(buf: Uint8Array): Fields | null {
  const out: Fields = new Map();
  let i = 0;
  const varint = (): bigint | null => {
    let v = 0n;
    for (let shift = 0n, n = 0; n < 10; n++, shift += 7n) {
      if (i >= buf.length) return null;
      const b = buf[i++];
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
    }
    return null;
  };
  const skipGroup = (field: number): boolean => {
    for (;;) {
      const tag = varint();
      if (tag === null) return false;
      const f = Number(tag >> 3n);
      const wt = Number(tag & 7n);
      if (wt === 4) return f === field;
      if (!skip(f, wt)) return false;
    }
  };
  const skip = (field: number, wt: number): boolean => {
    if (wt === 0) return varint() !== null;
    if (wt === 1) return (i += 8) <= buf.length;
    if (wt === 5) return (i += 4) <= buf.length;
    if (wt === 2) {
      const len = varint();
      return len !== null && (i += Number(len)) <= buf.length;
    }
    if (wt === 3) return skipGroup(field);
    return false;
  };
  while (i < buf.length) {
    const tag = varint();
    if (tag === null) return null;
    const field = Number(tag >> 3n);
    const wt = Number(tag & 7n);
    if (field === 0) return null;
    let v: Value | undefined;
    if (wt === 0) {
      const n = varint();
      if (n === null) return null;
      v = n;
    } else if (wt === 2) {
      const len = varint();
      if (len === null || i + Number(len) > buf.length) return null;
      v = buf.subarray(i, i + Number(len));
      i += Number(len);
    } else if (!skip(field, wt)) {
      return null;
    }
    if (v !== undefined) {
      const list = out.get(field);
      if (list) list.push(v);
      else out.set(field, [v]);
    }
  }
  return out;
}

/**
 * Field tunggal bertipe bytes/message. Muncul lebih dari sekali => tolak:
 * parser Go menggabungkan (merge) kemunculan ganda, jadi hasil bacaan kita
 * bisa berbeda dari yang dilihat peer.
 */
function one(f: Fields, n: number): Uint8Array | undefined {
  const v = (f.get(n) ?? []).filter((x): x is Uint8Array => x instanceof Uint8Array);
  if (v.length > 1) throw new Refuse(`field ${n} muncul lebih dari sekali`);
  return v[0];
}

function sub(f: Fields | null | undefined, n: number): Fields | null {
  if (!f) return null;
  const b = one(f, n);
  return b ? parse(b) : null;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
function str(b: Uint8Array | undefined): string {
  if (!b) return '';
  try {
    return utf8.decode(b);
  } catch {
    throw new Refuse('teks bukan UTF-8 yang sah');
  }
}

// ----------------------------------------------------------------- decode

/** ChaincodeProposalPayload -> pemanggilan chaincode (nama, fungsi, argumen). */
function callFromProposalPayload(cpp: Fields | null): Pick<Call, 'chaincode' | 'fn' | 'args'> | null {
  const spec = sub(sub(cpp, 1), 1); // input (ChaincodeInvocationSpec) -> chaincode_spec
  if (!spec) return null;
  const ccid = sub(spec, 2);
  const input = sub(spec, 3);
  if (!ccid || !input) return null;
  const raw = (input.get(1) ?? []).filter((x): x is Uint8Array => x instanceof Uint8Array);
  if (!raw.length) return null;
  const [fn, ...args] = raw.map(str);
  return { chaincode: str(one(ccid, 2)), fn, args };
}

interface Header {
  type: number;
  channel: string;
  txId: string;
}

function header(top: Fields): Header | null {
  const ch = sub(sub(top, 1), 1); // header -> channel_header
  if (!ch) return null;
  const types = (ch.get(1) ?? []).filter((x): x is bigint => typeof x === 'bigint');
  return { type: Number(types[types.length - 1] ?? 0n), channel: str(one(ch, 4)), txId: str(one(ch, 5)) };
}

export type Decoded =
  | { kind: 'proposal'; call: Call }
  | { kind: 'envelope'; call: Call }
  | { kind: 'commit-status'; txId: string; channel: string };

/** Kenali pesan. Melempar kalau pesan tidak dikenali atau bisa ditafsirkan ganda. */
export function decode(message: Uint8Array): Decoded {
  const top = parse(message);
  if (!top) throw new Refuse('pesan bukan protobuf yang sah');

  // CommitStatusRequest { transaction_id=1, channel_id=2, identity=3 }
  const f1 = one(top, 1);
  if (f1 && f1.length === 64 && HEX64.test(str(f1))) {
    if ([...top.keys()].some((k) => k < 1 || k > 3)) throw new Refuse('field tak dikenal pada permintaan status commit');
    const channel = str(one(top, 2));
    if (!channel || !one(top, 3)) throw new Refuse('permintaan status commit tidak lengkap');
    return { kind: 'commit-status', txId: str(f1), channel };
  }

  // Proposal { header=1, payload=2 } dan Payload envelope { header=1, data=2 }
  const h = header(top);
  if (!h) throw new Refuse('pesan tanpa channel header');
  if (h.type !== ENDORSER_TRANSACTION) throw new Refuse(`tipe header ${h.type} tidak pernah ditandatangani`);
  if (!HEX64.test(h.txId) || !h.channel) throw new Refuse('txId/channel tidak sah');
  const body = sub(top, 2);

  // tafsiran 1: field 2 = ChaincodeProposalPayload (ini proposal)
  const asProposal = callFromProposalPayload(body);
  // tafsiran 2: field 2 = Transaction { actions=1 { header=1, payload=2 { chaincode_proposal_payload=1 } } }
  let asEnvelope: ReturnType<typeof callFromProposalPayload> = null;
  const actions = (body?.get(1) ?? []).filter((x): x is Uint8Array => x instanceof Uint8Array);
  if (actions.length === 1) asEnvelope = callFromProposalPayload(sub(sub(parse(actions[0]), 2), 1));

  if (asProposal && asEnvelope) throw new Refuse('pesan bisa ditafsirkan sebagai proposal maupun envelope');
  if (asProposal) return { kind: 'proposal', call: { channel: h.channel, txId: h.txId, ...asProposal } };
  if (asEnvelope) return { kind: 'envelope', call: { channel: h.channel, txId: h.txId, ...asEnvelope } };
  throw new Refuse('pesan tidak dikenali');
}

// ----------------------------------------------------------------- policy

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function matches(intent: Intent, call: Call) {
  return intent.fn === call.fn && intent.args.length === call.args.length && intent.args.every((a, i) => a === null || a === call.args[i]);
}

/** Putuskan apakah `message` boleh ditandatangani. Mengembalikan state baru (niat terpakai, txId disetujui). */
export function decide(message: Uint8Array, prev: SignState, now: number, chaincode: string): Decision {
  const state: SignState = {
    intents: prev.intents.filter((i) => i.exp > now),
    approved: Object.fromEntries(Object.entries(prev.approved).filter(([, a]) => a.exp > now)),
  };
  const no = (reason: string): Decision => ({ ok: false, reason, state });
  let d: Decoded;
  try {
    d = decode(message);
  } catch (e) {
    return no(e instanceof Refuse ? e.message : 'pesan tidak dapat dibaca');
  }

  if (d.kind === 'commit-status') {
    return state.approved[d.txId] ? { ok: true, reason: 'cek status transaksi yang disetujui', state } : no('status commit untuk transaksi yang tidak dikenal');
  }
  const { call } = d;
  if (call.chaincode !== chaincode) return no(`chaincode "${call.chaincode}" bukan "${chaincode}"`);

  if (d.kind === 'envelope') {
    const a = state.approved[call.txId];
    if (!a || a.fn !== call.fn || !same(a.args, call.args)) return no(`envelope ${call.fn} tidak sesuai proposal yang disetujui`);
    return { ok: true, reason: `kirim transaksi ${call.fn}`, state };
  }

  if (READ_FNS.has(call.fn)) return { ok: true, reason: `baca: ${call.fn}`, state };
  const idx = state.intents.findIndex((i) => matches(i, call));
  if (idx < 0) return no(`${call.fn}(${call.args.join(', ').slice(0, 120)}) tidak diminta dari perangkat ini`);
  state.intents.splice(idx, 1); // satu niat = satu transaksi
  state.approved[call.txId] = { fn: call.fn, args: call.args, exp: now + APPROVED_TTL_MS };
  return { ok: true, reason: `aksi: ${call.fn}`, state };
}
