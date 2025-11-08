import { RequestHandler, Router } from 'express';
import { z } from 'zod';

import { AuthService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types/express';

export function createSessionController(
  authService: AuthService,
  authenticate: RequestHandler,
  authorize: (roles: string[]) => RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  const privilegedRoles = ['admin', 'physician', 'nurse_practitioner'];

  router.get('/', authorize(privilegedRoles), async (req: AuthenticatedRequest, res, next) => {
    try {
      const sessions = await authService.listSessions(req.user.id);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  const revokeSchema = z.object({
    sessionId: z.string().uuid(),
  });

  router.delete(
    '/:sessionId',
    authorize(privilegedRoles),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const params = revokeSchema.parse({ sessionId: req.params.sessionId });
        await authService.revokeSession(req.user.id, params.sessionId);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
