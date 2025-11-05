"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server");

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("documentation service exposes SOAP template", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/templates/default`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.subjective.includes("mild"));
  assert.equal(body.plan, "Recommend rest and OTC analgesics.");
});
