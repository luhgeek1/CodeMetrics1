import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { encodeCursor, parse, uuid } from '../../common/validation.js';
import { CatalogRepository } from '../catalog/catalog.repository.js';
import { summaryCommit } from '../catalog/catalog.service.js';
import {
  CommitFeed,
  DashboardSummary,
  DeveloperDetailSummary,
  DevelopersSummary,
  TimelineSummary,
} from '../../generated/graphql.js';
import {
  AnalyticsFilter,
  analyticsFilter,
  feedOptions,
} from './analytics.filter.js';
import { AnalyticsRepository } from './analytics.repository.js';
import {
  offHours,
  percent,
  recommendations,
  round,
  sizeStatistics,
} from './analytics.calculations.js';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly catalog: CatalogRepository,
  ) {}
  async dashboard(
    input: unknown,
    latestLimit: unknown = 10,
  ): Promise<DashboardSummary> {
    const filter = analyticsFilter(input);
    const limit = parse(
      z.coerce.number().int().min(0).max(100).default(10),
      latestLimit,
    );
    const result = await this.compute(filter, 10);
    return {
      ...result,
      latest_commits: (await this.feed(filter, limit)).items,
    };
  }
  async timeline(input: unknown): Promise<TimelineSummary> {
    const result = await this.dashboard(input, 0);
    const daily = result.series.commits_daily;
    const hours = result.series.by_hour;
    return {
      kpi: {
        ...result.kpi,
        peak_day: daily.length
          ? daily.reduce((best, row) => (row.count > best.count ? row : best))
              .date
          : null,
        peak_hour: hours.length
          ? hours.reduce((best, row) =>
              row.commits > best.commits ? row : best,
            ).hour
          : null,
        offhours_pct: offHours(hours),
      },
      series: result.series,
    };
  }
  async developers(input: unknown): Promise<DevelopersSummary> {
    const result = await this.compute(analyticsFilter(input), 50);
    return { kpi: result.kpi, authors: result.authors_top };
  }
  async developer(
    author: unknown,
    input: unknown,
    page: unknown,
  ): Promise<DeveloperDetailSummary> {
    const filter = {
      ...analyticsFilter(input),
      author_ids: [parse(uuid, author)],
    };
    const options = parse(feedOptions, page ?? {});
    const result = await this.compute(filter, 1, true);
    return {
      kpi: result.kpi,
      series: result.series,
      size_hist: result.series.size_hist,
      latest_commits: await this.feed(filter, options.limit, options.cursor),
      recommendations: result.recommendations,
    };
  }
  developerCommits(author: unknown, input: unknown, page: unknown) {
    const filter = {
      ...analyticsFilter(input),
      author_ids: [parse(uuid, author)],
    };
    const options = parse(
      feedOptions.extend({
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      page ?? {},
    );
    return this.feed(filter, options.limit, options.cursor);
  }
  async insights(input: unknown) {
    return (await this.dashboard(input, 0)).recommendations;
  }

  private async compute(
    filter: AnalyticsFilter,
    authorLimit: number,
    individual = false,
  ): Promise<Omit<DashboardSummary, 'latest_commits'>> {
    const [kpis, daily, hours, weekdays, authors, sizes, files] =
      await this.repository.snapshot(filter, authorLimit);
    const kpi = kpis[0]!;
    const size = sizeStatistics(sizes);
    const totalHour = hours.reduce((sum, row) => sum + row.commits, 0);
    const totalWeekday = weekdays.reduce((sum, row) => sum + row.commits, 0);
    const series = {
      commits_daily: daily.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        count: row.commits,
      })),
      by_hour: hours.map((row) => ({
        ...row,
        share_pct: percent(row.commits, totalHour),
      })),
      by_weekday: weekdays.map((row) => ({
        ...row,
        share_pct: percent(row.commits, totalWeekday),
      })),
      size_hist: size.histogram,
    };
    const top = authors.map((row) => ({
      ...row,
      share_pct: percent(row.commits, kpi.commits),
    }));
    return {
      kpi: {
        commits: kpi.commits,
        active_devs: kpi.active_devs,
        active_repos: kpi.active_repos,
        avg_commit_size: size.statistics,
        msg_quality: {
          avg_length: kpi.commits ? round(kpi.msg_total_len / kpi.commits) : 0,
          short_pct: percent(kpi.msg_short_count, kpi.commits),
        },
      },
      series,
      authors_top: top,
      recommendations: recommendations(
        kpi.commits,
        size.histogram,
        series.by_hour,
        individual ? [] : top,
        individual ? [] : files,
        individual,
      ),
    };
  }
  private async feed(
    filter: AnalyticsFilter,
    limit: number,
    cursor?: string | null,
  ): Promise<CommitFeed> {
    if (limit === 0) return { items: [], next_cursor: null };
    const rows = await this.catalog.commits(
      {
        createdAt: {
          gte: new Date(`${filter.since}T00:00:00Z`),
          lt: new Date(
            new Date(`${filter.until}T00:00:00Z`).getTime() + 86400000,
          ),
        },
        repository:
          filter.project_id != null
            ? { projectId: filter.project_id }
            : undefined,
        repoId: filter.repo_ids?.length ? { in: filter.repo_ids } : undefined,
        authorId: filter.author_ids?.length
          ? { in: filter.author_ids }
          : undefined,
      },
      limit,
      cursor,
    );
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map(summaryCommit),
      next_cursor:
        rows.length > limit && last
          ? encodeCursor(last.createdAt, last.sha)
          : null,
    };
  }
}
