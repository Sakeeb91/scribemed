"use strict";

/**
 * Documentation service stub that returns templated SOAP notes.
 * It demonstrates how future FastAPI/Express implementations can respond.
 */
const http = require("node:http");

/**
 * Prepares a server that exposes documentation endpoints.
 * @returns {http.Server}
 */
function createServer() {
  return http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "GET" && request.url === "/templates/default") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          subjective: "Patient reports mild pain.",
          objective: "Vitals within normal limits.",
          assessment: "Likely musculoskeletal strain.",
          plan: "Recommend rest and OTC analgesics.",
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not Found" }));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8081);
  const server = createServer();
  server.listen(port, () => {
    console.log(`[documentation] listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
