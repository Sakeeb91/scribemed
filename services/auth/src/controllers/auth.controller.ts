import { RequestHandler, Router } from 'express';
import { z } from 'zod';

import { AuthService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types/express';
import { buildRequestContext } from '../utils/request-context.util';

export function createAuthController(
  authService: AuthService,
  authenticate: RequestHandler
): Router {
  const router = Router();

  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(12),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    organizationId: z.string().uuid(),
    role: z.string().min(2),
  });

  router.post('/register', async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body);
      await authService.register({
        ...body,
        context: buildRequestContext(req),
      });
      res.status(201).json({ message: 'Registration submitted. Verify your email to continue.' });
    } catch (error) {
      next(error);
    }
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    mfaCode: z.string().optional(),
  });

  router.post('/login', async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authService.login({
        ...body,
        context: buildRequestContext(req),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  const refreshSchema = z.object({
    sessionId: z.string().uuid(),
    refreshToken: z.string().min(10),
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const body = refreshSchema.parse(req.body);
      const tokens = await authService.refreshTokens({
        ...body,
        context: buildRequestContext(req),
      });
      res.json(tokens);
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', authenticate, async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      await authService.logout(user.sessionId, user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  const forgotSchema = z.object({
    email: z.string().email(),
  });

  router.post('/password/forgot', async (req, res, next) => {
    try {
      const body = forgotSchema.parse(req.body);
      await authService.requestPasswordReset({
        email: body.email,
        context: buildRequestContext(req),
      });
      res.status(202).json({ message: 'If the email exists, a reset link will be sent.' });
    } catch (error) {
      next(error);
    }
  });

  const resetSchema = z.object({
    token: z.string().min(10),
    newPassword: z.string().min(12),
  });

  router.post('/password/reset', async (req, res, next) => {
    try {
      const body = resetSchema.parse(req.body);
      await authService.resetPassword({
        ...body,
        context: buildRequestContext(req),
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
