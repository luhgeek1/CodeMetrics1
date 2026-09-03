import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogResolver } from './catalog.resolver.js';

@Module({
  imports: [AuthModule],
  providers: [CatalogRepository, CatalogService, CatalogResolver],
  controllers: [CatalogController],
  exports: [CatalogRepository],
})
export class CatalogModule {}
