import type { Logger } from '@scribemed/logging';
import { logger as defaultLogger } from '@scribemed/logging';

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
  timedOut?: boolean;
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

const DEFAULT_MEMORY_DEGRADED_PERCENT = 90;
const DEFAULT_MEMORY_UNHEALTHY_PERCENT = 95;
const DEFAULT_CHECK_TIMEOUT_MS = 2000;
const DEFAULT_CACHE_TTL_MS = 2000;

/**
 * Thresholds that determine when the memory check flips to degraded/unhealthy.
 */
export interface MemoryThresholds {
  degradedPercent?: number;
  unhealthyPercent?: number;
}

/**
 * Timeout configuration for all health checks with optional per-check overrides.
 */
export interface TimeoutOptions {
  defaultMs?: number;
  perCheck?: Record<string, number>;
}

/**
 * Cache policy for memoising expensive health checks.
 */
export interface CacheOptions {
  enabled?: boolean;
  ttlMs?: number;
}

/**
 * Circuit breaker configuration for health checks.
 * Detailed behaviour lands in later commits; the shape is defined now so
 * call-sites can begin annotating their checks.
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  cooldownPeriodMs?: number;
  halfOpenSuccesses?: number;
  openStatus?: HealthStatus;
  halfOpenStatus?: HealthStatus;
}

export type HealthCheckImpact = 'critical' | 'non-critical';

/**
 * Configuration object that enables advanced health check behaviour.
 */
export interface HealthCheckConfig {
  run: HealthCheckFunction;
  timeoutMs?: number;
  impact?: HealthCheckImpact;
  circuitBreaker?: CircuitBreakerOptions;
  tags?: string[];
}

export type HealthCheckDefinition = HealthCheckFunction | HealthCheckConfig;

/**
 * Options for creating a health check handler
 */
export interface HealthCheckOptions {
  serviceName: string;
  checks?: Record<string, HealthCheckDefinition>;
  includeMemoryCheck?: boolean;
  memoryThresholds?: MemoryThresholds;
  timeouts?: TimeoutOptions;
  cache?: CacheOptions;
  logger?: Logger;
}

/**
 * Creates health check options by merging sensible defaults with environment variables.
 */
