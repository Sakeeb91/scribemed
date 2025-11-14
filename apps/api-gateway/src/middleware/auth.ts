import { loadConfig } from '@services/auth/src/config/env';
import { createAuthMiddleware } from '@services/auth/src/middleware/auth.middleware';
import type { Request, Response, NextFunction } from 'express';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

let guard: Middleware | null = null;

/**
 * Provides the auth middleware from the auth service so the API gateway can
 * reuse the same JWT verification logic.
 */
export function getAuthGuard(): Middleware {
  if (!guard) {
    const { authenticate } = createAuthMiddleware(loadConfig());
    guard = authenticate;
  }
  if (!guard) {
    throw new Error('Failed to initialize auth guard');
  }
  return guard;
}
