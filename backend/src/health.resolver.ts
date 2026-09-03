import { Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from './infrastructure/database/prisma.service.js';

@Resolver()
export class HealthResolver {
  constructor(private readonly db: PrismaService) {}
  @Query('health') async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'operating' };
  }
}
