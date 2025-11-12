'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createServer } = require('../src/server');

function createMockHealthModule() {
  const buildResponse = (serviceName, checks) => {
    const result = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: serviceName,
      checks,
    };

    const statuses = Object.values(checks).map((check) => check.status);
    if (statuses.includes('unhealthy')) {
      result.status = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      result.status = 'degraded';
    }

    return result;
  };

  const runChecks = async (serviceName, checks = {}) => {
    const results = {};
    await Promise.all(
      Object.entries(checks).map(async ([name, fn]) => {
        results[name] = await fn();
      })
    );
    return buildResponse(serviceName, results);
  };

  return {
    createLivenessHandler: (serviceName) => () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: serviceName,
    }),
    createReadinessHandler: ({ serviceName, checks }) => {
      return async () => runChecks(serviceName, checks);
    },
    createHealthHandler: ({ serviceName, checks }) => {
      return async () => runChecks(serviceName, checks);
    },
    createDatabaseCheck: (database) => async () => {
      const isHealthy = await database.healthCheck();
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
      };
    },
    createHealthConfigFromEnv: (serviceName, overrides = {}) => ({
      serviceName,
      checks: overrides.checks ?? {},
    }),
    createRemoteHealthCheck:
      ({ serviceName }) =>
      async () => ({
        status: 'healthy',
        remoteService: serviceName,
      }),
    getHealthMetricsSnapshot: () => 'scribemed_health_check_status 1',
  };
}

const defaultHealthModule = createMockHealthModule();

async function startServer(options = {}) {
  const server = createServer({
    ...options,
    healthModule: options.healthModule ?? defaultHealthModule,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test('templates endpoint returns default SOAP structure', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/templates/default`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.plan, 'Rest, hydration, and follow-up in one week.');
});

test('GET /health reports unhealthy until dependencies are ready', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert.equal(payload.status, 'unhealthy');
  assert(payload.timestamp);
  assert(payload.checks.database);
  assert.equal(payload.checks.database.status, 'unhealthy');
});

test('GET /health/live returns liveness status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/live`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert.equal(payload.status, 'healthy');
});

test('GET /health/ready returns unhealthy when dependencies missing', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/ready`);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert.equal(payload.status, 'unhealthy');
});

test('GET /health/ready returns healthy when database check passes', async (t) => {
  const mockHealthCheck = async () => ({ status: 'healthy' });
  const { server, url } = await startServer({
    healthChecksOverride: { database: mockHealthCheck },
  });
  t.after(() => server.close());

  const response = await fetch(`${url}/health/ready`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert.equal(payload.status, 'healthy');
});

test('GET /metrics returns Prometheus payload', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/metrics`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert(body.includes('scribemed_health_check_status'));
});
