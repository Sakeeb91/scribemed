'use strict';

const defaults = {
  env: 'development',
  features: [],
};

const environmentOverrides = {
  production: {
    env: 'production',
    features: ['audit-logging'],
  },
  staging: {
    env: 'staging',
    features: ['beta-flows'],
  },
};

/**
 * Returns environment specific configuration used by smoke tests.
 * @param {string | undefined} envName
 * @returns {{ env: string; features: string[] }}
 */
function getEnvironmentConfig(envName = process.env.NODE_ENV) {
  const key = (envName ?? defaults.env).toLowerCase();
  return {
    ...defaults,
    ...(environmentOverrides[key] ?? {}),
  };
}

module.exports = {
  defaults,
  getEnvironmentConfig,
};
