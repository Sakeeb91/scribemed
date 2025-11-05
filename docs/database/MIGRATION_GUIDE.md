# Migration Guide

This project uses [Flyway](https://flywaydb.org/) to version-control PostgreSQL schema changes. The configuration lives in `packages/database/flyway.conf` and the SQL migrations reside under `packages/database/migrations`.

## Prerequisites
- PostgreSQL client tools (`psql`) installed locally.
- Java Runtime Environment (required by Flyway CLI).
- Environment variables providing database connectivity:
  - `DB_HOST`
  - `DB_PORT` (defaults to `5432`)
  - `DB_NAME`
  - `DB_USER`
  - `DB_PASSWORD`

## Installing dependencies

From `packages/database`:

```bash
npm install
```

This pulls in the Flyway CLI and TypeScript build tooling.

## Running migrations

```bash
cd packages/database
npm run migrate
```

Flyway reads credentials from the environment and executes migrations in version order (`V1__initial_schema.sql`, `V2__...`, etc.). The `flyway_schema_history` table tracks execution state to keep environments consistent.

### Checking migration status

```bash
npm run migrate:info
```

Displays pending or failed migrations along with applied versions.

### Undoing the last migration

```bash
npm run migrate:undo
```

Use with caution—only available when a corresponding `U` (undo) script exists.

## Seeding development data

```bash
cd packages/database
npm run seed:dev
```

The helper script wraps `psql` to load `migrations/seeds/dev_seed.sql` into the configured database. Seeds are intentionally limited to non-production test data.

## Adding a new migration
1. Create a new file `packages/database/migrations/V{N}__your_description.sql`.
2. Write an idempotent migration using pure SQL. Avoid application-specific assumptions such as user IDs unless guarded with `IF EXISTS`.
3. If rollback support is required, add a matching `U{N}__your_description.sql`.
4. Run `npm run migrate` against a local database to validate the script before pushing.

## Environment-specific notes
- **Development**: Set `ENVIRONMENT=development` to keep SSL disabled and rely on `DB_PASSWORD`.
- **Staging/Production**: Set `ENVIRONMENT` to the respective value. The application will fetch credentials from AWS Secrets Manager (`ai-med-docs/db-password-{environment}`).
- **CI/CD**: Prefer ephemeral databases to guarantee clean migration runs.

## Troubleshooting
- **Flyway cannot connect**: Confirm environment variables and network access (e.g. VPN).
- **Checksum mismatch**: Never edit an already-applied migration. Create a new version with the desired changes.
- **Permission errors**: Ensure the database role has privileges to create extensions, tables, and policies defined in the migration.
