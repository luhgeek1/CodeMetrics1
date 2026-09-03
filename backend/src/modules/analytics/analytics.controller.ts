import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';

@Controller('api/v1')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('metrics/summary') dashboard(
    @Query() filter: unknown,
    @Query('latest_limit') limit: unknown,
  ) {
    return this.analytics.dashboard(filter, limit);
  }
  @Get('metrics/timeline/summary') timeline(@Query() filter: unknown) {
    return this.analytics.timeline(filter);
  }
  @Get('developers/summary') developers(@Query() filter: unknown) {
    return this.analytics.developers(filter);
  }
  @Get('developers/:id/summary') developer(
    @Param('id') id: string,
    @Query() filter: unknown,
  ) {
    return this.analytics.developer(id, filter, filter);
  }
  @Get('developers/:id/commits') commits(
    @Param('id') id: string,
    @Query() filter: unknown,
  ) {
    return this.analytics.developerCommits(id, filter, filter);
  }
  @Get('insights') insights(@Query() filter: unknown) {
    return this.analytics.insights(filter);
  }
}
