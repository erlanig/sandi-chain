import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AlertsService } from '../alerts/alerts.service';
import { CryptoService } from '../crypto/crypto.service';
import { DbService, DocRow } from '../db/db.service';
import { FabricService, KLASIFIKASI } from '../fabric/fabric.service';
import { StorageService } from '../storage/storage.service';
import { AppUser } from '../users/users.service';
import { VIEWABLE_MIME, WatermarkService } from '../watermark/watermark.service';

// Bentuk data dari chaincode (lihat chaincode/sandichain/contract/model.go)
export interface ChainDoc {
  docId: string;
  nomor: string;
  hash: string;
  klasifikasi: string;
  owner: string;
  ownerName: string;
  ownerOrg: string;
  version: number;
  history: string[];
  recipients: string[];
  revoked: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AccessResult {
  granted: boolean;
  reason: string;
  hash: string;
  version: number;
}
export interface ActionResult {
  ok: boolean;
  reason: string;
  document?: ChainDoc;
}
export interface VerifyResult {
  authentic: boolean;
  matchedVersion: number;
  latestVersion: number;
  message: string;
}
export interface AuditLog {
  txId: string;
  docId: string;
  action: string;
  actor: string;
  actorOrg: string;
  clearance: string;
  jabatan: string;
  detail: string;
  timestamp: string;
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class DocumentsService {
  private readonly log = new Logger(DocumentsService.name);

  constructor(
    private readonly fabric: FabricService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly db: DbService,
    private readonly wm: WatermarkService,
    private readonly alerts: AlertsService,
  ) {}

  // ------------------------------------------------------------- tulis

  async create(user: AppUser, file: UploadedFile | undefined, body: { nomor?: string; perihal?: string; klasifikasi?: string }) {
    this.assertFile(file);
    const klas = (body.klasifikasi ?? '').toUpperCase();
    if (!KLASIFIKASI.includes(klas as never)) throw new BadRequestException('Klasifikasi tidak valid');
    if (!body.nomor?.trim() || !body.perihal?.trim()) throw new BadRequestException('Nomor dan perihal wajib diisi');

    const channel = this.fabric.channelFor(klas);
    const docId = newDocId();
    const sealed = await this.sealAndStore(docId, 1, file);

    const doc = await this.db.insertDocument(
      { doc_id: docId, channel, klasifikasi: klas, perihal: body.perihal.trim(), created_by: user.username },
      sealed.row,
      () => this.fabric.submit<ChainDoc>(user, channel, 'RegisterDocument', docId, body.nomor!.trim(), sealed.hash, klas),
    );
    return { ...doc, perihal: body.perihal.trim(), channel };
  }

  async addVersion(user: AppUser, docId: string, file: UploadedFile | undefined) {
    this.assertFile(file);
    const row = await this.row(docId);
    const current = await this.fabric.evaluate<ChainDoc>(user, row.channel, 'GetDocument', docId);
    const sealed = await this.sealAndStore(docId, current.version + 1, file);

    // Ditolak chaincode => tetap tercatat di ledger, DB di-rollback.
    let res: ActionResult | undefined;
    try {
      res = await this.db.insertVersion(sealed.row, async () => {
        const r = await this.fabric.submit<ActionResult>(user, row.channel, 'AddVersion', docId, sealed.hash);
        if (!r.ok) throw new DeniedOnChain(r);
        return r;
      });
    } catch (e) {
      if (e instanceof DeniedOnChain) throw new ForbiddenException(e.result.reason);
      throw e;
    }
    return res.document;
  }

  async disposition(user: AppUser, docId: string, recipient: string, catatan: string) {
    const row = await this.row(docId);
    const r = await this.fabric.submit<ActionResult>(user, row.channel, 'AddDisposition', docId, recipient ?? '', catatan ?? '');
    if (!r.ok) throw new ForbiddenException(r.reason);
    return r.document;
  }

  async revoke(user: AppUser, docId: string, alasan: string) {
    const row = await this.row(docId);
    const r = await this.fabric.submit<ActionResult>(user, row.channel, 'RevokeDocument', docId, alasan ?? '');
    if (!r.ok) throw new ForbiddenException(r.reason);
    return r.document;
  }

  // ------------------------------------------------------------- baca

  /**
   * Alur membuka dokumen:
   * 1. RequestAccess di chaincode (ABAC + log immutable, ditolak => alert)
   * 2. ambil versi yang hash-nya = hash di ledger
   * 3. dekripsi (DEK di-unwrap Vault), cek ulang SHA-256 vs ledger
   * 4. render dengan watermark nama/NRP/waktu/txId
   */
  async view(user: AppUser, docId: string): Promise<{ pdf: Buffer; txId: string }> {
    const row = await this.row(docId);
    const { result: access, txId } = await this.fabric.submitTx<AccessResult>(user, row.channel, 'RequestAccess', docId);
    if (!access.granted) throw new ForbiddenException(`Akses ditolak dan tercatat di ledger: ${access.reason}`);

    const v = await this.db.getVersionByHash(docId, access.hash);
    if (!v) {
      await this.integrityAlert(user, docId, txId, 'metadata versi yang cocok dengan hash ledger tidak ditemukan');
      throw new ConflictException('Integritas dokumen gagal: data di storage tidak sesuai ledger');
    }

    let plain: Buffer;
    try {
      const ciphertext = await this.storage.get(v.object_key);
      plain = await this.crypto.open({ ciphertext, iv: v.iv, authTag: v.auth_tag, wrappedDek: v.wrapped_dek });
    } catch (e) {
      await this.integrityAlert(user, docId, txId, `dekripsi gagal (ciphertext/tag diubah?): ${(e as Error).message}`);
      throw new ConflictException('Integritas dokumen gagal: file terenkripsi rusak atau dimanipulasi');
    }
    if (CryptoService.sha256(plain) !== access.hash) {
      await this.integrityAlert(user, docId, txId, 'hash file di storage berbeda dengan ledger');
      throw new ConflictException('Integritas dokumen gagal: hash tidak cocok dengan ledger');
    }

    const pdf = await this.wm.render(plain, v.mime, {
      nama: user.nama,
      nrp: user.nrp,
      jabatan: user.jabatan,
      klasifikasi: row.klasifikasi,
      docId,
      accessTxId: txId,
      waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
    });
    plain.fill(0);
    return { pdf, txId };
  }

  async verify(user: AppUser, docId: string, file: UploadedFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('File pembanding wajib diunggah');
    const row = await this.row(docId);
    const hash = CryptoService.sha256(file.buffer);
    const r = await this.fabric.submit<VerifyResult>(user, row.channel, 'VerifyDocument', docId, hash);
    return { ...r, hash };
  }

  async list(user: AppUser) {
    const docs: (ChainDoc & { channel: string })[] = [];
    for (const ch of this.fabric.allChannels()) {
      try {
        const list = await this.fabric.evaluate<ChainDoc[]>(user, ch, 'ListDocuments');
        (list ?? []).forEach((d) => docs.push({ ...d, channel: ch }));
      } catch (e) {
        this.log.debug(`ListDocuments ${ch} dilewati untuk ${user.username}: ${(e as Error).message}`);
      }
    }
    const rows = new Map((await this.db.getDocuments(docs.map((d) => d.docId))).map((r) => [r.doc_id, r]));
    return docs
      .map((d) => ({ ...publicDoc(d), perihal: rows.get(d.docId)?.perihal ?? '(metadata off-chain tidak ada)', channel: d.channel }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async detail(user: AppUser, docId: string) {
    const row = await this.row(docId);
    const d = await this.fabric.evaluate<ChainDoc>(user, row.channel, 'GetDocument', docId);
    return {
      ...publicDoc(d),
      perihal: row.perihal,
      channel: row.channel,
      isOwner: d.ownerName === user.username,
      versions: await this.db.listVersions(docId),
    };
  }

  async audit(user: AppUser, docId: string) {
    const row = await this.row(docId);
    const logs = await this.fabric.evaluate<AuditLog[]>(user, row.channel, 'GetAuditTrail', docId);
    return (logs ?? []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async history(user: AppUser, docId: string) {
    const row = await this.row(docId);
    return this.fabric.evaluate(user, row.channel, 'GetDocumentHistory', docId);
  }

  async allAudit(user: AppUser) {
    const out: (AuditLog & { channel: string })[] = [];
    for (const ch of this.fabric.allChannels()) {
      const logs = await this.fabric.evaluate<AuditLog[]>(user, ch, 'GetAllAuditLogs');
      (logs ?? []).forEach((l) => out.push({ ...l, channel: ch }));
    }
    return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ------------------------------------------------------------- helper

  private async row(docId: string): Promise<DocRow> {
    const r = await this.db.getDocument(docId);
    if (!r) throw new NotFoundException(`Dokumen ${docId} tidak ditemukan`);
    return r;
  }

  private assertFile(file: UploadedFile | undefined): asserts file is UploadedFile {
    if (!file?.buffer?.length) throw new BadRequestException('File wajib diunggah');
    if (!VIEWABLE_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Hanya PDF, PNG, atau JPG yang diterima (agar bisa ditampilkan dengan watermark)');
    }
  }

  private async sealAndStore(docId: string, version: number, file: UploadedFile) {
    const hash = CryptoService.sha256(file.buffer);
    const sealed = await this.crypto.seal(file.buffer);
    const objectKey = `${docId}/v${version}-${crypto.randomUUID()}.enc`;
    await this.storage.put(objectKey, sealed.ciphertext);
    return {
      hash,
      row: {
        doc_id: docId,
        version,
        object_key: objectKey,
        filename: file.originalname,
        mime: file.mimetype,
        size: file.size,
        iv: sealed.iv,
        auth_tag: sealed.authTag,
        wrapped_dek: sealed.wrappedDek,
        sha256: hash,
      },
    };
  }

  private integrityAlert(user: AppUser, docId: string, txId: string, reason: string) {
    return this.alerts.raise('StorageIntegrity', {
      docId,
      actor: user.username,
      org: user.mspId,
      reason,
      txId: `${txId}-integrity`,
    });
  }
}

class DeniedOnChain extends Error {
  constructor(readonly result: ActionResult) {
    super(result.reason);
  }
}

/** ID sertifikat (x509::CN=...::...) tidak perlu dikirim ke frontend. */
function publicDoc(d: ChainDoc) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, ...rest } = d;
  return rest;
}

function newDocId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DOC-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
