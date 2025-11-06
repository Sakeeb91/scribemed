'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createServer } = require('../src/server');

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test('templates endpoint returns default SOAP structure', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/templates/default`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.plan, 'Rest, hydration, and follow-up in one week.');
});

test('GET /health returns health status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert(payload.status);
  assert(payload.timestamp);
});

test('GET /health/live returns liveness status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/live`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert.equal(payload.status, 'healthy');
});

test('GET /health/ready returns readiness status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/ready`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'documentation');
  assert(payload.status);
});
