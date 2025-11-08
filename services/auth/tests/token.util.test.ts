import assert from 'node:assert/strict';
import test from 'node:test';

import { generateNumericCode, generateSecureToken } from '../src/utils/token.util';

test('generates secure tokens with entropy', () => {
  const tokenA = generateSecureToken();
  const tokenB = generateSecureToken();
  assert(tokenA.length > 10);
  assert.notEqual(tokenA, tokenB);
});

test('generates numeric codes of fixed length', () => {
  const code = generateNumericCode(6);
  assert.equal(code.length, 6);
  assert(/^\d+$/.test(code));
});
