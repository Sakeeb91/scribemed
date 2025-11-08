import { logger } from '@scribemed/logging';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response, json } from 'express';
import helmet from 'helmet';

import { AppConfig } from './config/env';
import { createContainer } from './container';
import { createAuthController } from './controllers/auth.controller';
import { createMfaController } from './controllers/mfa.controller';
import { createSessionController } from './controllers/session.controller';
import { createAuthMiddleware } from './middleware/auth.middleware';
import { createRateLimiter } from './middleware/rate-limit.middleware';
import { requireRole } from './middleware/rbac.middleware';

/**
 * Creates the Express application with shared middleware.
 */
export function createApp(config: AppConfig): Application {
  const app = express();
  const container = createContainer(config);
  const { authenticate } = createAuthMiddleware(config);
  const rateLimiter = createRateLimiter(config);

  app.use(helmet());
  app.use(cors());
  app.use(json({ limit: '1mb' }));
  app.use(rateLimiter);

  app.locals.config = config;

  app.use('/api/v1/auth', createAuthController(container.authService, authenticate));
  app.use('/api/v1/mfa', createMfaController(container.authService, authenticate));
  app.use(
    '/api/v1/sessions',
    createSessionController(container.authService, authenticate, requireRole)
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'auth', environment: config.env });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Auth service error', { error });
    res.status(500).json({ error: error.message ?? 'Internal server error' });
  });

  return app;
}
