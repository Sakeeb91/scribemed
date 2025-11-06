#!/usr/bin/env bash
set -euo pipefail

echo "🌡️  Running staging health checks"

TARGET="${STAGING_HEALTHCHECK_URL:-https://staging.example.local/health}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not available; skipping HTTP probe"
  exit 0
fi

curl --fail --silent --show-error "$TARGET"
echo
echo "✅  Staging endpoint responded successfully"

