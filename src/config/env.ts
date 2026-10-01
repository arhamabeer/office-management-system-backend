import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Parse a boolean-ish env string. */
const boolFromEnv = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((v) =>
      typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
    )
    .default(def);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),

    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/ems'),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),

    JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret-change-me'),
    JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret-change-me'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('7d'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    // General per-IP cap. Generous because a single page load fans out to
    // ~8 API calls and a whole office can share one NAT IP. (A Redis store +
    // per-user keying is the real prod path for tighter limits.)
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
    // Failed auth attempts per window (successful logins don't count — see
    // authRateLimiter). 20 tolerates fat-fingered passwords while blocking brute force.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Off by default (safe for prod); dev enables it via .env (see .env.example).
    SWAGGER_ENABLED: boolFromEnv(false),

    // --- Email / onboarding ---
    // Public origin of the web app, used to build invite/onboarding links.
    WEB_ORIGIN: z.string().url().default('http://localhost:3001'),
    MAIL_FROM: z.string().min(1).default('BrainCrop <no-reply@braincrop.io>'),
    // Real SMTP connection string, e.g. smtp://user:pass@host:587. When set (or
    // MAIL_TRANSPORT=smtp), invites are sent through it.
    SMTP_URL: z.string().default(''),
    // Discrete SMTP settings — an alternative to SMTP_URL that avoids
    // URL-encoding the username/password (handy for Brevo, whose login is an
    // email). Used when SMTP_URL is empty and SMTP_HOST is set.
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_SECURE: boolFromEnv(false), // true only for port 465
    // auto = smtp if SMTP_URL is set, else an Ethereal preview inbox (dev).
    // ethereal = always use an Ethereal preview inbox. log = only log the link.
    MAIL_TRANSPORT: z.enum(['auto', 'smtp', 'ethereal', 'log']).default('auto'),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (val[key].startsWith('dev-')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must be set to a strong secret in production`,
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment configuration:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
