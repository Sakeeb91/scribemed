import { loadConfig } from '@services/auth/src/config/env';
import { createAuthMiddleware } from '@services/auth/src/middleware/auth.middleware';

type Middleware = (req: unknown, res: unknown, next: () => void) => void;

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
  return guard;
}
