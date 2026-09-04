#!/bin/sh
set -eu
node scripts/migrate.mjs
node dist/infrastructure/database/seed.js
exec node dist/main.js
