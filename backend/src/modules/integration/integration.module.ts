import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SourceApiClient } from './source-api.client.js';
import { SourceRepository } from './source.repository.js';
import { SyncService } from './sync.service.js';
import { IntegrationResolver } from './integration.resolver.js';

@Module({
  imports: [AuthModule],
  providers: [
    SourceApiClient,
    SourceRepository,
    SyncService,
    IntegrationResolver,
  ],
  exports: [SyncService],
})
export class IntegrationModule {}
