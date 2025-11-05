#!/usr/bin/env node

/**
 * Lightweight placeholder task runner so the CI pipeline can execute
 * until full implementations are available. Each task simply logs a
 * human-readable message and exits successfully.
 */
const tasks = {
  lint: "ESLint placeholder: no source files to lint yet.",
  "format:check": "Formatting placeholder: nothing to format.",
  "type-check": "Type-check placeholder: TypeScript project not initialized.",
  migrate: "Database migrations placeholder: no migrations to run.",
  "test:unit": "Unit tests placeholder: no tests defined yet.",
  "test:integration": "Integration tests placeholder: no tests defined yet.",
  coverage: "Coverage placeholder: coverage artifacts not generated.",
  build: "Build placeholder: nothing to build yet."
};

const taskName = process.argv[2];

if (!taskName || !Object.prototype.hasOwnProperty.call(tasks, taskName)) {
  console.error(
    `Unknown task "${taskName ?? "<missing>"}". Available tasks: ${Object.keys(tasks).join(", ")}`
  );
  process.exit(1);
}

console.log(`[CI Placeholder] ${tasks[taskName]}`);
