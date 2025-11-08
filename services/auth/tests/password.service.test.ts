import assert from 'node:assert/strict';
import test from 'node:test';

import { PasswordService } from '../src/services/password.service';

const service = new PasswordService(4);

test('rejects weak passwords', () => {
  const result = service.validateStrength('short');
  assert.equal(result.valid, false);
  assert(result.reasons?.some((reason) => reason.includes('uppercase')));
});

test('hashes and verifies passwords', async () => {
  const password = 'StrongPassword!23';
  const hash = await service.hashPassword(password);
  assert.ok(hash);
  assert.equal(await service.verifyPassword(password, hash), true);
  assert.equal(await service.verifyPassword('other', hash), false);
});
