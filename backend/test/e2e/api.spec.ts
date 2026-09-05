import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { configureApp } from '../../src/bootstrap.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { seedDatabase } from '../../src/infrastructure/database/seed.js';
import { SyncService } from '../../src/modules/integration/sync.service.js';
import { DashboardSummary } from '../../src/generated/graphql.js';

const filter = { since: '2026-09-01', until: '2026-09-30' };
const commits = Array.from({ length: 15 }, (_, index) => ({
  hash: `fixture-${String(index).padStart(3, '0')}`,
  author: {
    name: index < 10 ? 'Alice' : 'Bob',
    email: index < 10 ? 'alice@example.com' : 'bob@example.com',
  },
  committer: { name: 'Alice', email: 'alice@example.com' },
  created_at: `2026-09-${String(index + 1).padStart(2, '0')}T${index % 2 ? '21' : '10'}:00:00Z`,
  message:
    index < 10
      ? 'Fix an issue'
      : 'A detailed commit message documenting a meaningful change for the team',
  parents: index === 0 ? ['parent-a', 'parent-b'] : ['parent-a'],
  branch_names: ['main'],
}));

describe('PostgreSQL REST and GraphQL integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let source: Server;
  let token: string;
  let userId: string;
  let repoId: string;
  let modified = false;
  let authRequests = 0;
  let serverError = false;

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
      throw new Error(
        'TEST_DATABASE_URL must point to a dedicated database ending in _test',
      );
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      JWT_PRIVATE_KEY: '',
      JWT_PUBLIC_KEY: '',
      JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
      CSRF_HMAC_KEY: 'test-csrf-secret-at-least-32-characters',
      COOKIE_SECURE: 'true',
      SYNC_ON_START: 'false',
      SYNC_INTERVAL_MINUTES: '0',
      API_USERNAME: 'fixture',
      API_PASSWORD: 'fixture',
      GRAPHQL_SANDBOX: 'true',
    });
    source = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      res.setHeader('Content-Type', 'application/json');
      if (serverError) {
        res.statusCode = 503;
        res.end('{}');
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        authRequests++;
        res.end(JSON.stringify({ access_token: 'fixture-token' }));
        return;
      }
      if (req.headers.authorization !== 'Bearer fixture-token') {
        res.statusCode = 401;
        res.end('{}');
        return;
      }
      let data: unknown;
      let page: unknown;
      if (url.pathname === '/projects')
        data = [
          {
            id: 1001,
            name: 'fixture',
            full_name: 'Fixture project',
            is_public: true,
            created_at: '2026-09-01T00:00:00Z',
          },
        ];
      else if (url.pathname === '/projects/fixture/repos')
        data = [
          {
            name: 'backend',
            default_branch: 'main',
            updated_at: '2026-09-15T10:00:00Z',
          },
        ];
      else if (url.pathname.endsWith('/branches'))
        data = [{ name: 'main', is_protected: true }, { name: 'feature' }];
      else if (url.pathname.endsWith('/commits')) {
        const offset = url.searchParams.get('cursor') === 'next' ? 8 : 0;
        data = commits.slice(offset, offset ? 15 : 8);
        page = { next_cursor: offset ? null : 'next' };
      } else if (url.pathname.endsWith('/diff')) {
        const index = Number(url.pathname.split('/').at(-2)!.split('-').at(-1));
        const churn =
          index < 5
            ? modified && index === 0
              ? 7
              : 5
            : index < 10
              ? 35
              : index < 13
                ? 75
                : 150;
        const patch =
          'diff --git a/src/shared.ts b/src/shared.ts\n--- a/src/shared.ts\n+++ b/src/shared.ts\n@@ -0,0 +1,' +
          churn +
          ' @@\n' +
          Array.from({ length: churn }, () => '+added').join('\n');
        data = { content: Buffer.from(patch).toString('base64') };
      } else {
        res.statusCode = 404;
        res.end('{}');
        return;
      }
      res.end(JSON.stringify({ status: 'ok', data, page }));
    });
    await new Promise<void>((resolve) =>
      source.listen(0, '127.0.0.1', resolve),
    );
    process.env.API_URL = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;
    const { AppModule } = await import('../../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(module.createNestApplication({ logger: false }));
    await app.init();
    if (app.get(ConfigService).get('DATABASE_URL') !== testUrl)
      throw new Error(
        'Test database configuration mismatch; refusing to modify data',
      );
    db = app.get(PrismaService);
    await db.$executeRawUnsafe(
      'TRUNCATE users, roles, permissions, languages, projects, authors, auth_throttles CASCADE',
    );
    await seedDatabase(db);
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Client', 'mobile')
      .send({
        email: 'e2e@example.com',
        password: 'correct-password',
        username: 'Test user',
      })
      .expect(201);
    token = registration.body.access_token;
    const user = await db.user.findUniqueOrThrow({
      where: { email: 'e2e@example.com' },
    });
    userId = user.id;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (source)
      await new Promise<void>((resolve, reject) =>
        source.close((error) => (error ? reject(error) : resolve())),
      );
  });

  it('checks health, authorization, Sandbox and the typed GraphQL schema', async () => {
    await request(app.getHttpServer())
      .get('/ping')
      .expect(200, { status: 'operating' });
    await request(app.getHttpServer()).get('/api/v1/users/me/').expect(401);
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me/')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: userId,
      username: 'Test user',
      role_slugs: ['member'],
      permission_slugs: [],
    });
    const sandbox = await request(app.getHttpServer())
      .get('/graphql')
      .set('Accept', 'text/html')
      .expect(200);
    expect(sandbox.text).toContain('embeddable-sandbox');
    const gql = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query:
          '{ health { status } me { id email role_slugs } __schema { queryType { name } } }',
      })
      .expect(200);
    expect(gql.body.errors).toBeUndefined();
    expect(gql.body.data.me.id).toBe(userId);
    const denied = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ me { id } }' });
    expect(denied.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('preserves secure web cookies, CSRF validation, mobile tokens and atomic rotation', async () => {
    await db.authThrottle.deleteMany();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e@example.com', password: 'correct-password' })
      .expect(200);
    expect(login.body.refresh_token).toBeNull();
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('Secure');
    expect(cookies[0]).toContain('SameSite=None');
    const csrf = decodeURIComponent(
      cookies
        .find((cookie) => cookie.startsWith('csrf_token='))!
        .split(';')[0]!
        .slice('csrf_token='.length),
    );
    const cookieHeader = cookies
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(401);
    const mobile = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client', 'mobile')
      .send({ email: 'e2e@example.com', password: 'correct-password' })
      .expect(200);
    const refresh = mobile.body.refresh_token;
    const rotations = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Authorization', `Bearer ${refresh}`)
          .send({}),
      ),
    );
    expect(rotations.map((result) => result.status).sort()).toEqual([200, 401]);
    const issued = rotations.find((result) => result.status === 200)!.body;
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${issued.refresh_token}`)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${issued.access_token}`)
      .expect(401);
  });

  it('imports real fixture data and computes the legacy metrics and recommendations', async () => {
    const status = await app.get(SyncService).start();
    expect(status).toMatchObject({
      state: 'completed',
      projects: 1,
      repositories: 1,
      commits: 15,
    });
    expect(authRequests).toBe(1);
    const repos = await db.repository.findMany();
    repoId = repos[0]!.id;
    const result = await request(app.getHttpServer())
      .get('/api/v1/metrics/summary')
      .query(filter)
      .expect(200);
    const summary: DashboardSummary = result.body;
    expect(summary.kpi).toMatchObject({
      commits: 15,
      active_devs: 2,
      active_repos: 1,
      avg_commit_size: { median: 30.5 },
      msg_quality: { short_pct: 66.67 },
    });
    expect(summary.series.size_hist.map((row) => row.count)).toEqual([
      5, 5, 3, 2,
    ]);
    expect(summary.authors_top.map((row) => row.commits)).toEqual([10, 5]);
    expect(summary.latest_commits).toHaveLength(10);
    expect(summary.recommendations.map((row) => row.id)).toEqual([
      'off-hours',
      'author-concentration',
      'hot-file',
    ]);
    const gql = await request(app.getHttpServer()).post('/graphql').send({
      query:
        'query($filter: MetricsFilter!) { metricsSummary(filter:$filter) { kpi { commits active_devs active_repos avg_commit_size { mean median } msg_quality { short_pct } } series { size_hist { bucket count } } } }',
      variables: { filter },
    });
    expect(gql.body.errors).toBeUndefined();
    expect(gql.body.data.metricsSummary.kpi.commits).toBe(summary.kpi.commits);
    for (const route of [
      '/api/v1/metrics/timeline/summary',
      '/api/v1/developers/summary',
      '/api/v1/insights',
    ])
      await request(app.getHttpServer()).get(route).query(filter).expect(200);
  });

  it('paginates all commits without losing rows and validates dates and IDs', async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const result: request.Response = await request(app.getHttpServer())
        .get(`/api/v1/entities/repos/${repoId}/commits`)
        .set('Authorization', `Bearer ${token}`)
        .query({ limit: 4, ...(cursor ? { cursor } : {}) })
        .expect(200);
      for (const item of result.body.items) {
        expect(seen.has(item.sha)).toBe(false);
        seen.add(item.sha);
      }
      cursor = result.body.next_cursor;
    } while (cursor);
    expect(seen.size).toBe(15);
    const author = await db.author.findUniqueOrThrow({
      where: { emailNormalized: 'alice@example.com' },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/developers/${author.id}/summary`)
      .query(filter)
      .expect(200);
    const feed = await request(app.getHttpServer())
      .get(`/api/v1/developers/${author.id}/commits`)
      .query({ ...filter, limit: 100 })
      .expect(200);
    expect(feed.body.items).toHaveLength(10);
    const scoped = await request(app.getHttpServer())
      .get('/api/v1/metrics/summary')
      .query({ ...filter, author_ids: [author.id], repo_ids: [repoId] })
      .expect(200);
    expect(scoped.body.kpi.commits).toBe(10);
    await request(app.getHttpServer())
      .get('/api/v1/metrics/summary')
      .query({ since: '2026-09-31', until: '2026-10-01' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/metrics/summary')
      .query({ since: '2026-10-01', until: '2026-09-01' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/entities/repos/${repoId}/commits`)
      .set('Authorization', `Bearer ${token}`)
      .query({ cursor: 'broken' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/entities/repos/not-a-uuid/commits')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('keeps synchronization idempotent, updates changed diffs, and reports external failures', async () => {
    const before = await db.authorDay.aggregate({
      _sum: { commits: true, linesAdded: true },
    });
    expect((await app.get(SyncService).start()).state).toBe('completed');
    expect(
      await db.authorDay.aggregate({
        _sum: { commits: true, linesAdded: true },
      }),
    ).toEqual(before);
    modified = true;
    expect((await app.get(SyncService).start()).state).toBe('completed');
    const after = await db.authorDay.aggregate({
      _sum: { commits: true, linesAdded: true },
    });
    expect(after._sum.commits).toBe(15);
    expect(after._sum.linesAdded).toBe(before._sum.linesAdded! + 2);
    expect(await db.commit.count()).toBe(15);
    expect(await db.commitFile.count()).toBe(15);
    serverError = true;
    expect(await app.get(SyncService).start()).toMatchObject({
      state: 'failed',
      error: 'External API /projects returned HTTP 503',
    });
    expect(await db.commit.count()).toBe(15);
  });

  it('updates profiles and enforces roles and account bans in both transports', async () => {
    await db.authThrottle.deleteMany();
    await db.language.create({
      data: { code: 'ru', nameRu: 'Русский', nameEn: 'Russian' },
    });
    const profile = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'Renamed',
        birth_date: '2000-01-01',
        language_code: 'ru',
      })
      .expect(200);
    expect(profile.body.username).toBe('Renamed');
    await request(app.getHttpServer()).get('/api/v1/languages/').expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/languages/')
      .query({ limit: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admins/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    const admin = await db.role.findUniqueOrThrow({ where: { slug: 'admin' } });
    await db.userRole.create({ data: { userId, roleId: admin.id } });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client', 'mobile')
      .send({ email: 'e2e@example.com', password: 'correct-password' })
      .expect(200);
    token = login.body.access_token;
    await request(app.getHttpServer())
      .get('/api/v1/admins/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const user = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Client', 'mobile')
      .send({ email: 'target@example.com', password: 'correct-password' })
      .expect(201);
    const target = await db.user.findUniqueOrThrow({
      where: { email: 'target@example.com' },
    });
    const gql = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query:
          'mutation($id:String!) { setUserBan(userId:$id, banned:true) { banned } }',
        variables: { id: target.id },
      });
    expect(gql.body.errors).toBeUndefined();
    expect(gql.body.data.setUserBan.banned).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.body.access_token}`)
      .expect(403);
    const roles = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query:
          'mutation($id:String!) { setUserRoles(userId:$id, roles:["member"]) { role_slugs } }',
        variables: { id: target.id },
      });
    expect(roles.body.errors).toBeUndefined();
    expect(roles.body.data.setUserRoles.role_slugs).toEqual(['member']);
  });

  it('applies the shared authentication rate limit', async () => {
    await db.authThrottle.deleteMany();
    for (let index = 0; index < 10; index++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'wrong' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(429);
  });
});
