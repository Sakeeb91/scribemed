# Deployment Runbook

This runbook summarizes the steps operators follow when promoting code through the
GitHub Actions workflows introduced in issue #15.

## Staging Promotion

1. Merge the feature branch into `main`.
2. GitHub Actions automatically builds containers and deploys to the staging namespace.
3. Confirm the workflow step `Run staging smoke tests` succeeds and check the Slack
   notification for additional context.
4. Perform any manual QA or database migrations required by the release.

## Production Promotion

1. Create a semver tag (`vX.Y.Z`) on the commit you wish to release.
2. Approve the production environment gate inside the GitHub Actions run.
3. Monitor the `Run production smoke tests` step and the accompanying Slack alert.
4. Record the release in observability tooling (Datadog event logging is automated
   when credentials are provided).

## Rollback Procedure

1. Re-run the latest successful deployment workflow selecting the previous tag via
   `workflow_dispatch`.
2. Alternatively, execute `kubectl rollout undo deployment/<service> -n production`
   for targeted services.
3. Update the incident log with root cause, mitigation steps, and follow-up actions.
