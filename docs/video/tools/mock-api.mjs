// API tiruan untuk memeriksa frontend dan merekam video demo tanpa jaringan Fabric. SEMUA DATA FIKTIF.
// Jalankan dari folder backend:  TS_NODE_TRANSPILE_ONLY=1 node ../docs/video/tools/mock-api.mjs   (port 4010)
// Frontend: BACKEND_URL=http://127.0.0.1:4010 npm run dev   Ganti pengguna: GET /api/__as/<username>
// Endpoint /forensics/* memakai kode SUNGGUHAN dari backend (behavior.ts, trace.ts, WatermarkService) lewat ts-node.
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

// Jalur backend dihitung dari lokasi file ini (docs/video/tools -> backend).
const B = decodeURIComponent(new URL('../../../backend', import.meta.url).pathname);
const req = createRequire(B + '/package.json');
req('ts-node').register({ transpileOnly: true, project: B + '/tsconfig.json' });
const { analyzeBehavior, riskAlert, DEFAULTS } = req(B + '/src/forensics/behavior.ts');
const { buildTrace, parseLeakMetadata } = req(B + '/src/forensics/trace.ts');
const { WatermarkService } = req(B + '/src/watermark/watermark.service.ts');
const { PDFDocument } = req('pdf-lib');

const USERS = {
  'letkol.arya': { username: 'letkol.arya', nama: 'Letkol Inf Arya Wiratama', nrp: '11000001', jabatan: 'Danyon', clearance: 'SANGAT_RAHASIA', role: 'user', mspId: 'Org1MSP' },
  'mayor.dewi': { username: 'mayor.dewi', nama: 'Mayor Inf Dewi Lestari', nrp: '11000002', jabatan: 'Kasi Intel', clearance: 'RAHASIA', role: 'user', mspId: 'Org1MSP' },
  'kapten.andi': { username: 'kapten.andi', nama: 'Kapten Inf Andi Saputra', nrp: '11000003', jabatan: 'Pasi Ops', clearance: 'SANGAT_RAHASIA', role: 'user', mspId: 'Org2MSP' },
  'serka.budi': { username: 'serka.budi', nama: 'Serka Budi Santoso', nrp: '21000004', jabatan: 'Staf TU', clearance: 'TERBATAS', role: 'user', mspId: 'Org2MSP' },
  'auditor.pam': { username: 'auditor.pam', nama: 'Kapten Cpm Rina Hapsari', nrp: '11000005', jabatan: 'Unit Pam', clearance: 'RAHASIA', role: 'auditor', mspId: 'Org1MSP' },
};
let current = 'letkol.arya';

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const docs = [
  ['DOC-20261107-59B142', 'R/001/XI/2026', 'Rencana Operasi Latihan Gabungan', 'SANGAT_RAHASIA', 'letkol.arya', 'Org1MSP', 2, false, 'ch-rahasia', ['kapten.andi']],
  ['DOC-20261107-417211', 'R/045/XI/2026', 'Laporan Intelijen Mingguan', 'RAHASIA', 'mayor.dewi', 'Org1MSP', 1, false, 'ch-rahasia', []],
  ['DOC-20261106-A1C3F0', 'B/212/XI/2026', 'Jadwal Piket Markas November', 'BIASA', 'serka.budi', 'Org2MSP', 1, false, 'ch-umum', []],
  ['DOC-20261105-0D77E2', 'T/078/XI/2026', 'Daftar Inventaris Kendaraan Dinas', 'TERBATAS', 'serka.budi', 'Org2MSP', 3, false, 'ch-umum', []],
  ['DOC-20261104-C9E410', 'R/039/X/2026', 'Evaluasi Pengamanan Perbatasan Triwulan III', 'RAHASIA', 'mayor.dewi', 'Org1MSP', 1, true, 'ch-rahasia', []],
  ['DOC-20261103-77AB09', 'T/071/X/2026', 'Rencana Kebutuhan Logistik Latihan', 'TERBATAS', 'kapten.andi', 'Org2MSP', 2, false, 'ch-umum', []],
].map(([docId, nomor, perihal, klasifikasi, ownerName, ownerOrg, version, revoked, channel, recipients], i) => ({
  docId, nomor, perihal, klasifikasi, ownerName, ownerOrg, version, revoked, channel, recipients,
  hash: h('hash' + docId), history: [],
  createdAt: `2026-11-0${7 - i}T12:5${i}:00Z`, updatedAt: `2026-11-0${7 - i}T12:5${i}:00Z`,
}));
const [A, B_, C, D, E, F] = docs.map((d) => d.docId);

