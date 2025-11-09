# Issue #8: Error Handling & Resilience Patterns

## Priority

P0

## Story Points

8

## Dependencies

Depends on #6 (Shared Libraries), #7 (API Gateway)

## Summary

Establish standardized error handling, retry logic, circuit breakers, and resilience patterns across all services to ensure graceful degradation, meaningful error messages, and system stability under failure conditions.

## Background

Currently, services have inconsistent error handling:

- Basic try-catch blocks without structured error types
- No retry logic for transient failures
- No circuit breakers for external dependencies
- Inconsistent error response formats
- Limited error context for debugging
- No correlation IDs for request tracing

This creates issues with:

- Poor user experience during failures
- Difficulty debugging production issues
- Cascading failures from external service outages
- Lack of observability into error patterns

## Acceptance Criteria

- [ ] Standardized error response format across all services
- [ ] Custom error types (ValidationError, DatabaseError, AuthError, etc.)
- [ ] Circuit breaker pattern for external service calls
- [ ] Retry logic with exponential backoff for transient failures
- [ ] Correlation IDs propagated through all service calls
- [ ] Graceful degradation strategies documented
- [ ] Error middleware for Express/HTTP servers
- [ ] Structured error logging with context
- [ ] Dead letter queue for failed async jobs
- [ ] Error recovery documentation and runbooks

## Technical Specification

### Standard Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string; // Machine-readable error code (e.g., 'AUTH_INVALID_TOKEN')
    message: string; // Human-readable error message
    details?: Record<string, unknown>; // Additional error context
    requestId: string; // Correlation ID for tracing
    timestamp: string; // ISO 8601 timestamp
    path?: string; // Request path where error occurred
  };
}
```

### Custom Error Types

**`packages/utils/src/errors/base-error.ts`:**

```typescript
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
    isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(this);
  }
}
```

**`packages/utils/src/errors/application-errors.ts`:**

```typescript
import { BaseError } from './base-error';

export class ValidationError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', details?: Record<string, unknown>) {
    super('AUTH_FAILED', message, 401, details);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Insufficient permissions', details?: Record<string, unknown>) {
    super('AUTH_FORBIDDEN', message, 403, details);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, { resource, identifier });
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DATABASE_ERROR', message, 500, details, false);
  }
}

export class ExternalServiceError extends BaseError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super('EXTERNAL_SERVICE_ERROR', message, 502, { service, ...details }, false);
  }
}

export class RateLimitError extends BaseError {
  constructor(retryAfter?: number) {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, { retryAfter });
  }
}
```

### Error Handler Middleware

**`packages/utils/src/middleware/error-handler.ts`:**

```typescript
import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../errors/base-error';
import { logger } from '@scribemed/logging';

export function errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string;

  // Log error with context
  if (error instanceof BaseError) {
    if (error.isOperational) {
      logger.warn('Operational error occurred', {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        requestId,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.error('Non-operational error occurred', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        statusCode: error.statusCode,
        details: error.details,
        requestId,
        path: req.path,
        method: req.method,
      });
    }

    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  } else {
    // Unknown error
    logger.error('Unexpected error occurred', {
      error: error.message,
      stack: error.stack,
      requestId,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
        requestId,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
  }
}
```

### Circuit Breaker Implementation

**`packages/utils/src/resilience/circuit-breaker.ts`:**

```typescript
import { logger } from '@scribemed/logging';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes in half-open before closing
  timeout: number; // Time in ms before attempting to close circuit
  onStateChange?: (state: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.setState(CircuitState.HALF_OPEN);
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount += 1;
      if (this.successCount >= this.options.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState(CircuitState.OPEN);
      this.nextAttempt = Date.now() + this.options.timeout;
    }
  }

  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      logger.info('Circuit breaker state changed', {
        oldState: this.state,
        newState,
        failureCount: this.failureCount,
      });
      this.state = newState;
      this.options.onStateChange?.(newState);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}
```

### Enhanced Retry Utility

**Update `packages/utils/src/retry.util.ts`:**

```typescript
import { logger } from '@scribemed/logging';

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (attempt: number, error: unknown) => void;
}

