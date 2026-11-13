import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { WatermarkService } from '../src/watermark/watermark.service';
import { buildTrace, parseLeakMetadata, PersonInfo } from '../src/forensics/trace';

const hex = (c: string) => c.repeat(64);
const L = (txId: string, docId: string, action: string, actor: string, at: string, detail = '') => ({
  txId, docId, action, actor, actorOrg: 'Org1MSP', clearance: 'RAHASIA', jabatan: 'Staf', detail, timestamp: at,
});
const users: PersonInfo[] = [
  { username: 'letkol.arya', nama: 'Letkol Inf Arya Wiratama', nrp: '11000001', jabatan: 'Danyon', clearance: 'SANGAT_RAHASIA', mspId: 'Org1MSP' },
  { username: 'kapten.andi', nama: 'Kapten Inf Andi Saputra', nrp: '11000003', jabatan: 'Pasi Ops', clearance: 'SANGAT_RAHASIA', mspId: 'Org2MSP' },
  { username: 'mayor.dewi', nama: 'Mayor Inf Dewi Lestari', nrp: '11000002', jabatan: 'Kasi Intel', clearance: 'RAHASIA', mspId: 'Org1MSP' },
];
const T = (m: number) => `2026-11-10T03:${String(m).padStart(2, '0')}:00Z`;

const logs = [
  L(hex('1'), 'DOC-20261110-AAAAAA', 'REGISTER', 'letkol.arya', T(0)),
  L(hex('2'), 'DOC-20261110-AAAAAA', 'DISPOSITION', 'letkol.arya', T(5), 'kepada kapten.andi: Pelajari dan siapkan paparan'),
  L(hex('a'), 'DOC-20261110-AAAAAA', 'ACCESS_GRANTED', 'kapten.andi', T(10)),
  L(hex('b'), 'DOC-20261110-AAAAAA', 'ACCESS_GRANTED', 'letkol.arya', T(12)),
  L(hex('c'), 'DOC-20261110-AAAAAA', 'ACCESS_DENIED', 'mayor.dewi', T(15)),
  L(hex('d'), 'DOC-20261110-BBBBBB', 'ACCESS_GRANTED', 'kapten.andi', T(20)),
];

test('telusuri: txId penuh menunjuk ke pembaca, dokumen, dan disposisi yang memberi akses', () => {
  const r = buildTrace(logs, users, { txId: hex('a') });
  assert.equal(r.status, 'found');
  const m = r.matches[0];
  assert.equal(m.isAccessGrant, true);
  assert.equal(m.person?.nama, 'Kapten Inf Andi Saputra');
  assert.equal(m.access.docId, 'DOC-20261110-AAAAAA');
  assert.equal(m.grantedBy?.actor, 'letkol.arya');
  assert.match(m.grantedBy!.detail, /kapten\.andi/);
});

test('telusuri: awalan 16 karakter (seperti di footer watermark) cukup; huruf besar diterima', () => {
  const r = buildTrace(logs, users, { txId: hex('a').slice(0, 16).toUpperCase() });
  assert.equal(r.status, 'found');
  assert.equal(r.matches[0].access.txId, hex('a'));
});

test('telusuri: txId terlalu pendek atau bukan heksadesimal ditolak dengan pesan jelas', () => {
  assert.equal(buildTrace(logs, users, { txId: 'abc' }).status, 'bad_query');
  assert.equal(buildTrace(logs, users, { txId: 'zzzzzzzzzzzz' }).status, 'bad_query');
  assert.equal(buildTrace(logs, users, {}).status, 'bad_query');
});

test('telusuri: txId tidak ada di ledger = not_found', () => {
  assert.equal(buildTrace(logs, users, { txId: hex('9') }).status, 'not_found');
});

