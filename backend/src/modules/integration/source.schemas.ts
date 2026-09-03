import { z } from 'zod';

const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'Invalid timestamp')
  .transform((value) => new Date(value));
const nullableTime = timestamp.nullish();
const permissions = z.record(z.string(), z.boolean()).default({});
const strings = z.array(z.string()).default([]);
const gitUser = z.object({ name: z.string(), email: z.string() });

export const sourceProject = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  full_name: z.string(),
  description: z.string().nullish(),
  is_public: z.boolean().default(false),
  lfs_allow: z.boolean().default(false),
  is_favorite: z.boolean().default(false),
  parent_id: z.number().int().nullish(),
  permissions,
  created_at: nullableTime,
  updated_at: nullableTime,
});
export const sourceRepository = z.object({
  name: z.string().min(1),
  default_branch: z.string().nullish(),
  description: z.string().nullish(),
  topics: strings,
  permissions,
  created_at: nullableTime,
  updated_at: nullableTime,
});
export const sourceBranch = z.object({
  name: z.string().min(1),
  is_protected: z.boolean().default(false),
});
export const sourceCommit = z.object({
  hash: z.string().min(1),
  author: gitUser.nullish(),
  committer: gitUser.nullish(),
  created_at: timestamp,
  message: z.string().nullish(),
  issues: z.record(z.string(), z.string()).default({}),
  parents: strings,
  branch_names: strings,
  tag_names: strings,
  Tags: strings,
});
export const sourceDiff = z.object({ content: z.string().nullish() });
export type SourceCommit = z.infer<typeof sourceCommit>;
export type GitUser = z.infer<typeof gitUser>;
