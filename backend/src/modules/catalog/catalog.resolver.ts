import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/auth.guard.js';
import { PageInput } from '../../generated/graphql.js';
import { CatalogService } from './catalog.service.js';

@Resolver()
@UseGuards(AuthGuard)
export class CatalogResolver {
  constructor(private readonly catalog: CatalogService) {}
  @Query('projects') projects() {
    return this.catalog.projects();
  }
  @Query('project') project(@Args('id') id: number) {
    return this.catalog.project(id);
  }
  @Query('repositories') repositories(@Args('projectId') id: number) {
    return this.catalog.repositories(id);
  }
  @Query('branches') branches(
    @Args('repoId') id: string,
    @Args('page') page: PageInput | null,
  ) {
    return this.catalog.branches(id, page);
  }
  @Query('repositoryCommits') commits(
    @Args('repoId') id: string,
    @Args('page') page: PageInput | null,
  ) {
    return this.catalog.commits(id, page);
  }
}
