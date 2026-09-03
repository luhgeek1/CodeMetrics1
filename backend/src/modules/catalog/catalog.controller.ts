import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CatalogService } from './catalog.service.js';

@Controller('api/v1/entities')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('projects') projects() {
    return this.catalog.projects();
  }
  @Get('projects/:id') project(@Param('id') id: string) {
    return this.catalog.project(id);
  }
  @Get('projects/:id/repos') repositories(@Param('id') id: string) {
    return this.catalog.repositories(id);
  }
  @Get('repos/:id/branches') branches(
    @Param('id') id: string,
    @Query() page: unknown,
  ) {
    return this.catalog.branches(id, page);
  }
  @Get('repos/:id/commits') commits(
    @Param('id') id: string,
    @Query() page: unknown,
  ) {
    return this.catalog.commits(id, page);
  }
}
