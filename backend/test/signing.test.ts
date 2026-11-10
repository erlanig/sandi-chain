import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import * as grpc from '@grpc/grpc-js';
import { connect, hash } from '@hyperledger/fabric-gateway';
import { common, gateway, peer } from '@hyperledger/fabric-protos';
import { openCard, parseCard, signMessage } from '../../frontend/src/lib/card-crypto';
import { decide, decode, SignState } from '../../frontend/src/lib/sign-policy';
import { p1363ToDerLowS } from '../src/signing/ecdsa';
import { SignBroker, SignRefusedError } from '../src/signing/sign-broker';

const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

// Proposal asli dari Fabric Gateway (tanpa jaringan): pesan yang akan dilihat perangkat.
const client = new grpc.Client('localhost:1', grpc.credentials.createInsecure());
const gw = connect({
  client,
  identity: { mspId: 'Org1MSP', credentials: Buffer.from('cert') },
  signer: async () => new Uint8Array(),
  hash: hash.none,
});
function proposal(fn: string, args: string[], cc = 'sandichain') {
  const p = gw.getNetwork('ch-rahasia').getContract(cc).newProposal(fn, { arguments: args });
  return { bytes: p.getDigest(), txId: p.getTransactionId() };
}
/** Envelope transaksi (Payload) untuk proposal yang sama, seperti yang dihasilkan peer setelah endorse. */
function envelope(proposalBytes: Uint8Array, mutate?: (cpp: Uint8Array) => Uint8Array) {
  const prop = peer.Proposal.deserializeBinary(proposalBytes);
  const hdr = common.Header.deserializeBinary(prop.getHeader_asU8());
  const cap = new peer.ChaincodeActionPayload();
  cap.setChaincodeProposalPayload(mutate ? mutate(prop.getPayload_asU8()) : prop.getPayload_asU8());
  const action = new peer.TransactionAction();
  action.setHeader(hdr.getSignatureHeader_asU8());
  action.setPayload(cap.serializeBinary());
  const tx = new peer.Transaction();
  tx.addActions(action);
  const payload = new common.Payload();
  payload.setHeader(hdr);
  payload.setData(tx.serializeBinary());
  return payload.serializeBinary();
}
function commitStatus(txId: string) {
  const r = new gateway.CommitStatusRequest();
  r.setTransactionId(txId);
  r.setChannelId('ch-rahasia');
  r.setIdentity(Buffer.from('identity'));
  return r.serializeBinary();
}

const now = 1_000_000;
const empty = (): SignState => ({ intents: [], approved: {} });
const intent = (fn: string, args: (string | null)[]) => ({ fn, args, exp: now + 60_000 });
const H = 'a'.repeat(64);

