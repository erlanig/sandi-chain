import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { KeyguardModule } from './keyguard';

async function bootstrap() {
  const app = await NestFactory.create(KeyguardModule);
  app.enableShutdownHooks();
  const port = Number(process.env.KEYGUARD_PORT ?? 4100);
  // Default hanya localhost: KeyGuard tidak boleh terbuka ke jaringan pengguna.
  const host = process.env.KEYGUARD_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`SANDI KeyGuard di http://${host}:${port}/keyguard`, 'Bootstrap');
}
void bootstrap();
