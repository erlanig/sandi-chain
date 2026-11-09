import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  // Frontend memanggil lewat proxy Next.js (same-origin), jadi CORS tidak dibuka.
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`SANDI-Chain API di http://localhost:${port}/api`, 'Bootstrap');
}
void bootstrap();
