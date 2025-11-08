import { AppConfig } from '../src/config/env';

export const testConfig: AppConfig = {
  env: 'test',
  port: 0,
  jwt: {
    accessTokenSecret: 'test-access-token-secret-which-is-long-enough',
    refreshTokenSecret: 'test-refresh-token-secret-which-is-long-enough',
    accessTokenTtl: '5m',
    refreshTokenTtl: '1d',
  },
  passwordResetMinutes: 30,
  sessionTtlHours: 24,
  mfa: {
    issuer: 'TestIssuer',
  },
  rateLimit: {
    windowMs: 1000,
    maxRequests: 20,
  },
};
