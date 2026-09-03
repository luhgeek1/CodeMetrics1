import { UseGuards } from '@nestjs/common';
import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard, RequirePermissions } from '../auth/auth.guard.js';
import { SyncService } from './sync.service.js';

@Resolver()
@UseGuards(AuthGuard)
@RequirePermissions('users.manage_roles')
export class IntegrationResolver {
  constructor(private readonly sync: SyncService) {}
  @Query('syncStatus') status() {
    return this.sync.current();
  }
  @Mutation('syncSource') start() {
    return this.sync.start();
  }
}
