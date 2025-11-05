# CI/CD Pipeline Overview

This document captures the initial CI/CD foundation implemented for issue #2.
It is intentionally lightweight until real services and infrastructure are
available, but it defines the guardrails and observability hooks that the
future platform will rely on.

## Architecture Summary

```
┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Pull Request / │ ──▶ │ CI Workflow Jobs │ ──▶ │ Container Build / │
│      Push      │     │ (lint → test →   │     │ Deployment Targets │
└────────────────┘     │ security)        │     └──────────────────┘
                           │                           │
                           ▼                           ▼
                    ┌──────────────┐            ┌───────────────┐
                    │ Compliance   │            │ Staging /     │
                    │ (HIPAA scan) │            │ Production    │
                    └──────────────┘            │ environments  │
                                                └───────────────┘
```

Each job publishes artifacts, status checks, and (when configured) Slack
notifications so stakeholders have immediate visibility into outcomes.

## Workflow Breakdown

- **changes**: Uses `dorny/paths-filter` to identify which services changed.
- **lint**: Runs `pnpm`-based linting, formatting checks, and type checking.
- **test**: Executes unit and integration test placeholders against PostgreSQL
  and Redis service containers to mirror eventual runtime requirements.
- **security-scan**: Integrates Snyk (when configured) and Trivy to detect
  vulnerabilities and publishes SARIF artifacts.
- **hipaa-compliance**: Invokes `scripts/ci/check-phi-exposure.sh` to ensure
  PHI indicators are not accidentally committed.
- **build**: Builds (and optionally pushes) service containers to GHCR, using
  Buildx cache for efficiency.
- **deploy-staging / deploy-production**: Deploy via `kubectl` with staged
  health checks, Slack notifications, and Datadog hooks.

## Manual Gates & Approvals

- The `production` environment should be configured with required reviewers in
  GitHub to enforce manual approval before rollout.
- Staging health checks run automatically; production health checks halt the
  pipeline if endpoints fail.

## Secrets & Required Configuration

| Secret | Purpose |
| ------ | ------- |
| `SNYK_TOKEN` | Authenticate Snyk scans. |
| `KUBE_CONFIG_STAGING` | Kubeconfig for staging cluster access. |
| `KUBE_CONFIG_PROD` | Kubeconfig for production cluster access. |
| `SLACK_WEBHOOK` | Optional Slack deployment notifications. |
| `DATADOG_API_URL` / `DATADOG_API_KEY` | Deployment audit logging. |

## Runbook Highlights

1. Open a pull request → CI runs automatically.
2. Address lint/test feedback until all checks pass.
3. Merge to `main` → containers build and staging deploy kicks off.
4. Validate staging via health checks, logs, and Slack notification.
5. Tag a release (`v*`) → production deployment pipeline runs, waiting on
   environment approval.
6. Use `scripts/ci/health-check-*.sh` for additional smoke validation.

## Rollback Guidance

- Re-run the workflow with the previous tag to redeploy an older image.
- Alternatively, use `kubectl rollout undo deployment/<service> -n <env>` after
  verifying container images in GHCR.
- Always document rollbacks in the Datadog event log for traceability.
