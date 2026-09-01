import 'dotenv/config';
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';

const baseline = '20260901090000_legacy_baseline';
const client = new Client({
  connectionString: (process.env.DATABASE_URL ?? '').replace(
    'postgresql+asyncpg://',
    'postgresql://',
  ),
});
function prisma(...args) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', ...args],
    { stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) throw new Error(`Prisma ${args[0]} failed`);
}

try {
  await client.connect();
  const tables = await client.query(
    "SELECT to_regclass('public.users') AS users, to_regclass('public._prisma_migrations') AS migrations, to_regclass('public.alembic_version') AS legacy",
  );
  const { users, migrations, legacy } = tables.rows[0];
  if (users && !migrations) {
    if (!legacy)
      throw new Error(
        'Existing database has no recognized Alembic history. Review and baseline the database manually.',
      );
    const revision = await client.query(
      'SELECT version_num FROM alembic_version',
    );
    if (
      revision.rows.length !== 1 ||
      revision.rows[0].version_num !== '41ffcd3b898b'
    )
      throw new Error(
        'Legacy database must be migrated to Alembic revision 41ffcd3b898b before adoption',
      );
    console.log('Adopting the existing database without recreating its tables');
    prisma('migrate', 'resolve', '--applied', baseline);
  }
  prisma('migrate', 'deploy');
} finally {
  await client.end();
}
