#!/usr/bin/env bash
set -euo pipefail

echo "🌡️  Running production health checks"

TARGET="${PRODUCTION_HEALTHCHECK_URL:-https://app.example.local/health}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not available; skipping HTTP probe"
  exit 0
fi

curl --fail --silent --show-error "$TARGET"
echo
echo "✅  Production endpoint responded successfully"

