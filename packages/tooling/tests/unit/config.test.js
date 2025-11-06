'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getEnvironmentConfig, defaults } = require('../../src/config');

test('returns defaults when environment is not set', () => {
  const config = getEnvironmentConfig();
  assert.equal(config.env, defaults.env);
  assert.deepEqual(config.features, defaults.features);
});

test('applies overrides for production', () => {
  const config = getEnvironmentConfig('production');
  assert.equal(config.env, 'production');
  assert(config.features.includes('audit-logging'));
});
