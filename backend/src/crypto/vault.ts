import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

/** Konteks pengikat kunci: DEK dokumen hanya bisa dibuka dengan konteks yang sama. */
export interface KeyContext {
  docId: string;
  channel: string;
}

/** Bukti akses: entri ACCESS_GRANTED di ledger untuk dokumen ini. */
export interface AccessProof extends KeyContext {
  txId: string;
}

/** DEK dibungkus kunci transit "derived" dengan konteks channel/docId. */
export const DOC_KEY_PREFIX = 'kg:v1:';

export function contextString(ctx: KeyContext) {
  return `${ctx.channel}/${ctx.docId}`;
}

export class VaultClient {
  constructor(
    private readonly addr: string,
    private readonly token: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request(method: string, p: string, body?: unknown): Promise<any> {
    const res = await fetch(this.addr + p, {
      method,
      headers: { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    }).catch((e) => {
      throw new ServiceUnavailableException(`Vault tidak dapat dihubungi: ${e.message}`);
    });
    // 400 dari decrypt = ciphertext/konteks salah (DEK di DB dimanipulasi atau konteks tidak cocok)
    if (res.status === 400) throw new UnprocessableEntityException(`Vault ${p}: ${await res.text()}`);
    if (!res.ok) throw new ServiceUnavailableException(`Vault ${p}: HTTP ${res.status} ${await res.text()}`);
    return res.status === 204 ? {} : res.json();
  }

  /** Buat DEK baru yang dibungkus kunci dokumen (derived, konteks channel/docId). */
  async newDocDek(docKey: string, ctx: KeyContext): Promise<{ dek: Buffer; wrapped: string }> {
    const r = await this.request('POST', `/v1/transit/datakey/plaintext/${docKey}`, {
      bits: 256,
      context: b64(contextString(ctx)),
    });
    return { dek: Buffer.from(r.data.plaintext, 'base64'), wrapped: DOC_KEY_PREFIX + r.data.ciphertext };
  }

  /**
   * Buka DEK. Format baru wajib konteks yang cocok; format lama (sebelum
   * kunci derived) dibuka dengan kunci lama tanpa konteks, kalau diizinkan.
   */
  async unwrap(keys: { docKey: string; legacyKey: string }, wrapped: string, ctx: KeyContext, allowLegacy: boolean) {
    if (wrapped.startsWith(DOC_KEY_PREFIX)) {
      const r = await this.request('POST', `/v1/transit/decrypt/${keys.docKey}`, {
        ciphertext: wrapped.slice(DOC_KEY_PREFIX.length),
        context: b64(contextString(ctx)),
      });
      return Buffer.from(r.data.plaintext, 'base64');
    }
    if (!allowLegacy) throw new ServiceUnavailableException('DEK format lama tidak diizinkan');
    const r = await this.request('POST', `/v1/transit/decrypt/${keys.legacyKey}`, { ciphertext: wrapped });
    return Buffer.from(r.data.plaintext, 'base64');
  }
}

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64');
}
