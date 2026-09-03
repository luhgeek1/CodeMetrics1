import { Prisma, SizeBucket } from '../../generated/prisma/client.js';
import { ParsedFile } from './diff-parser.js';

export interface AggregateCommit {
  timestamp: Date;
  projectId: number;
  repoId: string;
  authorId: string | null;
  added: number;
  deleted: number;
  message: string;
  files: ParsedFile[];
}

export function sizeBucket(churn: number): SizeBucket {
  return churn <= 10
    ? 'ZERO_TEN'
    : churn <= 50
      ? 'ELEVEN_FIFTY'
      : churn <= 100
        ? 'FIFTY_ONE_HUNDRED'
        : 'HUNDRED_PLUS';
}

// Replace the old contribution before writing a changed commit. This keeps resyncs idempotent.
export async function writeAggregate(
  tx: Prisma.TransactionClient,
  commit: AggregateCommit,
  direction: 1 | -1,
) {
  const day = new Date(commit.timestamp.toISOString().slice(0, 10));
  const hour = commit.timestamp.getUTCHours();
  const base = { day, projectId: commit.projectId, repoId: commit.repoId };
  const numbers = {
    commits: direction,
    linesAdded: commit.added * direction,
    linesDeleted: commit.deleted * direction,
  };
  if (commit.authorId) {
    const totals = {
      ...numbers,
      filesChanged: commit.files.length * direction,
      msgTotalLen: [...commit.message].length * direction,
      msgShortCount: [...commit.message].length < 50 ? direction : 0,
    };
    await tx.authorDay.upsert({
      where: {
        day_repoId_authorId: {
          day,
          repoId: commit.repoId,
          authorId: commit.authorId,
        },
      },
      create: { ...base, authorId: commit.authorId, ...totals },
      update: {
        commits: { increment: totals.commits },
        linesAdded: { increment: totals.linesAdded },
        linesDeleted: { increment: totals.linesDeleted },
        filesChanged: { increment: totals.filesChanged },
        msgTotalLen: { increment: totals.msgTotalLen },
        msgShortCount: { increment: totals.msgShortCount },
      },
    });
  }
  await tx.hourDay.upsert({
    where: { day_repoId_hour: { day, repoId: commit.repoId, hour } },
    create: { ...base, hour, ...numbers },
    update: {
      commits: { increment: numbers.commits },
      linesAdded: { increment: numbers.linesAdded },
      linesDeleted: { increment: numbers.linesDeleted },
    },
  });
  const bucket = sizeBucket(commit.added + commit.deleted);
  await tx.sizeDay.upsert({
    where: { day_repoId_bucket: { day, repoId: commit.repoId, bucket } },
    create: { ...base, bucket, cnt: direction },
    update: { cnt: { increment: direction } },
  });
  for (const file of commit.files) {
    const added = file.addedLines * direction;
    const deleted = file.deletedLines * direction;
    await tx.fileDay.upsert({
      where: {
        day_repoId_path: { day, repoId: commit.repoId, path: file.path },
      },
      create: {
        ...base,
        path: file.path,
        commitsTouch: direction,
        linesAdded: added,
        linesDeleted: deleted,
        churn: added + deleted,
      },
      update: {
        commitsTouch: { increment: direction },
        linesAdded: { increment: added },
        linesDeleted: { increment: deleted },
        churn: { increment: added + deleted },
      },
    });
  }
}
