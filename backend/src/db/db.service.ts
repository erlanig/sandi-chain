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
  status?: SyncStatus;
}

/**
 * pending   = sudah tersimpan off-chain, transaksi Fabric belum terkonfirmasi
 * committed = transaksi Fabric sukses (atau dikonfirmasi rekonsiliasi)
 */
export type SyncStatus = 'pending' | 'committed';

export interface PendingVersion {
  doc_id: string;
  version: number;
  object_key: string;
  sha256: string;
  channel: string;
  doc_status: SyncStatus;
  age_sec: number;
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
  status?: SyncStatus;
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
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  username TEXT PRIMARY KEY,
  count    INT NOT NULL,
  until    TIMESTAMPTZ NOT NULL
);
-- migrasi: baris lama dianggap sudah committed
ALTER TABLE documents         ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'committed';
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'committed';
CREATE INDEX IF NOT EXISTS document_versions_pending ON document_versions (created_at) WHERE status = 'pending';
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
   * Simpan metadata sebagai `pending` SEBELUM transaksi Fabric dikirim.
   * Transaksi DB tidak dibiarkan terbuka selama menunggu commit Fabric:
   * kalau status commit tidak pasti (timeout), baris pending tetap ada dan
   * diputuskan oleh rekonsiliasi berdasarkan isi ledger.
   * `doc` diisi hanya untuk dokumen baru (versi 1).
   */
  async insertPending(doc: Omit<DocRow, 'created_at' | 'status'> | null, v: VersionRow): Promise<void> {
    await this.tx(async (c) => {
      if (doc) {
        await c.query(
          `INSERT INTO documents (doc_id, channel, klasifikasi, perihal, created_by, status)
           VALUES ($1,$2,$3,$4,$5,'pending')`,
          [doc.doc_id, doc.channel, doc.klasifikasi, doc.perihal, doc.created_by],
        );
      }
      await this.insertVersionWith(c, v);
    });
  }

  async markCommitted(docId: string, version: number) {
    await this.tx(async (c) => {
      await c.query(`UPDATE document_versions SET status='committed' WHERE doc_id=$1 AND version=$2`, [docId, version]);
      await c.query(`UPDATE documents SET status='committed' WHERE doc_id=$1`, [docId]);
    });
  }

  /** Hapus versi pending (dan dokumennya kalau dokumen itu juga masih pending). */
  async discardPending(docId: string, version: number) {
    await this.tx(async (c) => {
      await c.query(`DELETE FROM document_versions WHERE doc_id=$1 AND version=$2 AND status='pending'`, [docId, version]);
      await c.query(
        `DELETE FROM documents d WHERE d.doc_id=$1 AND d.status='pending'
           AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.doc_id=d.doc_id)`,
        [docId],
      );
    });
  }

  async nextVersion(docId: string): Promise<number> {
    const r = await this.pool.query('SELECT COALESCE(MAX(version),0)+1 AS n FROM document_versions WHERE doc_id=$1', [docId]);
    return Number(r.rows[0].n);
  }

  async hasPending(docId: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM document_versions WHERE doc_id=$1 AND status='pending' LIMIT 1`, [docId]);
    return r.rowCount! > 0;
  }

  async listPending(minAgeSec: number): Promise<PendingVersion[]> {
    return (
      await this.pool.query<PendingVersion>(
        `SELECT v.doc_id, v.version, v.object_key, v.sha256, d.channel, d.status AS doc_status,
                EXTRACT(EPOCH FROM now() - v.created_at)::int AS age_sec
           FROM document_versions v JOIN documents d USING (doc_id)
          WHERE v.status='pending' AND v.created_at < now() - make_interval(secs => $1)
          ORDER BY v.created_at LIMIT 100`,
        [minAgeSec],
      )
    ).rows;
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
      `INSERT INTO document_versions (doc_id, version, object_key, filename, mime, size, iv, auth_tag, wrapped_dek, sha256, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
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

  /**
   * Versi yang hash-nya cocok dengan ledger. Kalau tidak ada => storage dimanipulasi.
   * Status sengaja diabaikan: ledger adalah sumber kebenaran, jadi baris pending
   * yang hash-nya ada di ledger berarti transaksinya sudah ter-commit.
   */
  async getVersionByHash(docId: string, sha256: string): Promise<VersionRow | undefined> {
    return (
      await this.pool.query<VersionRow>('SELECT * FROM document_versions WHERE doc_id=$1 AND sha256=$2', [docId, sha256])
    ).rows[0];
  }

  async listVersions(docId: string) {
    return (
      await this.pool.query(
        "SELECT version, filename, mime, size, sha256, created_at FROM document_versions WHERE doc_id=$1 AND status='committed' ORDER BY version",
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

  // ------------------------------------------------ batas percobaan login
  // Disimpan di Postgres supaya berlaku sama di semua instance backend.

  async loginLocked(username: string, max: number): Promise<boolean> {
    const r = await this.pool.query('SELECT 1 FROM login_attempts WHERE username=$1 AND count >= $2 AND until > now()', [
      username,
      max,
    ]);
    return r.rowCount! > 0;
  }

  /** Catat satu kegagalan secara atomik; hitungan direset kalau jendela sebelumnya sudah lewat. */
  async loginFailed(username: string, windowSec: number) {
    await this.pool.query(
      `INSERT INTO login_attempts (username, count, until) VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (username) DO UPDATE SET
         count = CASE WHEN login_attempts.until < now() THEN 1 ELSE login_attempts.count + 1 END,
         until = now() + make_interval(secs => $2)`,
      [username, windowSec],
    );
  }

  async loginSucceeded(username: string) {
    await this.pool.query('DELETE FROM login_attempts WHERE username=$1', [username]);
  }

  // ------------------------------------------------ pencabutan sesi (logout)

  /** Catat token yang di-logout sampai masa berlakunya habis; sekalian buang yang sudah kedaluwarsa. */
  async revokeToken(jti: string, expiresAt: Date) {
    await this.pool.query('DELETE FROM revoked_tokens WHERE expires_at < now()');
    await this.pool.query('INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1,$2) ON CONFLICT DO NOTHING', [jti, expiresAt]);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    return (await this.pool.query('SELECT 1 FROM revoked_tokens WHERE jti=$1', [jti])).rowCount! > 0;
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
