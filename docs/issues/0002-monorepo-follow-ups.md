# Issue: Harden Monorepo Developer Experience

## Summary

Capture follow-up improvements for the freshly scaffolded Turborepo workspace so the developer experience remains predictable and actionable.

## Background

During the initial bootstrap of the repository we identified a few areas that could be smoothed out once the base structure landed (see issue #1). These items do not block day-one usage but will prevent friction for future contributors if tackled soon.

## Proposed Changes

1. **Tighten commit strategy**
   - Document or adjust the multi-stage commit approach so related configuration changes land together and the history stays easy to traverse.

2. **Introduce deterministic installs**
   - Generate and commit a `pnpm-lock.yaml` (or enable `pnpm install --frozen-lockfile`) to guarantee repeatable dependency resolution.

3. **Seed workspace package targets**
   - Add minimal `package.json` files in representative `apps/*` and `services/*` folders with placeholder `dev`, `lint`, and `test` scripts so Turbo tasks run immediately.

4. **Apply Prettier across templates/docs**
   - Run Prettier on `docs/` and `.github/` to align with the configured 100 character print width and avoid formatting churn in early contributions.

5. **Document staged commit workflow**
   - Add a short guide in `docs/runbooks/` describing when to use multi-stage commits and how to keep them coherent if the pattern returns.

## Acceptance Criteria

- Follow-up issue references this document or is closed once tasks are complete.
- Lockfile checked into the repository and CI verifies it.
- Turbo `lint`/`dev` commands report at least one task executed.
- Documentation and template files match Prettier expectations (no diffs when running `pnpm format:check`).
- Runbook added or existing documentation updated to clarify commit strategy expectations.

## References

- Original scaffolding work: issue #1 (Initialize Monorepo with Turborepo)
