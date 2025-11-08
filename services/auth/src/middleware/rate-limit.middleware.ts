import rateLimitFactory from 'express-rate-limit';

import { AppConfig } from '../config/env';

export function createRateLimiter(config: AppConfig) {
  return rateLimitFactory({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests. Slow down and try again shortly.',
    },
  });
}
