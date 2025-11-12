import type { Logger } from '@scribemed/logging';
import { logger as defaultLogger } from '@scribemed/logging';

/**
 * Health check status types
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type CircuitBreakerState = 'closed' | 'open' | 'half-open';
type FetchImplementation = typeof fetch;

/**
 * Individual check result
 */
export interface CheckResult {
  status: HealthStatus;
  message?: string;
  responseTime?: number;
  timedOut?: boolean;
  circuitBreakerState?: CircuitBreakerState;
  retryAfterMs?: number;
  remoteStatus?: HealthStatus;
  remoteService?: string;
  impact?: HealthCheckImpact;
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
const DEFAULT_BREAKER_FAILURE_THRESHOLD = 3;
const DEFAULT_BREAKER_SUCCESS_THRESHOLD = 2;
const DEFAULT_BREAKER_COOLDOWN_MS = 10000;
const DEFAULT_BREAKER_OPEN_STATUS: HealthStatus = 'degraded';
const DEFAULT_BREAKER_HALF_OPEN_STATUS: HealthStatus = 'degraded';
const HEALTH_STATUS_VALUES: Record<HealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
};
const HEALTH_DURATION_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000];

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

export interface HealthMetricsCollector {
  recordCheckStatus(service: string, check: string, status: HealthStatus): void;
  recordCheckDuration(service: string, check: string, durationMs: number): void;
  recordOverallStatus(service: string, status: HealthStatus): void;
  toPrometheus(): string;
}

export interface HealthMetricsOptions {
  enabled?: boolean;
  collector?: HealthMetricsCollector;
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
  metrics?: HealthMetricsOptions;
}

export interface RemoteHealthCheckOptions {
  serviceName: string;
  endpoint: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  degradeOnDegraded?: boolean;
  fetchImplementation?: FetchImplementation;
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
    metrics: overrides.metrics,
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
 * Creates a health check that queries another service's health endpoint.
 */
export function createRemoteHealthCheck(options: RemoteHealthCheckOptions): HealthCheckFunction {
  const fetchImpl = options.fetchImplementation ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API is not available in this runtime');
  }

