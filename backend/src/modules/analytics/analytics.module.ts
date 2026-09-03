import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsResolver } from './analytics.resolver.js';

@Module({
  imports: [CatalogModule],
  providers: [AnalyticsRepository, AnalyticsService, AnalyticsResolver],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
