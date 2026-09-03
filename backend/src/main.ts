import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { Environment } from './config/environment.js';

async function bootstrap() {
  const app = configureApp(
    await NestFactory.create(AppModule, { rawBody: false }),
  );
  const config = app.get(ConfigService<Environment, true>);
  await app.listen(config.get('API_PORT'), config.get('API_HOST'));
}
void bootstrap();
