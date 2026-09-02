import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  decodeCursor,
  encodeCursor,
  date,
  parse,
  uuid,
} from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  Principal,
  permissions,
  principalInclude,
} from '../auth/auth.types.js';
import { UserModel, LanguageModel } from '../../generated/graphql.js';
import { Prisma } from '../../generated/prisma/client.js';

const patchSchema = z
  .object({
    username: z.string().max(256).nullish(),
    profile_pic_url: z.url().nullish(),
    bio: z.string().max(10000).nullish(),
    birth_date: date.nullish(),
    language_code: z.string().length(2).nullish(),
  })
  .strict();
const listSchema = z.object({
  banned: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value === 'true'
          ? true
          : value === 'false'
            ? false
            : value
        : value,
    z.boolean().nullish(),
  ),
  search: z.string().max(256).nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(2048).nullish(),
});

export function userView(user: Principal): UserModel {
  const now = new Date();
  const born = user.birthDate;
  const age = born
    ? now.getUTCFullYear() -
      born.getUTCFullYear() -
      (now.getUTCMonth() < born.getUTCMonth() ||
      (now.getUTCMonth() === born.getUTCMonth() &&
        now.getUTCDate() < born.getUTCDate())
        ? 1
        : 0)
    : null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    profile_pic_url: user.profilePicUrl,
    bio: user.bio,
    birth_date: born?.toISOString().slice(0, 10) ?? null,
    age,
    language_code: user.languageCode,
    is_onboarded: user.isOnboarded,
    banned: user.banned,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt?.toISOString() ?? null,
    role_slugs: user.userRoles.map((item) => item.role.slug),
    permission_slugs: permissions(user),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}
  async patch(id: string, input: unknown) {
    const data = parse(patchSchema, input);
    if (
      data.language_code &&
      !(await this.db.language.findUnique({
        where: { code: data.language_code },
      }))
    )
      throw new BadRequestException('Unknown language');
    return userView(
      await this.db.user.update({
        where: { id },
        data: {
          username: data.username ?? undefined,
          profilePicUrl: data.profile_pic_url ?? undefined,
          bio: data.bio ?? undefined,
          birthDate: data.birth_date ? new Date(data.birth_date) : undefined,
          languageCode: data.language_code ?? undefined,
          updatedAt: new Date(),
        },
        include: principalInclude,
      }),
    );
  }

  async languages(query: unknown, limit?: unknown): Promise<LanguageModel[]> {
    const search = parse(z.string().max(50).default(''), query);
    if (!search && limit != null)
      throw new BadRequestException('Limit is not allowed when query is empty');
    const take =
      limit == null
        ? search
          ? 10
          : 50
        : parse(z.coerce.number().int().min(1).max(50), limit);
    const rows = await this.db.language.findMany({
      where: search
        ? {
            OR: [
              { nameRu: { contains: search, mode: 'insensitive' } },
              { nameEn: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { nameRu: 'asc' },
      take,
    });
    return rows.map((row) => ({
      code: row.code,
      name_ru: row.nameRu,
      name_en: row.nameEn,
    }));
  }

  async list(input: unknown) {
    const data = parse(listSchema, input ?? {});
    const cursor = data.cursor ? decodeCursor(data.cursor, '_') : null;
    if (cursor) parse(uuid, cursor.id);
    const where: Prisma.UserWhereInput = {
      banned: data.banned ?? undefined,
      AND: [
        data.search
          ? {
              OR: [
                { username: { contains: data.search, mode: 'insensitive' } },
                { email: { contains: data.search, mode: 'insensitive' } },
              ],
            }
          : {},
        cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.date } },
                { createdAt: cursor.date, id: { lt: cursor.id } },
              ],
            }
          : {},
      ],
    };
    const users = await this.db.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: data.limit + 1,
      include: principalInclude,
    });
    const items = users.slice(0, data.limit);
    const last = items.at(-1);
    return {
      items: items.map(userView),
      next_cursor:
        users.length > data.limit && last
          ? encodeCursor(last.createdAt, last.id, '_')
          : null,
    };
  }

  async setBan(userId: unknown, banned: unknown) {
    const id = parse(uuid, userId);
    const value = parse(z.boolean(), banned);
    await this.exists(id);
    return userView(
      await this.db.user.update({
        where: { id },
        data: {
          banned: value,
          authVersion: { increment: 1 },
          updatedAt: new Date(),
        },
        include: principalInclude,
      }),
    );
  }

  async setRoles(userId: unknown, input: unknown) {
    const id = parse(uuid, userId);
    const slugs = [
      ...new Set(parse(z.array(z.string().min(1).max(64)).max(50), input)),
    ];
    await this.exists(id);
    return this.db.$transaction(async (tx) => {
      const roles = await tx.role.findMany({ where: { slug: { in: slugs } } });
      const missing = slugs.filter(
        (slug) => !roles.some((role) => role.slug === slug),
      );
      if (missing.length)
        throw new NotFoundException(
          `Unknown roles: ${missing.sort().join(', ')}`,
        );
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id })),
      });
      return userView(
        await tx.user.update({
          where: { id },
          data: { authVersion: { increment: 1 }, updatedAt: new Date() },
          include: principalInclude,
        }),
      );
    });
  }

  async registrations(input: unknown) {
    const days = parse(
      z.coerce.number().int().min(1).max(3650).default(30),
      input,
    );
    const rows = await this.db.$queryRaw<
      { day: Date; count: bigint }[]
    >`SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, count(*) AS count FROM users WHERE created_at >= NOW() - ${days} * INTERVAL '1 day' GROUP BY day ORDER BY day`;
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      count: Number(row.count),
    }));
  }
  private async exists(id: string) {
    if (
      !(await this.db.user.findUnique({ where: { id }, select: { id: true } }))
    )
      throw new NotFoundException('User not found');
  }
}
