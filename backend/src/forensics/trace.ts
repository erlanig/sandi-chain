import type { AuditLog } from '../documents/documents.service';

/**
 * Telusuri kebocoran: dari jejak yang tertinggal di salinan bocoran (txId pada watermark,
 * metadata PDF, atau NRP + dokumen) ke entri ACCESS_GRANTED di ledger, lalu ke rantai
 * akses dokumen itu. Murni: menerima jejak audit dan daftar personel, tanpa I/O.
 */

export interface PersonInfo {
  username: string;
  nama: string;
  nrp: string;
  jabatan: string;
  clearance: string;
  mspId: string;
}

export interface TraceQuery {
  txId?: string;
  nrp?: string;
  nama?: string;
  docId?: string;
}

export interface Reader {
  actor: string;
  actorOrg: string;
  jabatan: string;
  opens: number;
  last: string;
}

export interface TraceMatch {
  /** Entri ledger yang cocok. */
  access: AuditLog;
  /** true bila entri itu ACCESS_GRANTED, yaitu dokumen benar-benar tampil di layar orang tersebut. */
  isAccessGrant: boolean;
  person: PersonInfo | null;
  /** Disposisi yang memberi orang ini akses (jika ada). */
  grantedBy: AuditLog | null;
  /** Seluruh jejak dokumen, terurut naik menurut waktu. */
  custody: AuditLog[];
  /** Aktivitas orang ini pada dokumen tersebut. */
  suspectActivity: AuditLog[];
  /** Pembaca lain dokumen ini (tanpa orang tersebut), untuk menyingkirkan atau membandingkan. */
  otherReaders: Reader[];
}

export type TraceStatus = 'found' | 'ambiguous' | 'not_found' | 'bad_query';

export interface TraceResult {
  status: TraceStatus;
  message: string;
  matches: TraceMatch[];
}

export const MIN_TX_PREFIX = 8;
const MAX_MATCHES = 20;

const byTime = (a: AuditLog, b: AuditLog) => a.timestamp.localeCompare(b.timestamp);

/** Ambil jejak SANDI-Chain dari metadata PDF hasil render (judul, subjek, kata kunci). */
export function parseLeakMetadata(meta: { title?: string; subject?: string; keywords?: string }) {
  const hex = (meta.subject ?? '').match(/SANDI-Chain access ([0-9a-f]{8,64})/i)?.[1] ?? (meta.keywords ?? '').match(/\b[0-9a-f]{64}\b/i)?.[0];
  const docId = (meta.title ?? '').match(/DOC-\d{8}-[0-9A-F]{6}/i)?.[0];
  const nrp = (meta.keywords ?? '').split(/\s+/).find((t) => /^\d{6,}$/.test(t));
  return { txId: hex?.toLowerCase(), docId: docId?.toUpperCase(), nrp };
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

export function buildTrace(logs: AuditLog[], users: PersonInfo[], q: TraceQuery): TraceResult {
  const txId = norm(q.txId);
  const nrp = norm(q.nrp);
  const nama = norm(q.nama);
  const docId = (q.docId ?? '').trim().toUpperCase();

  let hits: AuditLog[] = [];

  if (txId) {
    if (!/^[0-9a-f]+$/.test(txId) || txId.length < MIN_TX_PREFIX) {
      return { status: 'bad_query', message: `txId harus heksadesimal, minimal ${MIN_TX_PREFIX} karakter (watermark menampilkan 16 karakter pertama).`, matches: [] };
    }
    hits = logs.filter((l) => l.txId.toLowerCase().startsWith(txId));
  } else if (nrp || nama) {
    const who = new Set(
      users
        .filter((u) => (nrp && u.nrp === q.nrp?.trim()) || (nama && (u.nama.toLowerCase().includes(nama) || u.username.toLowerCase().includes(nama))))
        .map((u) => u.username),
    );
    if (!who.size) return { status: 'not_found', message: 'Tidak ada personel dengan NRP atau nama itu.', matches: [] };
    hits = logs.filter((l) => l.action === 'ACCESS_GRANTED' && who.has(l.actor) && (!docId || l.docId === docId));
  } else {
    return { status: 'bad_query', message: 'Isi txId dari watermark, atau NRP/nama pembaca.', matches: [] };
  }

  if (!hits.length) {
    return {
      status: 'not_found',
      message: txId ? 'Tidak ada entri ledger dengan txId itu. Periksa penulisannya, atau salinan ini bukan berasal dari SANDI-Chain.' : 'Tidak ada akses yang cocok di ledger.',
      matches: [],
    };
  }

  const people = new Map(users.map((u) => [u.username, u]));
  const matches = hits
    .sort((a, b) => byTime(b, a))
    .slice(0, MAX_MATCHES)
    .map((access): TraceMatch => {
      const custody = logs.filter((l) => l.docId === access.docId).sort(byTime);
      const suspectActivity = custody.filter((l) => l.actor === access.actor);
      const grantedBy =
        [...custody].reverse().find((l) => l.action === 'DISPOSITION' && new RegExp(`kepada\\s+${escapeRe(access.actor)}\\b`).test(l.detail) && l.timestamp <= access.timestamp) ?? null;

      const readers = new Map<string, Reader>();
      for (const l of custody) {
        if (l.action !== 'ACCESS_GRANTED' || l.actor === access.actor) continue;
        const r = readers.get(l.actor) ?? { actor: l.actor, actorOrg: l.actorOrg, jabatan: l.jabatan, opens: 0, last: l.timestamp };
        r.opens++;
        if (l.timestamp > r.last) r.last = l.timestamp;
        readers.set(l.actor, r);
      }
      return {
        access,
        isAccessGrant: access.action === 'ACCESS_GRANTED',
        person: people.get(access.actor) ?? null,
        grantedBy,
        custody,
        suspectActivity,
        otherReaders: [...readers.values()].sort((a, b) => b.opens - a.opens),
      };
    });

  const grants = matches.filter((m) => m.isAccessGrant);
  if (txId && !grants.length) {
    return { status: 'found', message: 'Entri ditemukan, tetapi bukan akses yang berhasil: dokumen tidak pernah tampil lewat transaksi ini.', matches };
  }
  return matches.length === 1
    ? { status: 'found', message: 'Satu akses cocok. Pembaca teridentifikasi dari ledger.', matches }
    : { status: 'ambiguous', message: `${matches.length} akses cocok. Persempit dengan txId atau waktu pada watermark.`, matches };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
