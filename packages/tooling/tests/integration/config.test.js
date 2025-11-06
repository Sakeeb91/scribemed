'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getEnvironmentConfig } = require('../../src/config');

test('staging configuration exposes beta features', () => {
  const config = getEnvironmentConfig('staging');
  assert.equal(config.env, 'staging');
  assert(config.features.includes('beta-flows'));
});
