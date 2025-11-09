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

## Testing

```bash
pnpm --filter @scribemed/health test
```
