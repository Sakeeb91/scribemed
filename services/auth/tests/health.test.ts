import { createServer } from 'http';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import test from 'node:test';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config/env';

test('health endpoints report status and metrics', async (t) => {
  const app = createApp(loadConfig({ env: 'test', port: 1 }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;

  const liveResponse = await fetch(`http://127.0.0.1:${port}/health/live`);
  assert.equal(liveResponse.status, 200);

  const readyResponse = await fetch(`http://127.0.0.1:${port}/health/ready`);
  assert.equal(readyResponse.status, 200);
  const readyPayload = await readyResponse.json();
  assert.equal(readyPayload.service, 'auth');

  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthResponse.status, 200);
  const healthPayload = await healthResponse.json();
  assert.equal(healthPayload.service, 'auth');

  const metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  assert(metrics.includes('scribemed_health_check_status'));
});