test('ecdsa: r||s dari WebCrypto -> DER low-S yang sah', () => {
  const msg = Buffer.from('pesan fabric');
  for (let i = 0; i < 40; i++) {
    const raw = crypto.sign('sha256', msg, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    const der = p1363ToDerLowS(raw);
    assert.ok(crypto.verify('sha256', msg, publicKey, der), 'DER harus terverifikasi');
    const sLen = der[4 + der[3] + 1];
    const s = BigInt('0x' + Buffer.from(der.subarray(4 + der[3] + 2, 4 + der[3] + 2 + sLen)).toString('hex'));
    assert.ok(s <= N / 2n, 's harus rendah');
  }
  assert.throws(() => p1363ToDerLowS(new Uint8Array(63)));
  assert.throws(() => p1363ToDerLowS(new Uint8Array(64)));
});

test('kartu identitas: dibuat saat enroll, dibuka di perangkat, tanda tangan sah untuk Fabric', async () => {
  const { makeCard } = await esmImport(require('node:url').pathToFileURL(require.resolve('../scripts/card.mjs')).href);
  const keyPem = privateKey.export({ type: 'sec1', format: 'pem' }) as string;
  const card = parseCard(
    JSON.stringify(makeCard({ username: 'mayor.dewi', mspId: 'Org1MSP', certFp: 'f'.repeat(64), keyPem, pin: '123456', iterations: 100_000 })),
  );
  await assert.rejects(() => openCard(card, 'pin-salah'), /PIN salah/);
  const key = await openCard(card, '123456');
  assert.equal(key.extractable, false, 'kunci tidak boleh bisa diekspor');
  const { bytes } = proposal('GetDocument', ['DOC-1']);
  const raw = await signMessage(key, bytes);
  // Peer memverifikasi ECDSA atas SHA-256(pesan) dengan tanda tangan DER low-S.
  assert.ok(crypto.verify('sha256', bytes, publicKey, p1363ToDerLowS(raw)));
});

test('broker: permintaan sampai ke perangkat dan jawabannya kembali', async () => {
  const b = new SignBroker();
  const waiting = b.next('u', 1000); // perangkat sudah menunggu
  const sig = b.request('u', Buffer.from('m1'));
  const req = await waiting;
  assert.equal(Buffer.from(req!.message, 'base64').toString(), 'm1');
  assert.equal(await b.next('u', 10), null, 'tidak dikirim dua kali selama masih diproses');
  assert.equal(await b.next('lain', 10), null, 'user lain tidak menerima');
  b.complete('u', req!.id, new Uint8Array(64).fill(7));
  assert.equal((await sig)[0], 7);

  const sig2 = b.request('u', Buffer.from('m2'));
  const req2 = await b.next('u', 10);
  assert.throws(() => b.complete('lain', req2!.id, new Uint8Array(64)), /tidak ada/);
  b.refuse('u', req2!.id, 'tidak diminta');
  await assert.rejects(sig2, SignRefusedError);
});

test('policy: fungsi baca ditandatangani, fungsi tulis butuh niat dari perangkat', () => {
  assert.equal(decide(proposal('ListDocumentsPage', ['200', '']).bytes, empty(), now, 'sandichain').ok, true);

  const p = proposal('RequestAccess', ['DOC-1']);
  assert.equal(decode(p.bytes).kind, 'proposal');
  const denied = decide(p.bytes, empty(), now, 'sandichain');
  assert.equal(denied.ok, false, 'tanpa niat harus ditolak');

  const d = decide(p.bytes, { intents: [intent('RequestAccess', ['DOC-1'])], approved: {} }, now, 'sandichain');
  assert.equal(d.ok, true);
  assert.equal(d.state.intents.length, 0, 'niat hanya berlaku sekali');
  assert.ok(d.state.approved[p.txId]);
  // proposal kedua untuk dokumen yang sama tidak ikut disetujui
  assert.equal(decide(proposal('RequestAccess', ['DOC-1']).bytes, d.state, now, 'sandichain').ok, false);
  // niat untuk dokumen lain / kedaluwarsa tidak berlaku
  assert.equal(decide(p.bytes, { intents: [intent('RequestAccess', ['DOC-2'])], approved: {} }, now, 'sandichain').ok, false);
  assert.equal(decide(p.bytes, { intents: [{ fn: 'RequestAccess', args: ['DOC-1'], exp: now - 1 }], approved: {} }, now, 'sandichain').ok, false);
});

test('policy: registrasi terikat ke hash file yang dihitung perangkat', () => {
  const st = (): SignState => ({ intents: [intent('RegisterDocument', [null, 'R/001', H, 'RAHASIA'])], approved: {} });
  assert.equal(decide(proposal('RegisterDocument', ['DOC-9', 'R/001', H, 'RAHASIA']).bytes, st(), now, 'sandichain').ok, true);
  assert.equal(decide(proposal('RegisterDocument', ['DOC-9', 'R/001', 'b'.repeat(64), 'RAHASIA']).bytes, st(), now, 'sandichain').ok, false);
  assert.equal(decide(proposal('RegisterDocument', ['DOC-9', 'R/001', H, 'BIASA']).bytes, st(), now, 'sandichain').ok, false);
  assert.equal(decide(proposal('RegisterDocument', ['DOC-9', 'R/001', H, 'RAHASIA', 'x']).bytes, st(), now, 'sandichain').ok, false);
});

test('policy: chaincode lain dan pesan tak dikenal ditolak', () => {
  assert.equal(decide(proposal('GetDocument', ['DOC-1'], 'lain').bytes, empty(), now, 'sandichain').ok, false);
  assert.equal(decide(crypto.randomBytes(200), empty(), now, 'sandichain').ok, false);
  assert.equal(decide(new Uint8Array(), empty(), now, 'sandichain').ok, false);

  // header bertipe CONFIG tidak pernah ditandatangani
  const prop = peer.Proposal.deserializeBinary(proposal('GetDocument', ['DOC-1']).bytes);
  const hdr = common.Header.deserializeBinary(prop.getHeader_asU8());
  const ch = common.ChannelHeader.deserializeBinary(hdr.getChannelHeader_asU8());
  ch.setType(common.HeaderType.CONFIG);
  hdr.setChannelHeader(ch.serializeBinary());
  prop.setHeader(hdr.serializeBinary());
  assert.equal(decide(prop.serializeBinary(), empty(), now, 'sandichain').ok, false);
});

test('policy: envelope & status commit hanya untuk transaksi yang proposalnya disetujui', () => {
  const p = proposal('AddVersion', ['DOC-1', H]);
  const env = envelope(p.bytes);
  assert.equal(decode(env).kind, 'envelope');
  assert.equal(decide(env, empty(), now, 'sandichain').ok, false, 'envelope tanpa proposal yang disetujui');
  assert.equal(decide(commitStatus(p.txId), empty(), now, 'sandichain').ok, false);

  const ok = decide(p.bytes, { intents: [intent('AddVersion', ['DOC-1', H])], approved: {} }, now, 'sandichain');
  assert.equal(decide(env, ok.state, now, 'sandichain').ok, true);
  assert.equal(decide(commitStatus(p.txId), ok.state, now, 'sandichain').ok, true);

  // envelope ber-txId sama tapi isi pemanggilan diganti
  const other = peer.Proposal.deserializeBinary(proposal('AddVersion', ['DOC-1', 'b'.repeat(64)]).bytes).getPayload_asU8();
  assert.equal(decide(envelope(p.bytes, () => other), ok.state, now, 'sandichain').ok, false);
  // field ganda (parser Go akan menggabungkannya) ditolak
  const dup = new Uint8Array([...p.bytes, ...p.bytes]);
  assert.equal(decide(dup, { intents: [intent('AddVersion', ['DOC-1', H])], approved: {} }, now, 'sandichain').ok, false);
});

test.after(() => {
  gw.close();
  client.close();
});

test('FabricService mode client: pesan dikirim ke perangkat, tanda tangan dicek terhadap sertifikat', async () => {
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { ConfigService } = await import('@nestjs/config');
  const { FabricService } = await import('../src/fabric/fabric.service');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandi-sign-'));
  const wallet = path.join(dir, 'mayor.dewi');
  fs.mkdirSync(wallet);
  // sertifikat + kunci P-256 seperti terbitan Fabric CA; kunci TIDAK ditaruh di wallet
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1',
    '-subj', '/CN=mayor.dewi', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(wallet, 'cert.pem')], { stdio: 'pipe' });
  const cardKey = crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'key.pem')));

  const broker = new SignBroker();
  const cfg = new ConfigService({
    SIGNING_MODE: 'client', WALLET_DIR: dir, PEER_ORG1_ENDPOINT: 'localhost:1', PEER_ORG1_TLS: path.join(wallet, 'cert.pem'),
  });
  const fabric = new FabricService(cfg, broker);
  const user = { username: 'mayor.dewi', org: 'org1', mspId: 'Org1MSP', role: 'user' } as never;
  assert.equal(fabric.signsOnClient(user), true);
  assert.equal(fabric.signsOnClient({ service: true } as never), false, 'identitas layanan tetap ditandatangani di server');
  assert.match(fabric.certFingerprint(user), /^[a-f0-9]{64}$/);

  // perangkat: terima pesan, periksa dengan kebijakan, tanda tangani
  const device = async (key: crypto.KeyObject) => {
    const req = await broker.next('mayor.dewi', 5000);
    const msg = Buffer.from(req!.message, 'base64');
    const d = decode(msg);
    assert.equal(d.kind, 'proposal');
    assert.equal(d.kind === 'proposal' && d.call.fn, 'GetDocument');
    broker.complete('mayor.dewi', req!.id, crypto.sign('sha256', msg, { key, dsaEncoding: 'ieee-p1363' }));
  };

  // kunci benar: tanda tangan diterima, lalu gagal di jaringan (tidak ada peer) => 503, bukan error tanda tangan
  const [r1] = await Promise.allSettled([fabric.evaluate(user, 'ch-rahasia', 'GetDocument', 'DOC-1'), device(cardKey)]);
  assert.equal(r1.status, 'rejected');
  assert.match(String((r1 as PromiseRejectedResult).reason?.message), /blockchain tidak dapat dihubungi/);

  // kunci lain (kartu salah): ditolak sebelum menyentuh jaringan
  const [r2] = await Promise.allSettled([fabric.evaluate(user, 'ch-rahasia', 'GetDocument', 'DOC-1'), device(privateKey)]);
  assert.ok((r2 as PromiseRejectedResult).reason instanceof SignRefusedError);

  fabric.onModuleDestroy();
  fs.rmSync(dir, { recursive: true, force: true });
});
