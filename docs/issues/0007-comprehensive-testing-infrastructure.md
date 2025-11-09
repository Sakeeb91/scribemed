# Issue #7: Comprehensive Testing Infrastructure & Coverage Requirements

## Priority

P0

## Story Points

13

## Dependencies

Depends on #1, #5, #6, #7

## Summary

Establish a comprehensive testing infrastructure with enforced code coverage requirements, integration test harnesses, E2E test suites, and automated quality gates to ensure reliability and maintainability of the ScribeMed platform.

## Background

Currently, the codebase has minimal test coverage with only 2 test files (`config.test.js` and `health.test.js`). This creates significant risk for:

- Undetected regressions when making changes
- Difficulty onboarding new developers
- Production bugs due to untested code paths
- HIPAA compliance issues from data handling errors

## Acceptance Criteria

- [ ] Test coverage enforcement at minimum 70% across all packages and services
- [ ] Unit test suites for all shared packages (auth, logging, monitoring, config, utils, types)
- [ ] Integration tests for all API endpoints and service integrations
- [ ] E2E tests for critical user workflows (authentication, clinical documentation, transcription)
- [ ] CI pipeline fails builds that don't meet coverage thresholds
- [ ] Test fixtures and mock data for healthcare scenarios (FHIR resources, clinical notes)
- [ ] Database testing utilities with transaction rollback support
- [ ] Performance regression tests for API response times
- [ ] Contract testing between services
- [ ] Documentation for testing patterns and best practices

## Technical Specification

### Testing Stack

**Test Framework:**

- Node.js built-in test runner for unit tests
- Supertest for API integration tests
- Playwright for E2E browser tests
- Artillery or k6 for load/performance testing

**Coverage Tools:**

- c8 or nyc for code coverage reporting
- Istanbul for coverage enforcement

**Mocking & Fixtures:**

- nock for HTTP mocking
- @faker-js/faker for test data generation
- Custom FHIR resource generators

### Project Structure

```
tests/
├── unit/
│   ├── packages/
│   │   ├── auth/
│   │   │   ├── jwt.service.test.ts
│   │   │   ├── mfa.service.test.ts
│   │   │   └── session.service.test.ts
│   │   ├── logging/
│   │   │   └── logger.test.ts
│   │   ├── monitoring/
│   │   │   └── metrics.test.ts
│   │   ├── config/
│   │   │   └── config.loader.test.ts
│   │   └── utils/
│   │       ├── retry.util.test.ts
│   │       └── error.util.test.ts
│   └── services/
│       ├── transcription/
│       ├── documentation/
│       └── coding/
├── integration/
│   ├── api/
│   │   ├── auth.endpoints.test.ts
│   │   ├── transcription.endpoints.test.ts
│   │   ├── documentation.endpoints.test.ts
│   │   └── coding.endpoints.test.ts
│   ├── database/
│   │   ├── migrations.test.ts
│   │   ├── queries.test.ts
│   │   └── transactions.test.ts
│   └── health/
│       └── health-endpoints.test.ts
├── e2e/
│   ├── auth-flow.spec.ts
│   ├── clinical-documentation.spec.ts
│   ├── transcription-workflow.spec.ts
│   └── coding-workflow.spec.ts
├── performance/
│   ├── api-load-test.yml
│   └── database-query-benchmark.ts
├── fixtures/
│   ├── fhir-resources/
│   │   ├── patient.json
│   │   ├── encounter.json
│   │   └── observation.json
│   ├── clinical-notes/
│   │   ├── soap-note.json
│   │   └── progress-note.json
│   └── users/
│       └── test-users.json
└── helpers/
    ├── test-database.ts
    ├── test-server.ts
    ├── fhir-generator.ts
    └── auth-helpers.ts
```

### Coverage Configuration

**`package.json` (root):**