let seq = 0;
const log = (action, actor, at, docId, detail = '') => {
  const u = USERS[actor];
  return { txId: h(`tx${++seq}${action}${actor}${at}`), docId, action, actor, actorOrg: u.mspId, clearance: u.clearance, jabatan: u.jabatan, detail, timestamp: at, channel: docs.find((d) => d.docId === docId).channel };
};
const logs = [
  // 7 Nov: alur resmi dokumen A (19.49-19.59 WIB)
  log('REGISTER', 'letkol.arya', '2026-11-07T12:49:00Z', A, 'v1 af1ac594c97c'),
  log('ACCESS_DENIED', 'kapten.andi', '2026-11-07T12:51:00Z', A, 'SANGAT_RAHASIA: tidak ada di daftar disposisi (need to know)'),
  log('DISPOSITION', 'letkol.arya', '2026-11-07T12:52:00Z', A, 'kepada kapten.andi: Pelajari dan siapkan paparan'),
  log('ACCESS_GRANTED', 'kapten.andi', '2026-11-07T12:53:00Z', A, 'penerima disposisi'),
  log('VERIFY_TAMPERED', 'kapten.andi', '2026-11-07T12:54:00Z', A, 'TIDAK COCOK - dokumen telah diubah atau bukan dokumen resmi'),
  log('NEW_VERSION', 'letkol.arya', '2026-11-07T12:55:00Z', A, 'v2 8156fe1426dc'),
  log('VERIFY_OK', 'letkol.arya', '2026-11-07T12:56:00Z', A, 'ASLI - cocok dengan v1 (bukan versi terbaru, terbaru v2)'),
  log('ACCESS_DENIED', 'serka.budi', '2026-11-07T12:59:00Z', A, 'clearance TERBATAS < klasifikasi SANGAT_RAHASIA'),
  log('REGISTER', 'mayor.dewi', '2026-11-06T04:00:00Z', B_, 'v1'),
  log('ACCESS_GRANTED', 'letkol.arya', '2026-11-08T03:00:00Z', B_, 'pemilik / clearance cukup'),
  // 12 Nov malam (23.10 WIB): serka.budi menyisir dokumen rahasia
  log('ACCESS_DENIED', 'serka.budi', '2026-11-12T16:10:00Z', A, 'clearance TERBATAS < klasifikasi SANGAT_RAHASIA'),
  log('ACCESS_DENIED', 'serka.budi', '2026-11-12T16:12:00Z', B_, 'clearance TERBATAS < klasifikasi RAHASIA'),
  log('ACCESS_DENIED', 'serka.budi', '2026-11-12T16:13:00Z', E, 'clearance TERBATAS < klasifikasi RAHASIA'),
  log('ACCESS_DENIED', 'serka.budi', '2026-11-12T16:15:00Z', A, 'clearance TERBATAS < klasifikasi SANGAT_RAHASIA'),
  // 12 Nov pagi: kapten.andi membuka lima dokumen berbeda dalam 8 menit
  ...[A, B_, C, D, E].map((d, i) => log('ACCESS_GRANTED', 'kapten.andi', `2026-11-12T02:0${i * 2}:00Z`, d, 'akses sah')),
  // 12 Nov: mayor.dewi membuka dokumen yang sama berulang
  ...[0, 2, 4, 6].map((m) => log('ACCESS_GRANTED', 'mayor.dewi', `2026-11-12T03:0${m}:00Z`, B_, 'pemilik')),
];
const grantTx = logs.find((l) => l.action === 'ACCESS_GRANTED' && l.actor === 'kapten.andi' && l.docId === A).txId;

const opts = { workStartHour: DEFAULTS.workStartHour, workEndHour: DEFAULTS.workEndHour };
const risks = () => analyzeBehavior(logs, opts);

const baseAlert = (id, type, actor, org, reason, at, doc, ack = false) => ({
  id, type, doc_id: doc ?? '', actor, org, reason, tx_id: h('alert' + id), channel: doc ? docs.find((d) => d.docId === doc)?.channel ?? 'off-chain' : 'off-chain', block: '42', acknowledged: ack, created_at: at,
});
let alerts = [
  baseAlert(5, 'UnauthorizedAccess', 'serka.budi', 'Org2MSP', 'clearance TERBATAS < klasifikasi SANGAT_RAHASIA', '2026-11-12T16:15:00Z', A),
  baseAlert(4, 'StorageIntegrity', 'mayor.dewi', 'Org1MSP', 'dekripsi gagal (ciphertext/tag diubah?): Unsupported state or unable to authenticate data', '2026-11-08T03:05:00Z', B_),
  baseAlert(3, 'DocumentTampered', 'kapten.andi', 'Org2MSP', 'TIDAK COCOK - dokumen telah diubah atau bukan dokumen resmi', '2026-11-07T12:54:00Z', A),
  baseAlert(2, 'UnauthorizedAccess', 'kapten.andi', 'Org2MSP', 'SANGAT_RAHASIA: tidak ada di daftar disposisi (need to know)', '2026-11-07T12:51:00Z', A, true),
];
risks()
  .filter((r) => r.level === 'tinggi' || r.level === 'kritis')
  .forEach((r, i) => {
    const a = riskAlert(r);
    alerts.unshift({ ...baseAlert(10 + i, 'SuspiciousBehavior', a.actor, a.org, a.reason, '2026-11-12T16:16:00Z', ''), tx_id: a.txId });
  });

