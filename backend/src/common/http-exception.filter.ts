import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw error;
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response.status(error.getStatus()).json(
        typeof body === 'string'
          ? { detail: body }
          : {
              detail: 'message' in body ? body.message : error.message,
              ...body,
            },
      );
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      response.status(409).json({ detail: 'Already exists' });
    } else {
      this.logger.error(
        error instanceof Error ? error.stack : 'Unknown server error',
      );
      response.status(500).json({ detail: 'Internal server error' });
    }
  }
}
