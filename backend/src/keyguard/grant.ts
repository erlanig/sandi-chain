import type { AuditLog } from '../documents/documents.service';

export interface GrantCheck {
  ok: boolean;
  reason: string;
}

/**
 * Bukti akses sah jika entri ledger:
 *  - ada, untuk dokumen dan txId yang diminta
 *  - action = ACCESS_GRANTED (bukan ACCESS_DENIED / aksi lain)
 *  - masih baru: umur <= maxAgeSec, dan tidak lebih dari skewSec di masa depan
 */
export function checkGrant(
  log: AuditLog | null | undefined,
  req: { docId: string; txId: string },
  nowMs: number,
  maxAgeSec: number,
  skewSec = 30,
): GrantCheck {
  if (!log) return { ok: false, reason: 'tidak ada entri akses di ledger' };
  if (log.docId !== req.docId || log.txId !== req.txId) return { ok: false, reason: 'entri ledger tidak sesuai permintaan' };
  if (log.action !== 'ACCESS_GRANTED') return { ok: false, reason: `entri ledger bukan ACCESS_GRANTED (${log.action})` };
  const t = Date.parse(log.timestamp);
  if (Number.isNaN(t)) return { ok: false, reason: 'timestamp entri ledger tidak valid' };
  if (t > nowMs + skewSec * 1000) return { ok: false, reason: 'timestamp entri ledger di masa depan' };
  if (nowMs - t > maxAgeSec * 1000) return { ok: false, reason: `bukti akses kedaluwarsa (> ${maxAgeSec} detik)` };
  return { ok: true, reason: `ACCESS_GRANTED oleh ${log.actor}` };
}

/**
 * Satu bukti akses = satu kali pelepasan kunci. Cukup in-memory: bukti yang
 * lebih tua dari maxAge ditolak checkGrant, jadi daftar ini hanya perlu
 * mengingat txId selama jendela waktu tersebut.
 */
export class ReplayGuard {
  private readonly used = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  /** true kalau txId belum pernah dipakai (dan sekarang ditandai terpakai). */
  claim(txId: string, nowMs = Date.now()): boolean {
    for (const [k, exp] of this.used) if (exp < nowMs) this.used.delete(k);
    if (this.used.has(txId)) return false;
    this.used.set(txId, nowMs + this.ttlMs);
    return true;
  }
}
