import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { decodeCursor } from '../../common/validation.js';

export const commitInclude = {
  author: true,
  committer: true,
  repository: { include: { project: true } },
  _count: { select: { files: true } },
} satisfies Prisma.CommitInclude;
export type CommitRecord = Prisma.CommitGetPayload<{
  include: typeof commitInclude;
}>;
export const projectInclude = {
  repositories: { select: { updatedAt: true } },
  _count: { select: { repositories: true } },
} satisfies Prisma.ProjectInclude;
export type ProjectRecord = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

@Injectable()
export class CatalogRepository {
  constructor(private readonly db: PrismaService) {}
  projects() {
    return this.db.project.findMany({
      include: projectInclude,
      orderBy: { name: 'asc' },
    });
  }
  project(id: number) {
    return this.db.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }
  repositories(projectId: number) {
    return this.db.repository.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
  }
  repository(id: string) {
    return this.db.repository.findUnique({
      where: { id },
      select: { id: true },
    });
  }
  branches(repoId: string, limit: number, cursor?: string | null) {
    const decoded = cursor ? decodeCursor(cursor) : null;
    return this.db.branch.findMany({
      where: {
        repoId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.date } },
                { createdAt: decoded.date, name: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { name: 'desc' }],
      take: limit + 1,
    });
  }
  commits(
    where: Prisma.CommitWhereInput,
    limit: number,
    cursor?: string | null,
  ) {
    const decoded = cursor ? decodeCursor(cursor) : null;
    return this.db.commit.findMany({
      where: {
        AND: [
          where,
          decoded
            ? {
                OR: [
                  { createdAt: { lt: decoded.date } },
                  { createdAt: decoded.date, sha: { lt: decoded.id } },
                ],
              }
            : {},
        ],
      },
      include: commitInclude,
      orderBy: [{ createdAt: 'desc' }, { sha: 'desc' }],
      take: limit + 1,
    });
  }
}
