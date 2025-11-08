import assert from 'node:assert/strict';
import test from 'node:test';

import { JWTService } from '../src/services/jwt.service';

import { testConfig } from './test-config';

const service = new JWTService(testConfig);

test('issues and verifies access tokens', () => {
  const token = service.generateAccessToken({
    userId: 'user-1',
    email: 'user@example.com',
    role: 'physician',
    organizationId: 'org-1',
    sessionId: 'session-1',
  });
  const payload = service.verifyAccessToken(token);
  assert.equal(payload.userId, 'user-1');
  assert.equal(payload.sessionId, 'session-1');
});

test('issues and verifies refresh tokens', () => {
  const token = service.generateRefreshToken({
    userId: 'user-2',
    sessionId: 'session-2',
  });
  const payload = service.verifyRefreshToken(token);
  assert.equal(payload.userId, 'user-2');
});
