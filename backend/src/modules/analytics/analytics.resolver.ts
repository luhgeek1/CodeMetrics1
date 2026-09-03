import { Args, Query, Resolver } from '@nestjs/graphql';
import { MetricsFilter, PageInput } from '../../generated/graphql.js';
import { AnalyticsService } from './analytics.service.js';

@Resolver()
export class AnalyticsResolver {
  constructor(private readonly analytics: AnalyticsService) {}
  @Query('metricsSummary') dashboard(
    @Args('filter') filter: MetricsFilter,
    @Args('latestLimit') limit: number,
  ) {
    return this.analytics.dashboard(filter, limit);
  }
  @Query('timelineSummary') timeline(@Args('filter') filter: MetricsFilter) {
    return this.analytics.timeline(filter);
  }
  @Query('developersSummary') developers(
    @Args('filter') filter: MetricsFilter,
  ) {
    return this.analytics.developers(filter);
  }
  @Query('developerSummary') developer(
    @Args('authorId') id: string,
    @Args('filter') filter: MetricsFilter,
    @Args('page') page: PageInput | null,
  ) {
    return this.analytics.developer(id, filter, page);
  }
  @Query('developerCommits') commits(
    @Args('authorId') id: string,
    @Args('filter') filter: MetricsFilter,
    @Args('page') page: PageInput | null,
  ) {
    return this.analytics.developerCommits(id, filter, page);
  }
  @Query('insights') insights(@Args('filter') filter: MetricsFilter) {
    return this.analytics.insights(filter);
  }
}
