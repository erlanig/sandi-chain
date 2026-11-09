import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface Sealed {
  ciphertext: Buffer;
  iv: string; // base64
  authTag: string; // base64
  wrappedDek: string; // DEK terenkripsi oleh KEK (Vault transit / local)
}

/**
 * Envelope encryption:
 *  - tiap dokumen punya DEK (AES-256) sendiri
 *  - DEK dibungkus KEK yang TIDAK pernah keluar dari Vault (transit engine)
 *  - yang disimpan hanya ciphertext + DEK terbungkus
 * Akibatnya admin MinIO / DBA tidak bisa membaca isi dokumen.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly log = new Logger(CryptoService.name);
  private readonly mode: 'vault' | 'local';
  private localKek?: Buffer;

  constructor(private readonly cfg: ConfigService) {
    this.mode = cfg.get('KMS_MODE', 'vault') === 'local' ? 'local' : 'vault';
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
    // Pastikan transit engine + key ada (idempoten; di dev token=root).
    try {
      await this.vault('POST', '/v1/sys/mounts/transit', { type: 'transit' }).catch(() => undefined);
      await this.vault('POST', `/v1/transit/keys/${this.keyName}`, { type: 'aes256-gcm96' }).catch(() => undefined);
      this.log.log(`Vault transit siap (key: ${this.keyName})`);
    } catch (e) {
      this.log.error(`Vault tidak dapat dihubungi: ${(e as Error).message}`);
    }
  }

  static sha256(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  async seal(plain: Buffer): Promise<Sealed> {
    const { dek, wrapped } = await this.newDek();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([c.update(plain), c.final()]);
    const authTag = c.getAuthTag();
    dek.fill(0);
    return { ciphertext, iv: iv.toString('base64'), authTag: authTag.toString('base64'), wrappedDek: wrapped };
  }

  async open(s: Sealed): Promise<Buffer> {
    const dek = await this.unwrap(s.wrappedDek);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(s.iv, 'base64'));
      d.setAuthTag(Buffer.from(s.authTag, 'base64'));
      return Buffer.concat([d.update(s.ciphertext), d.final()]);
    } finally {
      dek.fill(0);
    }
  }

  // ---------------------------------------------------------------------

  private get keyName() {
    return this.cfg.get('VAULT_TRANSIT_KEY', 'sandichain');
  }

  private async newDek(): Promise<{ dek: Buffer; wrapped: string }> {
    if (this.mode === 'local') {
      const dek = crypto.randomBytes(32);
      return { dek, wrapped: this.localWrap(dek) };
    }
    const r = await this.vault('POST', `/v1/transit/datakey/plaintext/${this.keyName}`, { bits: 256 });
    return { dek: Buffer.from(r.data.plaintext, 'base64'), wrapped: r.data.ciphertext };
  }

  private async unwrap(wrapped: string): Promise<Buffer> {
    if (this.mode === 'local') return this.localUnwrap(wrapped);
    const r = await this.vault('POST', `/v1/transit/decrypt/${this.keyName}`, { ciphertext: wrapped });
    return Buffer.from(r.data.plaintext, 'base64');
  }

  private localWrap(dek: Buffer): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.localKek!, iv);
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return 'local:v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  }

  private localUnwrap(w: string): Buffer {
    const raw = Buffer.from(w.replace(/^local:v1:/, ''), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', this.localKek!, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async vault(method: string, p: string, body?: unknown): Promise<any> {
    const res = await fetch(this.cfg.get('VAULT_ADDR', 'http://localhost:8200') + p, {
      method,
      headers: { 'X-Vault-Token': this.cfg.get('VAULT_TOKEN', ''), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).catch((e) => {
      throw new ServiceUnavailableException(`Vault tidak dapat dihubungi: ${e.message}`);
    });
    if (!res.ok) throw new ServiceUnavailableException(`Vault ${p}: HTTP ${res.status} ${await res.text()}`);
    return res.status === 204 ? {} : res.json();
  }
}
