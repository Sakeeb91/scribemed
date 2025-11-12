# Health Check Package

Standardized health check utilities for ScribeMed microservices.

## Overview

This package provides a consistent way to implement health checks across all services, supporting:

- **Liveness probes** - Indicates if the service process is running
- **Readiness probes** - Indicates if the service can accept traffic (checks dependencies)
- **Comprehensive health checks** - Full health status including all dependencies and memory usage

## Installation

```bash
pnpm add @scribemed/health
```

## Usage

### Basic Health Checks

```javascript
const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
} = require('@scribemed/health');

// Liveness check (always returns healthy if process is running)
const livenessHandler = createLivenessHandler('my-service');

// Readiness check (checks dependencies)
const readinessHandler = createReadinessHandler({
  serviceName: 'my-service',
  checks: {},
});

// Comprehensive health check (includes memory)
const healthHandler = createHealthHandler({
  serviceName: 'my-service',
  checks: {},
});
```

### With Database Checks

```javascript
const {
  createDatabaseCheck,
  createReadinessHandler,
  createHealthHandler,
} = require('@scribemed/health');
const { getDatabase } = require('@scribemed/database');

const database = await getDatabase();
const databaseCheck = createDatabaseCheck(database);

const readinessHandler = createReadinessHandler({
  serviceName: 'my-service',
  checks: { database: databaseCheck },
});

const healthHandler = createHealthHandler({
  serviceName: 'my-service',
  checks: { database: databaseCheck },
});
```

### HTTP Server Integration

```javascript
const http = require('node:http');

const server = http.createServer(async (request, response) => {
  if (request.url === '/health/live') {
    const health = livenessHandler();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(health));
    return;
  }

  if (request.url === '/health/ready') {
    const health = await readinessHandler();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(health));
    return;
  }

  if (request.url === '/health') {
    const health = await healthHandler();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(health));
    return;
  }
});
```

## Response Format

### Liveness Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "my-service"
}
```

### Readiness/Health Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "my-service",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "memory": {
      "status": "healthy",
      "heapUsedMB": 45.2,
      "heapTotalMB": 100.0,
      "rssMB": 120.5,
      "heapUsagePercent": 45.2
    }
  }
}
```

## Health Status Values

- `healthy` - Service is operating normally
- `degraded` - Service is operational but experiencing issues (e.g., high memory usage)
- `unhealthy` - Service cannot operate (e.g., database connection failed)

## Custom Health Checks

You can create custom health checks by implementing a function that returns a `CheckResult`:

```javascript
const customCheck = async () => {
  try {
    // Check external service, cache, etc.
    const isHealthy = await checkExternalService();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
    };
  }
};

const healthHandler = createHealthHandler({
  serviceName: 'my-service',
  checks: {
    database: databaseCheck,
    externalService: customCheck,
  },
});
```

## Advanced Configuration

### Environment-driven options

Use `createHealthConfigFromEnv` to hydrate handler options from `process.env` so you can tune thresholds without editing code:

```javascript
const { createHealthConfigFromEnv, createHealthHandler } = require('@scribemed/health');

const healthHandler = createHealthHandler(
  createHealthConfigFromEnv('my-service', {
    checks: {
      database: databaseCheck,
    },
    timeouts: { perCheck: { database: 1500 } },
  })
);
```

The helper understands:

- `HEALTH_CHECK_TIMEOUT_MS`
- `HEALTH_CACHE_TTL_MS`
- `HEALTH_CACHE_ENABLED`
- `HEALTH_MEMORY_DEGRADED_PERCENT`
- `HEALTH_MEMORY_UNHEALTHY_PERCENT`

### Cache and timeout controls

Every handler caches results for a short TTL to avoid hammering shared dependencies. Set `cache.enabled` to `false` to disable, or provide a custom TTL:

```javascript
const handler = createHealthHandler({
  serviceName: 'my-service',
  cache: { ttlMs: 2000 },
  timeouts: {
    defaultMs: 1000,
    perCheck: { database: 2000 },
  },
  checks: { database: databaseCheck },
});
```

### Circuit breakers for flaky dependencies

Wrap any expensive check with a circuit breaker by providing `impact` and `circuitBreaker` options. The breaker trips after repeated failures, short-circuits calls, then probes dependencies again after a cooldown:

```javascript
const redisCheck = {
  run: async () => {
    const healthy = await redis.ping();
    return { status: healthy ? 'healthy' : 'unhealthy' };
  },
  impact: 'non-critical',
  circuitBreaker: {
    failureThreshold: 3,
    cooldownPeriodMs: 10_000,
    openStatus: 'degraded',
  },
};

const handler = createHealthHandler({
  serviceName: 'worker',
  checks: { redis: redisCheck },
});
```

### Aggregate downstream services

`createRemoteHealthCheck` lets a gateway expose the health of services it depends on:

```javascript
const { createRemoteHealthCheck } = require('@scribemed/health');

const handler = createHealthHandler({
  serviceName: 'api-gateway',
  checks: {
    transcription: createRemoteHealthCheck({
      serviceName: 'transcription',
      endpoint: 'http://transcription:8082/health',
      timeoutMs: 1500,
    }),
  },
});
```

### Metrics export

The package keeps lightweight Prometheus-style metrics for every check. Call `getHealthMetricsSnapshot()` and expose the payload via `/metrics` to plug into your monitoring stack.

```javascript
const { getHealthMetricsSnapshot } = require('@scribemed/health');

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send(getHealthMetricsSnapshot());
});
```

### Critical vs non-critical impact

Set `impact: 'non-critical'` on optional dependencies. Failing non-critical checks mark the overall service as `degraded` instead of `unhealthy`, so rollouts can proceed while auxiliary systems recover.

## Kubernetes Integration

The health endpoints are designed to work with Kubernetes liveness and readiness probes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

## API Reference

### `createLivenessHandler(serviceName: string)`

Creates a liveness check handler that always returns healthy if the process is running.

### `createReadinessHandler(options: HealthCheckOptions)`

Creates a readiness check handler that checks critical dependencies (excludes memory checks).

### `createHealthHandler(options: HealthCheckOptions)`

Creates a comprehensive health check handler that includes all checks including memory.

### `createDatabaseCheck(database: { healthCheck: () => Promise<boolean> })`

Creates a database health check function.

### `createMemoryCheck()`

Creates a memory usage health check function.

### `createHealthConfigFromEnv(serviceName: string, overrides?: Partial<HealthCheckOptions>)`

Builds a `HealthCheckOptions` object from environment variables (see the "Advanced Configuration" section).

### `createRemoteHealthCheck(options: RemoteHealthCheckOptions)`

Returns a check that calls another service's `/health` endpoint and maps the remote status into the local health response.

### `getHealthMetricsSnapshot()`

Returns the Prometheus-formatted metrics string for all recorded health checks.

## Testing

```bash
pnpm --filter @scribemed/health test
```
