#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Running PHI exposure audit"

declare -a PATTERNS=(
  "SSN"
  "social[_[:space:]]?security"
  "medical[_[:space:]]?record"
  "patient[_[:space:]]?id"
  "date[_[:space:]]?of[_[:space:]]?birth"
)

violations=0

for pattern in "${PATTERNS[@]}"; do
  if git grep -iE "$pattern" -- '*.ts' '*.tsx' '*.js' '*.jsx' \
    ':(exclude)*.test.*' ':(exclude)*.spec.*'; then
    echo "⚠️  Potential PHI indicator found for pattern: $pattern"
    violations=$((violations + 1))
  fi
done

if [[ $violations -gt 0 ]]; then
  echo "❌  PHI audit flagged $violations potential occurrences"
  exit 1
fi

echo "✅  No PHI indicators detected"

