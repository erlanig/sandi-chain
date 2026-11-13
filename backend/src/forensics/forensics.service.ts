import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { AlertsService } from '../alerts/alerts.service';
import { AuditLog, DocumentsService, UploadedFile } from '../documents/documents.service';
import { AppUser, UsersService } from '../users/users.service';
import { analyzeBehavior, DEFAULTS, LEVEL_ORDER, riskAlert } from './behavior';
import { buildTrace, parseLeakMetadata, TraceQuery } from './trace';

type Logs = (AuditLog & { channel: string })[];

/**
 * Forensik di atas jejak audit ledger:
 *  - risk()      skor risiko per personel (deteksi perilaku mencurigakan)
 *  - trace()     telusuri pembaca dari jejak di salinan bocoran
 *  - watcher     memindai berkala dan memunculkan alert SuspiciousBehavior untuk risiko tinggi/kritis
 */
@Injectable()
export class ForensicsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ForensicsService.name);
  private timer?: NodeJS.Timeout;
  private cache?: { at: number; logs: Logs };

  constructor(
    private readonly cfg: ConfigService,
    private readonly docs: DocumentsService,
    private readonly users: UsersService,
    private readonly alerts: AlertsService,
  ) {}

  onApplicationBootstrap() {
    const sec = Number(this.cfg.get('BEHAVIOR_INTERVAL_SEC', 60));
    if (!sec || sec < 5) return this.log.log('Pemindaian perilaku berkala dimatikan (BEHAVIOR_INTERVAL_SEC=0)');
    this.timer = setInterval(() => void this.scan(), sec * 1000);
    this.timer.unref();
    this.log.log(`Pemindaian perilaku tiap ${sec}s, alert mulai tingkat ${this.alertFrom()}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private options() {
    return {
      workStartHour: Number(this.cfg.get('WORK_START_HOUR', DEFAULTS.workStartHour)),
      workEndHour: Number(this.cfg.get('WORK_END_HOUR', DEFAULTS.workEndHour)),
    };
  }

  private alertFrom() {
    const v = this.cfg.get<string>('BEHAVIOR_ALERT_LEVEL', 'tinggi');
    return (LEVEL_ORDER as string[]).includes(v) && v !== 'rendah' ? v : 'tinggi';
  }

  /** Jejak audit seluruh channel; di-cache sebentar supaya halaman yang memanggil beruntun tidak memindai ledger berulang. */
  private async logs(user: AppUser, fresh = false): Promise<Logs> {
    if (!fresh && this.cache && Date.now() - this.cache.at < 5_000) return this.cache.logs;
    const logs = (await this.docs.allAudit(user)) as Logs;
    this.cache = { at: Date.now(), logs };
    return logs;
  }

  async risk(user: AppUser) {
    const actors = analyzeBehavior(await this.logs(user), this.options());
    return { generatedAt: new Date().toISOString(), options: this.options(), alertFrom: this.alertFrom(), actors };
  }

  async trace(user: AppUser, q: TraceQuery) {
    const result = buildTrace(await this.logs(user), this.users.all(), q);
    // Lengkapi data dokumen (perihal, klasifikasi) bila bisa dibaca; gagal tidak menggugurkan hasil.
    const docIds = [...new Set(result.matches.map((m) => m.access.docId))];
    const documents: Record<string, unknown> = {};
    for (const id of docIds) {
      try {
        const d = await this.docs.detail(user, id);
        documents[id] = { docId: id, nomor: d.nomor, perihal: d.perihal, klasifikasi: d.klasifikasi, channel: d.channel, ownerName: d.ownerName, ownerOrg: d.ownerOrg, revoked: d.revoked, version: d.version };
      } catch {
        /* metadata dokumen tidak tersedia */
      }
    }
    return { ...result, documents };
  }

  /** PDF bocoran: baca jejak yang ditanam saat render (judul, subjek, kata kunci), lalu telusuri. */
  async traceFile(user: AppUser, file: UploadedFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('File bocoran wajib diunggah');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Hanya PDF yang menyimpan metadata. Untuk foto layar, cari manual dari watermark.');
    }
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(file.buffer, { updateMetadata: false, ignoreEncryption: true });
    } catch {
      throw new BadRequestException('File bukan PDF yang valid');
    }
    const extracted = parseLeakMetadata({ title: pdf.getTitle(), subject: pdf.getSubject(), keywords: pdf.getKeywords() });
    if (!extracted.txId && !extracted.nrp) {
      return {
        source: 'metadata' as const,
        extracted,
        status: 'not_found' as const,
        message: 'Jejak SANDI-Chain tidak ada di metadata (file bukan dari sistem ini, atau metadatanya dibersihkan). Cari manual dari watermark di halaman.',
        matches: [],
        documents: {},
      };
    }
    const r = await this.trace(user, extracted.txId ? { txId: extracted.txId } : { nrp: extracted.nrp, docId: extracted.docId });
    return { source: 'metadata' as const, extracted, ...r };
  }

  /** Pindai dengan akun Sentinel; alert hanya untuk tingkat >= BEHAVIOR_ALERT_LEVEL. Duplikat dibuang oleh DB (tx_id unik). */
  private async scan() {
    const sentinel = this.users.find(this.cfg.get('SENTINEL_USER', 'sentinel'));
    if (!sentinel) return;
    try {
      const from = LEVEL_ORDER.indexOf(this.alertFrom() as never);
      for (const r of analyzeBehavior(await this.logs(sentinel, true), this.options())) {
        if (LEVEL_ORDER.indexOf(r.level) < from) continue;
        await this.alerts.raise('SuspiciousBehavior', riskAlert(r));
      }
    } catch (e) {
      this.log.warn(`Pemindaian perilaku gagal: ${(e as Error).message}`);
    }
  }
}
