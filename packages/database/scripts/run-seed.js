#!/usr/bin/env node

/**
 * Development helper script that streams the seed SQL into the configured database.
 * The script intentionally avoids database driver dependencies so it can run
 * on any machine with `psql` installed.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const process = require('node:process');

const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'];

function assertEnvVars() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exitCode = 1;
    process.exit();
  }
}

function runSeed() {
  assertEnvVars();

  const seedPath = path.resolve(__dirname, '..', 'migrations', 'seeds', 'dev_seed.sql');

  const args = [
    '--host',
    process.env.DB_HOST,
    '--port',
    process.env.DB_PORT ?? '5432',
    '--username',
    process.env.DB_USER,
    '--dbname',
    process.env.DB_NAME,
    '--file',
    seedPath,
  ];

  if (process.env.DB_PASSWORD) {
    process.env.PGPASSWORD = process.env.DB_PASSWORD;
  }

  const child = spawn('psql', args, {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

runSeed();
