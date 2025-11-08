import { createServer } from 'http';

import { logger } from '@scribemed/logging';

import { createApp } from './app';
import { loadConfig } from './config/env';

const config = loadConfig();
const app = createApp(config);
const server = createServer(app);

server.listen(config.port, () => {
  logger.info('Auth service listening', { port: config.port, env: config.env });
});

process.on('SIGTERM', () => {
  logger.info('Auth service shutting down');
  server.close(() => process.exit(0));
});
