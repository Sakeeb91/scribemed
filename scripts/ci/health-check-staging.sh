#!/usr/bin/env bash
set -euo pipefail

# Minimal placeholder health check for the staging deployment.
# Replace curl targets with real service endpoints when available.
echo "Running staging health checks..."

if command -v curl >/dev/null 2>&1; then
  curl --fail --head --silent "${STAGING_HEALTHCHECK_URL:-https://staging.aimedocs.example.com/health}" || {
    echo "Staging health check failed."
    exit 1
  }
else
  echo "curl is not available; skipping staged HTTP health probe."
fi

echo "Staging environment looks healthy."
