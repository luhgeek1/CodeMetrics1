import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AnalyticsFilter } from './analytics.filter.js';

export interface KpiRow {
  commits: number;
  active_devs: number;
  active_repos: number;
  msg_total_len: number;
  msg_short_count: number;
}
export interface DailyRow {
  day: Date;
  commits: number;
}
export interface HourRow {
  hour: number;
  commits: number;
  lines_added: number;
  lines_deleted: number;
}
export interface WeekdayRow {
  weekday: number;
  commits: number;
}
export interface AuthorRow {
  author_id: string;
  commits: number;
  lines: number;
  git_name: string | null;
  git_email: string | null;
}
export interface SizeRow {
  bucket: string;
  count: number;
}
export interface HotFileRow {
  path: string;
  commits_touch: number;
  churn: number;
}

function filterSql(filter: AnalyticsFilter, authors = false) {
  const conditions = [
    Prisma.sql`d.day >= ${new Date(filter.since)}::date`,
    Prisma.sql`d.day <= ${new Date(filter.until)}::date`,
  ];
  if (filter.project_id != null)
    conditions.push(Prisma.sql`d.project_id = ${filter.project_id}`);
  if (filter.repo_ids?.length)
    conditions.push(Prisma.sql`d.repo_id IN (${Prisma.join(filter.repo_ids)})`);
  if (authors && filter.author_ids?.length)
    conditions.push(
      Prisma.sql`d.author_id IN (${Prisma.join(filter.author_ids)})`,
    );
  return Prisma.join(conditions, ' AND ');
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly db: PrismaService) {}
  snapshot(filter: AnalyticsFilter, authorLimit: number) {
    const where = filterSql(filter);
    const authorWhere = filterSql(filter, true);
    // Existing hour, size and file rollups are repository-scoped, as in the original API.
    return this.db.$transaction(
      [
        this.db.$queryRaw<
          KpiRow[]
        >`SELECT COALESCE(SUM(commits),0)::int AS commits, COUNT(DISTINCT author_id)::int AS active_devs, COUNT(DISTINCT repo_id)::int AS active_repos, COALESCE(SUM(msg_total_len),0)::int AS msg_total_len, COALESCE(SUM(msg_short_count),0)::int AS msg_short_count FROM agg_author_repo_day d WHERE ${authorWhere}`,
        this.db.$queryRaw<
          DailyRow[]
        >`SELECT day, SUM(commits)::int AS commits FROM agg_author_repo_day d WHERE ${authorWhere} GROUP BY day ORDER BY day`,
        this.db.$queryRaw<
          HourRow[]
        >`SELECT hour::int, SUM(commits)::int AS commits, SUM(lines_added)::int AS lines_added, SUM(lines_deleted)::int AS lines_deleted FROM agg_hour_repo_day d WHERE ${where} GROUP BY hour ORDER BY hour`,
        this.db.$queryRaw<
          WeekdayRow[]
        >`SELECT EXTRACT(DOW FROM day)::int AS weekday, SUM(commits)::int AS commits FROM agg_hour_repo_day d WHERE ${where} GROUP BY weekday ORDER BY weekday`,
        this.db.$queryRaw<
          AuthorRow[]
        >`SELECT d.author_id, SUM(d.commits)::int AS commits, SUM(d.lines_added+d.lines_deleted)::int AS lines, a.git_name, a.git_email FROM agg_author_repo_day d LEFT JOIN authors a ON a.id=d.author_id WHERE ${authorWhere} GROUP BY d.author_id,a.git_name,a.git_email ORDER BY commits DESC, lines DESC, d.author_id LIMIT ${authorLimit}`,
        this.db.$queryRaw<
          SizeRow[]
        >`SELECT bucket::text, SUM(cnt)::int AS count FROM agg_size_bucket_repo_day d WHERE ${where} GROUP BY bucket`,
        this.db.$queryRaw<
          HotFileRow[]
        >`SELECT path, SUM(commits_touch)::int AS commits_touch, SUM(churn)::int AS churn FROM agg_file_repo_day d WHERE ${where} GROUP BY path ORDER BY churn DESC, commits_touch DESC, path LIMIT 3`,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
