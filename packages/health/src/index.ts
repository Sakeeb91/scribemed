/**
 * Health check status types
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual check result
 */
export interface CheckResult {
  status: HealthStatus;
  message?: string;
  responseTime?: number;
  [key: string]: unknown;
}

/**
 * Health check response structure
 */
export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  service: string;
  checks?: Record<string, CheckResult>;
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<CheckResult> | CheckResult;

/**
 * Options for creating a health check handler
 */
export interface HealthCheckOptions {
  serviceName: string;
  checks?: Record<string, HealthCheckFunction>;
  includeMemoryCheck?: boolean;
}

/**
 * Creates a database health check function
 */
export function createDatabaseCheck(database: {
  healthCheck: () => Promise<boolean>;
}): HealthCheckFunction {
  return async (): Promise<CheckResult> => {
    const start = Date.now();
    try {
      const isHealthy = await database.healthCheck();
      const responseTime = Date.now() - start;

      if (isHealthy) {
        return {
          status: 'healthy',
          responseTime,
        };
      }
      return {
        status: 'unhealthy',
        message: 'Database health check failed',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - start;
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown database error',
        responseTime,
      };
    }
  };
}

/**
 * Creates a memory health check function
 */
export function createMemoryCheck(): HealthCheckFunction {
  return (): CheckResult => {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    // Consider unhealthy if heap usage exceeds 95%, degraded if > 90%
    const status: HealthStatus =
      heapUsagePercent > 95 ? 'unhealthy' : heapUsagePercent > 90 ? 'degraded' : 'healthy';

    return {
      status,
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      rssMB: Math.round(rssMB * 100) / 100,
      heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
    };
  };
}

/**
 * Determines overall health status from individual check results
 */
function determineOverallStatus(checkResults: Record<string, CheckResult>): HealthStatus {
  const statuses = Object.values(checkResults).map((check) => check.status);

  if (statuses.some((s) => s === 'unhealthy')) {
    return 'unhealthy';
  }
  if (statuses.some((s) => s === 'degraded')) {
    return 'degraded';
  }
  return 'healthy';
}

/**
 * Runs all health checks and returns a comprehensive health response
 */
export async function runHealthChecks(options: HealthCheckOptions): Promise<HealthResponse> {
  const checks: Record<string, HealthCheckFunction> = { ...options.checks };

  // Add memory check if requested
  if (options.includeMemoryCheck !== false) {
    checks.memory = createMemoryCheck();
  }

  // Run all checks
  const checkResults: Record<string, CheckResult> = {};
  const checkPromises = Object.entries(checks).map(async ([name, checkFn]) => {
    try {
      const result = await checkFn();
      checkResults[name] = result;
    } catch (error) {
      checkResults[name] = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  await Promise.all(checkPromises);

  const overallStatus = determineOverallStatus(checkResults);

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: options.serviceName,
    checks: checkResults,
  };
}

/**
 * Creates a liveness check handler (always returns healthy if process is running)
 */
export function createLivenessHandler(serviceName: string) {
  return (): HealthResponse => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: serviceName,
  });
}

/**
 * Creates a readiness check handler (checks dependencies)
 */
export function createReadinessHandler(options: HealthCheckOptions) {
  return async (): Promise<HealthResponse> => {
    // For readiness, we only check critical dependencies (not memory)
    const readinessChecks: Record<string, HealthCheckFunction> = {};

    // Include database check if provided
    if (options.checks?.database) {
      readinessChecks.database = options.checks.database;
    }

    // Include other critical checks
    Object.entries(options.checks || {}).forEach(([name, check]) => {
      if (name !== 'memory') {
        readinessChecks[name] = check;
      }
    });

    return runHealthChecks({
      ...options,
      checks: readinessChecks,
      includeMemoryCheck: false,
    });
  };
}

/**
 * Creates a comprehensive health check handler
 */
export function createHealthHandler(options: HealthCheckOptions) {
  return async (): Promise<HealthResponse> => {
    return runHealthChecks(options);
  };
}
