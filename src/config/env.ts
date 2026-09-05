import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 0 = let the OS assign a free port (valid for tests / ephemeral runs).
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Customer-facing JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // NibssByPhoenix fintech credentials (obtained via POST /api/fintech/onboard)
  NIBSS_BASE_URL: z.string().url().default('https://nibssbyphoenix.onrender.com'),
  NIBSS_API_KEY: z.string().min(1, 'NIBSS_API_KEY is required'),
  NIBSS_API_SECRET: z.string().min(1, 'NIBSS_API_SECRET is required'),
  NIBSS_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  // Refresh the Nibss JWT this many seconds before it actually expires
  // (the Nibss JWT is valid for 1 hour).
  NIBSS_TOKEN_REFRESH_LEEWAY_S: z.coerce.number().int().nonnegative().default(60),

  CORS_ORIGIN: z.string().default('*'),

  // Optional admin key guarding the dev identity-seeding endpoints.
  DEV_ADMIN_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  // Generous by default: the live smoke script + Postman collection + UI demo
  // together make hundreds of calls per run.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // How often the background poller reconciles each account's ledger balance
  // for incoming-payment detection (incoming money is only visible via the
  // balance endpoint, so we poll it).
  BALANCE_POLL_INTERVAL_S: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration. Fix the following variables:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;