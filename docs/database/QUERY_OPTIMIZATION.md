# Query Optimisation Guide

The initial schema ships with a baseline indexing strategy designed to support the most common product workflows. This guide documents the rationales and provides guidance for extending the approach.

## Indexing Strategy

- **Lookup tables**: `idx_organizations_active`, `idx_users_email`, and related partial indexes accelerate tenant-aware lookups while ignoring soft-deleted rows.
- **Search-driven entities**: Full-text indexes (`pg_trgm` and `to_tsvector`) on `patients`, `transcripts`, `icd10_codes`, and `cpt_codes` enable fuzzy search in UI flows.
- **Encounter timeline**: B-tree indexes on `encounters` (`patient_id`, `physician_id`, `status`, `scheduled_at`) support dashboard filtering and scheduling widgets.
- **Billing artefacts**: `diagnoses` and `procedures` receive compound indexes on `(encounter_id, status)` to speed up approval queues.
- **Audit logs**: Partitioned table with indexes on actor, resource, and `phi_accessed` boolean to accelerate compliance reporting.

## Query Hints

- Always include `organization_id` filters when querying PHI tables to leverage partial indexes and remain RLS-friendly.
- Use explicit ordering on timestamp columns that already have indexes (e.g. `encounters.scheduled_at`) to avoid additional sort operations.
- Leverage the helper functions:
  - `get_patient_age(patient_id)` for server-side age calculations without transferring DOB to clients unnecessarily.
  - `user_can_access_patient(user_id, patient_id)` inside complex joins to provide an extra safety net beyond RLS.

## Monitoring

- Enable `auto_explain` in staging to capture slow queries during QA.
- Review `pg_stat_statements` regularly; if a query exhibits high mean time or shared_blks_hit, consider adding compound indexes or rewriting the statement.
- For analytical workloads, create materialized views in a separate schema rather than overloading transactional tables.

## Extending the Schema

- When adding new feature tables, follow the existing naming conventions (`snake_case`, plural table names).
- Default to including `created_at` and `updated_at` columns with the `update_updated_at_column` trigger.
- Evaluate partitioning if a table is expected to exceed ~100M rows (audit logs set a precedent).

## Vacuum and Maintenance

- Run `VACUUM ANALYZE` on newly seeded environments to ensure the planner has up-to-date statistics.
- Schedule regular `REINDEX` operations for GIN indexes if write-heavy workloads degrade performance.
- Monitor table bloat metrics; consider autovacuum tuning for large PHI tables with frequent updates.
