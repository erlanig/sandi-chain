import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService, PendingVersion } from '../db/db.service';
import { FabricService } from '../fabric/fabric.service';
import { AppUser, UsersService } from '../users/users.service';
import { ChainDoc, DocumentsService } from './documents.service';

/** Baris pending baru diperiksa setelah umur ini (beri waktu commit normal selesai). */
const MIN_AGE_SEC = 120;
/** Setelah umur ini, versi yang tidak ada di ledger dianggap gagal lalu dihapus. */
const GIVE_UP_SEC = 15 * 60;
const INTERVAL_MS = 60_000;

/**
 * Rekonsiliasi metadata off-chain dengan ledger untuk transaksi yang status
 * commit-nya tidak diketahui (CommitUnknownError). Ledger adalah sumber kebenaran:
 *  - hash versi ada di ledger    => committed
 *  - tidak ada setelah GIVE_UP   => metadata + objek terenkripsi dihapus
 */
@Injectable()
export class ReconcileService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ReconcileService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly cfg: ConfigService,
    private readonly db: DbService,
    private readonly fabric: FabricService,
    private readonly users: UsersService,
    private readonly docs: DocumentsService,
  ) {}

  onApplicationBootstrap() {
    const sentinel = this.users.find(this.cfg.get('SENTINEL_USER', 'sentinel'));
    if (!sentinel) {
      this.log.warn('User sentinel tidak ada, rekonsiliasi ledger tidak dijalankan');
      return;
    }
    this.timer = setInterval(() => void this.run(sentinel), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(sentinel: AppUser) {
    if (this.running) return;
    this.running = true;
    try {
      for (const p of await this.db.listPending(MIN_AGE_SEC)) {
        await this.reconcile(sentinel, p).catch((e) =>
          this.log.warn(`Rekonsiliasi ${p.doc_id} v${p.version} ditunda: ${(e as Error).message}`),
        );
      }
    } catch (e) {
      this.log.warn(`Rekonsiliasi gagal: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async reconcile(sentinel: AppUser, p: PendingVersion) {
    let chain: ChainDoc | null = null;
    try {
      chain = await this.fabric.evaluate<ChainDoc>(sentinel, p.channel, 'GetDocument', p.doc_id);
    } catch (e) {
      if (!(e instanceof NotFoundException)) throw e; // jaringan bermasalah: coba lagi nanti
    }
    const onLedger = !!chain && (chain.hash === p.sha256 || chain.history.includes(p.sha256));
    if (onLedger) {
      await this.db.markCommitted(p.doc_id, p.version);
      this.log.log(`${p.doc_id} v${p.version} terkonfirmasi di ledger`);
    } else if (p.age_sec >= GIVE_UP_SEC) {
      await this.docs.discard(p);
      this.log.warn(`${p.doc_id} v${p.version} tidak pernah masuk ledger, metadata & objek dihapus`);
    }
  }
}
