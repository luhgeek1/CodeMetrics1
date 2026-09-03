import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { Prisma, Repository } from '../../generated/prisma/client.js';
import {
  SourceCommit,
  GitUser,
  sourceBranch,
  sourceProject,
  sourceRepository,
} from './source.schemas.js';
import { parseDiff, ParsedFile } from './diff-parser.js';
import { writeAggregate } from './aggregate-writer.js';

@Injectable()
export class SourceRepository {
  constructor(private readonly db: PrismaService) {}
  project(name: string) {
    return this.db.project.findUniqueOrThrow({ where: { name } });
  }
  upsertProject(model: z.infer<typeof sourceProject>) {
    const data = {
      id: model.id,
      name: model.name,
      fullName: model.full_name,
      description: model.description ?? null,
      isPublic: model.is_public,
      lfsAllow: model.lfs_allow,
      isFavorite: model.is_favorite,
      permissions: model.permissions,
      createdAt: model.created_at ?? null,
      updatedAt: model.updated_at ?? null,
    };
    return this.db.project.upsert({
      where: { name: model.name },
      create: data,
      update: { ...data, id: undefined },
    });
  }
  async linkParent(id: number, parentId?: number | null) {
    if (
      parentId != null &&
      (await this.db.project.findUnique({ where: { id: parentId } }))
    )
      await this.db.project.update({ where: { id }, data: { parentId } });
  }
  upsertRepository(projectId: number, model: z.infer<typeof sourceRepository>) {
    const data = {
      projectId,
      name: model.name,
      topics: model.topics,
      permissions: model.permissions,
      defaultBranch: model.default_branch ?? null,
      description: model.description ?? null,
      createdAt: model.created_at ?? null,
      updatedAt: model.updated_at ?? null,
    };
    return this.db.repository.upsert({
      where: { projectId_name: { projectId, name: model.name } },
      create: data,
      update: data,
    });
  }
  latestCommit(repoId: string) {
    return this.db.commit.findFirst({
      where: { repoId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
  }
  async replaceBranches(
    repo: Repository,
    branches: z.infer<typeof sourceBranch>[],
  ) {
    await this.db.$transaction(async (tx) => {
      for (const branch of branches)
        await tx.branch.upsert({
          where: { repoId_name: { repoId: repo.id, name: branch.name } },
          create: {
            repoId: repo.id,
            name: branch.name,
            isDefault: branch.name === repo.defaultBranch,
            isProtected: branch.is_protected,
          },
          update: {
            isDefault: branch.name === repo.defaultBranch,
            isProtected: branch.is_protected,
            updatedAt: new Date(),
          },
        });
      await tx.branch.deleteMany({
        where: {
          repoId: repo.id,
          name: { notIn: branches.map((branch) => branch.name) },
        },
      });
    });
  }

  async storeCommit(
    repo: Repository,
    commit: SourceCommit,
    diff: string | null,
  ) {
    await this.db.$transaction(
      async (tx) => {
        const existing = await tx.commit.findUnique({
          where: { sha: commit.hash },
          include: { files: true },
        });
        if (existing && existing.repoId !== repo.id) return; // SHA is the legacy global primary key.
        const author = await this.author(tx, commit.author, commit.created_at);
        const committer = await this.author(
          tx,
          commit.committer,
          commit.created_at,
        );
        const files: ParsedFile[] =
          diff == null && existing
            ? existing.files.map((file) => ({
                path: file.filePath,
                addedLines: file.addedLines,
                deletedLines: file.deletedLines,
                isBinary: file.isBinary,
                patch: file.patch ?? '',
                status: file.status as ParsedFile['status'],
              }))
            : parseDiff(diff ?? '');
        const added = files.reduce((sum, file) => sum + file.addedLines, 0);
        const deleted = files.reduce((sum, file) => sum + file.deletedLines, 0);
        if (existing)
          await writeAggregate(
            tx,
            {
              timestamp: existing.committedAt ?? existing.createdAt,
              projectId: repo.projectId,
              repoId: repo.id,
              authorId: existing.authorId ?? existing.committerId,
              added: existing.addedLines,
              deleted: existing.deletedLines,
              message: existing.message,
              files: existing.files.map((file) => ({
                path: file.filePath,
                addedLines: file.addedLines,
                deletedLines: file.deletedLines,
                patch: file.patch ?? '',
                isBinary: file.isBinary,
                status: file.status as ParsedFile['status'],
              })),
            },
            -1,
          );
        const data = {
          repoId: repo.id,
          authorId: author?.id ?? null,
          committerId: committer?.id ?? null,
          authorName: commit.author?.name ?? '',
          authorEmail: commit.author?.email ?? '',
          committerName: commit.committer?.name ?? null,
          committerEmail: commit.committer?.email ?? null,
          message: commit.message ?? '',
          issues: commit.issues,
          parents: commit.parents,
          branchNames: commit.branch_names,
          tagNames: commit.tag_names,
          oldTagNames: commit.Tags,
          addedLines: added,
          deletedLines: deleted,
          isMergeCommit: commit.parents.length > 1,
          diffContent: diff ?? existing?.diffContent ?? '',
          createdAt: commit.created_at,
        };
        const stored = await tx.commit.upsert({
          where: { sha: commit.hash },
          create: { sha: commit.hash, ...data },
          update: data,
        });
        await tx.commitFile.deleteMany({ where: { commitSha: commit.hash } });
        await tx.commitFile.createMany({
          data: files.map((file) => ({
            commitSha: commit.hash,
            filePath: file.path,
            addedLines: file.addedLines,
            deletedLines: file.deletedLines,
            patch: file.patch,
            status: file.status,
            isBinary: file.isBinary,
          })),
        });
        await writeAggregate(
          tx,
          {
            timestamp: stored.committedAt ?? stored.createdAt,
            projectId: repo.projectId,
            repoId: repo.id,
            authorId: author?.id ?? committer?.id ?? null,
            added,
            deleted,
            message: data.message,
            files,
          },
          1,
        );
        await tx.authorDay.deleteMany({
          where: { repoId: repo.id, commits: { lte: 0 } },
        });
        await tx.hourDay.deleteMany({
          where: { repoId: repo.id, commits: { lte: 0 } },
        });
        await tx.sizeDay.deleteMany({
          where: { repoId: repo.id, cnt: { lte: 0 } },
        });
        await tx.fileDay.deleteMany({
          where: { repoId: repo.id, commitsTouch: { lte: 0 } },
        });
      },
      { timeout: 30000 },
    );
  }

  private async author(
    tx: Prisma.TransactionClient,
    person: GitUser | null | undefined,
    timestamp: Date,
  ) {
    if (!person?.email) return null;
    const emailNormalized = person.email.trim().toLowerCase();
    const existing = await tx.author.findUnique({ where: { emailNormalized } });
    return tx.author.upsert({
      where: { emailNormalized },
      create: {
        emailNormalized,
        gitName: person.name || person.email,
        gitEmail: person.email,
        firstCommitAt: timestamp,
        lastCommitAt: timestamp,
      },
      update: {
        gitName: person.name || existing?.gitName || person.email,
        gitEmail: person.email,
        firstCommitAt:
          existing?.firstCommitAt && existing.firstCommitAt < timestamp
            ? existing.firstCommitAt
            : timestamp,
        lastCommitAt:
          existing?.lastCommitAt && existing.lastCommitAt > timestamp
            ? existing.lastCommitAt
            : timestamp,
      },
    });
  }
}
