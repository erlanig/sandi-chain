import 'reflect-metadata';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Module,
  NotFoundException,
  OnApplicationBootstrap,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { VaultClient } from '../crypto/vault';
import type { AuditLog } from '../documents/documents.service';
import { FabricService } from '../fabric/fabric.service';
import { SignBroker } from '../signing/sign-broker';
import { AppUser, UsersService } from '../users/users.service';
import { checkGrant, ReplayGuard } from './grant';

interface UnwrapRequest {
  docId: string;
  channel: string;
  txId: string;
  wrappedDek: string;
}

/**
 * KeyGuard: satu-satunya komponen yang punya izin `transit/decrypt` di Vault.
 * Kunci dokumen hanya dilepas jika ledger memuat ACCESS_GRANTED yang baru
 * dan belum pernah dipakai untuk (channel, docId) tersebut. DEK di-derive
 * dengan konteks channel/docId, jadi bukti akses dokumen A tidak bisa
 * dipakai membuka dokumen B.
 *
 * Jalankan sebagai proses terpisah dengan token Vault sendiri
 * (scripts/vault-setup.sh), sehingga backend API tidak memegang izin decrypt.
 */
@Controller('keyguard')
class KeyguardController implements OnApplicationBootstrap {
  private readonly log = new Logger('KeyGuard');
  private readonly secret: Buffer;
  private readonly maxAgeSec: number;
  private readonly replay: ReplayGuard;
  private readonly vault: VaultClient;
  private readonly allowLegacy: boolean;
  private user?: AppUser;

  constructor(
    private readonly cfg: ConfigService,
    private readonly fabric: FabricService,
    private readonly users: UsersService,
  ) {
    const secret = cfg.get<string>('KEYGUARD_SECRET') ?? '';
    if (secret.length < 32) throw new Error('KEYGUARD_SECRET wajib diisi (minimal 32 karakter)');
    this.secret = Buffer.from(secret);
    const token = cfg.get<string>('KEYGUARD_VAULT_TOKEN');
    if (!token) throw new Error('KEYGUARD_VAULT_TOKEN wajib diisi (lihat scripts/vault-setup.sh)');
    this.vault = new VaultClient(cfg.get('VAULT_ADDR', 'http://localhost:8200'), token);
    this.maxAgeSec = Number(cfg.get('KEYGUARD_GRANT_MAX_AGE_SEC', 120));
    this.replay = new ReplayGuard((this.maxAgeSec + 60) * 1000);
    this.allowLegacy = cfg.get('KEYGUARD_ALLOW_LEGACY_DEK', 'true') === 'true';
  }

  /** Dicek setelah semua provider siap (urutan hook init tidak dijamin). */
  onApplicationBootstrap() {
    this.identity();
  }

  private identity(): AppUser {
    if (this.user) return this.user;
    const name = this.cfg.get('KEYGUARD_USER', 'keyguard');
    const u = this.users.find(name);
    if (!u) throw new Error(`Identitas Fabric "${name}" tidak ada di users.json. Jalankan npm run enroll`);
    return (this.user = u);
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'sandi-keyguard' };
  }

  @Post('unwrap')
  @HttpCode(200)
  async unwrap(@Headers('x-keyguard-secret') secret: string | undefined, @Body() b: UnwrapRequest) {
    const given = Buffer.from(secret ?? '');
    if (given.length !== this.secret.length || !crypto.timingSafeEqual(given, this.secret)) {
      throw new UnauthorizedException('Pemanggil KeyGuard tidak dikenal');
    }
    if (!b || typeof b.wrappedDek !== 'string' || !b.wrappedDek) throw new BadRequestException('wrappedDek wajib');
    if (typeof b.docId !== 'string' || !/^[\w.-]{1,100}$/.test(b.docId)) throw new BadRequestException('docId tidak valid');
    if (typeof b.txId !== 'string' || !/^[a-f0-9]{64}$/.test(b.txId)) throw new BadRequestException('txId tidak valid');
    if (!this.fabric.allChannels().includes(b.channel)) throw new BadRequestException('channel tidak valid');

    let grant: AuditLog | null = null;
    try {
      grant = await this.fabric.evaluate<AuditLog>(this.identity(), b.channel, 'GetAccessGrant', b.docId, b.txId);
    } catch (e) {
      if (!(e instanceof NotFoundException)) throw e;
    }
    const chk = checkGrant(grant, b, Date.now(), this.maxAgeSec);
    if (!chk.ok) {
      this.log.warn(`TOLAK ${b.channel}/${b.docId} tx=${b.txId.slice(0, 12)}: ${chk.reason}`);
      throw new ForbiddenException(chk.reason);
    }
    if (!this.replay.claim(b.txId)) {
      this.log.warn(`TOLAK ${b.channel}/${b.docId} tx=${b.txId.slice(0, 12)}: bukti akses dipakai ulang`);
      throw new ForbiddenException('bukti akses sudah pernah dipakai');
    }

    const dek = await this.vault.unwrap(
      { docKey: this.cfg.get('VAULT_DOC_KEY', 'sandichain-doc'), legacyKey: this.cfg.get('VAULT_TRANSIT_KEY', 'sandichain') },
      b.wrappedDek,
      b,
      this.allowLegacy,
    );
    this.log.log(`LEPAS ${b.channel}/${b.docId} untuk ${grant!.actor} (${grant!.actorOrg}) tx=${b.txId.slice(0, 12)}`);
    try {
      return { dek: dek.toString('base64') };
    } finally {
      dek.fill(0);
    }
  }
}

@Module({
  // keyguard.env (rahasia KeyGuard: token Vault decrypt) didahulukan dan TIDAK
  // dibaca backend API. .env hanya untuk konfigurasi bersama (Fabric, Vault addr).
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: [process.env.KEYGUARD_ENV_FILE ?? 'keyguard.env', '.env'] })],
  controllers: [KeyguardController],
  providers: [FabricService, UsersService, SignBroker],
})
export class KeyguardModule {}
