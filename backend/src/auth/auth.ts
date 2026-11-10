import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { DbService } from '../db/db.service';
import { AppUser, UsersService } from '../users/users.service';

export const COOKIE = 'sandi_token';
const PUBLIC = 'isPublic';
export const Public = () => SetMetadata(PUBLIC, true);

interface TokenPayload {
  sub: string;
  jti?: string;
  exp?: number;
}
type AuthedRequest = Request & { user?: AppUser; token?: TokenPayload };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AppUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** Guard global: semua endpoint wajib login kecuali yang diberi @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException('Belum login');
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesi tidak valid');
    }
    const user = this.users.find(payload.sub);
    // Token tanpa jti (diterbitkan sebelum fitur pencabutan) ditolak: cukup login ulang.
    if (!user || user.service || !payload.jti) throw new UnauthorizedException('Sesi tidak valid');
    // Kalau DB tidak bisa dihubungi, query melempar error => request gagal (fail closed).
    if (await this.db.isTokenRevoked(payload.jti)) throw new UnauthorizedException('Sesi sudah berakhir (logout)');
    req.user = user;
    req.token = payload;
    return true;
  }
}

/** Kunci sementara username setelah terlalu banyak password salah (disimpan di Postgres). */
const MAX_FAILS = 5;
const LOCK_SEC = 15 * 60;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly db: DbService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const username = String(body?.username ?? '').slice(0, 64);
    if (await this.db.loginLocked(username, MAX_FAILS)) {
      throw new HttpException('Terlalu banyak percobaan login. Coba lagi nanti.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = this.users.find(username);
    const ok = user && !user.service && (await bcrypt.compare(String(body?.password ?? ''), user.passwordHash));
    if (!ok) {
      await this.db.loginFailed(username, LOCK_SEC);
      throw new UnauthorizedException('Username atau password salah');
    }
    await this.db.loginSucceeded(username);

    const token = await this.jwt.signAsync({ sub: user.username, jti: crypto.randomUUID() });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.cfg.get('COOKIE_SECURE') === 'true',
      maxAge: 8 * 3600 * 1000,
    });
    return UsersService.toPublic(user);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    // Cabut token di server: cookie yang sudah tersalin tidak bisa dipakai lagi.
    const t = req.token;
    if (t?.jti && t.exp) await this.db.revokeToken(t.jti, new Date(t.exp * 1000));
    res.clearCookie(COOKIE);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AppUser) {
    return UsersService.toPublic(user);
  }

  @Get('personel')
  personel() {
    return this.users.all().map(({ username, nama, jabatan, clearance }) => ({ username, nama, jabatan, clearance }));
  }
}
