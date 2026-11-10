import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';

/** Perangkat pengguna menolak atau tidak menjawab: pesan PASTI tidak ditandatangani. */
export class SignError extends ServiceUnavailableException {}
export class SignRefusedError extends ForbiddenException {}

export interface SignRequest {
  id: string;
  /** Pesan utuh (bukan digest) dalam base64: perangkat memeriksa isinya sebelum menandatangani. */
  message: string;
}

interface Pending {
  id: string;
  message: Uint8Array;
  deliveredAt: number;
  resolve: (sig: Uint8Array) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

const SIGN_TIMEOUT_MS = 30_000;
/** Permintaan yang sudah dikirim tapi belum dijawab dikirim ulang setelah ini (tab tertutup, koneksi putus). */
const REDELIVER_MS = 5_000;
const MAX_PENDING_PER_USER = 100;

/**
 * Perantara tanda tangan untuk SIGNING_MODE=client. Kunci privat personel ada
 * di perangkat mereka; backend hanya menitipkan pesan yang perlu ditandatangani
 * dan menunggu jawabannya:
 *
 *   FabricService --request()--> antrean --GET /sign/next--> perangkat
 *   FabricService <--tanda tangan-- POST /sign/:id <------- perangkat
 *
 * State in-memory: kalau backend dijalankan beberapa instance, pakai sticky
 * session supaya perangkat dan request API-nya mendarat di instance yang sama.
 */
@Injectable()
export class SignBroker {
  private readonly queues = new Map<string, Map<string, Pending>>();
  private readonly waiters = new Map<string, Set<(r: SignRequest | null) => void>>();

  /** Minta perangkat `username` menandatangani `message`. Hasil: r||s (64 byte). */
  request(username: string, message: Uint8Array): Promise<Uint8Array> {
    let q = this.queues.get(username);
    if (!q) this.queues.set(username, (q = new Map()));
    if (q.size >= MAX_PENDING_PER_USER) throw new SignError('Terlalu banyak permintaan tanda tangan yang tertunda');
    const queue = q;
    const id = crypto.randomUUID();
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        queue.delete(id);
        reject(new SignError('Perangkat tidak menandatangani. Pastikan portal terbuka dan kartu identitas sudah diimpor.'));
      }, SIGN_TIMEOUT_MS);
      queue.set(id, { id, message, deliveredAt: 0, resolve, reject, timer });
      this.wake(username);
    });
  }

  /** Long-poll: permintaan berikutnya untuk perangkat ini, atau null setelah `waitMs`. */
  next(username: string, waitMs: number, onAbort?: (cancel: () => void) => void): Promise<SignRequest | null> {
    const ready = this.take(username);
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
      let set = this.waiters.get(username);
      if (!set) this.waiters.set(username, (set = new Set()));
      const waiters = set;
      const done = (r: SignRequest | null) => {
        clearTimeout(timer);
        waiters.delete(done);
        resolve(r);
      };
      const timer = setTimeout(() => done(null), waitMs);
      waiters.add(done);
      onAbort?.(() => done(null));
    });
  }

  complete(username: string, id: string, signature: Uint8Array) {
    const p = this.pop(username, id);
    p.resolve(signature);
  }

  refuse(username: string, id: string, reason: string) {
    const p = this.pop(username, id);
    p.reject(new SignRefusedError(`Perangkat menolak menandatangani: ${reason.slice(0, 200)}`));
  }

  private pop(username: string, id: string): Pending {
    const p = this.queues.get(username)?.get(id);
    if (!p) throw new NotFoundException('Permintaan tanda tangan tidak ada atau sudah kedaluwarsa');
    clearTimeout(p.timer);
    this.queues.get(username)!.delete(id);
    return p;
  }

  private take(username: string): SignRequest | null {
    const now = Date.now();
    for (const p of this.queues.get(username)?.values() ?? []) {
      if (p.deliveredAt && now - p.deliveredAt < REDELIVER_MS) continue;
      p.deliveredAt = now;
      return { id: p.id, message: Buffer.from(p.message).toString('base64') };
    }
    return null;
  }

  private wake(username: string) {
    for (const w of this.waiters.get(username) ?? []) {
      const r = this.take(username);
      if (!r) return;
      w(r);
    }
  }
}
