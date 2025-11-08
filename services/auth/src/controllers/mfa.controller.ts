import { RequestHandler, Router } from 'express';
import { z } from 'zod';

import { AuthService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types/express';

export function createMfaController(
  authService: AuthService,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post('/setup', async (req: AuthenticatedRequest, res, next) => {
    try {
      const setup = await authService.initMfa(req.user.id);
      res.json(setup);
    } catch (error) {
      next(error);
    }
  });

  const verifySchema = z.object({
    code: z.string().min(6),
  });

  router.post('/verify', async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = verifySchema.parse(req.body);
      await authService.verifyMfa(req.user.id, body.code);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/disable', async (req: AuthenticatedRequest, res, next) => {
    try {
      await authService.disableMfa(req.user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
