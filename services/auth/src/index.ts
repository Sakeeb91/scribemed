import { createServer } from 'http';

import { logger } from '@scribemed/logging';

import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 8085);

const app = createApp();
const server = createServer(app);

server.listen(PORT, () => {
  logger.info('Auth service listening', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('Auth service shutting down');
  server.close(() => process.exit(0));
});