  return async (): Promise<CheckResult> => {
    const controller = new AbortController();
    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined;
    if (timeout && typeof timeout.unref === 'function') {
      timeout.unref();
    }

    const start = Date.now();
    try {
      const response = await fetchImpl(options.endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      });
      const payload = await response.json();
      const remoteStatus: HealthStatus =
        payload?.status === 'degraded'
          ? 'degraded'
          : payload?.status === 'unhealthy'
            ? 'unhealthy'
            : 'healthy';
      const status = determineRemoteStatus(remoteStatus, options.degradeOnDegraded ?? true);
      return {
        status,
        remoteStatus,
        remoteService: payload?.service ?? options.serviceName,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Remote health check failed',
        remoteService: options.serviceName,
        responseTime: Date.now() - start,
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
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

function updateCircuitBreakerState(
  breaker: CircuitBreaker,
  result: CheckResult
): CircuitBreakerEvent | null {
  if (isSuccessfulResult(result)) {
    return breaker.recordSuccess();
  }
  return breaker.recordFailure();
}

function isSuccessfulResult(result: CheckResult): boolean {
  return result.status === 'healthy' && !result.timedOut;
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
    circuitBreakerState: result.circuitBreakerState,
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

export function getHealthMetricsSnapshot(): string {
  return defaultMetricsCollector.toPrometheus();
}

function logCircuitBreakerBypass(
  loggerInstance: Logger,
  serviceName: string,
  check: NormalizedCheck
) {
  loggerInstance.warn('Circuit breaker bypassed health check', {
    service: serviceName,
    check: check.name,
    circuitBreakerState: check.breaker?.getState(),
  });
}

function logCircuitBreakerEvent(
  loggerInstance: Logger,
  serviceName: string,
  checkName: string,
  event: CircuitBreakerEvent
) {
  const context = { service: serviceName, check: checkName };
  if (event === 'opened') {
    loggerInstance.error('Circuit breaker opened', context);
    return;
  }
  loggerInstance.info('Circuit breaker closed', context);
}

function recordCheckMetrics(
  options: HealthMetricsOptions | undefined,
  serviceName: string,
  check: NormalizedCheck,
  result: CheckResult
) {
  const collector = getMetricsCollector(options);
  if (!collector) {
    return;
  }

  collector.recordCheckStatus(serviceName, check.name, result.status);

  if (typeof result.responseTime === 'number') {
    collector.recordCheckDuration(serviceName, check.name, result.responseTime);
  }
}

function recordOverallMetrics(options: HealthMetricsOptions | undefined, response: HealthResponse) {
  const collector = getMetricsCollector(options);
  if (!collector) {
    return;
  }

  collector.recordOverallStatus(response.service, response.status);
}

function getMetricsCollector(options?: HealthMetricsOptions): HealthMetricsCollector | null {
  if (options?.enabled === false) {
    return null;
  }

  return options?.collector ?? defaultMetricsCollector;
}

interface HistogramBucketState {
  le: number;
  count: number;
}

interface HistogramState {
  buckets: HistogramBucketState[];
  count: number;
  sum: number;
}

class SimpleHealthMetricsCollector implements HealthMetricsCollector {
  private readonly statusMap = new Map<string, number>();
  private readonly durationMap = new Map<string, HistogramState>();
  private readonly overallStatusMap = new Map<string, number>();

  recordCheckStatus(service: string, check: string, status: HealthStatus): void {
    this.statusMap.set(this.buildKey(service, check), HEALTH_STATUS_VALUES[status] ?? 2);
  }

  recordCheckDuration(service: string, check: string, durationMs: number): void {
    const key = this.buildKey(service, check);
    const histogram = this.durationMap.get(key) ?? createHistogramState();
    histogram.count += 1;
    histogram.sum += durationMs;
    histogram.buckets.forEach((bucket) => {
      if (durationMs <= bucket.le) {
        bucket.count += 1;
      }
    });
    this.durationMap.set(key, histogram);
  }

  recordOverallStatus(service: string, status: HealthStatus): void {
    this.overallStatusMap.set(service, HEALTH_STATUS_VALUES[status] ?? 2);
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push(
      '# HELP scribemed_health_check_status Health check status (0 healthy, 1 degraded, 2 unhealthy)',
      '# TYPE scribemed_health_check_status gauge'
    );

    for (const [key, value] of this.statusMap.entries()) {
      const [service, check] = key.split('::');
      lines.push(`scribemed_health_check_status{service="${service}",check="${check}"} ${value}`);
    }

    lines.push(
      '# HELP scribemed_health_check_duration_ms Health check duration in milliseconds',
      '# TYPE scribemed_health_check_duration_ms histogram'
    );

    for (const [key, histogram] of this.durationMap.entries()) {
      const [service, check] = key.split('::');
      let cumulative = 0;
      histogram.buckets.forEach((bucket) => {
        cumulative = bucket.count;
        lines.push(
          `scribemed_health_check_duration_ms_bucket{service="${service}",check="${check}",le="${bucket.le}"} ${cumulative}`
        );
      });
      lines.push(
        `scribemed_health_check_duration_ms_bucket{service="${service}",check="${check}",le="+Inf"} ${histogram.count}`
      );
      lines.push(
        `scribemed_health_check_duration_ms_sum{service="${service}",check="${check}"} ${histogram.sum}`
      );
      lines.push(
        `scribemed_health_check_duration_ms_count{service="${service}",check="${check}"} ${histogram.count}`
      );
    }

    lines.push(
      '# HELP scribemed_health_overall_status Overall service health status',
      '# TYPE scribemed_health_overall_status gauge'
    );

    for (const [service, value] of this.overallStatusMap.entries()) {
      lines.push(`scribemed_health_overall_status{service="${service}"} ${value}`);
    }

    return lines.join('\n');
  }

  private buildKey(service: string, check: string): string {
    return `${service}::${check}`;
  }
}

function createHistogramState(): HistogramState {
  return {
    buckets: HEALTH_DURATION_BUCKETS.map((le) => ({ le, count: 0 })),
    count: 0,
    sum: 0,
  };
}

const defaultMetricsCollector = new SimpleHealthMetricsCollector();
type CircuitBreakerEvent = 'opened' | 'closed';

class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private openedAt = 0;
  private readonly config: CircuitBreakerRuntimeConfig;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions
  ) {
    this.config = resolveCircuitBreakerConfig(options);
  }

  canExecute(): boolean {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.cooldownPeriodMs) {
        this.state = 'half-open';
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): CircuitBreakerEvent | null {
    if (this.state === 'half-open') {
      this.successCount += 1;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
        return 'closed';
      }
      return null;
    }

    this.failureCount = 0;
    return null;
  }

  recordFailure(): CircuitBreakerEvent | null {
    if (this.state === 'half-open') {
      this.trip();
      return 'opened';
    }

    this.failureCount += 1;
    if (this.failureCount >= this.config.failureThreshold) {
      this.trip();
      return 'opened';
    }

    return null;
  }

  getBypassResult(): CheckResult {
    const retryAfterMs =
      this.state === 'open'
        ? Math.max(0, this.config.cooldownPeriodMs - (Date.now() - this.openedAt))
        : 0;

    const status = this.state === 'open' ? this.config.openStatus : this.config.halfOpenStatus;

    return {
      status,
      message:
        this.state === 'open'
          ? `Circuit breaker open for "${this.name}"`
          : `Circuit breaker half-open for "${this.name}"`,
      circuitBreakerState: this.state,
      retryAfterMs,
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  private trip() {
    this.state = 'open';
    this.openedAt = Date.now();
    this.failureCount = 0;
    this.successCount = 0;
  }

  private reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = 0;
  }
}

interface CircuitBreakerRuntimeConfig {
  failureThreshold: number;
  successThreshold: number;
  cooldownPeriodMs: number;
  openStatus: HealthStatus;
  halfOpenStatus: HealthStatus;
}

function resolveCircuitBreakerConfig(options: CircuitBreakerOptions): CircuitBreakerRuntimeConfig {
  const failureThreshold = Math.max(
    1,
    options.failureThreshold ?? DEFAULT_BREAKER_FAILURE_THRESHOLD
  );
  const successThreshold = Math.max(
    1,
    options.successThreshold ?? options.halfOpenSuccesses ?? DEFAULT_BREAKER_SUCCESS_THRESHOLD
  );
  const cooldownPeriodMs = Math.max(100, options.cooldownPeriodMs ?? DEFAULT_BREAKER_COOLDOWN_MS);
  return {
    failureThreshold,
    successThreshold,
    cooldownPeriodMs,
    openStatus: options.openStatus ?? DEFAULT_BREAKER_OPEN_STATUS,
    halfOpenStatus: options.halfOpenStatus ?? DEFAULT_BREAKER_HALF_OPEN_STATUS,
  };
}

interface NormalizedCheck {
  name: string;
  fn: HealthCheckFunction;
  timeoutMs?: number;
  impact: HealthCheckImpact;
  tags?: string[];
  breaker?: CircuitBreaker;
}

interface HealthCheckRuntimeState {
  circuitBreakers: Map<string, CircuitBreaker>;
}

function normalizeCheckDefinition(
  name: string,
  definition: HealthCheckDefinition,
  breakerMap?: Map<string, CircuitBreaker>
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
    tags: definition.tags,
    breaker: resolveCircuitBreaker(name, definition.circuitBreaker, breakerMap),
  };
}

function isHealthCheckConfig(definition: HealthCheckDefinition): definition is HealthCheckConfig {
  return typeof definition === 'object' && definition !== null && 'run' in definition;
}

function resolveCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions | undefined,
  breakerMap?: Map<string, CircuitBreaker>
): CircuitBreaker | undefined {
  if (!options) {
    return undefined;
  }

  if (breakerMap) {
    const existing = breakerMap.get(name);
    if (existing) {
      return existing;
    }
    const breaker = new CircuitBreaker(name, options);
    breakerMap.set(name, breaker);
    return breaker;
  }

  return new CircuitBreaker(name, options);
}

