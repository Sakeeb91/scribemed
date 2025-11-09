# Issue #10: Service-to-Service Communication & Integration Patterns

## Priority

P1

## Story Points

8

## Dependencies

Depends on #5 (Authentication), #6 (Shared Libraries), #7 (API Gateway)

## Summary

Establish standardized patterns for service-to-service communication including protocol selection, service discovery, request validation, API versioning, and resilience patterns to enable reliable inter-service integration as the platform scales.

## Background

Currently:

- Services are isolated with no established communication patterns
- No service discovery mechanism
- No standardized approach to inter-service calls
- No API contracts or validation
- No versioning strategy

As we implement the RAG service, FHIR adapter, and agent orchestrator, services will need to communicate with each other. Without established patterns, this will lead to:

- Tight coupling between services
- Inconsistent error handling
- Version compatibility issues
- Difficult debugging of distributed workflows
- Performance issues from inefficient communication

## Acceptance Criteria

- [ ] Communication protocol selected and documented (REST, gRPC, or event-driven)
- [ ] Service discovery mechanism implemented
- [ ] Request/response validation with shared contracts
- [ ] API versioning strategy defined and implemented
- [ ] Circuit breakers for inter-service calls
- [ ] Request timeouts and retries configured
- [ ] Correlation ID propagation across services
- [ ] Service authentication (service-to-service JWT or API keys)
- [ ] API client library for common operations
- [ ] Documentation for adding new service integrations

## Technical Specification

### Communication Protocol Options

**Option 1: Synchronous REST (Recommended for MVP)**

- Use HTTP/REST with JSON for service-to-service calls
- Leverage existing HTTP infrastructure
- Simple debugging and testing
- Good fit for request/response patterns

**Option 2: gRPC (Consider for high-throughput services)**

- Binary protocol with Protobuf
- Better performance for high-volume calls
- Type-safe contracts
- Requires additional infrastructure

**Option 3: Event-Driven with Message Queue**

- RabbitMQ or Kafka for async workflows
- Decouples services
- Better for long-running processes
- Adds operational complexity

**Recommendation:** Start with REST for synchronous calls, add message queue for async workflows (transcription jobs, document generation).

### Service Discovery

**Development Environment:**

- Use Docker Compose DNS (service names resolve automatically)
- Configuration via environment variables

**Production Environment:**

- Kubernetes Service discovery
- DNS-based service resolution
- Service mesh (Istio/Linkerd) for advanced routing (future)

**Service Registry Package (`packages/service-registry`):**

```typescript
interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

export class ServiceRegistry {
  private services: Map<string, ServiceConfig> = new Map();

  register(config: ServiceConfig): void {
    this.services.set(config.name, config);
  }

  getService(name: string): ServiceConfig {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }
    return service;
  }

  getBaseUrl(name: string): string {
    return this.getService(name).baseUrl;
  }
}

// Singleton instance
export const serviceRegistry = new ServiceRegistry();

// Register services from environment variables
serviceRegistry.register({
  name: 'auth',
  baseUrl: process.env.AUTH_SERVICE_URL!,
  timeout: 5000,
  retries: 3,
});

serviceRegistry.register({
  name: 'documentation',
  baseUrl: process.env.DOCUMENTATION_SERVICE_URL!,
  timeout: 10000,
  retries: 2,
});
```

### HTTP Client Wrapper

**`packages/utils/src/http-client.ts`:**

```typescript
import { retry } from './retry.util';
import { CircuitBreaker } from './resilience/circuit-breaker';
import { logger } from '@scribemed/logging';
import { v4 as uuidv4 } from 'uuid';

export interface HttpClientOptions {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  circuitBreaker?: CircuitBreaker;
  headers?: Record<string, string>;
}

export class HttpClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private circuitBreaker?: CircuitBreaker;
  private defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout || 5000;
    this.retries = options.retries || 3;
    this.circuitBreaker = options.circuitBreaker;
    this.defaultHeaders = options.headers || {};
  }

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, {
      ...options,
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('PUT', path, {
      ...options,
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(method: string, path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const requestId = uuidv4();

    const headers = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...this.defaultHeaders,
      ...options?.headers,
    };

    const fetchWithTimeout = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          signal: controller.signal,
          ...options,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    const executeRequest = async (): Promise<T> => {
      const startTime = Date.now();

      try {
        const response = this.circuitBreaker
          ? await this.circuitBreaker.execute(fetchWithTimeout)
          : await fetchWithTimeout();

        const duration = Date.now() - startTime;

        logger.debug('HTTP request completed', {
          method,
          url,
          statusCode: response.status,
          duration,
          requestId,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
        }

        return await response.json();
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('HTTP request failed', {
          method,
          url,
          duration,
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    return retry(executeRequest, {
      retries: this.retries,
      delayMs: 100,
      backoffFactor: 2,
      maxDelayMs: 5000,
    });
  }
}
```