export function createHealthConfigFromEnv(
  serviceName: string,
  overrides: Partial<HealthCheckOptions> = {},
  env: NodeJS.ProcessEnv = process.env
): HealthCheckOptions {
  const parseOptionalNumber = (value?: string): number | undefined => {
    if (typeof value === 'undefined' || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const parseOptionalBoolean = (value?: string): boolean | undefined => {
    if (typeof value === 'undefined') {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return undefined;
  };

  const memoryThresholds: MemoryThresholds = {
    degradedPercent:
      overrides.memoryThresholds?.degradedPercent ??
      parseOptionalNumber(env.HEALTH_MEMORY_DEGRADED_PERCENT) ??
      DEFAULT_MEMORY_DEGRADED_PERCENT,
    unhealthyPercent:
      overrides.memoryThresholds?.unhealthyPercent ??
      parseOptionalNumber(env.HEALTH_MEMORY_UNHEALTHY_PERCENT) ??
      DEFAULT_MEMORY_UNHEALTHY_PERCENT,
  };

  const timeouts: TimeoutOptions = {
    defaultMs:
      overrides.timeouts?.defaultMs ??
      parseOptionalNumber(env.HEALTH_CHECK_TIMEOUT_MS) ??
      DEFAULT_CHECK_TIMEOUT_MS,
    perCheck: overrides.timeouts?.perCheck,
  };

  const cache: CacheOptions = {
    enabled: overrides.cache?.enabled ?? parseOptionalBoolean(env.HEALTH_CACHE_ENABLED) ?? true,
    ttlMs:
      overrides.cache?.ttlMs ??
      parseOptionalNumber(env.HEALTH_CACHE_TTL_MS) ??
      DEFAULT_CACHE_TTL_MS,
  };

  return {
    includeMemoryCheck: overrides.includeMemoryCheck ?? true,
    serviceName,
    checks: overrides.checks,
    memoryThresholds,
    timeouts,
    cache,
    logger: overrides.logger,
  };
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
export function createMemoryCheck(thresholds?: MemoryThresholds): HealthCheckFunction {
  const degradedThreshold = thresholds?.degradedPercent ?? DEFAULT_MEMORY_DEGRADED_PERCENT;
  const unhealthyThreshold = thresholds?.unhealthyPercent ?? DEFAULT_MEMORY_UNHEALTHY_PERCENT;

  return (): CheckResult => {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    const status = resolveMemoryStatus(heapUsagePercent, degradedThreshold, unhealthyThreshold);

    return {
      status,
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      rssMB: Math.round(rssMB * 100) / 100,
      heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
      degradedThresholdPercent: degradedThreshold,
      unhealthyThresholdPercent: unhealthyThreshold,
    };
  };
}

function resolveMemoryStatus(
  heapUsagePercent: number,
  degradedThreshold: number,
  unhealthyThreshold: number
): HealthStatus {
  const safeUnhealthyThreshold = Math.max(unhealthyThreshold, degradedThreshold);

  if (heapUsagePercent > safeUnhealthyThreshold) {
    return 'unhealthy';
  }

  return heapUsagePercent > degradedThreshold ? 'degraded' : 'healthy';
}

function resolveTimeoutMs(check: NormalizedCheck, options: HealthCheckOptions): number | undefined {
  const fromDefinition = normalizeTimeoutValue(check.timeoutMs);
  if (typeof fromDefinition !== 'undefined') {
    return fromDefinition;
  }

  const fromMap = normalizeTimeoutValue(options.timeouts?.perCheck?.[check.name]);
  if (typeof fromMap !== 'undefined') {
    return fromMap;
  }

  return normalizeTimeoutValue(options.timeouts?.defaultMs ?? DEFAULT_CHECK_TIMEOUT_MS);
}

function normalizeTimeoutValue(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined;
  }
  return value;
}

async function executeCheckWithTimeout(
  check: NormalizedCheck,
  timeoutMs?: number
): Promise<CheckResult> {
  if (!timeoutMs) {
    return check.fn();
  }

  const timeoutToken = Symbol(`timeout:${check.name}`);
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<typeof timeoutToken>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(timeoutToken), timeoutMs);
    if (typeof timeoutHandle.unref === 'function') {
      timeoutHandle.unref();
    }
  });

  try {
    const result = await Promise.race([Promise.resolve(check.fn()), timeoutPromise]);
    if (result === timeoutToken) {
      return {
        status: 'unhealthy',
        message: `Health check "${check.name}" timed out after ${timeoutMs}ms`,
        timedOut: true,
      };
    }
    return result as CheckResult;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function withResponseTime(result: CheckResult, durationMs: number): CheckResult {
  if (typeof result.responseTime === 'number') {
    return result;
  }

  return {
    ...result,
    responseTime: durationMs,
  };
}

function createCachedHandler<T>(
  factory: () => Promise<T>,
  cacheOptions?: CacheOptions
): () => Promise<T> {
  if (!shouldUseCache(cacheOptions)) {
    return factory;
  }

  const ttlMs = resolveCacheTtl(cacheOptions);
  let cached: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return async (): Promise<T> => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = factory()
      .then((result) => {
        cached = { value: result, expiresAt: Date.now() + ttlMs };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

function shouldUseCache(cacheOptions?: CacheOptions): boolean {
  if (!cacheOptions) {
    return true;
  }

  if (cacheOptions.enabled === false) {
    return false;
  }

  if (typeof cacheOptions.ttlMs === 'number' && cacheOptions.ttlMs <= 0) {
    return false;
  }

  return true;
}

function resolveCacheTtl(cacheOptions?: CacheOptions): number {
  if (cacheOptions?.ttlMs && cacheOptions.ttlMs > 0) {
    return cacheOptions.ttlMs;
  }

  return DEFAULT_CACHE_TTL_MS;
}

function logCheckOutcome(
  loggerInstance: Logger,
  serviceName: string,
  check: NormalizedCheck,
  result: CheckResult
) {
  if (result.status === 'healthy' && !result.timedOut) {
    return;
  }

  const context = {
    service: serviceName,
    check: check.name,
    status: result.status,
    timedOut: Boolean(result.timedOut),
    responseTime: result.responseTime,
    impact: check.impact,
    message: result.message,
  };

  if (result.status === 'unhealthy') {
    loggerInstance.error('Health check unhealthy', context);
    return;
  }

  loggerInstance.warn('Health check degraded', context);
}

function logCheckExecutionError(
  loggerInstance: Logger,
  serviceName: string,
  check: NormalizedCheck,
  error: unknown
) {
  loggerInstance.error('Health check execution failed', {
    service: serviceName,
    check: check.name,
    impact: check.impact,
    error: serializeError(error),
  });
}

function logOverallResult(loggerInstance: Logger, response: HealthResponse) {
  const context = {
    service: response.service,
    status: response.status,
    timestamp: response.timestamp,
  };

  if (response.status === 'healthy') {
    loggerInstance.debug('Health summary', context);
    return;
  }

  if (response.status === 'degraded') {
    loggerInstance.warn('Health summary degraded', context);
    return;
  }

  loggerInstance.error('Health summary unhealthy', context);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

interface NormalizedCheck {
  name: string;
  fn: HealthCheckFunction;
  timeoutMs?: number;
  impact: HealthCheckImpact;
  circuitBreaker?: CircuitBreakerOptions;
  tags?: string[];
}

function normalizeCheckDefinition(
  name: string,
  definition: HealthCheckDefinition
): NormalizedCheck {
  if (!isHealthCheckConfig(definition)) {
    return {
      name,
      fn: definition,
      impact: 'critical',
    };
  }

  return {
    name,
    fn: definition.run,
    timeoutMs: definition.timeoutMs,
    impact: definition.impact ?? 'critical',
    circuitBreaker: definition.circuitBreaker,
    tags: definition.tags,
  };
}

function isHealthCheckConfig(definition: HealthCheckDefinition): definition is HealthCheckConfig {
  return typeof definition === 'object' && definition !== null && 'run' in definition;
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
  const checks: Record<string, HealthCheckDefinition> = { ...options.checks };
  const activeLogger = options.logger ?? defaultLogger;

  // Add memory check if requested
  if (options.includeMemoryCheck !== false) {
    checks.memory = createMemoryCheck(options.memoryThresholds);
  }

  // Run all checks
  const normalizedChecks = Object.entries(checks).map(([name, definition]) =>
    normalizeCheckDefinition(name, definition)
  );

  const checkResults: Record<string, CheckResult> = {};
  const checkPromises = normalizedChecks.map(async (check) => {
    const timeoutMs = resolveTimeoutMs(check, options);
    const start = Date.now();

    try {
      const result = await executeCheckWithTimeout(check, timeoutMs);
      const finalResult = withResponseTime(result, Date.now() - start);
      checkResults[check.name] = finalResult;
      logCheckOutcome(activeLogger, options.serviceName, check, finalResult);
    } catch (error) {
      const failureResult: CheckResult = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
      checkResults[check.name] = failureResult;
      logCheckExecutionError(activeLogger, options.serviceName, check, error);
    }
  });

  await Promise.all(checkPromises);

  const overallStatus = determineOverallStatus(checkResults);

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: options.serviceName,
    checks: checkResults,
  };

  logOverallResult(activeLogger, response);
  return response;
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
  const runner = async (): Promise<HealthResponse> => {
    // For readiness, we only check critical dependencies (not memory)
    const readinessChecks: Record<string, HealthCheckDefinition> = {};

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

  return createCachedHandler(runner, options.cache);
}

/**
 * Creates a comprehensive health check handler
 */
export function createHealthHandler(options: HealthCheckOptions) {
  const runner = (): Promise<HealthResponse> => runHealthChecks(options);
  return createCachedHandler(runner, options.cache);
}
