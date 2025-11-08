import { Router, Request } from 'express';
import { z } from 'zod';

import { AuthService } from '../services/auth.service';

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
  };
};

export function createSessionController(authService: AuthService): Router {
  const router = Router();

  router.get('/', async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const sessions = await authService.listSessions(req.user.id);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  const revokeSchema = z.object({
    sessionId: z.string().uuid(),
  });

  router.delete('/:sessionId', async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const params = revokeSchema.parse({ sessionId: req.params.sessionId });
      await authService.revokeSession(req.user.id, params.sessionId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
