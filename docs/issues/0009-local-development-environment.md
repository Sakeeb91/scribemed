# Issue #9: Local Development Environment with Docker Compose

## Priority

P0

## Story Points

5

## Dependencies

Depends on #1 (Monorepo), #4 (Database), #6 (Shared Libraries)

## Summary

Create a fully containerized local development environment using Docker Compose that allows developers to start all services, databases, and dependencies with a single command, eliminating manual setup friction and ensuring consistency across development machines.

## Background

Currently, local development requires:

- Manual installation of PostgreSQL, Redis, and other dependencies
- Multiple terminal windows to run services
- Complex environment variable configuration
- Inconsistent setups across developer machines
- Difficulty onboarding new developers

This creates friction and wastes development time on environment setup rather than feature development.

## Acceptance Criteria

- [ ] Docker Compose configuration for all services and dependencies
- [ ] Single command (`pnpm dev`) to start entire development environment
- [ ] Hot reload for all services during development
- [ ] Pre-configured databases with migrations applied
- [ ] Development seed data for testing
- [ ] Service discovery and networking configured
- [ ] Volume mounts for live code changes
- [ ] Health checks for all containers
- [ ] Development SSL certificates for HTTPS testing
- [ ] Documentation for Docker Compose workflow

## Technical Specification

### Docker Compose Configuration

**`docker-compose.yml`:**

```yaml
version: '3.9'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: scribemed-postgres
    environment:
      POSTGRES_DB: scribemed_dev
      POSTGRES_USER: scribemed
      POSTGRES_PASSWORD: dev_password
      POSTGRES_INITDB_ARGS: '-A md5'
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/db/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U scribemed']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - scribemed-network

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: scribemed-redis
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - scribemed-network

  # Auth Service
  auth-service:
    build:
      context: .
      dockerfile: services/auth/Dockerfile
      target: development
    container_name: scribemed-auth
    environment:
      NODE_ENV: development
      PORT: 8080
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: dev_access_secret_change_in_production
      JWT_REFRESH_SECRET: dev_refresh_secret_change_in_production
      LOG_LEVEL: debug
    ports:
      - '8080:8080'
    volumes:
      - ./services/auth/src:/app/services/auth/src
      - ./packages:/app/packages
      - /app/node_modules
      - /app/services/auth/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm run dev
    networks:
      - scribemed-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health/live']
      interval: 30s
      timeout: 10s
      retries: 3

  # Documentation Service
  documentation-service:
    build:
      context: .
      dockerfile: services/documentation/Dockerfile
      target: development
    container_name: scribemed-documentation
    environment:
      NODE_ENV: development
      PORT: 8081
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: debug
    ports:
      - '8081:8081'
    volumes:
      - ./services/documentation/src:/app/services/documentation/src
      - ./packages:/app/packages
      - /app/node_modules
      - /app/services/documentation/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm run dev
    networks:
      - scribemed-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8081/health/live']
      interval: 30s
      timeout: 10s
      retries: 3

  # Transcription Service
  transcription-service:
    build:
      context: .
      dockerfile: services/transcription/Dockerfile
      target: development
    container_name: scribemed-transcription
    environment:
      NODE_ENV: development
      PORT: 8082
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: debug
    ports:
      - '8082:8082'
    volumes:
      - ./services/transcription/src:/app/services/transcription/src
      - ./packages:/app/packages
      - /app/node_modules
      - /app/services/transcription/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm run dev
    networks:
      - scribemed-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8082/health/live']
      interval: 30s
      timeout: 10s
      retries: 3

  # Coding Service
  coding-service:
    build:
      context: .
      dockerfile: services/coding/Dockerfile
      target: development
    container_name: scribemed-coding
    environment:
      NODE_ENV: development
      PORT: 8083
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: debug
    ports:
      - '8083:8083'
    volumes:
      - ./services/coding/src:/app/services/coding/src
      - ./packages:/app/packages
      - /app/node_modules
      - /app/services/coding/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm run dev
    networks:
      - scribemed-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8083/health/live']
      interval: 30s
      timeout: 10s
      retries: 3

  # API Gateway
  api-gateway:
    build:
      context: .
      dockerfile: services/api-gateway/Dockerfile
      target: development
    container_name: scribemed-gateway
    environment:
      NODE_ENV: development
      PORT: 3000
      AUTH_SERVICE_URL: http://auth-service:8080
      DOCUMENTATION_SERVICE_URL: http://documentation-service:8081
      TRANSCRIPTION_SERVICE_URL: http://transcription-service:8082
      CODING_SERVICE_URL: http://coding-service:8083
      LOG_LEVEL: debug
    ports:
      - '3000:3000'
    volumes:
      - ./services/api-gateway/src:/app/services/api-gateway/src
      - ./packages:/app/packages
      - /app/node_modules
      - /app/services/api-gateway/node_modules
    depends_on:
      - auth-service
      - documentation-service
      - transcription-service
      - coding-service
    command: pnpm run dev
    networks:
      - scribemed-network
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  # Web Application (Next.js)
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: development
    container_name: scribemed-web
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:3000
      PORT: 3001
    ports:
      - '3001:3001'
    volumes:
      - ./apps/web:/app/apps/web
      - ./packages:/app/packages
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/web/.next
    depends_on:
      - api-gateway
    command: pnpm run dev
    networks:
      - scribemed-network

  # Database Migration Runner (runs once)
  db-migrate:
    build:
      context: .
      dockerfile: Dockerfile.migrate
    container_name: scribemed-db-migrate
    environment:
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
    depends_on:
      postgres:
        condition: service_healthy
    command: pnpm run db:migrate
    networks:
      - scribemed-network
    restart: 'no'

  # Database Seeder (runs once for development data)
  db-seed:
    build:
      context: .
      dockerfile: Dockerfile.migrate
    container_name: scribemed-db-seed
    environment:
      DATABASE_URL: postgres://scribemed:dev_password@postgres:5432/scribemed_dev
      NODE_ENV: development
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    command: pnpm run db:seed:dev
    networks:
      - scribemed-network
    restart: 'no'

networks:
  scribemed-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
```

