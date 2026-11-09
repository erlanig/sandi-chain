import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/**
 * Object storage S3-compatible untuk file yang SUDAH terenkripsi.
 * Library `minio` adalah klien S3 generik: bisa ke SeaweedFS (dev),
 * MinIO, Ceph RGW, atau S3 on-prem lainnya.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;

  constructor(cfg: ConfigService) {
    this.client = new Client({
      endPoint: cfg.get('S3_ENDPOINT', 'localhost'),
      port: Number(cfg.get('S3_PORT', 8333)),
      useSSL: cfg.get('S3_USE_SSL') === 'true',
      accessKey: cfg.get('S3_ACCESS_KEY', ''),
      secretKey: cfg.get('S3_SECRET_KEY', ''),
      pathStyle: true,
    });
    this.bucket = cfg.get('S3_BUCKET', 'sandi-docs');
  }

  async onModuleInit() {
    try {
      if (!(await this.client.bucketExists(this.bucket))) await this.client.makeBucket(this.bucket);
      this.log.log(`Bucket ${this.bucket} siap`);
    } catch (e) {
      this.log.error(`Object storage tidak dapat dihubungi: ${(e as Error).message}`);
    }
  }

  async put(key: string, data: Buffer) {
    await this.client.putObject(this.bucket, key, data, data.length, { 'Content-Type': 'application/octet-stream' });
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }
}
