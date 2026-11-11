#!/usr/bin/env node
// Skenario demo end-to-end SANDI-Chain (juga berfungsi sebagai uji integrasi).
// Prasyarat: jaringan Fabric, docker compose, dan backend sudah jalan.
//   node scripts/demo.mjs [http://localhost:4000]

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'minio';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const API = (process.argv[2] ?? 'http://localhost:4000') + '/api';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]),
);
const outDir = path.join(root, 'demo-output');
fs.mkdirSync(outDir, { recursive: true });

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  cond ? pass++ : fail++;
};
const step = (t) => console.log(`\n▸ ${t}`);

// ------------------------------------------------------------------ helper
const sessions = {};
async function login(u) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: 'sandi123' }),
  });
  if (!r.ok) throw new Error(`login ${u}: ${r.status} ${await r.text()}`);
  sessions[u] = r.headers.get('set-cookie').split(';')[0];
}
// SIGNING_MODE=client: skrip ini berperan sebagai perangkat tiap personel. Kartu dibuka
// dengan PIN lalu setiap permintaan tanda tangan dari backend dijawab. (Portal web
// memeriksa isi pesan dulu, lihat frontend/src/lib/sign-policy.ts; di sini langsung
// ditandatangani karena skrip inilah yang memulai semua aksi.)
function openCard(u) {
  const file = path.join(root, env.CARDS_DIR ?? './cards', `${u}.card.json`);
  if (!fs.existsSync(file)) throw new Error(`Kartu ${file} tidak ada. Jalankan: SIGNING_MODE=client npm run enroll`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'config/users.seed.json'), 'utf8'));
  const kek = crypto.pbkdf2Sync(seed.defaultPin ?? '123456', Buffer.from(c.kdf.salt, 'base64'), c.kdf.iterations, 32, 'sha256');
  const ct = Buffer.from(c.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(c.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pkcs8 = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
}
async function startDevice(u) {
  const info = await call(u, 'GET', '/sign/info');
  if (info.data.mode !== 'client') return false;
  const key = openCard(u);
  const cookie = sessions[u];
  (async () => {
    for (;;) {
      const r = await fetch(`${API}/sign/next`, { headers: { Cookie: cookie } }).catch(() => null);
      if (!r || r.status === 401) return; // backend mati / sesi berakhir
      if (r.status !== 200) continue;
      const { id, message } = await r.json();
      const signature = crypto.sign('sha256', Buffer.from(message, 'base64'), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');
      await fetch(`${API}/sign/${id}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ signature }) });
    }
  })();
  return true;
}
async function call(u, method, p, body) {
  const headers = { Cookie: sessions[u] };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(API + p, { method, headers, body: payload });
  const type = r.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, headers: r.headers };
}
function form(file, name, fields = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([file], { type: 'application/pdf' }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
async function makePdf(lines) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 60, y: 760 - i * 22, size: i === 0 ? 16 : 12, font }));
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ skenario
const users = ['letkol.arya', 'mayor.dewi', 'kapten.andi', 'serka.budi', 'auditor.pam'];
step('Login 5 personel');
for (const u of users) await login(u);
ok(true, users.join(', '));
const devices = await Promise.all(users.map(startDevice));
console.log(`  mode tanda tangan: ${devices[0] ? 'client (kunci di perangkat, kartu dari cards/)' : 'server (kunci di wallet backend)'}`);

const renops = await makePdf([
  'RENCANA OPERASI (FIKTIF - DEMO)', 'Nomor: R/001/XI/2026', 'Kepada: Pasi Ops', '', 'Isi rencana operasi untuk demo SANDI-Chain.',
]);
const laporan = await makePdf(['LAPORAN INTELIJEN (FIKTIF - DEMO)', 'Nomor: R/045/XI/2026', '', 'Isi laporan untuk demo.']);

step('Danyon mendaftarkan dokumen SANGAT RAHASIA; Kasi Intel mendaftarkan dokumen RAHASIA');
const a = await call('letkol.arya', 'POST', '/documents', form(renops, 'renops.pdf', { nomor: 'R/001/XI/2026', perihal: 'Rencana Operasi Latihan Gabungan', klasifikasi: 'SANGAT_RAHASIA' }));
ok(a.status === 201, `RegisterDocument SR -> ${a.status} ${a.data.docId ?? JSON.stringify(a.data)}`);
const b = await call('mayor.dewi', 'POST', '/documents', form(laporan, 'lapintel.pdf', { nomor: 'R/045/XI/2026', perihal: 'Laporan Intelijen Mingguan', klasifikasi: 'RAHASIA' }));
ok(b.status === 201, `RegisterDocument RAHASIA -> ${b.status} ${b.data.docId ?? JSON.stringify(b.data)}`);
const A = a.data.docId;
const B = b.data.docId;

step('Staf TU (clearance TERBATAS) tidak melihat dokumen RAHASIA ke atas');
const listBudi = await call('serka.budi', 'GET', '/documents');
ok(!listBudi.data.some((d) => d.docId === A || d.docId === B), `ListDocuments disaring chaincode (${listBudi.data.length} dokumen terlihat)`);
const vBudi = await call('serka.budi', 'GET', `/documents/${B}/view`);
ok(vBudi.status === 403, `Staf TU coba buka dokumen RAHASIA -> ${vBudi.status} ${vBudi.data.message}`);

step('Penolakan selain "buka dokumen" juga tercatat');
const regBudi = await call('serka.budi', 'POST', '/documents', form(laporan, 'coba.pdf', { nomor: 'X/001', perihal: 'Percobaan', klasifikasi: 'RAHASIA' }));
ok(regBudi.status === 403, `Staf TU mendaftarkan dokumen RAHASIA -> ${regBudi.status} ${regBudi.data.message}`);
const verBudi = await call('serka.budi', 'POST', `/documents/${B}/verify`, form(laporan, 'bocoran.pdf'));
ok(verBudi.status === 403 && verBudi.data.authentic === undefined, `Staf TU memverifikasi salinan dokumen RAHASIA -> ${verBudi.status} (hasil tidak dibocorkan)`);

step('Need-to-know: SANGAT RAHASIA hanya untuk penerima disposisi');
const listAndi1 = await call('kapten.andi', 'GET', '/documents');
const metaAndi1 = await call('kapten.andi', 'GET', `/documents/${A}`);
ok(!listAndi1.data.some((d) => d.docId === A) && metaAndi1.status === 403, `Pasi Ops (clearance SR, belum disposisi) tidak melihat metadata dokumen SR -> ${metaAndi1.status}`);
const vAndi1 = await call('kapten.andi', 'GET', `/documents/${A}/view`);
ok(vAndi1.status === 403, `Pasi Ops (clearance SR, belum disposisi) -> ${vAndi1.status}`);
const disp = await call('letkol.arya', 'POST', `/documents/${A}/disposition`, { recipient: 'kapten.andi', catatan: 'Pelajari dan siapkan paparan' });
ok(disp.status === 200 && disp.data.recipients.includes('kapten.andi'), 'Danyon mendisposisikan ke kapten.andi');
const listAndi2 = await call('kapten.andi', 'GET', '/documents');
ok(listAndi2.data.some((d) => d.docId === A), 'Setelah disposisi, dokumen SR muncul di daftar Pasi Ops');
const vAndi2 = await call('kapten.andi', 'GET', `/documents/${A}/view`);
ok(vAndi2.status === 200 && vAndi2.headers.get('content-type') === 'application/pdf', `Pasi Ops sekarang bisa membuka -> ${vAndi2.status}, tx ${vAndi2.headers.get('x-access-tx')?.slice(0, 12)}`);
if (vAndi2.status === 200) {
  fs.writeFileSync(path.join(outDir, 'renops-dilihat-kapten.andi.pdf'), vAndi2.data);
  const wm = await PDFDocument.load(vAndi2.data);
  ok((wm.getSubject() ?? '').includes(vAndi2.headers.get('x-access-tx')), 'PDF berwatermark membawa txId akses di metadata');
}
const vDewi = await call('mayor.dewi', 'GET', `/documents/${A}/view`);
ok(vDewi.status === 403, `Kasi Intel (clearance RAHASIA) buka dokumen SR -> ${vDewi.status}`);

step('Verifikasi keaslian');
const v1 = await call('kapten.andi', 'POST', `/documents/${A}/verify`, form(renops, 'salinan.pdf'));
ok(v1.data.authentic === true, `File asli -> ${v1.data.message}`);
const palsu = Buffer.from(renops);
palsu[palsu.indexOf('demo SANDI') + 1] ^= 0x01; // ubah 1 bit
const v2 = await call('kapten.andi', 'POST', `/documents/${A}/verify`, form(palsu, 'salinan-beredar.pdf'));
ok(v2.data.authentic === false, `File diubah 1 bit -> ${v2.data.message}`);

step('Revisi hanya oleh pemilik');
const rev1 = await call('kapten.andi', 'POST', `/documents/${A}/versions`, form(palsu, 'revisi.pdf'));
ok(rev1.status === 403, `Non-pemilik merevisi -> ${rev1.status} (tercatat sebagai ACCESS_DENIED)`);
const renops2 = await makePdf(['RENCANA OPERASI (FIKTIF - DEMO) REV-1', 'Nomor: R/001/XI/2026', '', 'Revisi jadwal.']);
const rev2 = await call('letkol.arya', 'POST', `/documents/${A}/versions`, form(renops2, 'renops-rev1.pdf'));
ok(rev2.status === 201 && rev2.data.version === 2, `Pemilik merevisi -> v${rev2.data.version}`);
const v3 = await call('letkol.arya', 'POST', `/documents/${A}/verify`, form(renops, 'versi-lama.pdf'));
ok(v3.data.authentic && v3.data.matchedVersion === 1, `File versi lama -> ${v3.data.message}`);

step('Simulasi admin storage memanipulasi ciphertext dokumen RAHASIA');
const s3 = new Client({ endPoint: env.S3_ENDPOINT, port: Number(env.S3_PORT), useSSL: false, accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY, pathStyle: true });
const objs = [];
for await (const o of s3.listObjectsV2(env.S3_BUCKET, `${B}/`, true)) objs.push(o.name);
const original = await (async () => { const s = await s3.getObject(env.S3_BUCKET, objs[0]); const c = []; for await (const x of s) c.push(x); return Buffer.concat(c); })();
const tampered = Buffer.from(original);
tampered[20] ^= 0xff;
await s3.putObject(env.S3_BUCKET, objs[0], tampered);
const vt = await call('mayor.dewi', 'GET', `/documents/${B}/view`);
ok(vt.status === 409, `Pemilik membuka dokumen yang ciphertext-nya diubah -> ${vt.status} ${vt.data.message}`);
await s3.putObject(env.S3_BUCKET, objs[0], original); // pulihkan
const vr = await call('mayor.dewi', 'GET', `/documents/${B}/view`);
ok(vr.status === 200, `Setelah dipulihkan -> ${vr.status}`);

step('Unit pengamanan menerima alert & jejak lengkap');
await sleep(4000);
const alerts = await call('auditor.pam', 'GET', '/alerts');
const types = alerts.data.reduce((m, x) => ((m[x.type] = (m[x.type] ?? 0) + 1), m), {});
ok(types.UnauthorizedAccess >= 6, `Alert akses tidak sah: ${types.UnauthorizedAccess ?? 0}`);
ok(types.DocumentTampered >= 1, `Alert dokumen palsu: ${types.DocumentTampered ?? 0}`);
ok(types.StorageIntegrity >= 1, `Alert manipulasi storage: ${types.StorageIntegrity ?? 0}`);
const trail = await call('auditor.pam', 'GET', `/documents/${A}/audit`);
const actions = trail.data.map((l) => l.action);
ok(['REGISTER', 'ACCESS_DENIED', 'DISPOSITION', 'ACCESS_GRANTED', 'VERIFY_OK', 'VERIFY_TAMPERED', 'NEW_VERSION'].every((x) => actions.includes(x)),
  `Audit trail dokumen SR: ${trail.data.length} entri (${[...new Set(actions)].join(', ')})`);
const hist = await call('auditor.pam', 'GET', `/documents/${A}/history`);
ok(Array.isArray(hist.data) && hist.data.length >= 3, `History key di ledger: ${hist.data.length} perubahan state`);
const noAudit = await call('serka.budi', 'GET', '/audit');
ok(noAudit.status === 403, `Staf TU membuka dashboard audit -> ${noAudit.status}`);

step('Logout mencabut sesi di server');
const oldCookie = sessions['serka.budi'];
await call('serka.budi', 'POST', '/auth/logout');
const reuse = await fetch(`${API}/documents`, { headers: { Cookie: oldCookie } });
ok(reuse.status === 401, `Cookie lama dipakai setelah logout -> ${reuse.status}`);

console.log(`\n${pass} lulus, ${fail} gagal. PDF berwatermark: ${outDir}`);
process.exit(fail ? 1 : 0);
