import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/auth';
import { FabricService } from '../fabric/fabric.service';
import { AppUser } from '../users/users.service';
import { SignBroker } from './sign-broker';

const POLL_MS = 20_000;

/** Endpoint yang dipakai perangkat pengguna untuk menandatangani transaksi Fabric (SIGNING_MODE=client). */
@Controller('sign')
export class SignController {
  constructor(
    private readonly broker: SignBroker,
    private readonly fabric: FabricService,
  ) {}

  /** Mode tanda tangan + sidik jari sertifikat, supaya perangkat tahu kartu mana yang cocok. */
  @Get('info')
  info(@CurrentUser() u: AppUser) {
    return {
      mode: this.fabric.signsOnClient(u) ? 'client' : 'server',
      certFp: this.fabric.certFingerprint(u),
      chaincode: this.fabric.chaincodeName,
    };
  }

  @Get('next')
  async next(@CurrentUser() u: AppUser, @Req() req: Request, @Res() res: Response) {
    const r = await this.broker.next(u.username, POLL_MS, (cancel) => req.on('close', cancel));
    if (res.writableEnded || req.destroyed) return;
    res.setHeader('Cache-Control', 'no-store');
    if (!r) res.status(204).end();
    else res.json(r);
  }

  @Post(':id')
  @HttpCode(200)
  answer(@CurrentUser() u: AppUser, @Param('id') id: string, @Body() b: { signature?: string; refuse?: string }) {
    if (typeof b?.refuse === 'string') {
      this.broker.refuse(u.username, id, b.refuse);
      return { ok: true };
    }
    if (typeof b?.signature !== 'string') throw new BadRequestException('signature wajib');
    const sig = Buffer.from(b.signature, 'base64');
    if (sig.length !== 64) throw new BadRequestException('signature harus 64 byte (r||s) base64');
    this.broker.complete(u.username, id, sig);
    return { ok: true };
  }
}
