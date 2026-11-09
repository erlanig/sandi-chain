import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloseableAsyncIterable, ChaincodeEvent } from '@hyperledger/fabric-gateway';
import * as fs from 'fs';
import * as path from 'path';
import { Subject } from 'rxjs';
import { AlertRow, DbService } from '../db/db.service';
import { FabricService } from '../fabric/fabric.service';
import { UsersService } from '../users/users.service';

export type AlertType = 'UnauthorizedAccess' | 'DocumentTampered' | 'StorageIntegrity';

const ALERT_EVENTS: AlertType[] = ['UnauthorizedAccess', 'DocumentTampered'];
const utf8 = new TextDecoder();

/**
 * Sentinel: mendengarkan chaincode event di setiap channel, menyimpannya
 * sebagai alert, lalu meneruskan ke:
 *   1. dashboard (Server-Sent Events, real time)
 *   2. file JSON-lines  -> di-tail agent Wazuh/Filebeat
 *   3. webhook          -> Telegram bot / SOAR / sistem piket
 * Checkpoint disimpan per channel sehingga tidak ada event yang hilang saat restart.
 */
@Injectable()
export class AlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(AlertsService.name);
  readonly stream$ = new Subject<{ kind: 'alert' | 'info'; data: unknown }>();
  private iterators: CloseableAsyncIterable<ChaincodeEvent>[] = [];
  private stopped = false;

  constructor(
    private readonly cfg: ConfigService,
    private readonly fabric: FabricService,
    private readonly users: UsersService,
    private readonly db: DbService,
  ) {}

  onApplicationBootstrap() {
    const sentinel = this.users.find(this.cfg.get('SENTINEL_USER', 'sentinel'));
    if (!sentinel) {
      this.log.warn('User sentinel tidak ada, listener event tidak dijalankan');
      return;
    }
    for (const ch of this.fabric.allChannels()) void this.listen(ch, sentinel);
  }

  onModuleDestroy() {
    this.stopped = true;
    this.iterators.forEach((i) => i.close());
  }

  /** Alert yang dibangkitkan backend sendiri (mis. ciphertext di storage dimanipulasi). */
  async raise(type: AlertType, data: { docId: string; actor: string; org?: string; reason: string; txId: string }) {
    await this.handle(type, 'off-chain', undefined, { ...data });
  }

  private async listen(channel: string, sentinel: NonNullable<ReturnType<UsersService['find']>>) {
    let backoff = 2_000;
    while (!this.stopped) {
      try {
        const cp = await this.db.getCheckpoint(channel);
        const network = this.fabric.network(sentinel, channel);
        const events = await network.getChaincodeEvents(this.fabric.chaincodeName, {
          startBlock: cp ? cp.block : 0n,
        });
        this.iterators.push(events);
        this.log.log(`Sentinel aktif di ${channel} mulai blok ${cp ? cp.block : 0n}`);
        backoff = 2_000;

        for await (const ev of events) {
          const payload = JSON.parse(utf8.decode(ev.payload) || '{}');
          if (ALERT_EVENTS.includes(ev.eventName as AlertType)) {
            await this.handle(ev.eventName as AlertType, channel, ev.blockNumber, { ...payload, txId: ev.transactionId });
          } else {
            this.stream$.next({ kind: 'info', data: { event: ev.eventName, channel, ...payload } });
          }
          await this.db.saveCheckpoint(channel, ev.blockNumber, ev.transactionId);
        }
      } catch (e) {
        if (this.stopped) return;
        this.log.warn(`Listener ${channel} terputus: ${(e as Error).message}. Coba lagi dalam ${backoff / 1000}s`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  }

  private async handle(type: AlertType, channel: string, block: bigint | undefined, p: Record<string, string>) {
    const row = await this.db.insertAlert({
      type,
      doc_id: p.docId,
      actor: p.actor,
      org: p.org,
      reason: p.reason ?? '',
      tx_id: p.txId,
      channel,
      block: block?.toString() ?? '',
      payload: p,
    });
    if (!row) return; // duplikat (event diputar ulang dari checkpoint)

    this.log.warn(`[ALERT] ${type} doc=${p.docId} oleh ${p.actor} (${p.org ?? '-'}): ${p.reason}`);
    this.stream$.next({ kind: 'alert', data: row });
    this.toFile(row);
    void this.toWebhook(row);
  }

  private toFile(row: AlertRow) {
    const file = this.cfg.get<string>('ALERT_LOG_FILE');
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.appendFileSync(
        file,
        JSON.stringify({ '@timestamp': new Date().toISOString(), app: 'sandi-chain', severity: severity(row.type), ...row }) +
          '\n',
      );
    } catch (e) {
      this.log.error(`Gagal menulis ${file}: ${(e as Error).message}`);
    }
  }

  private async toWebhook(row: AlertRow) {
    const url = this.cfg.get<string>('ALERT_WEBHOOK_URL');
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[SANDI-Chain] ${row.type} - dokumen ${row.doc_id} - pelaku ${row.actor} (${row.org}) - ${row.reason}`,
          severity: severity(row.type),
          alert: row,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (e) {
      this.log.error(`Webhook alert gagal: ${(e as Error).message}`);
    }
  }
}

function severity(t: string) {
  return t === 'UnauthorizedAccess' ? 'high' : 'critical';
}
