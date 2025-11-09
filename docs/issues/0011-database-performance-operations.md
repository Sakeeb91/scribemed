# Issue #11: Database Performance & Operations Improvements

## Priority

P1

## Story Points

5

## Dependencies

Depends on #4 (Database Schema - closed), #21 (Docker Compose)

## Summary

Enhance the database layer with performance monitoring, connection pool tuning, query optimization patterns, automated backups, and operational runbooks to ensure the PostgreSQL database can handle production workloads efficiently and reliably.

## Background

The current database setup (Issue #4) provides:

- Basic schema and migrations with Flyway
- Connection pooling via `pg` package
- PostgreSQL 15 with required extensions

What's missing:

- No query performance monitoring
- Connection pool settings not tuned for production
- No database seeding scripts for testing
- Migrations not tested in CI pipeline
- No query optimization documentation
- No read replica configuration
- No backup/restore procedures
- No database performance benchmarks

## Acceptance Criteria

- [ ] Query performance monitoring with slow query logging
- [ ] Connection pool tuning for development, staging, and production
- [ ] Database seeding scripts for all environments (dev, test, staging)
- [ ] Migration testing integrated into CI pipeline
- [ ] Query optimization patterns documented with examples
- [ ] Read replica configuration for reporting queries
- [ ] Automated backup procedures with point-in-time recovery
- [ ] Database performance benchmarks established
- [ ] Operational runbooks for common database tasks
- [ ] Database health metrics exposed to monitoring system

## Technical Specification

### Query Performance Monitoring

**Enable Slow Query Logging:**

```sql
-- In PostgreSQL configuration or migration
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';
ALTER SYSTEM SET log_statement = 'mod'; -- Log all data-modifying statements
SELECT pg_reload_conf();
```

**Create Monitoring View:**

```sql
-- Migration: V10__query_monitoring.sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View for slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 1000 -- Queries averaging > 1s
ORDER BY mean_exec_time DESC
LIMIT 50;
```

### Connection Pool Tuning

**Enhanced Database Configuration (`packages/database/src/index.ts`):**

```typescript
import { Pool, PoolConfig } from 'pg';
import { logger } from '@scribemed/logging';

interface DatabaseOptions {
  connectionString: string;
  environment: 'development' | 'test' | 'staging' | 'production';
}

function getPoolConfig(environment: string): PoolConfig {
  const baseConfig: PoolConfig = {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  const envConfigs: Record<string, Partial<PoolConfig>> = {
    development: {
      max: 5,
      min: 1,
      idleTimeoutMillis: 60000,
    },
    test: {
      max: 3,
      min: 0,
      idleTimeoutMillis: 10000,
    },
    staging: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    },
    production: {
      max: 50,
      min: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000, // 10s query timeout
    },
  };

  return {
    ...baseConfig,
    ...envConfigs[environment],
  };
}

let pool: Pool | null = null;

export async function getDatabase(options?: DatabaseOptions): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const connectionString = options?.connectionString || process.env.DATABASE_URL;
  const environment = options?.environment || process.env.NODE_ENV || 'development';

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const poolConfig = getPoolConfig(environment);

  pool = new Pool({
    connectionString,
    ...poolConfig,
  });

  // Log pool events
  pool.on('connect', (client) => {
    logger.debug('Database connection established');
  });

  pool.on('acquire', (client) => {
    logger.debug('Database connection acquired from pool');
  });

  pool.on('error', (err, client) => {
    logger.error('Unexpected database error', { error: err.message, stack: err.stack });
  });

  pool.on('remove', (client) => {
    logger.debug('Database connection removed from pool');
  });

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database pool initialized', {
      environment,
      maxConnections: poolConfig.max,
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    throw error;
  }

  return pool;
}

export async function getPoolStats() {
  if (!pool) {
    return null;
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
```

### Database Seeding Scripts

**`scripts/db/seed-dev.ts`:** (Already created in Issue #21)

**`scripts/db/seed-test.ts`:**

```typescript
import { getDatabase } from '@scribemed/database';

async function seedTestData() {
  const db = await getDatabase({ environment: 'test' });

  console.log('Seeding test data...');

  // Minimal seed data for automated tests
  const orgResult = await db.query(
    `INSERT INTO organizations (name, status) VALUES ($1, $2)
     RETURNING id`,
    ['Test Organization', 'active']
  );

  console.log('Test data seeded successfully!');
  await db.end();
}

seedTestData().catch((error) => {
  console.error('Error seeding test data:', error);
  process.exit(1);
});
```

### Migration Testing in CI

**Update `.github/workflows/ci.yml`:**

```yaml
jobs:
  test-migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: scribemed_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/scribemed_test
        run: pnpm run db:migrate

      - name: Verify migrations
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/scribemed_test
        run: pnpm run db:migrate:info

      - name: Test rollback
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/scribemed_test
        run: |
          pnpm run db:migrate:undo
          pnpm run db:migrate
```

### Query Optimization Patterns

**Documentation: `docs/database/query-optimization.md`:**

**Pattern 1: Use Indexes for Frequent Queries**

```sql
-- Migration: V11__add_performance_indexes.sql

-- Index for user lookups by email
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- Index for session lookups
CREATE INDEX CONCURRENTLY idx_sessions_user_active
ON sessions(user_id) WHERE revoked_at IS NULL;

-- Composite index for audit log queries
CREATE INDEX CONCURRENTLY idx_audit_logs_user_date
ON audit_logs(user_id, created_at DESC);

-- Partial index for active patients
CREATE INDEX CONCURRENTLY idx_patients_active
ON patients(organization_id, last_name) WHERE status = 'active';
```

**Pattern 2: Use EXPLAIN ANALYZE**

```typescript
// Helper function for query analysis
export async function analyzeQuery(pool: Pool, query: string, params: any[]) {
  const explainQuery = `EXPLAIN ANALYZE ${query}`;
  const result = await pool.query(explainQuery, params);
  logger.info('Query plan', { plan: result.rows });
  return result.rows;
}
```

**Pattern 3: Avoid N+1 Queries**

```typescript
// ❌ Bad: N+1 query
async function getNotesWithProviders(noteIds: string[]) {
  const notes = await db.query('SELECT * FROM notes WHERE id = ANY($1)', [noteIds]);

  for (const note of notes.rows) {
    const provider = await db.query('SELECT * FROM users WHERE id = $1', [note.provider_id]);
    note.provider = provider.rows[0];
  }

  return notes.rows;
}

// ✅ Good: Single query with JOIN
async function getNotesWithProviders(noteIds: string[]) {
  const result = await db.query(
    `SELECT
      n.*,
      u.first_name AS provider_first_name,
      u.last_name AS provider_last_name,
      u.email AS provider_email
     FROM notes n
     JOIN users u ON n.provider_id = u.id
     WHERE n.id = ANY($1)`,
    [noteIds]
  );

  return result.rows;
}
```

### Read Replica Configuration

**`packages/database/src/read-replica.ts`:**

```typescript
import { Pool } from 'pg';
import { getDatabase } from './index';

let readPool: Pool | null = null;

export async function getReadReplica(): Promise<Pool> {
  if (readPool) {
    return readPool;
  }

  const readReplicaUrl = process.env.DATABASE_READ_REPLICA_URL;

  if (!readReplicaUrl) {
    // Fallback to primary database if no replica configured
    return getDatabase();
  }

  readPool = new Pool({
    connectionString: readReplicaUrl,
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
  });

  return readPool;
}

// Use for read-only queries (reports, analytics)
export async function executeReadQuery<T>(query: string, params?: any[]): Promise<T[]> {
  const pool = await getReadReplica();
  const result = await pool.query(query, params);
  return result.rows;
}
```

### Backup & Restore Procedures

**Automated Backup Script (`scripts/db/backup.sh`):**

```bash
#!/bin/bash

set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/scribemed}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/scribemed_$TIMESTAMP.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform backup
echo "Starting database backup..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
  echo "Backup completed successfully: $BACKUP_FILE"

  # Upload to S3 (optional)
  if [ -n "$AWS_S3_BACKUP_BUCKET" ]; then
    aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BACKUP_BUCKET/database-backups/"
    echo "Backup uploaded to S3"
  fi

  # Clean up old backups (keep last 7 days)
  find "$BACKUP_DIR" -name "scribemed_*.sql.gz" -mtime +7 -delete
else
  echo "Backup failed!"
  exit 1
fi
```

**Restore Script (`scripts/db/restore.sh`):**

```bash
#!/bin/bash

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

echo "Restoring database from $BACKUP_FILE..."

# Drop and recreate database
psql -c "DROP DATABASE IF EXISTS scribemed_restore;"
psql -c "CREATE DATABASE scribemed_restore;"

# Restore backup
gunzip -c "$BACKUP_FILE" | psql scribemed_restore

echo "Database restored successfully to scribemed_restore"
echo "To use this database, update DATABASE_URL to point to scribemed_restore"
```

### Database Health Metrics

**Expose Metrics in Health Package:**

```typescript
// packages/health/src/checks/database-metrics.ts
import { getDatabase, getPoolStats } from '@scribemed/database';

export async function getDatabaseMetrics() {
  const pool = await getDatabase();
  const poolStats = await getPoolStats();

  // Get database size
  const sizeResult = await pool.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size
  `);

  // Get active connections
  const connectionsResult = await pool.query(`
    SELECT count(*) AS active_connections
    FROM pg_stat_activity
    WHERE state = 'active'
  `);

  // Get table sizes
  const tableSizesResult = await pool.query(`
    SELECT
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10
  `);

  return {
    poolStats,
    databaseSize: sizeResult.rows[0].size,
    activeConnections: parseInt(connectionsResult.rows[0].active_connections),
    largestTables: tableSizesResult.rows,
  };
}
```

## Implementation Steps

1. **Phase 1: Performance Monitoring (Week 1)**
   - Enable slow query logging
   - Create monitoring views
   - Add query analysis helpers

2. **Phase 2: Connection Pool Tuning (Week 1)**
   - Implement environment-specific pool configs
   - Add pool metrics logging
   - Test under load

3. **Phase 3: Seeding & Testing (Week 2)**
   - Create seeding scripts for all environments
   - Integrate migration testing in CI
   - Add migration rollback tests

4. **Phase 4: Query Optimization (Week 2)**
   - Document optimization patterns
   - Add performance indexes
   - Analyze and optimize existing queries

5. **Phase 5: Backup & Operations (Week 3)**
   - Implement automated backups
   - Create restore procedures
   - Set up read replica (if needed)
   - Document operational runbooks

## Testing Requirements

- Migration tests run in CI
- Connection pool behavior tested under load
- Query performance benchmarks established
- Backup and restore procedures tested
- Read replica failover tested

## Documentation

- `docs/database/performance-tuning.md` - Connection pool config, query optimization
- `docs/database/query-optimization.md` - Optimization patterns with examples
- `docs/database/operations.md` - Backup, restore, and operational procedures
- `docs/runbooks/database-maintenance.md` - Routine maintenance tasks

## Status

Open

## Related Issues

- Issue #4: Database Schema Design and Migration System (closed)
- Issue #21: Local Development Environment with Docker Compose
- Issue #8: Monitoring & Observability Setup
