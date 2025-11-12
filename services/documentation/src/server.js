'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT ?? 8081);
const DATABASE_RETRY_DELAY_MS = Number(process.env.DATABASE_RETRY_DELAY_MS ?? 5000);
const CODING_HEALTH_URL = process.env.CODING_HEALTH_URL ?? 'http://coding:8082/health';
const TRANSCRIPTION_HEALTH_URL =
  process.env.TRANSCRIPTION_HEALTH_URL ?? 'http://transcription:8080/health';

let databaseCheck = null;
let databaseInitializationError = null;
let databaseRetryHandle = null;
let cachedHealthModule = null;

function resolveHealthModule(override) {
  if (override) {
    return override;
  }

  if (!cachedHealthModule) {
    // eslint-disable-next-line global-require
    cachedHealthModule = require('@scribemed/health');
  }

  return cachedHealthModule;
}

function scheduleDatabaseRetry() {
  if (databaseRetryHandle) {
    return;
  }

  databaseRetryHandle = setTimeout(() => {
    databaseRetryHandle = null;
    initializeDatabase().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Database retry failed:', error);
    });
  }, DATABASE_RETRY_DELAY_MS);
  if (typeof databaseRetryHandle.unref === 'function') {
    databaseRetryHandle.unref();
  }
}

async function initializeDatabase() {
  try {
    // Dynamically require so tests can run without installing the database package
    // eslint-disable-next-line global-require
    const { getDatabase } = require('@scribemed/database');
    const database = await getDatabase();
    const { createDatabaseCheck } = resolveHealthModule();
    databaseCheck = createDatabaseCheck(database);
    databaseInitializationError = null;

    if (databaseRetryHandle) {
      clearTimeout(databaseRetryHandle);
      databaseRetryHandle = null;
    }
  } catch (error) {
    databaseInitializationError =
      error instanceof Error ? error : new Error('Database initialization failed');
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', databaseInitializationError);
    scheduleDatabaseRetry();
  }
}

function createPendingDatabaseCheck() {
  return async () => ({
    status: 'unhealthy',
    message: databaseInitializationError?.message ?? 'Database initialization pending',
  });
}

function resolveHealthChecks(healthChecksOverride) {
  if (healthChecksOverride) {
    return healthChecksOverride;
  }

  if (databaseCheck) {
    return { database: databaseCheck };
  }

  return { database: createPendingDatabaseCheck() };
}

function buildHealthOptions(healthModule, healthChecksOverride) {
  return healthModule.createHealthConfigFromEnv('documentation', {
    cache: { ttlMs: Number(process.env.HEALTH_CACHE_TTL_MS ?? 2000) },
    timeouts: { defaultMs: 1500 },
    checks: {
      ...resolveHealthChecks(healthChecksOverride),
      ...createRemoteChecks(healthModule),
    },
  });
}

function createRemoteChecks(healthModule) {
  return {
    coding: healthModule.createRemoteHealthCheck({
      serviceName: 'coding',
      endpoint: CODING_HEALTH_URL,
      timeoutMs: 1500,
    }),
    transcription: healthModule.createRemoteHealthCheck({
      serviceName: 'transcription',
      endpoint: TRANSCRIPTION_HEALTH_URL,
      timeoutMs: 1500,
    }),
  };
}

function createServer(options = {}) {
  const { healthChecksOverride, healthModule: healthModuleOverride } = options;
  const healthModule = resolveHealthModule(healthModuleOverride);
  const livenessHandler = healthModule.createLivenessHandler('documentation');

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
      const readinessHandler = healthModule.createReadinessHandler(
        buildHealthOptions(healthModule, healthChecksOverride)
      );
      const health = await readinessHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/health') {
      const healthHandler = healthModule.createHealthHandler(
        buildHealthOptions(healthModule, healthChecksOverride)
      );
      const health = await healthHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/metrics') {
      response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      response.end(healthModule.getHealthMetricsSnapshot());
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
  initializeDatabase()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Initial database check failed:', error);
    })
    .finally(() => {
      const server = createServer();
      server.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`[documentation] listening on http://localhost:${PORT}`);
      });
    });
}

module.exports = {
  createServer,
};