const PDFSAMPLE = async (klasifikasi) => {
  const src = await PDFDocument.create();
  src.addPage().drawText('Rencana Operasi Latihan Gabungan (fiktif - demo)', { x: 50, y: 700, size: 14 });
  const u = USERS['kapten.andi'];
  return new WatermarkService().render(Buffer.from(await src.save()), 'application/pdf', {
    nama: u.nama, nrp: u.nrp, jabatan: u.jabatan, klasifikasi, docId: A, accessTxId: grantTx, waktu: '7 Nov 2026 19.53 WIB',
  });
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const body = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const docMap = (ids) => Object.fromEntries(ids.map((id) => [id, docs.find((d) => d.docId === id)]).filter(([, d]) => d));
const traced = (q) => {
  const r = buildTrace(logs, Object.values(USERS), q);
  return { ...r, documents: docMap([...new Set(r.matches.map((m) => m.access.docId))]) };
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/^\/api/, '');
    const user = USERS[current];
    let m;
    if ((m = p.match(/^\/__as\/(.+)$/))) {
      current = m[1];
      return json(res, 200, { as: current, known: !!USERS[current] });
    }
    if (p === '/__sample-leak.pdf') {
      const pdf = await PDFSAMPLE(url.searchParams.get('klas') ?? 'RAHASIA');
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      return res.end(Buffer.from(pdf));
    }
    if (p === '/__info') return json(res, 200, { grantTx, risks: risks().map((r) => [r.actor, r.score, r.level]) });
    if (p === '/auth/me') return user ? json(res, 200, user) : json(res, 401, { message: 'Belum login' });
    if (p === '/auth/login') return json(res, 401, { message: 'Username atau password salah' });
    if (p === '/auth/logout') return json(res, 200, { ok: true });
    if (!user) return json(res, 401, { message: 'Belum login' });
    if (p === '/auth/personel') return json(res, 200, Object.values(USERS).map(({ username, nama, jabatan, clearance }) => ({ username, nama, jabatan, clearance })));
    if (p === '/sign/info') return json(res, 200, { mode: 'server', certFp: 'x', chaincode: 'sandichain' });
    if (p === '/documents' && req.method === 'GET') return json(res, 200, docs);
    const auditor = user.role === 'auditor' || user.role === 'admin';
    if (p === '/audit') return auditor ? json(res, 200, [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) : json(res, 403, { message: 'Khusus unit pengamanan' });
    if (p === '/alerts') return json(res, 200, alerts);
    if ((m = p.match(/^\/alerts\/(\d+)\/ack$/))) {
      alerts = alerts.map((a) => (a.id === +m[1] ? { ...a, acknowledged: true } : a));
      return json(res, 200, { ok: true });
    }
    if (p === '/alerts/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      return res.write(': ok\n\n');
    }
    // ---- forensik: kode backend sungguhan
    if (p.startsWith('/forensics')) {
      if (!auditor) return json(res, 403, { message: 'Khusus unit pengamanan (auditor)' });
      if (p === '/forensics/risk') return json(res, 200, { generatedAt: new Date().toISOString(), options: opts, alertFrom: 'tinggi', actors: risks() });
      if (p === '/forensics/trace') {
        const q = Object.fromEntries(url.searchParams);
        return json(res, 200, traced(q));
      }
      if (p === '/forensics/trace/file') {
        const buf = await body(req);
        const start = buf.indexOf('%PDF-');
        const end = buf.lastIndexOf('%%EOF');
        if (start < 0 || end < 0) return json(res, 400, { message: 'File bukan PDF yang valid' });
        const pdf = await PDFDocument.load(buf.subarray(start, end + 5), { updateMetadata: false, ignoreEncryption: true });
        const extracted = parseLeakMetadata({ title: pdf.getTitle(), subject: pdf.getSubject(), keywords: pdf.getKeywords() });
        if (!extracted.txId && !extracted.nrp) {
          return json(res, 200, { source: 'metadata', extracted, status: 'not_found', message: 'Jejak SANDI-Chain tidak ada di metadata (file bukan dari sistem ini, atau metadatanya dibersihkan). Cari manual dari watermark di halaman.', matches: [], documents: {} });
        }
        return json(res, 200, { source: 'metadata', extracted, ...traced(extracted.txId ? { txId: extracted.txId } : { nrp: extracted.nrp, docId: extracted.docId }) });
      }
    }
    if ((m = p.match(/^\/documents\/([^/]+)(\/\w+)?$/))) {
      const d = docs.find((x) => x.docId === m[1]);
      if (!d) return json(res, 404, { message: 'Dokumen tidak ditemukan' });
      if (!m[2])
        return json(res, 200, {
          ...d,
          isOwner: d.ownerName === user.username,
          versions: Array.from({ length: d.version }, (_, i) => ({ version: i + 1, filename: i ? `dok-rev${i}.pdf` : 'dok.pdf', mime: 'application/pdf', size: 1500 - i * 80, sha256: h('v' + d.docId + i), created_at: d.createdAt })),
        });
      if (m[2] === '/audit') return json(res, 200, logs.filter((l) => l.docId === d.docId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      req.resume();
      return req.on('end', () => json(res, 200, { ok: true }));
    }
    json(res, 404, { message: 'Tidak ditemukan' });
  })
  .listen(4010, '127.0.0.1', () => console.log('mock api :4010 (forensik = kode backend sungguhan)'));
