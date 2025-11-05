#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");

/**
 * Centralised task launcher so CI jobs follow the same code path locally.
 * When a task is not fully implemented yet we fall back to an educational
 * message that tells contributors what still needs to happen.
 */
const tasks = {
  "format:check": {
    type: "message",
    message: "Formatting placeholder: no formatter configured yet."
  },
  "type-check": {
    type: "message",
    message: "Type-check placeholder: TypeScript project not initialised."
  },
  migrate: {
    type: "message",
    message: "Database migrations placeholder: nothing to run."
  },
  coverage: {
    type: "message",
    message: "Coverage placeholder: reporters not wired up yet."
  }
};

const delegations = {
  lint: {
    command: ["pnpm", "-r", "--stream", "run", "lint"],
    description: "Run lint scripts across all workspaces"
  },
  build: {
    command: ["pnpm", "-r", "--stream", "run", "build"],
    description: "Run package-level build hooks"
  },
  "test:unit": {
    command: ["pnpm", "-r", "--stream", "run", "test"],
    description: "Run unit tests across services"
  },
  "test:integration": {
    command: ["pnpm", "-r", "--stream", "run", "test"],
    description: "Run integration tests (currently same as unit)"
  }
};

const taskName = process.argv[2];

if (!taskName) {
  console.error(
    `Unknown task "<missing>". Available tasks: ${[...Object.keys(tasks), ...Object.keys(delegations)].join(", ")}`
  );
  process.exit(1);
}

if (tasks[taskName]) {
  console.log(`[CI helper] ${tasks[taskName].message}`);
  process.exit(0);
}

const delegation = delegations[taskName];
if (!delegation) {
  console.error(
    `Unknown task "${taskName}". Available tasks: ${[...Object.keys(tasks), ...Object.keys(delegations)].join(", ")}`
  );
  process.exit(1);
}

const result = spawnSync(delegation.command[0], delegation.command.slice(1), {
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
