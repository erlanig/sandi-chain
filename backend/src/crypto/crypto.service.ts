import { ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AccessProof, contextString, KeyContext, VaultClient } from './vault';

export interface Sealed {
  ciphertext: Buffer;
  iv: string; // base64
  authTag: string; // base64
  wrappedDek: string; // DEK terenkripsi oleh KEK (Vault transit / local)
}

/**
 * Envelope encryption:
 *  - tiap dokumen punya DEK (AES-256) sendiri
 *  - DEK dibungkus KEK yang TIDAK pernah keluar dari Vault (transit engine),
 *    dengan konteks channel/docId sehingga DEK satu dokumen tidak bisa dibuka
 *    atas nama dokumen lain
 *  - yang disimpan hanya ciphertext + DEK terbungkus
 *
 * Membuka DEK (mode vault + KEYGUARD_URL): backend TIDAK punya izin decrypt di
 * Vault. Ia meminta KeyGuard, yang hanya mau membuka DEK kalau ada entri
 * ACCESS_GRANTED baru di ledger (lihat src/keyguard). Jadi setiap dekripsi,
 * bahkan oleh backend yang dibobol, pasti meninggalkan jejak di ledger.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly log = new Logger(CryptoService.name);
  private readonly mode: 'vault' | 'local';
  private localKek?: Buffer;
  private readonly vault: VaultClient;
  private readonly keyguardUrl: string;

  constructor(private readonly cfg: ConfigService) {
    this.mode = cfg.get('KMS_MODE', 'vault') === 'local' ? 'local' : 'vault';
    this.vault = new VaultClient(cfg.get('VAULT_ADDR', 'http://localhost:8200'), cfg.get('VAULT_TOKEN', ''));
    this.keyguardUrl = (cfg.get<string>('KEYGUARD_URL') ?? '').replace(/\/$/, '');
  }

  async onModuleInit() {
    if (this.mode === 'local') {
      const k = this.cfg.get<string>('LOCAL_KEK');
      this.localKek = k ? Buffer.from(k, 'base64') : undefined;
      if (this.localKek?.length !== 32) {
        throw new Error('KMS_MODE=local butuh LOCAL_KEK 32 byte base64 (openssl rand -base64 32)');
      }
      this.log.warn('KMS_MODE=local: KEK disimpan di env. Hanya untuk development.');
      return;
    }
    if (this.cfg.get('KEYGUARD_VAULT_TOKEN')) {
      this.log.warn('KEYGUARD_VAULT_TOKEN terbaca oleh backend API. Pindahkan ke keyguard.env agar backend tidak memegang izin decrypt.');
    }
    if (this.keyguardUrl) {
      if ((this.cfg.get<string>('KEYGUARD_SECRET') ?? '').length < 32) {
        throw new Error('KEYGUARD_SECRET wajib diisi (minimal 32 karakter) saat KEYGUARD_URL dipakai');
      }
      this.log.log(`Dekripsi lewat KeyGuard ${this.keyguardUrl}`);
    } else {
      this.log.warn('KEYGUARD_URL kosong: backend membuka DEK langsung di Vault. Hanya untuk development.');
    }
    // Dev convenience dengan token root. Produksi: jalankan scripts/vault-setup.sh;
    // token backend tidak punya izin membuat mount/key, jadi langkah ini gagal diam-diam.
    await this.vault.request('POST', '/v1/sys/mounts/transit', { type: 'transit' }).catch(() => undefined);
    await this.vault
      .request('POST', `/v1/transit/keys/${this.docKey}`, { type: 'aes256-gcm96', derived: true })
      .catch(() => undefined);
  }

  static sha256(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  async seal(plain: Buffer, ctx: KeyContext): Promise<Sealed> {
    const { dek, wrapped } = await this.newDek(ctx);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([c.update(plain), c.final()]);
    const authTag = c.getAuthTag();
    dek.fill(0);
    return { ciphertext, iv: iv.toString('base64'), authTag: authTag.toString('base64'), wrappedDek: wrapped };
  }

  /** `proof` = txId ACCESS_GRANTED dari RequestAccess untuk dokumen ini. */
  async open(s: Sealed, proof: AccessProof): Promise<Buffer> {
    const dek = await this.unwrap(s.wrappedDek, proof);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(s.iv, 'base64'));
      d.setAuthTag(Buffer.from(s.authTag, 'base64'));
      return Buffer.concat([d.update(s.ciphertext), d.final()]);
    } finally {
      dek.fill(0);
    }
  }

  // ---------------------------------------------------------------------

  private get docKey() {
    return this.cfg.get('VAULT_DOC_KEY', 'sandichain-doc');
  }

  private get legacyKey() {
    return this.cfg.get('VAULT_TRANSIT_KEY', 'sandichain');
  }

  private async newDek(ctx: KeyContext): Promise<{ dek: Buffer; wrapped: string }> {
    if (this.mode === 'local') {
      const dek = crypto.randomBytes(32);
      return { dek, wrapped: this.localWrap(dek, ctx) };
    }
    return this.vault.newDocDek(this.docKey, ctx);
  }

  private async unwrap(wrapped: string, proof: AccessProof): Promise<Buffer> {
    if (this.mode === 'local') return this.localUnwrap(wrapped, proof);
    if (!this.keyguardUrl) {
      return this.vault.unwrap({ docKey: this.docKey, legacyKey: this.legacyKey }, wrapped, proof, true);
    }
    const res = await fetch(`${this.keyguardUrl}/keyguard/unwrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Keyguard-Secret': this.cfg.get('KEYGUARD_SECRET', '') },
      body: JSON.stringify({ ...proof, wrappedDek: wrapped }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e) => {
      throw new ServiceUnavailableException(`KeyGuard tidak dapat dihubungi: ${e.message}`);
    });
    const body = (await res.json().catch(() => ({}))) as { dek?: string; message?: string };
    if (res.status === 403) throw new ForbiddenException(`KeyGuard menolak melepas kunci: ${body.message ?? ''}`);
    // 422 = DEK terbungkus tidak bisa dibuka => diperlakukan sebagai masalah integritas oleh pemanggil
    if (res.status === 422) throw new Error(`DEK tidak dapat dibuka: ${body.message ?? ''}`);
    if (!res.ok) throw new ServiceUnavailableException(`KeyGuard HTTP ${res.status}: ${body.message ?? ''}`);
    if (!body.dek) throw new ServiceUnavailableException('KeyGuard tidak mengembalikan kunci');
    return Buffer.from(body.dek, 'base64');
  }

  // local:v2 = AES-GCM dengan AAD channel/docId (pengikat konteks seperti Vault derived key)
  private localWrap(dek: Buffer, ctx: KeyContext): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.localKek!, iv);
    c.setAAD(Buffer.from(contextString(ctx)));
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return 'local:v2:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  }

  private localUnwrap(w: string, ctx: KeyContext): Buffer {
    const v2 = w.startsWith('local:v2:');
    const raw = Buffer.from(w.replace(/^local:v[12]:/, ''), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', this.localKek!, raw.subarray(0, 12));
    if (v2) d.setAAD(Buffer.from(contextString(ctx)));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
  }
}
