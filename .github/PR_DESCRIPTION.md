## Summary

Implements a standardized health check system across all microservices to enable reliable monitoring, load balancing, and orchestration. This PR adds consistent health endpoints that can be consumed by Kubernetes liveness/readiness probes, API gateways, and monitoring systems.

## Changes

### New Package: `@scribemed/health`

- Created reusable health check utilities package
- Supports liveness, readiness, and comprehensive health checks
- Database connectivity checks
- Memory usage monitoring
- Configurable health check handlers

### Service Updates

- **Transcription Service**: Added `/health`, `/health/live`, and `/health/ready` endpoints
- **Documentation Service**: Added health endpoints with database connectivity checks
- **Coding Service**: Added standardized health endpoints
- All services return consistent JSON response format

### Kubernetes Integration

- Created deployment manifests for all services with liveness/readiness probes
- Configured appropriate timeouts and thresholds
- Added health check probes to staging environment

### Testing

- Unit tests for health package (9 tests, all passing)
- Integration tests for service health endpoints
- Updated existing service tests

## Testing

- [x] `pnpm lint` - All code passes linting
- [x] `pnpm test` - All tests passing
  - Health package: 9/9 tests passing
  - Coding service: 5/5 tests passing
  - Transcription service: 4/4 tests passing
  - Documentation service: 4/4 tests passing
- [x] `pnpm build` - All packages build successfully

## Health Check Endpoints

All services now expose three standardized endpoints:

- **`GET /health/live`** - Liveness probe (always returns healthy if process is running)
- **`GET /health/ready`** - Readiness probe (checks critical dependencies like database)
- **`GET /health`** - Comprehensive health check (includes all checks + memory usage)

### Response Format

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "service-name",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "memory": {
      "status": "healthy",
      "heapUsedMB": 45.2,
      "heapUsagePercent": 45.2
    }
  }
}
```

## Kubernetes Probes

Example probe configuration:

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

## Files Changed

- **New Files:**
  - `packages/health/` - Complete health check package
  - `infrastructure/kubernetes/staging/*-service.yaml` - Service deployments with probes
  - `docs/issues/0005-health-check-system.md` - Issue documentation
  - `docs/issues/0006-health-check-enhancements.md` - Follow-up enhancements issue

- **Modified Files:**
  - `services/*/package.json` - Added health package dependency
  - `services/*/src/server.js` - Integrated health endpoints
  - `services/*/tests/server.test.js` - Added health check tests

## Related Issues

- Closes #5
- Related: #6 (follow-up enhancements identified during implementation)

## Documentation

- Health package README: `packages/health/README.md`
- Issue documentation: `docs/issues/0005-health-check-system.md`
- Follow-up enhancements: `docs/issues/0006-health-check-enhancements.md`

## Next Steps

After merge, consider implementing enhancements from issue #6:

- Timeout management for health checks
- Metrics integration (Prometheus)
- Circuit breaker pattern
- Health check result caching
- Configuration flexibility
