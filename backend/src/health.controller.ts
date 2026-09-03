import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './infrastructure/database/prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Get(['', 'ping', 'health'])
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'operating' };
  }
}
