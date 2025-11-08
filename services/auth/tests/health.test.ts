import { createServer } from 'http';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import test from 'node:test';

import { createApp } from '../src/app';

test('health endpoint reports ready status', async (t) => {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'auth');
});
