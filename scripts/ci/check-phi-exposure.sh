#!/usr/bin/env bash
set -euo pipefail

# Automated scan for accidentally committed Protected Health Information (PHI).
# The script exits non-zero if suspicious patterns are detected in tracked files.
echo "Checking for exposed PHI..."

declare -a PHI_PATTERNS=(
  "SSN"
  "social[_[:space:]]?security"
  "medical[_[:space:]]?record[_[:space:]]?number"
  "patient[_[:space:]]?id"
  "date[_[:space:]]?of[_[:space:]]?birth"
)

violations=0

for pattern in "${PHI_PATTERNS[@]}"; do
  if git grep -iE "$pattern" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' \
    -- ':(exclude)*.test.*' ':(exclude)*.spec.*'; then
    echo "⚠️  Potential PHI exposure found for pattern: $pattern"
    ((violations++))
  fi
done

if [[ $violations -gt 0 ]]; then
  echo "❌  Found $violations potential PHI exposures"
  exit 1
fi

echo "✅  No PHI exposure detected"
