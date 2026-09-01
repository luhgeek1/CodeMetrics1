import { z } from 'zod';

const bool = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .min(1)
    .transform((value) =>
      value.replace('postgresql+asyncpg://', 'postgresql://'),
    ),
  SITE_URL: z.url().default('https://localhost:8443'),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  CSRF_HMAC_KEY: z.string().min(16),
  ACCESS_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TTL: z.coerce.number().int().positive().default(604800),
  COOKIE_SECURE: bool.default(true),
  GRAPHQL_SANDBOX: bool.default(true),
  API_URL: z.string().default(''),
  API_USERNAME: z.string().default(''),
  API_PASSWORD: z.string().default(''),
  API_AUTH_PATH: z.string().startsWith('/').default('/api/auth/login'),
  SYNC_ON_START: bool.default(true),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
  SYNC_WINDOW_DAYS: z.coerce.number().int().positive().default(365),
});

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const config = schema.parse(input);
  if (Boolean(config.JWT_PRIVATE_KEY) !== Boolean(config.JWT_PUBLIC_KEY)) {
    throw new Error(
      'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured together',
    );
  }
  if (
    !(config.JWT_PRIVATE_KEY && config.JWT_PUBLIC_KEY) &&
    !config.JWT_SECRET
  ) {
    throw new Error(
      'Configure both JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or JWT_SECRET (32+ characters)',
    );
  }
  if (config.API_URL) z.url().parse(config.API_URL);
  return config;
}
