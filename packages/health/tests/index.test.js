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
  createRemoteHealthCheck,
  getHealthMetricsSnapshot,
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

const createMockCollector = () => {
  const events = [];
  return {
    recordCheckStatus: (service, check, status) =>
      events.push({ type: 'status', service, check, status }),
    recordCheckDuration: (service, check, duration) =>
      events.push({ type: 'duration', service, check, duration }),
    recordOverallStatus: (service, status) => events.push({ type: 'overall', service, status }),
    toPrometheus: () => '',
    events,
  };
};

const createFetchStub = (payload) => async () => ({
  ok: true,
  json: async () => payload,
});

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

test('circuit breaker opens after repeated failures', async () => {
  let attempts = 0;
  const handler = createHealthHandler({
    serviceName: 'test-service',
    cache: { enabled: false },
    checks: {
      flaky: {
        run: async () => {
          attempts += 1;
          throw new Error('boom');
        },
        circuitBreaker: {
          failureThreshold: 2,
          cooldownPeriodMs: 1000,
          openStatus: 'unhealthy',
        },
      },
    },
  });

  await handler().catch(() => {});
  await handler().catch(() => {});
  const bypassed = await handler();
  assert.equal(attempts, 2);
  assert.equal(bypassed.checks.flaky.circuitBreakerState, 'open');
});

test('circuit breaker recovers after cooldown', async () => {
  let shouldFail = true;
  const handler = createHealthHandler({
    serviceName: 'test-service',
    cache: { enabled: false },
    checks: {
      flaky: {
        run: async () => {
          if (shouldFail) {
            shouldFail = false;
            throw new Error('boom');
          }
          return { status: 'healthy' };
        },
        circuitBreaker: {
          failureThreshold: 1,
          successThreshold: 1,
          cooldownPeriodMs: 120,
        },
      },
    },
  });

  await handler().catch(() => {});
  await sleep(150);
  const result = await handler();
  assert.equal(result.checks.flaky.status, 'healthy');
});

test('remote health check maps degraded status', async () => {
  const remoteCheck = createRemoteHealthCheck({
    serviceName: 'reports',
    endpoint: 'http://reports/health',
    fetchImplementation: createFetchStub({ status: 'degraded', service: 'reports' }),
  });

  const result = await remoteCheck();
  assert.equal(result.status, 'degraded');
  assert.equal(result.remoteService, 'reports');
});

test('remote health check handles errors and degrade overrides', async () => {
  const tolerantCheck = createRemoteHealthCheck({
    serviceName: 'reports',
    endpoint: 'http://reports/health',
    degradeOnDegraded: false,
    fetchImplementation: createFetchStub({ status: 'degraded', service: 'reports' }),
  });
  const healthyResult = await tolerantCheck();
  assert.equal(healthyResult.status, 'healthy');

  const failingCheck = createRemoteHealthCheck({
    serviceName: 'reports',
    endpoint: 'http://reports/health',
    fetchImplementation: async () => {
      throw new Error('boom');
    },
  });
  const failureResult = await failingCheck();
  assert.equal(failureResult.status, 'unhealthy');
});

test('non-critical failures result in degraded overall status', async () => {
  const handler = createHealthHandler({
    serviceName: 'test-service',
    cache: { enabled: false },
    checks: {
      optional: {
        run: async () => ({ status: 'unhealthy', message: 'optional failed' }),
        impact: 'non-critical',
      },
    },
  });

  const result = await handler();
  assert.equal(result.status, 'degraded');
  assert.equal(result.checks.optional.status, 'unhealthy');
});

test('health handler records metrics via collector', async () => {
  const collector = createMockCollector();
  const handler = createHealthHandler({
    serviceName: 'test-service',
    metrics: { collector },
    cache: { enabled: false },
    checks: {
      metric: async () => {
        await sleep(5);
        return { status: 'degraded' };
      },
    },
  });

  await handler();
  const statusEvent = collector.events.find(
    (event) => event.type === 'status' && event.check === 'metric'
  );
  const durationEvent = collector.events.find(
    (event) => event.type === 'duration' && event.check === 'metric'
  );
  const overallEvent = collector.events.find((event) => event.type === 'overall');
  assert(statusEvent);
  assert(durationEvent);
  assert(overallEvent);
  assert.equal(statusEvent.status, 'degraded');
});

test('getHealthMetricsSnapshot returns Prometheus text', () => {
  const snapshot = getHealthMetricsSnapshot();
  assert.equal(typeof snapshot, 'string');
  assert(snapshot.includes('scribemed_health_check_status'));
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
