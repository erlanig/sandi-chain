import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Post,
  Res,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppUser, UsersService } from '../users/users.service';

export const COOKIE = 'sandi_token';
const PUBLIC = 'isPublic';
export const Public = () => SetMetadata(PUBLIC, true);

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
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AppUser }>();
    const token = req.cookies?.[COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException('Belum login');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = this.users.find(payload.sub);
      if (!user || user.service) throw new Error();
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Sesi tidak valid');
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const user = this.users.find(body?.username ?? '');
    const ok = user && !user.service && (await bcrypt.compare(body.password ?? '', user.passwordHash));
    if (!ok) throw new UnauthorizedException('Username atau password salah');

    const token = await this.jwt.signAsync({ sub: user.username });
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
  logout(@Res({ passthrough: true }) res: Response) {
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