### Development Dockerfiles

**Example: `services/auth/Dockerfile` (multi-stage):**

```dockerfile
# Base stage
FROM node:18-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# Dependencies stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json packages/*/
COPY services/auth/package.json services/auth/
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages ./packages
COPY . .
EXPOSE 8080
CMD ["pnpm", "--filter", "auth", "run", "dev"]

# Build stage
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# Production stage
FROM base AS production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### Package.json Scripts

**Root `package.json` (add/update):**

```json
{
  "scripts": {
    "dev": "docker compose up",
    "dev:build": "docker compose up --build",
    "dev:down": "docker compose down",
    "dev:clean": "docker compose down -v",
    "dev:logs": "docker compose logs -f",
    "dev:ps": "docker compose ps",
    "dev:restart": "docker compose restart",
    "dev:exec:postgres": "docker compose exec postgres psql -U scribemed -d scribemed_dev",
    "dev:exec:redis": "docker compose exec redis redis-cli"
  }
}
```

### Environment Configuration

**`.env.development` (template):**

```bash
# Application
NODE_ENV=development

# Database
DATABASE_URL=postgres://scribemed:dev_password@localhost:5432/scribemed_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (CHANGE IN PRODUCTION!)
JWT_ACCESS_SECRET=dev_access_secret_change_in_production
JWT_REFRESH_SECRET=dev_refresh_secret_change_in_production

# Service URLs
AUTH_SERVICE_URL=http://localhost:8080
DOCUMENTATION_SERVICE_URL=http://localhost:8081
TRANSCRIPTION_SERVICE_URL=http://localhost:8082
CODING_SERVICE_URL=http://localhost:8083
API_GATEWAY_URL=http://localhost:3000

# Logging
LOG_LEVEL=debug

# API Keys (for development)
OPENAI_API_KEY=your_openai_key_here
```

### Database Initialization Script

**`scripts/db/init/01-create-extensions.sql`:**

```sql
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set default search path
ALTER DATABASE scribemed_dev SET search_path TO public;
```

### Development Seed Script

**`scripts/db/seed-dev.ts`:**

```typescript
import { getDatabase } from '@scribemed/database';
import bcrypt from 'bcrypt';

async function seedDevelopmentData() {
  const db = await getDatabase();

  console.log('Seeding development data...');

  // Create test organization
  const orgResult = await db.query(
    `INSERT INTO organizations (name, status) VALUES ($1, $2) RETURNING id`,
    ['Dev Clinic', 'active']
  );
  const orgId = orgResult.rows[0].id;

  // Create test users
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const users = [
    {
      email: 'physician@dev.local',
      role: 'physician',
      firstName: 'John',
      lastName: 'Doe',
    },
    {
      email: 'admin@dev.local',
      role: 'admin',
      firstName: 'Jane',
      lastName: 'Admin',
    },
  ];

  for (const user of users) {
    await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, organization_id, role, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, passwordHash, user.firstName, user.lastName, orgId, user.role]
    );
  }

  console.log('Development data seeded successfully!');
  console.log('Test users:');
  console.log('  physician@dev.local / Password123!');
  console.log('  admin@dev.local / Password123!');

  await db.end();
}

seedDevelopmentData().catch((error) => {
  console.error('Error seeding development data:', error);
  process.exit(1);
});
```

## Implementation Steps

1. **Phase 1: Foundation (Day 1-2)**
   - Create Docker Compose configuration
   - Set up multi-stage Dockerfiles for all services
   - Configure networking and service discovery

2. **Phase 2: Database Setup (Day 2-3)**
   - Add PostgreSQL and Redis containers
   - Create initialization scripts
   - Set up migration runner

3. **Phase 3: Service Integration (Day 3-4)**
   - Add all service containers with hot reload
   - Configure volume mounts for live development
   - Set up health checks

4. **Phase 4: Development Tools (Day 4-5)**
   - Create seed data scripts
   - Add helper scripts for common tasks
   - Configure SSL certificates for HTTPS

5. **Phase 5: Documentation & Testing (Day 5)**
   - Document Docker Compose workflow
   - Test full stack startup
   - Create troubleshooting guide

## Testing Requirements

- Full stack starts with `pnpm dev`
- All services become healthy within 60 seconds
- Hot reload works for code changes
- Database migrations apply correctly
- Seed data loads successfully
- Services can communicate with each other
- Logs are accessible via `pnpm dev:logs`

## Documentation

**`docs/development/local-environment.md`:**

- Docker Compose workflow guide
- Available commands and scripts
- Troubleshooting common issues
- Adding new services to Docker Compose
- Port mapping reference
- Volume mount strategy

## Status

Open

## Related Issues

- Issue #1: Initialize Monorepo with Turborepo
- Issue #4: Database Schema Design and Migration System
- Issue #6: Shared Libraries Package Setup
- Issue #14: Harden Monorepo Developer Experience
