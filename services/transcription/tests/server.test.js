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

test('health endpoint responds with transcription status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'transcription');
  assert(payload.status);
  assert(payload.timestamp);
});

test('GET /health/live returns liveness status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/live`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'transcription');
  assert.equal(payload.status, 'healthy');
});

test('GET /health/ready returns readiness status', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health/ready`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'transcription');
  assert(payload.status);
});

test('POST /transcriptions acknowledges payload', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/transcriptions`, {
    method: 'POST',
    body: JSON.stringify({ audio: 'mock-data' }),
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.message, 'Transcription request accepted');
  assert(payload.characters > 0);
});