test('telusuri: rantai dokumen terurut waktu, aktivitas pelaku dan pembaca lain terpisah', () => {
  const m = buildTrace(logs, users, { txId: hex('a') }).matches[0];
  assert.deepEqual(m.custody.map((l) => l.txId), [hex('1'), hex('2'), hex('a'), hex('b'), hex('c')]);
  assert.deepEqual(m.suspectActivity.map((l) => l.txId), [hex('a')]);
  assert.deepEqual(m.otherReaders.map((r) => r.actor), ['letkol.arya']);
});

test('telusuri: txId milik penolakan bukan akses yang berhasil, dan dijelaskan', () => {
  const r = buildTrace(logs, users, { txId: hex('c') });
  assert.equal(r.matches[0].isAccessGrant, false);
  assert.match(r.message, /bukan akses yang berhasil/);
});

test('telusuri: NRP + dokumen mencari akses berhasil orang itu pada dokumen tersebut', () => {
  const r = buildTrace(logs, users, { nrp: '11000003', docId: 'doc-20261110-aaaaaa' });
  assert.equal(r.status, 'found');
  assert.equal(r.matches[0].access.txId, hex('a'));
});

test('telusuri: NRP tanpa dokumen menampilkan semua akses (ambiguous), terbaru dulu', () => {
  const r = buildTrace(logs, users, { nrp: '11000003' });
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.matches.map((m) => m.access.txId), [hex('d'), hex('a')]);
});

test('telusuri: nama sebagian cocok; personel tidak dikenal = not_found', () => {
  assert.equal(buildTrace(logs, users, { nama: 'andi', docId: 'DOC-20261110-AAAAAA' }).status, 'found');
  assert.equal(buildTrace(logs, users, { nrp: '99999999' }).status, 'not_found');
});

test('telusuri: metadata PDF hasil render dibaca balik menjadi txId, NRP, dan dokumen', async () => {
  // meniru WatermarkService.render: judul, subjek, kata kunci diisi persis seperti itu
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const tx = hex('a');
  pdf.setTitle('DOC-20261110-AAAAAA - SANGAT RAHASIA');
  pdf.setSubject(`SANDI-Chain access ${tx}`);
  pdf.setKeywords(['SANDI-Chain', tx, '11000003']);
  const re = await PDFDocument.load(await pdf.save(), { updateMetadata: false });
  const got = parseLeakMetadata({ title: re.getTitle(), subject: re.getSubject(), keywords: re.getKeywords() });
  assert.deepEqual(got, { txId: tx, docId: 'DOC-20261110-AAAAAA', nrp: '11000003' });
});

test('telusuri: metadata kosong tidak menghasilkan apa pun', () => {
  assert.deepEqual(parseLeakMetadata({}), { txId: undefined, docId: undefined, nrp: undefined });
});

test('telusuri: jejak bertahan setelah render nyata, juga pada mode raster (RAHASIA)', async () => {
  const src = await PDFDocument.create();
  src.addPage().drawText('Isi dokumen uji');
  const file = Buffer.from(await src.save());
  const tx = hex('a');
  for (const klasifikasi of ['TERBATAS', 'RAHASIA']) {
    const out = await new WatermarkService().render(file, 'application/pdf', {
      nama: 'Kapten Inf Andi Saputra', nrp: '11000003', jabatan: 'Pasi Ops', klasifikasi,
      docId: 'DOC-20261110-AAAAAA', accessTxId: tx, waktu: '10 Nov 2026 10.00 WIB',
    });
    const pdf = await PDFDocument.load(out, { updateMetadata: false });
    const got = parseLeakMetadata({ title: pdf.getTitle(), subject: pdf.getSubject(), keywords: pdf.getKeywords() });
    assert.equal(got.txId, tx, klasifikasi);
    assert.equal(got.docId, 'DOC-20261110-AAAAAA', klasifikasi);
    assert.equal(got.nrp, '11000003', klasifikasi);
    // dan dari jejak itu pembacanya ditemukan di ledger
    assert.equal(buildTrace(logs, users, { txId: got.txId }).matches[0].person?.nrp, '11000003', klasifikasi);
  }
});