```json
{
  "scripts": {
    "test": "pnpm run test:unit && pnpm run test:integration",
    "test:unit": "node --test --experimental-test-coverage tests/unit/**/*.test.{js,ts}",
    "test:integration": "node --test tests/integration/**/*.test.{js,ts}",
    "test:e2e": "playwright test",
    "test:coverage": "c8 --reporter=html --reporter=text --reporter=lcov pnpm test",
    "test:coverage:check": "c8 check-coverage --lines 70 --functions 70 --branches 70"
  },
  "c8": {
    "exclude": ["tests/**", "dist/**", "**/*.test.{js,ts}", "**/node_modules/**"],
    "reporter": ["html", "text", "lcov"],
    "all": true
  }
}
```

### Test Utilities

**Database Test Helper (`tests/helpers/test-database.ts`):**

```typescript
import { Pool } from 'pg';
import { getDatabase } from '@scribemed/database';

export class TestDatabase {
  private static pool: Pool;

  static async setup(): Promise<void> {
    this.pool = await getDatabase();
    await this.pool.query('BEGIN');
  }

  static async teardown(): Promise<void> {
    await this.pool.query('ROLLBACK');
    await this.pool.end();
  }

  static async seed(fixtures: any[]): Promise<void> {
    for (const fixture of fixtures) {
      await this.pool.query(fixture.query, fixture.params);
    }
  }

  static getPool(): Pool {
    return this.pool;
  }
}
```

**Test Server Helper (`tests/helpers/test-server.ts`):**

```typescript
import http from 'node:http';

export class TestServer {
  private server: http.Server;
  private port: number;

  constructor(app: any) {
    this.server = http.createServer(app);
    this.port = 0;
  }

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const address = this.server.address();
        this.port = typeof address === 'object' ? address!.port : 0;
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getPort(): number {
    return this.port;
  }
}
```

**FHIR Resource Generator (`tests/helpers/fhir-generator.ts`):**

```typescript
import { faker } from '@faker-js/faker';

export function generatePatient() {
  return {
    resourceType: 'Patient',
    id: faker.string.uuid(),
    name: [
      {
        family: faker.person.lastName(),
        given: [faker.person.firstName()],
      },
    ],
    gender: faker.helpers.arrayElement(['male', 'female', 'other']),
    birthDate: faker.date.past({ years: 80 }).toISOString().split('T')[0],
  };
}

export function generateEncounter(patientId: string) {
  return {
    resourceType: 'Encounter',
    id: faker.string.uuid(),
    status: 'finished',
    class: { code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    period: {
      start: faker.date.recent().toISOString(),
      end: faker.date.recent().toISOString(),
    },
  };
}
```

### Example Unit Test

**`tests/unit/packages/auth/jwt.service.test.ts`:**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JWTService } from '@scribemed/auth';

