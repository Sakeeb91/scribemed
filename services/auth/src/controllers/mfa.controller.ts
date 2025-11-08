import { Router, Request } from 'express';
import { z } from 'zod';

import { AuthService } from '../services/auth.service';

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
  };
};

export function createMfaController(authService: AuthService): Router {
  const router = Router();

  router.post('/setup', async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
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
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const body = verifySchema.parse(req.body);
      await authService.verifyMfa(req.user.id, body.code);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/disable', async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      await authService.disableMfa(req.user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
