'use strict';

const http = require('node:http');

const { getDatabase } = require('@scribemed/database');
const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
  createDatabaseCheck,
} = require('@scribemed/health');

const PORT = Number(process.env.PORT ?? 8081);

// Initialize database connection for health checks
let database = null;
let databaseCheck = null;

async function initializeDatabase() {
  try {
    database = await getDatabase();
    databaseCheck = createDatabaseCheck(database);
  } catch (error) {
    // Database initialization failed, health checks will reflect this
    console.error('Failed to initialize database:', error);
  }
}

// Initialize health check handlers
const livenessHandler = createLivenessHandler('documentation');

async function getReadinessHandler() {
  return createReadinessHandler({
    serviceName: 'documentation',
    checks: databaseCheck ? { database: databaseCheck } : {},
  });
}

async function getHealthHandler() {
  return createHealthHandler({
    serviceName: 'documentation',
    checks: databaseCheck ? { database: databaseCheck } : {},
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    // Health check endpoints
    if (request.url === '/health/live') {
      const health = livenessHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/health/ready') {
      const readinessHandler = await getReadinessHandler();
      const health = await readinessHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/health') {
      const healthHandler = await getHealthHandler();
      const health = await healthHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.method === 'GET' && request.url === '/templates/default') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          subjective: 'Patient reports mild discomfort.',
          objective: 'Vitals stable and within normal limits.',
          assessment: 'Likely musculoskeletal strain.',
          plan: 'Rest, hydration, and follow-up in one week.',
        })
      );
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not Found' }));
  });
}

if (require.main === module) {
  // Initialize database before starting server
  initializeDatabase()
    .then(() => {
      const server = createServer();
      server.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`[documentation] listening on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

module.exports = {
  createServer,
};
