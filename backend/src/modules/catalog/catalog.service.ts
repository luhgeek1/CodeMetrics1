import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  encodeCursor,
  pagination,
  parse,
  uuid,
} from '../../common/validation.js';
import {
  BranchPage,
  CommitOut,
  CommitPage,
  CommitSummary,
  ProjectOut,
  RepositoryOut,
} from '../../generated/graphql.js';
import { Author } from '../../generated/prisma/client.js';
import {
  CatalogRepository,
  CommitRecord,
  ProjectRecord,
} from './catalog.repository.js';

export function summaryCommit(row: CommitRecord): CommitSummary {
  const person = (
    author: Author | null,
    name: string | null,
    email: string | null,
  ) => ({
    id: author?.id ?? null,
    name: author?.gitName || name,
    email: author?.gitEmail || email,
  });
  return {
    sha: row.sha,
    repo: {
      id: row.repository.id,
      project_id: row.repository.projectId,
      name: row.repository.name,
    },
    author: person(row.author, row.authorName, row.authorEmail),
    committer: person(row.committer, row.committerName, row.committerEmail),
    committed_at: (row.committedAt ?? row.createdAt).toISOString(),
    message: row.message,
    is_merge: row.isMergeCommit,
    added_lines: row.addedLines,
    deleted_lines: row.deletedLines,
    files_changed: row._count.files,
  };
}

export function repositoryCommit(row: CommitRecord): CommitOut {
  const person = (
    author: Author | null,
    name: string | null,
    email: string | null,
  ) => {
    const safeEmail = author?.gitEmail || email;
    return {
      id:
        author?.id ??
        name ??
        (safeEmail?.includes('@') ? safeEmail : 'unknown'),
      name: author?.gitName || name || 'Unknown',
      email: safeEmail?.includes('@') ? safeEmail : null,
    };
  };
  return {
    ...summaryCommit(row),
    repo: {
      project_key: row.repository.project.name,
      name: row.repository.name,
    },
    author: person(row.author, row.authorName, row.authorEmail),
    committer: person(row.committer, row.committerName, row.committerEmail),
    committed_at: row.createdAt.toISOString(),
  };
}

function projectView(row: ProjectRecord): ProjectOut {
  const timestamps = row.repositories.flatMap((repo) =>
    repo.updatedAt ? [repo.updatedAt.getTime()] : [],
  );
  return {
    id: row.id,
    name: row.name,
    full_name: row.fullName,
    description: row.description,
    is_public: row.isPublic,
    repo_count: row._count.repositories,
    last_activity_at: timestamps.length
      ? new Date(Math.max(...timestamps)).toISOString()
      : null,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}
  async projects() {
    return (await this.repository.projects()).map(projectView);
  }
  async project(input: unknown) {
    const row = await this.repository.project(
      parse(z.coerce.number().int(), input),
    );
    if (!row) throw new NotFoundException('Project not found');
    return projectView(row);
  }
  async repositories(input: unknown): Promise<RepositoryOut[]> {
    const id = parse(z.coerce.number().int(), input);
    if (!(await this.repository.project(id)))
      throw new NotFoundException('Project not found');
    return (await this.repository.repositories(id)).map((row) => ({
      id: row.id,
      project_id: row.projectId,
      name: row.name,
      default_branch: row.defaultBranch,
      description: row.description,
      updated_at: row.updatedAt?.toISOString() ?? null,
    }));
  }
  async branches(input: unknown, page: unknown): Promise<BranchPage> {
    const id = await this.requireRepository(input);
    const params = parse(pagination, page ?? {});
    const rows = await this.repository.branches(
      id,
      params.limit,
      params.cursor,
    );
    const items = rows.slice(0, params.limit);
    const last = items.at(-1);
    return {
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        is_default: row.isDefault,
        is_protected: row.isProtected,
      })),
      next_cursor:
        rows.length > params.limit && last
          ? encodeCursor(last.createdAt, last.name)
          : null,
    };
  }
  async commits(input: unknown, page: unknown): Promise<CommitPage> {
    const repoId = await this.requireRepository(input);
    const params = parse(pagination, page ?? {});
    const rows = await this.repository.commits(
      {
        repoId,
        createdAt: params.after ? { gte: new Date(params.after) } : undefined,
      },
      params.limit,
      params.cursor,
    );
    const items = rows.slice(0, params.limit);
    const last = items.at(-1);
    return {
      items: items.map(repositoryCommit),
      next_cursor:
        rows.length > params.limit && last
          ? encodeCursor(last.createdAt, last.sha)
          : null,
    };
  }
  private async requireRepository(input: unknown) {
    const id = parse(uuid, input);
    if (!(await this.repository.repository(id)))
      throw new NotFoundException('Repository not found');
    return id;
  }
}