### API Contracts with Zod

**`packages/types/src/contracts/documentation.contract.ts`:**

```typescript
import { z } from 'zod';

// Request validation schema
export const CreateNoteRequestSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid(),
  providerId: z.string().uuid(),
  noteType: z.enum(['SOAP', 'Progress', 'Discharge']),
  transcriptionId: z.string().uuid().optional(),
  content: z.object({
    subjective: z.string(),
    objective: z.string(),
    assessment: z.string(),
    plan: z.string(),
  }),
});

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

// Response validation schema
export const CreateNoteResponseSchema = z.object({
  noteId: z.string().uuid(),
  status: z.enum(['draft', 'completed']),
  createdAt: z.string().datetime(),
});

export type CreateNoteResponse = z.infer<typeof CreateNoteResponseSchema>;

// Usage in service
export function validateCreateNoteRequest(data: unknown): CreateNoteRequest {
  return CreateNoteRequestSchema.parse(data);
}
```

### Service Client Example

**`services/documentation/src/clients/transcription.client.ts`:**

```typescript
import { HttpClient } from '@scribemed/utils';
import { serviceRegistry } from '@scribemed/service-registry';
import { CircuitBreaker } from '@scribemed/utils';

export interface TranscriptionResult {
  transcriptionId: string;
  text: string;
  confidence: number;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export class TranscriptionClient {
  private httpClient: HttpClient;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
    });

    const transcriptionService = serviceRegistry.getService('transcription');

    this.httpClient = new HttpClient({
      baseUrl: transcriptionService.baseUrl,
      timeout: transcriptionService.timeout,
      retries: transcriptionService.retries,
      circuitBreaker: this.circuitBreaker,
    });
  }

  async getTranscription(transcriptionId: string): Promise<TranscriptionResult> {
    return this.httpClient.get<TranscriptionResult>(`/transcriptions/${transcriptionId}`);
  }

  async createTranscription(audioUrl: string): Promise<{ jobId: string }> {
    return this.httpClient.post<{ jobId: string }>('/transcriptions', {
      audioUrl,
    });
  }

  async getTranscriptionStatus(jobId: string): Promise<{ status: string }> {
    return this.httpClient.get<{ status: string }>(`/transcriptions/jobs/${jobId}`);
  }
}
```

### API Versioning Strategy

**URL-based Versioning (Recommended):**

```
/v1/transcriptions
/v2/transcriptions
```

**Header-based Versioning:**

```
Accept: application/vnd.scribemed.v1+json
```

**Implementation:**

```typescript
// In API Gateway routing
router.use('/v1/transcriptions', transcriptionV1Routes);
router.use('/v2/transcriptions', transcriptionV2Routes);

// Middleware to handle version deprecation
function versionDeprecationMiddleware(version: string, sunsetDate: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Sunset', sunsetDate);
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `</v${parseInt(version) + 1}/docs>; rel="successor-version"`);
    next();
  };
}
```

### Service Authentication

**Service-to-Service JWT:**

```typescript
// In service startup
const serviceToken = generateServiceToken({
  service: 'documentation',
  permissions: ['read:transcriptions', 'write:notes'],
});

// Add to HTTP client headers
const client = new HttpClient({
  baseUrl: transcriptionServiceUrl,
  headers: {
    Authorization: `Bearer ${serviceToken}`,
  },
});
```

## Implementation Steps

1. **Phase 1: HTTP Client & Service Registry (Week 1)**
   - Create `packages/service-registry` package
   - Implement HTTP client wrapper with retry and circuit breaker
   - Add service registration from environment variables

2. **Phase 2: API Contracts (Week 2)**
   - Define Zod schemas for all service contracts
   - Create validation middleware
   - Document API contracts

3. **Phase 3: Service Clients (Week 2-3)**
   - Implement typed clients for each service
   - Add circuit breakers and timeouts
   - Test inter-service communication

4. **Phase 4: Versioning & Authentication (Week 3)**
   - Implement API versioning strategy
   - Add service-to-service authentication
   - Create version deprecation middleware

5. **Phase 5: Documentation & Testing (Week 4)**
   - Document communication patterns
   - Add integration tests for service calls
   - Create troubleshooting guide

## Testing Requirements

- Unit tests for HTTP client (retries, timeouts, circuit breaker)
- Integration tests for service-to-service calls
- Contract tests to validate API schemas
- Load tests for inter-service communication
- Chaos engineering tests (service failures, network issues)

## Documentation

- Service communication architecture diagram
- API contract documentation
- Service client usage examples
- Versioning guidelines
- Troubleshooting guide for inter-service issues

## Status

Open

## Related Issues

- Issue #5: Authentication & Authorization Service
- Issue #6: Shared Libraries Package Setup
- Issue #7: API Gateway Service
- Issue #20: Error Handling & Resilience Patterns
