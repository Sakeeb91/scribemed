import assert from 'node:assert/strict';
import test from 'node:test';

import type { Request } from 'express';

import { buildRequestContext } from '../src/utils/request-context.util';

test('extracts IP and user agent from headers', () => {
  const req = {
    headers: {
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'user-agent': 'node-test',
    },
    ip: '127.0.0.1',
  } as unknown as Request;

  const context = buildRequestContext(req);
  assert.equal(context.ipAddress, '203.0.113.10');
  assert.equal(context.userAgent, 'node-test');
});
