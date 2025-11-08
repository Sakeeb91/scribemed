import { Router } from 'express';

/**
 * Temporary router used while we build the full controller stack. It ensures the
 * service exports a consistent HTTP surface for early health checks.
 */
export function createPlaceholderRouter(): Router {
  const router = Router();

  router.all('*', (_req, res) => {
    res.status(501).json({
      error: 'Auth endpoints are under construction. Refer to issue #5 for progress.',
    });
  });

  return router;
}