describe('JWTService', () => {
  let jwtService: JWTService;

  before(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    jwtService = new JWTService();
  });

  after(() => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  it('should generate valid access token', () => {
    const payload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'physician',
      organizationId: 'org-456',
      sessionId: 'session-789',
    };

    const token = jwtService.generateAccessToken(payload);
    assert.ok(token);
    assert.match(token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('should verify and decode access token', () => {
    const payload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'physician',
      organizationId: 'org-456',
      sessionId: 'session-789',
    };

    const token = jwtService.generateAccessToken(payload);
    const decoded = jwtService.verifyAccessToken(token);

    assert.strictEqual(decoded.userId, payload.userId);
    assert.strictEqual(decoded.email, payload.email);
    assert.strictEqual(decoded.role, payload.role);
  });

  it('should reject invalid token', () => {
    assert.throws(() => jwtService.verifyAccessToken('invalid-token'), /Invalid or expired token/);
  });

  it('should reject expired token', () => {
    // Test with mocked time or short expiry
    // Implementation depends on testing strategy
  });
});
```

### Example Integration Test

**`tests/integration/api/auth.endpoints.test.ts`:**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { TestServer } from '../../helpers/test-server';
import { TestDatabase } from '../../helpers/test-database';
import { createApp } from '../../../services/auth/src/app';

describe('Auth API Endpoints', () => {
  let testServer: TestServer;
  let baseUrl: string;

  before(async () => {
    await TestDatabase.setup();
    const app = createApp();
    testServer = new TestServer(app);
    baseUrl = await testServer.start();
  });

  after(async () => {
    await testServer.stop();
    await TestDatabase.teardown();
  });

  it('POST /auth/register - should register new user', async () => {
    const response = await request(baseUrl)
      .post('/auth/register')
      .send({
        email: 'physician@example.com',
        password: 'SecurePassword123!',
        firstName: 'Jane',
        lastName: 'Doe',
        organizationId: 'org-123',
        role: 'physician',
      })
      .expect(201);

    assert.ok(response.body.userId);
  });

  it('POST /auth/login - should authenticate user', async () => {
    // Seed test user
    await TestDatabase.seed([
      {
        query: `INSERT INTO users (email, password_hash, first_name, last_name,
                organization_id, role, email_verified) VALUES ($1, $2, $3, $4, $5, $6, true)`,
        params: [
          'test@example.com',
          '$2b$12$hashedpassword',
          'Test',
          'User',
          'org-123',
          'physician',
        ],
      },
    ]);

    const response = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
      })
      .expect(200);

    assert.ok(response.body.accessToken);
    assert.ok(response.body.refreshToken);
    assert.strictEqual(response.body.user.email, 'test@example.com');
  });

  it('POST /auth/login - should reject invalid credentials', async () => {
    await request(baseUrl)
      .post('/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'WrongPassword',
      })
      .expect(401);
  });
});
```

### CI/CD Integration

**`.github/workflows/ci.yml` (updated):**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests with coverage
        run: pnpm run test:unit

      - name: Run integration tests
        run: pnpm run test:integration

      - name: Check coverage thresholds
        run: pnpm run test:coverage:check

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

      - name: Run E2E tests
        run: pnpm run test:e2e
```

## Implementation Steps

1. **Phase 1: Foundation (Week 1)**
   - Set up coverage tooling (c8/nyc) with enforced thresholds
   - Create test helpers (TestDatabase, TestServer, FHIR generators)
   - Update CI pipeline to run tests and enforce coverage

2. **Phase 2: Shared Package Tests (Week 2)**
   - Write unit tests for `packages/auth` (JWT, MFA, session services)
   - Write unit tests for `packages/logging`, `packages/monitoring`
   - Write unit tests for `packages/config`, `packages/utils`

3. **Phase 3: Service Tests (Week 3)**
   - Add integration tests for auth endpoints
   - Add integration tests for transcription, documentation, coding services
   - Add database integration tests (migrations, queries, transactions)

4. **Phase 4: E2E & Performance (Week 4)**
   - Implement E2E tests for critical user workflows
   - Add performance regression tests
   - Create contract tests for service boundaries

5. **Phase 5: Documentation & Training (Week 5)**
   - Document testing patterns and best practices
   - Create testing guidelines for new features
   - Train team on testing infrastructure

## Testing Requirements

- All new code must include unit tests achieving 70%+ coverage
- Critical paths must have integration tests
- At least 3 E2E tests covering primary user workflows
- Performance tests establish baseline for API response times
- Database tests use transactions for isolation
- Mock external dependencies in unit tests
- Integration tests use test database with fixtures

## Documentation

- Testing strategy guide in `docs/testing/strategy.md`
- Testing patterns and examples in `docs/testing/patterns.md`
- CI/CD testing integration in `docs/ci-cd/testing.md`
- Developer onboarding includes testing requirements

## Status

Open

## Related Issues

- Issue #1: Initialize Monorepo with Turborepo
- Issue #5: Authentication & Authorization Service
- Issue #6: Shared Libraries Package Setup
- Issue #7: API Gateway Service
