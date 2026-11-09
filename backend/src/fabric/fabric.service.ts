import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, GatewayError, hash, Network, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppUser } from '../users/users.service';

export const KLASIFIKASI = ['BIASA', 'TERBATAS', 'RAHASIA', 'SANGAT_RAHASIA'] as const;
export type Klasifikasi = (typeof KLASIFIKASI)[number];

interface PeerConf {
  endpoint: string;
  hostAlias: string;
  tlsCert: string;
}

const utf8 = new TextDecoder();

/**
 * Satu Gateway per personel: setiap transaksi ditandatangani dengan kunci
 * privat personel tsb, jadi identitas di ledger = identitas orang, bukan
 * identitas server. (Produksi: kunci di smartcard via signers.newHSMSigner.)
 */
@Injectable()
export class FabricService implements OnModuleDestroy {
  private readonly log = new Logger(FabricService.name);
  private readonly clients = new Map<string, grpc.Client>();
  private readonly gateways = new Map<string, Gateway>();
  private readonly ccName: string;
  private readonly walletDir: string;
  private readonly peers: Record<string, PeerConf>;

  constructor(private readonly cfg: ConfigService) {
    this.ccName = cfg.get('FABRIC_CHAINCODE', 'sandichain');
    this.walletDir = path.resolve(cfg.get('WALLET_DIR', './wallet'));
    const tn = path.resolve(cfg.get('FABRIC_TEST_NETWORK', '../fabric-samples/test-network'));
    const peerTls = (org: string) =>
      path.join(tn, `organizations/peerOrganizations/${org}.example.com/peers/peer0.${org}.example.com/tls/ca.crt`);
    this.peers = {
      org1: {
        endpoint: cfg.get('PEER_ORG1_ENDPOINT', 'localhost:7051'),
        hostAlias: 'peer0.org1.example.com',
        tlsCert: cfg.get('PEER_ORG1_TLS', peerTls('org1')),
      },
      org2: {
        endpoint: cfg.get('PEER_ORG2_ENDPOINT', 'localhost:9051'),
        hostAlias: 'peer0.org2.example.com',
        tlsCert: cfg.get('PEER_ORG2_TLS', peerTls('org2')),
      },
    };
  }

  channelFor(klas: string): string {
    const k = klas.toUpperCase();
    if (!KLASIFIKASI.includes(k as Klasifikasi)) throw new BadRequestException(`Klasifikasi tidak valid: ${klas}`);
    return this.cfg.get(`CHANNEL_${k}`, k === 'BIASA' || k === 'TERBATAS' ? 'ch-umum' : 'ch-rahasia');
  }

  allChannels(): string[] {
    return [...new Set(KLASIFIKASI.map((k) => this.channelFor(k)))];
  }

  network(user: AppUser, channel: string): Network {
    return this.gateway(user).getNetwork(channel);
  }

  private contract(user: AppUser, channel: string): Contract {
    return this.network(user, channel).getContract(this.ccName);
  }

  async submit<T>(user: AppUser, channel: string, fn: string, ...args: string[]): Promise<T> {
    return (await this.submitTx<T>(user, channel, fn, ...args)).result;
  }

  /** Submit + kembalikan txId (dipakai sebagai bukti akses di watermark). */
  async submitTx<T>(user: AppUser, channel: string, fn: string, ...args: string[]): Promise<{ result: T; txId: string }> {
    try {
      const tx = await this.contract(user, channel).newProposal(fn, { arguments: args }).endorse();
      const commit = await tx.submit();
      const status = await commit.getStatus();
      if (!status.successful) {
        throw new ServiceUnavailableException(`Transaksi ${status.transactionId} gagal di-commit (kode ${status.code})`);
      }
      return { result: JSON.parse(utf8.decode(tx.getResult())) as T, txId: tx.getTransactionId() };
    } catch (e) {
      throw this.mapError(e, fn);
    }
  }

  async evaluate<T>(user: AppUser, channel: string, fn: string, ...args: string[]): Promise<T> {
    try {
      const out = await this.contract(user, channel).evaluateTransaction(fn, ...args);
      const txt = utf8.decode(out);
      return (txt ? JSON.parse(txt) : null) as T;
    } catch (e) {
      throw this.mapError(e, fn);
    }
  }

  get chaincodeName() {
    return this.ccName;
  }

  private gateway(user: AppUser): Gateway {
    const cached = this.gateways.get(user.username);
    if (cached) return cached;

    const dir = path.join(this.walletDir, user.username);
    if (!fs.existsSync(path.join(dir, 'cert.pem'))) {
      throw new ServiceUnavailableException(`Identitas Fabric ${user.username} tidak ada di wallet. Jalankan npm run enroll`);
    }
    const gw = connect({
      client: this.client(user.org),
      identity: { mspId: user.mspId, credentials: fs.readFileSync(path.join(dir, 'cert.pem')) },
      signer: signers.newPrivateKeySigner(crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'key.pem')))),
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + 5_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 15_000 }),
      submitOptions: () => ({ deadline: Date.now() + 5_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
    });
    this.gateways.set(user.username, gw);
    return gw;
  }

  private client(org: string): grpc.Client {
    const existing = this.clients.get(org);
    if (existing) return existing;
    const p = this.peers[org];
    if (!p) throw new ServiceUnavailableException(`Peer untuk ${org} tidak dikonfigurasi`);
    if (!fs.existsSync(p.tlsCert)) {
      throw new ServiceUnavailableException(`TLS CA peer ${org} tidak ditemukan: ${p.tlsCert}. Jaringan Fabric sudah jalan?`);
    }
    const c = new grpc.Client(p.endpoint, grpc.credentials.createSsl(fs.readFileSync(p.tlsCert)), {
      'grpc.ssl_target_name_override': p.hostAlias,
    });
    this.clients.set(org, c);
    return c;
  }

  /** Ubah error chaincode menjadi HTTP error yang bisa dibaca user. */
  private mapError(e: unknown, fn: string): Error {
    if (e instanceof GatewayError) {
      const raw = e.details?.map((d) => d.message).join('; ') || e.message;
      const msg = raw.replace(/^.*chaincode response \d+,\s*/i, '').trim();
      this.log.warn(`${fn}: ${msg}`);
      if (/tidak ditemukan/i.test(msg)) return new NotFoundException(msg);
      if (/tidak berwenang|hanya |clearance|tidak cukup|tidak mencukupi/i.test(msg)) return new ForbiddenException(msg);
      if (e.code === grpc.status.UNAVAILABLE || e.code === grpc.status.DEADLINE_EXCEEDED) {
        return new ServiceUnavailableException('Jaringan blockchain tidak dapat dihubungi');
      }
      return new BadRequestException(msg);
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  onModuleDestroy() {
    this.gateways.forEach((g) => g.close());
    this.clients.forEach((c) => c.close());
  }
}
