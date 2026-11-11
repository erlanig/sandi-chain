import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCanvas } from '@napi-rs/canvas';
import * as path from 'path';
import { degrees, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/** `import()` asli (bukan require hasil transpile CommonJS): pdfjs-dist hanya tersedia sebagai ESM. */
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
let pdfjs: Promise<any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Batas piksel per halaman agar halaman berukuran raksasa tidak menghabiskan memori. */
const MAX_PIXELS = 12_000_000;

export const VIEWABLE_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

export interface WatermarkInfo {
  nama: string;
  nrp: string;
  jabatan: string;
  klasifikasi: string;
  docId: string;
  accessTxId: string;
  waktu: string;
}

/**
 * Watermark dinamis per pembaca. Kalau dokumen bocor lewat foto layar /
 * print, nama-NRP-waktu-txId di setiap halaman menunjuk ke entri
 * ACCESS_GRANTED di ledger, sehingga pelaku dapat dilacak.
 *
 * Mode raster (VIEW_RASTERIZE): setelah watermark ditempel, tiap halaman
 * dirender menjadi gambar. Watermark menyatu dengan piksel isi dokumen, jadi
 * tidak bisa dibuang dengan menghapus layer/objek di editor PDF, dan teks
 * asli tidak bisa disalin/diekstrak dari file yang dikirim ke pembaca.
 * Ini menaikkan biaya, bukan jaminan: watermark abu-abu masih bisa dikurangi
 * dengan pengolahan gambar, dan isi tetap bisa diketik ulang.
 */
@Injectable()
export class WatermarkService {
  private readonly rasterMode: 'off' | 'rahasia' | 'all';
  private readonly dpi: number;
  private readonly maxPages: number;

  constructor(@Optional() cfg?: ConfigService) {
    const m = cfg?.get<string>('VIEW_RASTERIZE') ?? 'rahasia';
    this.rasterMode = m === 'off' || m === 'all' ? m : 'rahasia';
    this.dpi = Math.min(300, Math.max(72, Number(cfg?.get('VIEW_RASTER_DPI') ?? 130)));
    this.maxPages = Number(cfg?.get('VIEW_MAX_PAGES') ?? 300);
  }

  private shouldRasterize(klasifikasi: string) {
    if (this.rasterMode === 'all') return true;
    return this.rasterMode === 'rahasia' && (klasifikasi === 'RAHASIA' || klasifikasi === 'SANGAT_RAHASIA');
  }

  async render(file: Buffer, mime: string, info: WatermarkInfo): Promise<Buffer> {
    const marked = await this.overlay(file, mime, info);
    const out = this.shouldRasterize(info.klasifikasi) ? await this.rasterize(marked) : await PDFDocument.load(marked);
    const label = info.klasifikasi.replace('_', ' ');
    out.setTitle(`${info.docId} - ${label}`);
    out.setSubject(`SANDI-Chain access ${info.accessTxId}`);
    out.setKeywords(['SANDI-Chain', info.accessTxId, info.nrp]);
    out.setProducer('SANDI-Chain');
    out.setCreator('SANDI-Chain');
    return Buffer.from(await out.save());
  }

  /** Render tiap halaman ke JPEG lalu susun ulang sebagai PDF berisi gambar saja. */
  private async rasterize(pdfBytes: Uint8Array): Promise<PDFDocument> {
    pdfjs ??= esmImport(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
    const lib = await pdfjs;
    const task = lib.getDocument({
      data: new Uint8Array(pdfBytes),
      // Font & cmap dari paket (tanpa font sistem / internet): cocok untuk container minimal & air-gapped.
      standardFontDataUrl: PDFJS_ROOT + '/standard_fonts/',
      cMapUrl: PDFJS_ROOT + '/cmaps/',
      cMapPacked: true,
      wasmUrl: PDFJS_ROOT + '/wasm/',
      iccUrl: PDFJS_ROOT + '/iccs/',
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    });
    const src = await task.promise;
    try {
      const out = await PDFDocument.create();
      for (let i = 1; i <= src.numPages; i++) {
        const page = await src.getPage(i);
        const base = page.getViewport({ scale: 1 }); // ukuran dalam pt, sudah memperhitungkan rotasi
        let scale = this.dpi / 72;
        scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
        const vp = page.getViewport({ scale });
        const canvas = createCanvas(Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
        const img = await out.embedJpg(canvas.toBuffer('image/jpeg', 82));
        out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        page.cleanup();
      }
      return out;
    } finally {
      await task.destroy();
    }
  }

  private async overlay(file: Buffer, mime: string, info: WatermarkInfo): Promise<Uint8Array> {
    const pdf = await this.toPdf(file, mime);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    const label = info.klasifikasi.replace('_', ' ');
    const mark = `${info.nama} | NRP ${info.nrp} | ${info.waktu}`;

    for (const page of pdf.getPages()) {
      this.tile(page, font, mark);
      this.banner(page, font, label);
      const footer = `Diakses oleh ${info.nama} (${info.jabatan}) | ${info.waktu} | doc ${info.docId} | tx ${info.accessTxId.slice(0, 16)}`;
      page.drawText(footer, { x: 20, y: 10, size: 7, font: small, color: rgb(0.55, 0.1, 0.1) });
    }

    return pdf.save();
  }

  /** Tolak saat upload file yang nanti tidak bisa ditampilkan (PDF terenkripsi/rusak). */
  async assertRenderable(file: Buffer, mime: string) {
    try {
      const pdf = await this.toPdf(file, mime);
      if (pdf.getPageCount() > this.maxPages) {
        throw new BadRequestException(`Dokumen ${pdf.getPageCount()} halaman melebihi batas ${this.maxPages} halaman`);
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`File tidak dapat dibuka viewer aman (PDF terenkripsi atau rusak): ${(e as Error).message}`);
    }
  }

  private async toPdf(file: Buffer, mime: string): Promise<PDFDocument> {
    if (mime === 'application/pdf') {
      return PDFDocument.load(file, { ignoreEncryption: false });
    }
    if (mime === 'image/png' || mime === 'image/jpeg') {
      const pdf = await PDFDocument.create();
      const img = mime === 'image/png' ? await pdf.embedPng(file) : await pdf.embedJpg(file);
      const maxW = 595; // A4 width pt
      const scale = Math.min(1, maxW / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      const page = pdf.addPage([w, h + 30]);
      page.drawImage(img, { x: 0, y: 20, width: w, height: h });
      return pdf;
    }
    throw new BadRequestException(`Tipe file ${mime} tidak dapat ditampilkan di viewer aman`);
  }

  private tile(page: PDFPage, font: PDFFont, text: string) {
    const { width, height } = page.getSize();
    const size = 11;
    const tw = font.widthOfTextAtSize(text, size);
    const stepX = tw + 40;
    const stepY = 70;
    let row = 0;
    for (let y = -height; y < height * 2; y += stepY, row++) {
      const shift = (row % 2) * (stepX / 2); // baris berselang-seling agar tidak ada area kosong
      for (let x = -width - shift; x < width * 2; x += stepX) {
        page.drawText(text, { x, y, size, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.18, rotate: degrees(30) });
      }
    }
  }

  private banner(page: PDFPage, font: PDFFont, label: string) {
    const { width, height } = page.getSize();
    const size = 12;
    const tw = font.widthOfTextAtSize(label, size);
    for (const y of [height - 18, 22]) {
      page.drawText(label, { x: (width - tw) / 2, y, size, font, color: rgb(0.75, 0.05, 0.05) });
    }
  }
}
