import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Client } from 'pg';
import { z } from 'zod';
import { Environment } from '../../config/environment.js';
import { SourceRepository } from './source.repository.js';
import { Repository } from '../../generated/prisma/client.js';
import { SyncStatus } from '../../generated/graphql.js';
import { SourceApiClient, SourceApiError } from './source-api.client.js';
import {
  SourceCommit,
  sourceBranch,
  sourceCommit,
  sourceDiff,
  sourceProject,
  sourceRepository,
} from './source.schemas.js';
import { decodeDiff } from './diff-parser.js';

@Injectable()
export class SyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private active: Promise<SyncStatus> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private status: SyncStatus = {
    state: 'idle',
    projects: 0,
    repositories: 0,
    commits: 0,
    error: null,
    started_at: null,
    finished_at: null,
  };
  private lastRun = 0;
  constructor(
    private readonly repository: SourceRepository,
    private readonly client: SourceApiClient,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  onApplicationBootstrap() {
    if (this.config.get('SYNC_ON_START') && this.config.get('API_URL')) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.start();
      }, 3000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    await this.active;
  }
  current() {
    return { ...this.status };
  }
  start() {
    if (this.active) throw new ConflictException('A sync is already running');
    this.active = this.run().finally(() => {
      this.active = null;
    });
    return this.active;
  }

  @Cron('0 * * * * *')
  async scheduled() {
    const interval = this.config.get('SYNC_INTERVAL_MINUTES');
    if (
      interval > 0 &&
      this.config.get('API_URL') &&
      !this.active &&
      Date.now() - this.lastRun >= interval * 60000
    )
      await this.start();
  }
  private async run(): Promise<SyncStatus> {
    this.lastRun = Date.now();
    this.status = {
      state: 'running',
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
      projects: 0,
      repositories: 0,
      commits: 0,
    };
    // A dedicated PostgreSQL connection owns the advisory lock for the entire import.
    const lock = new Client({
      connectionString: this.config.get('DATABASE_URL'),
    });
    try {
      await lock.connect();
      const result = await lock.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(723142001) AS acquired',
      );
      if (!result.rows[0]?.acquired)
        throw new SourceApiError('Another application instance is syncing');
      const projects = await this.client.list('/projects', sourceProject);
      for (const model of projects) {
        await this.repository.upsertProject(model);
        this.status.projects++;
      }
      for (const model of projects) {
        const project = await this.repository.project(model.name);
        await this.repository.linkParent(project.id, model.parent_id);
        for (const repo of await this.client.list(
          `/projects/${encodeURIComponent(model.name)}/repos`,
          sourceRepository,
        )) {
          const repository = await this.repository.upsertRepository(
            project.id,
            repo,
          );
          const path = `/projects/${encodeURIComponent(model.name)}/repos/${encodeURIComponent(repo.name)}`;
          await this.syncBranches(repository, path);
          await this.syncCommits(repository, path);
          this.status.repositories++;
        }
      }
      this.status.state = 'completed';
    } catch (error) {
      this.status.state = 'failed';
      this.status.error =
        error instanceof SourceApiError
          ? error.message
          : 'Data synchronization failed; inspect server logs';
      this.logger.error(
        error instanceof Error ? error.message : 'Data synchronization failed',
      );
    } finally {
      await lock.end().catch(() => undefined);
      this.status.finished_at = new Date().toISOString();
    }
    return this.current();
  }

  private async syncBranches(repo: Repository, path: string) {
    await this.repository.replaceBranches(
      repo,
      await this.client.list(`${path}/branches`, sourceBranch),
    );
  }

  private async syncCommits(repo: Repository, path: string) {
    const latest = await this.repository.latestCommit(repo.id);
    const after = new Date(
      latest
        ? latest.createdAt.getTime() - 60000
        : Date.now() - this.config.get('SYNC_WINDOW_DAYS') * 86400000,
    ).toISOString();
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const response: { data: SourceCommit[]; cursor: string | null } =
        await this.client.page(`${path}/commits`, sourceCommit, {
          limit: 500,
          fullHistory: false,
          after,
          ...(cursor ? { cursor } : {}),
        });
      for (const commit of response.data) {
        let diff: string | null = null;
        try {
          const payload = z
            .object({ data: sourceDiff.nullish() })
            .parse(
              await this.client.request(
                `${path}/commits/${encodeURIComponent(commit.hash)}/diff`,
                { binary: false },
              ),
            );
          diff = decodeDiff(payload.data?.content);
        } catch {
          this.logger.warn(
            `Diff unavailable for commit ${commit.hash}; retaining existing file statistics`,
          );
        }
        await this.repository.storeCommit(repo, commit, diff);
        this.status.commits++;
      }
      if (!response.cursor || !response.data.length) return;
      if (seen.has(response.cursor))
        throw new SourceApiError('External API repeated a commit cursor');
      seen.add(response.cursor);
      cursor = response.cursor;
    }
    throw new SourceApiError('Commit pagination limit reached');
  }
}
