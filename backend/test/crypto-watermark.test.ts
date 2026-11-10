import 'reflect-metadata';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { CryptoService } from '../src/crypto/crypto.service';
import { WatermarkService } from '../src/watermark/watermark.service';

const ctx = { docId: 'DOC-1', channel: 'ch-rahasia' };
const proof = { ...ctx, txId: 'tx1' };
const cfg = new ConfigService({ KMS_MODE: 'local', LOCAL_KEK: crypto.randomBytes(32).toString('base64') });

test('envelope encryption: seal -> open mengembalikan plaintext asli', async () => {
  const svc = new CryptoService(cfg);
  await svc.onModuleInit();
  const plain = Buffer.from('SURAT PERINTAH NOMOR SPRIN/001/XI/2026');
  const sealed = await svc.seal(plain, ctx);
  assert.notDeepEqual(sealed.ciphertext, plain);
  assert.match(sealed.wrappedDek, /^local:v2:/);
  assert.deepEqual(await svc.open(sealed, proof), plain);
});

test('ciphertext yang diubah 1 byte ditolak (GCM auth tag)', async () => {
  const svc = new CryptoService(cfg);
  await svc.onModuleInit();
  const sealed = await svc.seal(Buffer.from('dokumen rahasia'), ctx);
  sealed.ciphertext[0] ^= 0xff;
  await assert.rejects(() => svc.open(sealed, proof));
});

test('DEK terikat ke channel/docId: tidak bisa dibuka atas nama dokumen lain', async () => {
  const svc = new CryptoService(cfg);
  await svc.onModuleInit();
  const sealed = await svc.seal(Buffer.from('rahasia'), ctx);
  await assert.rejects(() => svc.open(sealed, { ...proof, docId: 'DOC-2' }));
  await assert.rejects(() => svc.open(sealed, { ...proof, channel: 'ch-umum' }));
});

test('setiap dokumen punya DEK berbeda', async () => {
  const svc = new CryptoService(cfg);
  await svc.onModuleInit();
  const a = await svc.seal(Buffer.from('x'), ctx);
  const b = await svc.seal(Buffer.from('x'), ctx);
  assert.notEqual(a.wrappedDek, b.wrappedDek);
  assert.notDeepEqual(a.ciphertext, b.ciphertext);
});

test('watermark: PDF tetap valid, jumlah halaman sama, metadata berisi txId', async () => {
  const src = await PDFDocument.create();
  src.addPage([595, 842]);
  src.addPage([595, 842]);
  const out = await new WatermarkService().render(Buffer.from(await src.save()), 'application/pdf', {
    nama: 'Mayor Inf Dewi Lestari',
    nrp: '11000002',
    jabatan: 'Kasi Intel',
    klasifikasi: 'RAHASIA',
    docId: 'DOC-TEST',
    accessTxId: 'abc123def456abc123def456',
    waktu: '07/11/2026 20.00 WIB',
  });
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 2);
  assert.match(pdf.getSubject() ?? '', /abc123def456/);
});

test('watermark: gambar PNG dikonversi menjadi PDF', async () => {
  // PNG 1x1 piksel
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const out = await new WatermarkService().render(png, 'image/png', {
    nama: 'A', nrp: '1', jabatan: 'B', klasifikasi: 'TERBATAS', docId: 'D', accessTxId: 'tx', waktu: 'w',
  });
  assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
});

test('watermark raster: dokumen RAHASIA jadi gambar, teks asli tidak bisa diekstrak', async () => {
  const { StandardFonts } = await import('pdf-lib');
  const src = await PDFDocument.create();
  const font = await src.embedFont(StandardFonts.Helvetica);
  src.addPage([595, 842]).drawText('KATA-KUNCI-RAHASIA-XYZ', { x: 60, y: 760, size: 14, font });
  src.addPage([842, 595]);
  const input = Buffer.from(await src.save({ useObjectStreams: false }));
  const info = {
    nama: 'Mayor Inf Dewi Lestari', nrp: '11000002', jabatan: 'Kasi Intel', klasifikasi: 'RAHASIA',
    docId: 'DOC-TEST', accessTxId: 'abc123def456abc123def456', waktu: '07/11/2026 20.00 WIB',
  };
  const out = await new WatermarkService().render(input, 'application/pdf', info);
  const pdf = await PDFDocument.load(out);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(1).getSize(), { width: 842, height: 595 });
  assert.match(pdf.getSubject() ?? '', /abc123def456/);
  // Hasil raster tidak memuat font/teks: hanya gambar.
  const raw = Buffer.from(await pdf.save({ useObjectStreams: false })).toString('latin1');
  assert.ok(!raw.includes('/BaseFont'), 'tidak boleh ada font (teks) di PDF raster');
  assert.ok(raw.includes('/DCTDecode'), 'halaman harus berupa gambar JPEG');

  // Klasifikasi rendah tetap PDF teks (bisa dicari), watermark ditempel.
  const low = await new WatermarkService().render(input, 'application/pdf', { ...info, klasifikasi: 'TERBATAS' });
  const lowRaw = Buffer.from(await (await PDFDocument.load(low)).save({ useObjectStreams: false })).toString('latin1');
  assert.ok(lowRaw.includes('/BaseFont'));
});
