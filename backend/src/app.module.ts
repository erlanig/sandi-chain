import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AlertsService } from './alerts/alerts.service';
import { AuthController, AuthGuard, Public } from './auth/auth';
import { CryptoService } from './crypto/crypto.service';
import { DbService } from './db/db.service';
import { DocumentsController, SecurityController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { ReconcileService } from './documents/reconcile.service';
import { FabricService } from './fabric/fabric.service';
import { SignBroker } from './signing/sign-broker';
import { SignController } from './signing/sign.controller';
import { StorageService } from './storage/storage.service';
import { UsersService } from './users/users.service';
import { WatermarkService } from './watermark/watermark.service';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok', service: 'sandi-chain', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret || secret.length < 16) throw new Error('JWT_SECRET wajib diisi (minimal 16 karakter)');
        return { secret, signOptions: { expiresIn: cfg.get('JWT_TTL', '8h') } };
      },
    }),
  ],
  controllers: [HealthController, AuthController, DocumentsController, SecurityController, SignController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    UsersService,
    SignBroker,
    FabricService,
    CryptoService,
    StorageService,
    DbService,
    WatermarkService,
    AlertsService,
    DocumentsService,
    ReconcileService,
  ],
})
export class AppModule {}
