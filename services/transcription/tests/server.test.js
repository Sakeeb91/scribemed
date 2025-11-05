"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server");

/**
 * Starts the server on an ephemeral port and returns its base URL.
 * Using async helpers keeps the test structure close to real-world examples.
 */
async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("health endpoint reports ready", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
});

test("POST /transcriptions accepts payloads", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const payload = JSON.stringify({ audio: "fake" });
  const response = await fetch(`${url}/transcriptions`, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.message, "Transcription request accepted");
  assert.equal(body.length, payload.length);
});
