import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

export interface DocRow {
  doc_id: string;
  channel: string;
  klasifikasi: string;
  perihal: string;
  created_by: string;
  created_at: Date;
}

export interface VersionRow {
  doc_id: string;
  version: number;
  object_key: string;
  filename: string;
  mime: string;
  size: number;
  iv: string;
  auth_tag: string;
  wrapped_dek: string;
  sha256: string;
}

export interface AlertRow {
  id: number;
  type: string;
  doc_id: string;
  actor: string;
  org: string;
  reason: string;
  tx_id: string;
  channel: string;
  block: string;
  payload: Record<string, unknown>;
  created_at: Date;
  acknowledged: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  doc_id      TEXT PRIMARY KEY,
  channel     TEXT NOT NULL,
  klasifikasi TEXT NOT NULL,
  perihal     TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_versions (
  doc_id      TEXT NOT NULL REFERENCES documents(doc_id),
  version     INT  NOT NULL,
  object_key  TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INT  NOT NULL,
  iv          TEXT NOT NULL,
  auth_tag    TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, version)
);
CREATE TABLE IF NOT EXISTS alerts (
  id           SERIAL PRIMARY KEY,
  type         TEXT NOT NULL,
  doc_id       TEXT,
  actor        TEXT,
  org          TEXT,
  reason       TEXT,
  tx_id        TEXT NOT NULL,
  channel      TEXT NOT NULL,
  block        TEXT,
  payload      JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tx_id, type)
);
CREATE TABLE IF NOT EXISTS event_checkpoints (
  channel TEXT PRIMARY KEY,
  block   TEXT NOT NULL,
  tx_id   TEXT
);
`;

/**
 * PostgreSQL hanya menyimpan metadata off-chain (perihal, lokasi object,
 * DEK terbungkus) dan cache alert. Sumber kebenaran tetap ledger.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbService.name);
  readonly pool: Pool;

  constructor(cfg: ConfigService) {
    this.pool = new Pool({ connectionString: cfg.get('DATABASE_URL') });
  }

  async onModuleInit() {
    try {
      await this.pool.query(SCHEMA);
      this.log.log('Skema database siap');
    } catch (e) {
      this.log.error(`PostgreSQL tidak dapat dihubungi: ${(e as Error).message}`);
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }

  /**
   * Insert metadata lalu jalankan `onChain` (transaksi Fabric) SEBELUM commit.
   * Kalau transaksi blockchain gagal, metadata ikut di-rollback sehingga
   * DB tidak pernah berisi dokumen yang tidak ada di ledger.
   */
  async insertDocument<T>(d: Omit<DocRow, 'created_at'>, v: VersionRow, onChain: () => Promise<T>): Promise<T> {
    return this.tx(async (c) => {
      await c.query(
        'INSERT INTO documents (doc_id, channel, klasifikasi, perihal, created_by) VALUES ($1,$2,$3,$4,$5)',
        [d.doc_id, d.channel, d.klasifikasi, d.perihal, d.created_by],
      );
      await this.insertVersionWith(c, v);
      return onChain();
    });
  }

  async insertVersion<T>(v: VersionRow, onChain: () => Promise<T>): Promise<T> {
    return this.tx(async (c) => {
      await this.insertVersionWith(c, v);
      return onChain();
    });
  }

  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  private insertVersionWith(q: PoolClient, v: VersionRow) {
    return q.query(
      `INSERT INTO document_versions (doc_id, version, object_key, filename, mime, size, iv, auth_tag, wrapped_dek, sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.doc_id, v.version, v.object_key, v.filename, v.mime, v.size, v.iv, v.auth_tag, v.wrapped_dek, v.sha256],
    );
  }

  async getDocument(docId: string): Promise<DocRow | undefined> {
    return (await this.pool.query<DocRow>('SELECT * FROM documents WHERE doc_id=$1', [docId])).rows[0];
  }

  async getDocuments(ids: string[]): Promise<DocRow[]> {
    if (!ids.length) return [];
    return (await this.pool.query<DocRow>('SELECT * FROM documents WHERE doc_id = ANY($1)', [ids])).rows;
  }

  /** Versi yang hash-nya cocok dengan ledger. Kalau tidak ada => storage dimanipulasi. */
  async getVersionByHash(docId: string, sha256: string): Promise<VersionRow | undefined> {
    return (
      await this.pool.query<VersionRow>('SELECT * FROM document_versions WHERE doc_id=$1 AND sha256=$2', [docId, sha256])
    ).rows[0];
  }

  async listVersions(docId: string) {
    return (
      await this.pool.query(
        'SELECT version, filename, mime, size, sha256, created_at FROM document_versions WHERE doc_id=$1 ORDER BY version',
        [docId],
      )
    ).rows;
  }

  async insertAlert(a: Omit<AlertRow, 'id' | 'created_at' | 'acknowledged'>): Promise<AlertRow | undefined> {
    const r = await this.pool.query<AlertRow>(
      `INSERT INTO alerts (type, doc_id, actor, org, reason, tx_id, channel, block, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tx_id, type) DO NOTHING RETURNING *`,
      [a.type, a.doc_id, a.actor, a.org, a.reason, a.tx_id, a.channel, a.block, a.payload],
    );
    return r.rows[0];
  }

  async listAlerts(limit = 200): Promise<AlertRow[]> {
    return (await this.pool.query<AlertRow>('SELECT * FROM alerts ORDER BY id DESC LIMIT $1', [limit])).rows;
  }

  async ackAlert(id: number) {
    await this.pool.query('UPDATE alerts SET acknowledged=true WHERE id=$1', [id]);
  }

  async getCheckpoint(channel: string): Promise<{ block: bigint; txId?: string } | undefined> {
    const r = (await this.pool.query('SELECT block, tx_id FROM event_checkpoints WHERE channel=$1', [channel])).rows[0];
    return r ? { block: BigInt(r.block), txId: r.tx_id ?? undefined } : undefined;
  }

  async saveCheckpoint(channel: string, block: bigint, txId?: string) {
    await this.pool.query(
      `INSERT INTO event_checkpoints (channel, block, tx_id) VALUES ($1,$2,$3)
       ON CONFLICT (channel) DO UPDATE SET block=EXCLUDED.block, tx_id=EXCLUDED.tx_id`,
      [channel, block.toString(), txId ?? null],
    );
  }
}