type AsyncFn<T> = () => Promise<T>;

function isRetryable(
  error: unknown,
  retryableErrors?: Array<new (...args: any[]) => Error>
): boolean {
  if (!retryableErrors || retryableErrors.length === 0) {
    return true; // Retry all errors by default
  }

  return retryableErrors.some((ErrorType) => error instanceof ErrorType);
}

export async function retry<T>(fn: AsyncFn<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    delayMs = 100,
    backoffFactor = 2,
    maxDelayMs = 10000,
    retryableErrors,
    onRetry,
  } = options;

  let attempt = 0;
  let currentDelay = delayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;

      if (!isRetryable(error, retryableErrors) || attempt > retries) {
        logger.error('Retry failed after max attempts', {
          attempt,
          maxRetries: retries,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      logger.warn('Retrying after failure', {
        attempt,
        maxRetries: retries,
        delayMs: currentDelay,
        error: error instanceof Error ? error.message : String(error),
      });

      onRetry?.(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelayMs);
    }
  }
}
```

### Correlation ID Middleware

**`packages/utils/src/middleware/correlation-id.ts`:**

```typescript
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { withLogContext } from '@scribemed/logging';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Set log context for this request
  withLogContext({ requestId }, async () => {
    next();
  });
}
```

### Graceful Shutdown Handler

**`packages/utils/src/server/graceful-shutdown.ts`:**

```typescript
import { Server } from 'http';
import { logger } from '@scribemed/logging';

export interface ShutdownHandler {
  name: string;
  cleanup: () => Promise<void>;
}

export class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds

  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  async shutdown(server: Server, signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Graceful shutdown initiated', { signal });

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Execute cleanup handlers
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout exceeded')), this.shutdownTimeout);
    });

    try {
      await Promise.race([
        Promise.all(
          this.handlers.map(async (handler) => {
            logger.info('Executing shutdown handler', { handler: handler.name });
            try {
              await handler.cleanup();
              logger.info('Shutdown handler completed', { handler: handler.name });
            } catch (error) {
              logger.error('Shutdown handler failed', {
                handler: handler.name,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })
        ),
        timeoutPromise,
      ]);

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  setupSignalHandlers(server: Server): void {
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
      process.on(signal, () => {
        this.shutdown(server, signal);
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown(server, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason });
      this.shutdown(server, 'unhandledRejection');
    });
  }
}
```

## Implementation Steps

1. **Phase 1: Error Types & Middleware (Week 1)**
   - Create custom error types in `packages/utils`
   - Implement error handler middleware
   - Add correlation ID middleware
   - Update existing services to use new error types

2. **Phase 2: Resilience Patterns (Week 2)**
   - Implement circuit breaker
   - Enhance retry utility with exponential backoff
   - Add timeout utilities
   - Create graceful shutdown handler

3. **Phase 3: Service Integration (Week 3)**
   - Integrate error handling in API Gateway
   - Add circuit breakers for external service calls
   - Implement retry logic for database operations
   - Add correlation IDs to all service calls

4. **Phase 4: Observability (Week 4)**
   - Add error metrics to monitoring package
   - Create error dashboards
   - Set up error alerting
   - Document common error scenarios

5. **Phase 5: Testing & Documentation (Week 5)**
   - Write unit tests for all error handling utilities
   - Test circuit breaker behavior
   - Document error handling patterns
   - Create runbooks for error recovery

## Testing Requirements

- Unit tests for all error types
- Circuit breaker state transitions tested
- Retry logic with various failure scenarios
- Graceful shutdown tested with cleanup handlers
- Error middleware tested with different error types
- Correlation IDs propagated through service calls

## Documentation

- Error handling guide in `docs/architecture/error-handling.md`
- Circuit breaker usage patterns
- Retry best practices
- Error recovery runbooks
- Error code reference documentation

## Status

Open

## Related Issues

- Issue #6: Shared Libraries Package Setup
- Issue #7: API Gateway Service
- Issue #8: Monitoring & Observability Setup
