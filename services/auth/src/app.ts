import cors from 'cors';
import express, { Application, NextFunction, Request, Response, json } from 'express';
import helmet from 'helmet';

import { getDatabase } from '@scribemed/database';
import {
  createDatabaseCheck,
  createHealthConfigFromEnv,
  createHealthHandler,
  createLivenessHandler,
  createReadinessHandler,
  getHealthMetricsSnapshot,
} from '@scribemed/health';
import { logger } from '@scribemed/logging';

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
  const healthHandlers = buildHealthHandlers(config);

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

  app.get('/health/live', (_req: Request, res: Response) => {
    res.json(healthHandlers.liveness());
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    const health = await healthHandlers.readiness();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  app.get('/health', async (_req: Request, res: Response) => {
    const health = await healthHandlers.health();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    res.type('text/plain').send(getHealthMetricsSnapshot());
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

function buildHealthHandlers(config: AppConfig) {
  const databaseCheck = createDatabaseCheck({
    healthCheck: async () => {
      if (config.env === 'test') {
        return true;
      }
      try {
        const db = await getDatabase();
        await db.query('SELECT 1');
        return true;
      } catch (error) {
        logger.error('Auth database health check failed', { error });
        return false;
      }
    },
  });

  const rateLimiterCheck = {
    run: async () => {
      const maxRequests = config.rateLimit.maxRequests;
      const status: 'healthy' | 'degraded' = maxRequests > 1000 ? 'degraded' : 'healthy';
      return {
        status,
        maxRequests,
      };
    },
    impact: 'non-critical' as const,
  };

  const healthOptions = createHealthConfigFromEnv('auth', {
    cache: { ttlMs: Number(process.env.HEALTH_CACHE_TTL_MS ?? 2000) },
    checks: {
      database: databaseCheck,
      rateLimiter: rateLimiterCheck,
    },
  });

  const checks = healthOptions.checks ?? {};
  const readinessOptions = {
    ...healthOptions,
    checks: { database: checks.database ?? databaseCheck },
    includeMemoryCheck: false,
  };

  return {
    liveness: createLivenessHandler(healthOptions.serviceName),
    readiness: createReadinessHandler(readinessOptions),
    health: createHealthHandler(healthOptions),
  };
}
