import { BadRequestException, Injectable } from '@nestjs/common';
import { degrees, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

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
 */
@Injectable()
export class WatermarkService {
  async render(file: Buffer, mime: string, info: WatermarkInfo): Promise<Buffer> {
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

    pdf.setTitle(`${info.docId} - ${label}`);
    pdf.setSubject(`SANDI-Chain access ${info.accessTxId}`);
    pdf.setKeywords(['SANDI-Chain', info.accessTxId, info.nrp]);
    pdf.setProducer('SANDI-Chain');
    pdf.setCreator('SANDI-Chain');
    return Buffer.from(await pdf.save());
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
