'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
  createMemoryCheck,
  createDatabaseCheck,
  createHealthConfigFromEnv,
} = require('../dist/index');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createMockLogger = () => {
  const calls = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };

  return {
    debug: (message, context) => calls.debug.push({ message, context }),
    info: (message, context) => calls.info.push({ message, context }),
    warn: (message, context) => calls.warn.push({ message, context }),
    error: (message, context) => calls.error.push({ message, context }),
    calls,
  };
};

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

test('createMemoryCheck respects custom thresholds', () => {
  const degradedCheck = createMemoryCheck({
    degradedPercent: 0,
    unhealthyPercent: 1000,
  });
  const degradedResult = degradedCheck();
  assert.equal(degradedResult.status, 'degraded');
  assert.equal(degradedResult.degradedThresholdPercent, 0);
  assert.equal(degradedResult.unhealthyThresholdPercent, 1000);

  const unhealthyCheck = createMemoryCheck({
    degradedPercent: 0,
    unhealthyPercent: 0.0001,
  });
  const unhealthyResult = unhealthyCheck();
  assert.equal(unhealthyResult.status, 'unhealthy');
  assert.equal(unhealthyResult.unhealthyThresholdPercent, 0.0001);
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

test('createHealthHandler accepts configuration objects', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {
      cache: {
        run: async () => ({ status: 'healthy', message: 'cache ok' }),
        impact: 'non-critical',
        timeoutMs: 500,
      },
    },
  });

  const result = await handler();
  assert(result.checks);
  assert.equal(result.checks.cache.status, 'healthy');
  assert.equal(result.checks.cache.message, 'cache ok');
});

test('health handler enforces default timeouts', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {
      slow: async () => {
        await sleep(30);
        return { status: 'healthy' };
      },
    },
    timeouts: { defaultMs: 5 },
  });

  const result = await handler();
  assert.equal(result.checks.slow.status, 'unhealthy');
  assert.equal(result.checks.slow.timedOut, true);
  assert(result.checks.slow.responseTime);
});

test('health handler honours per-check timeout overrides', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {
      slow: {
        run: async () => {
          await sleep(15);
          return { status: 'healthy', custom: true };
        },
        timeoutMs: 30,
      },
    },
    timeouts: { defaultMs: 5 },
  });

  const result = await handler();
  assert.equal(result.checks.slow.status, 'healthy');
  assert.equal(result.checks.slow.custom, true);
  assert(result.checks.slow.responseTime >= 15);
});

test('health handler caches results for the configured TTL', async () => {
  let executions = 0;
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {
      cached: async () => {
        executions += 1;
        return { status: 'healthy', executions };
      },
    },
    cache: { ttlMs: 25 },
  });

  await handler();
  await handler();
  assert.equal(executions, 1);

  await sleep(30);
  await handler();
  assert.equal(executions, 2);
});

test('health handler cache can be disabled', async () => {
  let executions = 0;
  const handler = createHealthHandler({
    serviceName: 'test-service',
    checks: {
      cached: async () => {
        executions += 1;
        return { status: 'healthy', executions };
      },
    },
    cache: { enabled: false },
  });

  await handler();
  await handler();
  assert.equal(executions, 2);
});

test('health handler logs unhealthy results', async () => {
  const mockLogger = createMockLogger();
  const handler = createHealthHandler({
    serviceName: 'test-service',
    logger: mockLogger,
    cache: { enabled: false },
    checks: {
      failing: async () => ({ status: 'unhealthy', message: 'boom' }),
    },
  });

  await handler();
  const unhealthyLog = mockLogger.calls.error.find(
    (entry) => entry.message === 'Health check unhealthy'
  );
  const summaryLog = mockLogger.calls.error.find(
    (entry) => entry.message === 'Health summary unhealthy'
  );
  assert(unhealthyLog);
  assert(summaryLog);
});

test('health handler logs execution errors', async () => {
  const mockLogger = createMockLogger();
  const handler = createHealthHandler({
    serviceName: 'test-service',
    logger: mockLogger,
    cache: { enabled: false },
    checks: {
      broken: async () => {
        throw new Error('explode');
      },
    },
  });

  await handler();
  const executionLog = mockLogger.calls.error.find(
    (entry) => entry.message === 'Health check execution failed'
  );
  assert(executionLog);
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

test('createHealthConfigFromEnv reads environment variables', () => {
  const options = createHealthConfigFromEnv(
    'test-service',
    {},
    {
      HEALTH_CHECK_TIMEOUT_MS: '4500',
      HEALTH_CACHE_TTL_MS: '1500',
      HEALTH_CACHE_ENABLED: 'false',
      HEALTH_MEMORY_DEGRADED_PERCENT: '85',
      HEALTH_MEMORY_UNHEALTHY_PERCENT: '92',
    }
  );

  assert.equal(options.serviceName, 'test-service');
  assert.equal(options.timeouts?.defaultMs, 4500);
  assert.equal(options.cache?.ttlMs, 1500);
  assert.equal(options.cache?.enabled, false);
  assert.equal(options.memoryThresholds?.degradedPercent, 85);
  assert.equal(options.memoryThresholds?.unhealthyPercent, 92);
});

test('createHealthConfigFromEnv honours explicit overrides', () => {
  const options = createHealthConfigFromEnv(
    'test-service',
    {
      includeMemoryCheck: false,
      cache: { enabled: true, ttlMs: 9999 },
      memoryThresholds: { degradedPercent: 80, unhealthyPercent: 90 },
      timeouts: { defaultMs: 1234, perCheck: { database: 2000 } },
    },
    {
      HEALTH_CACHE_ENABLED: 'false',
      HEALTH_CHECK_TIMEOUT_MS: '7000',
      HEALTH_CACHE_TTL_MS: '200',
      HEALTH_MEMORY_DEGRADED_PERCENT: '50',
      HEALTH_MEMORY_UNHEALTHY_PERCENT: '70',
    }
  );

  assert.equal(options.includeMemoryCheck, false);
  assert.equal(options.cache?.enabled, true);
  assert.equal(options.cache?.ttlMs, 9999);
  assert.equal(options.timeouts?.defaultMs, 1234);
  assert.equal(options.timeouts?.perCheck?.database, 2000);
  assert.equal(options.memoryThresholds?.degradedPercent, 80);
  assert.equal(options.memoryThresholds?.unhealthyPercent, 90);
});
