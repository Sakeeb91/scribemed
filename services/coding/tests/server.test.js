"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, icdCatalog } = require("../src/server");

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("catalog exports at least one ICD code", () => {
  assert.ok(Array.isArray(icdCatalog));
  assert.ok(icdCatalog.length >= 1);
});

test("GET /codes filters by search parameter", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/codes?search=hypertension`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.matches.some((entry) => entry.code === "I10"));
});
