import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { filter, interval, map, merge, Observable } from 'rxjs';
import { AlertsService } from '../alerts/alerts.service';
import { CurrentUser } from '../auth/auth';
import { DbService } from '../db/db.service';
import { AppUser } from '../users/users.service';
import { DocumentsService, UploadedFile as UFile } from './documents.service';

const upload = FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } });

function requireAuditor(u: AppUser) {
  if (u.role !== 'auditor' && u.role !== 'admin') throw new ForbiddenException('Khusus unit pengamanan (auditor)');
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  list(@CurrentUser() u: AppUser) {
    return this.docs.list(u);
  }

  @Post()
  @UseInterceptors(upload)
  create(@CurrentUser() u: AppUser, @UploadedFile() file: UFile, @Body() body: Record<string, string>) {
    return this.docs.create(u, file, body);
  }

  @Get(':id')
  detail(@CurrentUser() u: AppUser, @Param('id') id: string) {
    return this.docs.detail(u, id);
  }

  @Get(':id/view')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('X-Content-Type-Options', 'nosniff')
  async view(@CurrentUser() u: AppUser, @Param('id') id: string, @Res() res: Response) {
    const { pdf, txId } = await this.docs.view(u, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${id}.pdf"`);
    res.setHeader('X-Access-Tx', txId);
    res.end(pdf);
  }

  @Post(':id/versions')
  @UseInterceptors(upload)
  addVersion(@CurrentUser() u: AppUser, @Param('id') id: string, @UploadedFile() file: UFile) {
    return this.docs.addVersion(u, id, file);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @UseInterceptors(upload)
  verify(@CurrentUser() u: AppUser, @Param('id') id: string, @UploadedFile() file: UFile) {
    return this.docs.verify(u, id, file);
  }

  @Post(':id/disposition')
  @HttpCode(200)
  disposition(@CurrentUser() u: AppUser, @Param('id') id: string, @Body() b: { recipient: string; catatan?: string }) {
    return this.docs.disposition(u, id, b?.recipient, b?.catatan ?? '');
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() u: AppUser, @Param('id') id: string, @Body() b: { alasan?: string }) {
    return this.docs.revoke(u, id, b?.alasan ?? '');
  }

  @Get(':id/audit')
  audit(@CurrentUser() u: AppUser, @Param('id') id: string) {
    return this.docs.audit(u, id);
  }

  @Get(':id/history')
  history(@CurrentUser() u: AppUser, @Param('id') id: string) {
    return this.docs.history(u, id);
  }
}

@Controller()
export class SecurityController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly db: DbService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('audit')
  audit(@CurrentUser() u: AppUser) {
    requireAuditor(u);
    return this.docs.allAudit(u);
  }

  @Get('alerts')
  list(@CurrentUser() u: AppUser) {
    requireAuditor(u);
    return this.db.listAlerts();
  }

  @Post('alerts/:id/ack')
  @HttpCode(200)
  async ack(@CurrentUser() u: AppUser, @Param('id', ParseIntPipe) id: number) {
    requireAuditor(u);
    await this.db.ackAlert(id);
    return { ok: true };
  }

  /** Stream real time untuk dashboard unit pengamanan. */
  @Sse('alerts/stream')
  stream(@CurrentUser() u: AppUser): Observable<MessageEvent> {
    requireAuditor(u);
    const events = this.alerts.stream$.pipe(
      filter(Boolean),
      map((e) => ({ type: e.kind, data: e.data as object }) as MessageEvent),
    );
    const heartbeat = interval(20_000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(events, heartbeat);
  }
}
