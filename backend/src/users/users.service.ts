import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface AppUser {
  username: string;
  nama: string;
  nrp: string;
  jabatan: string;
  clearance: string;
  role: 'user' | 'auditor' | 'admin' | 'keyguard';
  mspId: string;
  org: string;
  passwordHash: string;
  service?: boolean;
}

export type PublicUser = Omit<AppUser, 'passwordHash'>;

/**
 * Prototype: daftar personel dibaca dari config/users.json (dihasilkan
 * scripts/enroll-users.mjs). Produksi: ganti dengan Keycloak/LDAP, dan
 * clearance tetap diambil dari atribut sertifikat Fabric (sumber kebenaran).
 */
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly log = new Logger(UsersService.name);
  private users = new Map<string, AppUser>();

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit() {
    const file = path.resolve(this.cfg.get('USERS_FILE', './config/users.json'));
    if (!fs.existsSync(file)) {
      this.log.warn(`${file} belum ada. Jalankan: npm run enroll`);
      return;
    }
    const list: AppUser[] = JSON.parse(fs.readFileSync(file, 'utf8'));
    list.forEach((u) => this.users.set(u.username, u));
    this.log.log(`${list.length} personel dimuat`);
  }

  find(username: string): AppUser | undefined {
    return this.users.get(username);
  }

  /** Untuk resolusi nama tampilan dari CN sertifikat. */
  all(): PublicUser[] {
    return [...this.users.values()].filter((u) => !u.service).map(UsersService.toPublic);
  }

  static toPublic(u: AppUser): PublicUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = u;
    return rest;
  }
}
