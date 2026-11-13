import { Controller, ForbiddenException, Get, HttpCode, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/auth';
import type { UploadedFile as UFile } from '../documents/documents.service';
import { AppUser } from '../users/users.service';
import { ForensicsService } from './forensics.service';

function requireAuditor(u: AppUser) {
  if (u.role !== 'auditor' && u.role !== 'admin') throw new ForbiddenException('Khusus unit pengamanan (auditor)');
}

@Controller('forensics')
export class ForensicsController {
  constructor(private readonly f: ForensicsService) {}

  /** Skor risiko per personel dari jejak audit. */
  @Get('risk')
  risk(@CurrentUser() u: AppUser) {
    requireAuditor(u);
    return this.f.risk(u);
  }

  /** Telusuri pembaca: ?txId=… atau ?nrp=…&docId=… */
  @Get('trace')
  trace(
    @CurrentUser() u: AppUser,
    @Query('txId') txId?: string,
    @Query('nrp') nrp?: string,
    @Query('nama') nama?: string,
    @Query('docId') docId?: string,
  ) {
    requireAuditor(u);
    return this.f.trace(u, { txId, nrp, nama, docId });
  }

  /** Unggah PDF bocoran; jejak dibaca dari metadata. */
  @Post('trace/file')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  traceFile(@CurrentUser() u: AppUser, @UploadedFile() file: UFile) {
    requireAuditor(u);
    return this.f.traceFile(u, file);
  }
}