function determineRemoteStatus(
  remoteStatus: HealthStatus,
  degradeOnDegraded: boolean
): HealthStatus {
  if (remoteStatus === 'unhealthy') {
    return 'unhealthy';
  }
  if (remoteStatus === 'degraded') {
    return degradeOnDegraded ? 'degraded' : 'healthy';
  }
  return 'healthy';
}

/**
 * Determines overall health status from individual check results
 */
function determineOverallStatus(checkResults: Record<string, CheckResult>): HealthStatus {
  let hasCriticalUnhealthy = false;
  let hasCriticalDegraded = false;
  let hasNonCriticalIssue = false;

  Object.values(checkResults).forEach((result) => {
    const impact = result.impact ?? 'critical';
    if (result.status === 'unhealthy') {
      if (impact === 'critical') {
        hasCriticalUnhealthy = true;
      } else {
        hasNonCriticalIssue = true;
      }
    } else if (result.status === 'degraded') {
      if (impact === 'critical') {
        hasCriticalDegraded = true;
      } else {
        hasNonCriticalIssue = true;
      }
    }
  });

  if (hasCriticalUnhealthy) {
    return 'unhealthy';
  }

  if (hasCriticalDegraded || hasNonCriticalIssue) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Runs all health checks and returns a comprehensive health response
 */
export async function runHealthChecks(
  options: HealthCheckOptions,
  runtimeState?: HealthCheckRuntimeState
): Promise<HealthResponse> {
  const checks: Record<string, HealthCheckDefinition> = { ...options.checks };
  const activeLogger = options.logger ?? defaultLogger;
  const circuitBreakers = runtimeState?.circuitBreakers ?? new Map<string, CircuitBreaker>();

  // Add memory check if requested
  if (options.includeMemoryCheck !== false) {
    checks.memory = createMemoryCheck(options.memoryThresholds);
  }

  // Run all checks
  const normalizedChecks = Object.entries(checks).map(([name, definition]) =>
    normalizeCheckDefinition(name, definition, circuitBreakers)
  );

  const checkResults: Record<string, CheckResult> = {};
  const checkPromises = normalizedChecks.map(async (check) => {
    const timeoutMs = resolveTimeoutMs(check, options);
    const start = Date.now();

    if (check.breaker && !check.breaker.canExecute()) {
      const breakerResult = {
        ...check.breaker.getBypassResult(),
        responseTime: 0,
      };
      breakerResult.impact = check.impact;
      checkResults[check.name] = breakerResult;
      recordCheckMetrics(options.metrics, options.serviceName, check, breakerResult);
      logCircuitBreakerBypass(activeLogger, options.serviceName, check);
      return;
    }

    try {
      const result = await executeCheckWithTimeout(check, timeoutMs);
      const finalResult = withResponseTime(result, Date.now() - start);
      finalResult.impact = check.impact;
      checkResults[check.name] = finalResult;
      recordCheckMetrics(options.metrics, options.serviceName, check, finalResult);
      logCheckOutcome(activeLogger, options.serviceName, check, finalResult);
      const breakerEvent = check.breaker
        ? updateCircuitBreakerState(check.breaker, finalResult)
        : null;
      if (breakerEvent) {
        logCircuitBreakerEvent(activeLogger, options.serviceName, check.name, breakerEvent);
      }
    } catch (error) {
      const failureResult: CheckResult = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
      failureResult.impact = check.impact;
      checkResults[check.name] = failureResult;
      recordCheckMetrics(options.metrics, options.serviceName, check, failureResult);
      logCheckExecutionError(activeLogger, options.serviceName, check, error);
      const breakerEvent = check.breaker
        ? updateCircuitBreakerState(check.breaker, failureResult)
        : null;
      if (breakerEvent) {
        logCircuitBreakerEvent(activeLogger, options.serviceName, check.name, breakerEvent);
      }
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
  recordOverallMetrics(options.metrics, response);
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
  const circuitBreakers = new Map<string, CircuitBreaker>();
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

    return runHealthChecks(
      {
        ...options,
        checks: readinessChecks,
        includeMemoryCheck: false,
      },
      { circuitBreakers }
    );
  };

  return createCachedHandler(runner, options.cache);
}

/**
 * Creates a comprehensive health check handler
 */
export function createHealthHandler(options: HealthCheckOptions) {
  const circuitBreakers = new Map<string, CircuitBreaker>();
  const runner = (): Promise<HealthResponse> => runHealthChecks(options, { circuitBreakers });
  return createCachedHandler(runner, options.cache);
}
