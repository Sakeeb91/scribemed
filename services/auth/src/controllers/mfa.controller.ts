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

  router.post('/setup', async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const setup = await authService.initMfa(user.id);
      res.json(setup);
    } catch (error) {
      next(error);
    }
  });

  const verifySchema = z.object({
    code: z.string().min(6),
  });

  router.post('/verify', async (req, res, next) => {
    try {
      const body = verifySchema.parse(req.body);
      const { user } = req as AuthenticatedRequest;
      await authService.verifyMfa(user.id, body.code);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/disable', async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      await authService.disableMfa(user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
