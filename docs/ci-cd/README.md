# CI/CD Pipeline Overview

This repository provides a workspace-aligned CI/CD pipeline that exercises linting,
tests, security, and deployment stages using GitHub Actions. The jobs run on every
pull request targeting `main` or `develop` and on pushes to `main`/tagged releases.

## Workflow Summary

| Job                 | Purpose                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `lint`              | Installs pnpm workspaces, runs ESLint, Prettier check, and TypeScript type checks. |
| `unit-tests`        | Executes Node native unit tests across Node 18 and 20.                             |
| `integration-tests` | Runs integration smoke suites and publishes diagnostics.                           |
| `security-scan`     | Performs `pnpm audit` (with optional Snyk/Trivy integrations via secrets).         |
| `hipaa-checks`      | Validates PHI exposure protection through `scripts/ci/check-phi-exposure.sh`.      |
| `build`             | Builds workspace packages with Turborepo and uploads dist artifacts.               |
| `container-images`  | Builds/pushes service containers (`transcription`, `documentation`, `coding`).     |
| `deploy-staging`    | Applies Kubernetes manifests and runs staging health checks (pushes to `main`).    |
| `deploy-production` | Applies production manifests on tagged releases; requires environment approval.    |

Manual redeployments are available through `cd.yml` via `workflow_dispatch`, providing the
same staging/production smoke tests.

## Required Secrets

- `KUBE_CONFIG_STAGING` – Base64 encoded kubeconfig for the staging cluster.
- `KUBE_CONFIG_PROD` – Base64 encoded kubeconfig for production (protected environment).
- `SLACK_WEBHOOK` – Optional webhook for deployment notifications.
- `DATADOG_*` / `SNYK_TOKEN` – Optional integrations (jobs skip gracefully when absent).

## Local Parity

Run the same checks locally with:

```bash
pnpm install       # workspace install
pnpm lint          # lint & types
pnpm test          # unit + integration tests
pnpm build         # turbo build artefacts
```

CI helper scripts live in `scripts/ci/` and are designed to be cross-platform so they can
double as operator runbooks.
