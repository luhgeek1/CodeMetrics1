import assert from 'node:assert/strict';

const reference = process.env.REFERENCE_API_URL;
const candidate = process.env.CANDIDATE_API_URL;
if (!reference || !candidate)
  throw new Error(
    'Set REFERENCE_API_URL and CANDIDATE_API_URL to backends using the same fixture database',
  );
const params = new URLSearchParams({
  since: process.env.SINCE ?? '2026-09-01',
  until: process.env.UNTIL ?? '2026-09-30',
  limit: '100',
});

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item)]),
    );
  if (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
    return new Date(value).toISOString();
  return value;
}
async function read(base, path) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  return normalize(await response.json());
}
const routes = [
  '/api/v1/metrics/summary',
  '/api/v1/metrics/timeline/summary',
  '/api/v1/developers/summary',
  '/api/v1/insights',
];
const authors = await read(reference, '/api/v1/developers/summary');
if (authors.authors[0]) {
  const id = authors.authors[0].author_id;
  routes.push(
    `/api/v1/developers/${id}/summary`,
    `/api/v1/developers/${id}/commits`,
  );
}
for (const route of routes) {
  const [oldResult, newResult] = await Promise.all([
    read(reference, route),
    read(candidate, route),
  ]);
  assert.deepEqual(newResult, oldResult, `${route} differs from the reference`);
  console.log(`MATCH ${route}`);
}
