## Scribemed Database Package

This package owns the PostgreSQL schema, Flyway migration configuration, and connection helpers for the Scribemed platform.

### Directory Layout
- migrations/ – Versioned SQL scripts (V1__*.sql) executed by Flyway.
- migrations/seeds/ – Development-only seed data.
- src/index.ts – TypeScript singleton that exposes the shared PostgreSQL pool.
- scripts/run-seed.js – Helper to run seed files via psql.

### Usage
```bash
cd packages/database
npm install
npm run migrate      # Apply migrations
npm run seed:dev     # Load development fixtures (requires psql)
```

### Environment Variables
- DB_HOST, DB_PORT, DB_NAME, DB_USER – Standard connection parameters.
- DB_PASSWORD – Required in development; in staging/production the package pulls credentials from AWS Secrets Manager (ai-med-docs/db-password-{environment}).
- ENVIRONMENT – One of development, staging, or production; controls SSL and secret resolution.

### Related Documentation
- docs/database/ERD.md
- docs/database/DATA_DICTIONARY.md
- docs/database/MIGRATION_GUIDE.md
- docs/database/ROLLBACK_PROCEDURES.md
- docs/database/QUERY_OPTIMIZATION.md
