import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

export async function seedDatabase(client: PrismaClient) {
  await client.$transaction(async (tx) => {
    await tx.role.upsert({
      where: { slug: 'member' },
      create: {
        slug: 'member',
        name: 'Member',
        description: 'Default role for registered users',
      },
      update: {},
    });
    const admin = await tx.role.upsert({
      where: { slug: 'admin' },
      create: {
        slug: 'admin',
        name: 'Administrator',
        description: 'Full administrative access',
      },
      update: {},
    });
    for (const [slug, name] of [
      ['users.read', 'Read users'],
      ['users.ban', 'Ban users'],
      ['users.manage_roles', 'Manage user roles'],
    ] as const) {
      const permission = await tx.permission.upsert({
        where: { slug },
        create: { slug, name },
        update: {},
      });
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: admin.id,
            permissionId: permission.id,
          },
        },
        create: { roleId: admin.id, permissionId: permission.id },
        update: {},
      });
    }
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: (process.env.DATABASE_URL ?? '').replace(
        'postgresql+asyncpg://',
        'postgresql://',
      ),
    }),
  });
  seedDatabase(db)
    .then(() => console.log('Default roles and permissions are ready'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
