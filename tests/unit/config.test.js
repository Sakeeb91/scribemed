'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getEnvironmentConfig } = require('@scribemed/tooling');

test('getEnvironmentConfig reads NODE_ENV from process', () => {
  process.env.NODE_ENV = 'production';
  const config = getEnvironmentConfig();
  assert.equal(config.env, 'production');
  delete process.env.NODE_ENV;
});
