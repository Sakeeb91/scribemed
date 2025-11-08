import { logger } from '@scribemed/logging';
import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';

import { AppConfig } from './config/env';
import { createPlaceholderRouter } from './routes/placeholder.routes';

/**
 * Creates the Express application with shared middleware.
 */
export function createApp(config: AppConfig): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.locals.config = config;

  app.use('/api/v1/auth', createPlaceholderRouter());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'auth', environment: config.env });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.on('error', (error) => {
    logger.error('Auth service encountered an error', { error });
  });

  return app;
}
