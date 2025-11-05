# Rollback Procedures

Although schema changes are carefully reviewed, production environments must still support controlled rollback. This document outlines the supported options when a migration introduces regressions.

## 1. Flyway Undo Scripts
- If a migration ships with a matching `U{version}__*.sql` file, run:
  ```bash
  cd packages/database
  npm run migrate:undo
  ```
- Flyway will execute the undo script in reverse order, reverting the last successful migration.
- Always re-run `npm run migrate` afterwards to confirm the database is back in a consistent state.

## 2. Manual Rollback
When no undo script exists (e.g. destructive migrations), follow the steps below:

1. **Capture context**
   - Record the current schema version using `npm run migrate:info`.
   - Export affected data with `pg_dump` if rows might be impacted.
2. **Write a targeted rollback script**
   - Create a new migration `U{version}__rollback_{identifier}.sql` under `packages/database/migrations`.
   - Include guarded `DROP` statements (`IF EXISTS`) and data restoration logic as needed.
3. **Apply in controlled environments**
   - Test the rollback script in staging before production.
   - Run `flyway -target={previous_version}` if you need to step back multiple versions.

## 3. Point-in-time Recovery
For catastrophic failures or data corruption:
- Use PostgreSQL base backups plus WAL archiving (configure via cloud provider or managed service).
- Coordinate with DevOps to trigger a point-in-time restore to a new instance.
- Re-apply migrations up to the desired safe version using `npm run migrate`.

## Best Practices
- Always create undo scripts for migrations that modify or delete data.
- Avoid relying solely on rollback; prefer *forward fixes* by shipping a new migration correcting the issue.
- Maintain regular backups and validate restore procedures quarterly.
- Document every rollback event in the incident tracker, including root cause and follow-up actions.
