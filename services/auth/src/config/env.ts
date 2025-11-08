import { z } from 'zod';

/**
 * Schema describing the runtime configuration for the auth service. Environment
 * variables are parsed through this schema to ensure we fail fast when a key is
 * missing or malformed.
 */
const ConfigSchema = z.object({
  env: z
    .enum(['development', 'test', 'staging', 'production'])
    .default(process.env.NODE_ENV === 'test' ? 'test' : 'development'),
  port: z.number().int().positive().default(8085),
  jwt: z.object({
    accessTokenSecret: z.string().min(32, 'JWT access token secret must be 32+ chars'),
    refreshTokenSecret: z.string().min(32, 'JWT refresh token secret must be 32+ chars'),
    accessTokenTtl: z.string().default('15m'),
    refreshTokenTtl: z.string().default('30d'),
  }),
  passwordResetMinutes: z.number().int().positive().default(30),
  sessionTtlHours: z
    .number()
    .int()
    .positive()
    .default(24 * 7),
  mfa: z.object({
    issuer: z.string().default('ScribeMed'),
  }),
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(60_000),
    maxRequests: z.number().int().positive().default(100),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Loads configuration from environment variables, applying sane defaults for
 * local development while still requiring secrets in higher environments.
 */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';
  const base = {
    env,
    port: Number(process.env.AUTH_SERVICE_PORT ?? process.env.PORT ?? 8085),
    jwt: {
      accessTokenSecret:
        process.env.JWT_ACCESS_TOKEN_SECRET ??
        (env === 'development' ? 'dev-access-token-secret-change-me' : ''),
      refreshTokenSecret:
        process.env.JWT_REFRESH_TOKEN_SECRET ??
        (env === 'development' ? 'dev-refresh-token-secret-change-me' : ''),
      accessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL ?? '15m',
      refreshTokenTtl: process.env.JWT_REFRESH_TOKEN_TTL ?? '30d',
    },
    passwordResetMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30),
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
    mfa: {
      issuer: process.env.MFA_ISSUER ?? 'ScribeMed',
    },
    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100),
    },
  };

  const parsed = ConfigSchema.safeParse({ ...base, ...overrides });
  if (!parsed.success) {
    throw new Error(
      `Invalid auth service configuration: ${parsed.error.errors.map((err) => err.message).join(', ')}`
    );
  }
  return parsed.data;
}
