# Backend

## Разработка

Используйте Node.js 24. Сначала запустите PostgreSQL с доступом с компьютера:

```sh
# Из корня репозитория
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
docker compose stop backend
```

В `backend/.env` задайте `DATABASE_URL=postgresql://postgres:secret@localhost:5444/hackathon`. Затем:

```sh
cd backend
npm ci
npm run generate
npm run db:migrate
npm run db:seed
API_PORT=18080 npm run start:dev
```

`start:dev` генерирует Prisma Client и TypeScript-типы из GraphQL-схемы, затем запускает Nest с отслеживанием изменений. Фронтенд запускается через `npm ci && npm run dev` в `frontend/`; Vite проксирует `/api/v1` и `/graphql` на порт 18080.

```sh
npm run build
npm run typecheck
npm run format
npm test
```

`src/generated` создаётся из Prisma и GraphQL и не хранится в Git. После изменения схемы используйте `npm run generate`. Миграции хранятся в `prisma/migrations`; применяются только через Prisma, без автоматического `db push`.

## PostgreSQL-тесты

Интеграционные тесты используют отдельную базу, имя которой заканчивается на `_test`. Они очищают только эту базу. Пример из корня репозитория:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
docker compose exec db psql -U postgres -d postgres -c 'CREATE DATABASE codemetrics_test'
cd backend
DATABASE_URL=postgresql://postgres:secret@localhost:5444/codemetrics_test npm run db:migrate
TEST_DATABASE_URL=postgresql://postgres:secret@localhost:5444/codemetrics_test npm run test:e2e
```

Проверяются REST и GraphQL, Sandbox, защищённые cookie, CSRF, конкурентная ротация токенов, роли и блокировки, валидаторы, пагинация, фактический импорт через тестовый HTTP API, формулы метрик, повторный импорт и изменение diff. Бизнес-логика и Prisma в этих тестах не подменяются.

Для сравнения со старым работающим бэкендом на той же тестовой базе:

```sh
REFERENCE_API_URL=http://localhost:18082 \
CANDIDATE_API_URL=http://localhost:18081 \
SINCE=2026-09-01 UNTIL=2026-09-30 npm run test:parity
```

Сравнение охватывает dashboard, timeline, developers, developer detail/commits и insights. Даты нормализуются из `+00:00` и `Z`; значения и структура ответов должны совпасть.

## Apollo Sandbox

Откройте `https://localhost:8443/graphql`. Для проверки без браузерных cookie удобно получить пару мобильных токенов:

```graphql
mutation {
  register(
    input: { email: "reader@example.com", password: "a-long-local-password" }
    client: "mobile"
  ) {
    access_token
    refresh_token
  }
}
```

Если аккаунт уже есть, используйте `login` с такими же аргументами. Добавьте в Sandbox заголовок `Authorization: Bearer <access_token>`:

```graphql
query {
  me { id email username role_slugs permission_slugs }
  projects { id name full_name repo_count }
  metricsSummary(filter: { since: "2026-09-01", until: "2026-09-30" }) {
    kpi { commits active_devs active_repos avg_commit_size { mean median } }
    series { commits_daily { date count } }
    recommendations { title description severity }
  }
}
```

Мобильный токен обновляется через `refresh(refreshToken: "...")`. При `client: "web"` refresh JWT передаётся как HttpOnly cookie, а `csrf_token` читается клиентом и отправляется в заголовке `X-CSRF-Token`. Logout отзывает сессию, включая её access JWT. Роли и блокировки проверяются по текущему состоянию пользователя.

Начальная роль — `member`. Для назначения первого администратора используйте доверенный доступ к PostgreSQL:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.email = 'admin@example.com' AND r.slug = 'admin'
ON CONFLICT DO NOTHING;
```

После этого доступны GraphQL-операции `adminUsers`, `setUserRoles`, `setUserBan`, `registrations`, `syncStatus` и `syncSource`.

## Настройки

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; старый префикс `postgresql+asyncpg://` принимается при миграции |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Существующая PEM-пара RS256; используйте оба значения вместе |
| `JWT_SECRET` | Альтернатива RSA: секрет HS256 длиной от 32 символов |
| `CSRF_HMAC_KEY` | Ключ HMAC для браузерного refresh |
| `SITE_URL` | Разрешённый origin фронтенда |
| `COOKIE_SECURE` | `true` для HTTPS; `false` для локального HTTP |
| `GRAPHQL_SANDBOX` | Sandbox и introspection; для закрытого production можно отключить |
| `API_URL` / `API_AUTH_PATH` | Внешний API и путь его авторизации |
| `SYNC_ON_START` / `SYNC_INTERVAL_MINUTES` | Начальный и периодический импорт |
| `SYNC_WINDOW_DAYS` | Глубина первоначального импорта коммитов |

Файл `.env.example` содержит настройки локальной разработки. Для развёртывания задайте собственные ключи и адреса через окружение. Docker работает от пользователя `node`, запускает миграции, добавляет недостающие начальные роли и проверяет готовность базы через `/health`.
