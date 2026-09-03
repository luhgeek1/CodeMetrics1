import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { Environment } from './config/environment.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<Environment, true>);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().set('query parser', 'extended');
  app.use(cookieParser());
  const headers = helmet();
  const sandboxHeaders = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path === '/graphql' && config.get('GRAPHQL_SANDBOX')
      ? sandboxHeaders
      : headers)(req, res, next),
  );
  app.enableCors({
    origin: [
      config.get('SITE_URL'),
      'http://localhost:5173',
      'https://localhost:5173',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Client',
      'Apollo-Require-Preflight',
      'X-Apollo-Operation-Name',
    ],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
