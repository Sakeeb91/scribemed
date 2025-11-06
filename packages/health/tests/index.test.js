'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
  createMemoryCheck,
  createDatabaseCheck,
} = require('../dist/index');

test('createLivenessHandler returns healthy status', () => {
  const handler = createLivenessHandler('test-service');
  const result = handler();
  assert.equal(result.status, 'healthy');
  assert.equal(result.service, 'test-service');
  assert(result.timestamp);
});

test('createMemoryCheck returns memory usage information', () => {
  const check = createMemoryCheck();
  const result = check();
  assert(result.status);
  assert(typeof result.heapUsedMB === 'number');
  assert(typeof result.heapTotalMB === 'number');
  assert(typeof result.rssMB === 'number');
  assert(typeof result.heapUsagePercent === 'number');
});

test('createReadinessHandler without checks returns healthy', async () => {
  const handler = createReadinessHandler({
    serviceName: 'test-service',
    checks: {},
  });
  const result = await handler();
  assert.equal(result.status, 'healthy');
  assert.equal(result.service, 'test-service');
});

test('createHealthHandler includes memory check by default', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {},
  });
  const result = await handler();
  // Status should be healthy, degraded, or unhealthy depending on memory usage
  assert(['healthy', 'degraded', 'unhealthy'].includes(result.status));
  assert(result.checks);
  assert(result.checks.memory);
});

test('createHealthHandler excludes memory check when disabled', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {},
    includeMemoryCheck: false,
  });
  const result = await handler();
  assert.equal(result.status, 'healthy');
  assert(!result.checks || !result.checks.memory);
});

test('createDatabaseCheck returns unhealthy when database check fails', async () => {
  const mockDatabase = {
    healthCheck: async () => false,
  };
  const check = createDatabaseCheck(mockDatabase);
  const result = await check();
  assert.equal(result.status, 'unhealthy');
  assert(result.responseTime !== undefined);
});

test('createDatabaseCheck returns healthy when database check succeeds', async () => {
  const mockDatabase = {
    healthCheck: async () => true,
  };
  const check = createDatabaseCheck(mockDatabase);
  const result = await check();
  assert.equal(result.status, 'healthy');
  assert(result.responseTime !== undefined);
});

test('createDatabaseCheck handles database errors', async () => {
  const mockDatabase = {
    healthCheck: async () => {
      throw new Error('Connection failed');
    },
  };
  const check = createDatabaseCheck(mockDatabase);
  const result = await check();
  assert.equal(result.status, 'unhealthy');
  assert.equal(result.message, 'Connection failed');
});

test('readiness handler includes database check', async () => {
  const mockDatabase = {
    healthCheck: async () => true,
  };
  const databaseCheck = createDatabaseCheck(mockDatabase);
  const handler = createReadinessHandler({
    serviceName: 'test-service',
    checks: { database: databaseCheck },
  });
  const result = await handler();
  assert.equal(result.status, 'healthy');
  assert(result.checks);
  assert(result.checks.database);
  assert(!result.checks.memory); // Memory should not be in readiness check
});
