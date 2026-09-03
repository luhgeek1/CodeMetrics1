import { z } from 'zod';
import { date, optionalList, parse } from '../../common/validation.js';

const schema = z
  .object({
    since: date,
    until: date,
    project_id: z.coerce.number().int().nullish(),
    repo_ids: optionalList,
    author_ids: optionalList,
  })
  .refine((value) => value.since <= value.until, {
    message: 'since must be before until',
    path: ['until'],
  });

export type AnalyticsFilter = z.infer<typeof schema>;
export function analyticsFilter(input: unknown) {
  return parse(schema, input);
}
export const feedOptions = z.object({
  limit: z.coerce.number().int().min(0).max(100).default(20),
  cursor: z.string().max(2048).nullish(),
});
