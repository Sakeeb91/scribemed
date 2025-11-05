"use strict";

/**
 * Coding service stub that surfaces a small ICD-10 catalogue.
 * Shipping this logic keeps container images meaningful for CI smoke tests.
 */
const http = require("node:http");

const icdCatalog = [
  { code: "M54.5", description: "Low back pain" },
  { code: "J06.9", description: "Acute upper respiratory infection" },
  { code: "I10", description: "Essential (primary) hypertension" }
];

/**
 * Returns a configured HTTP server that exposes basic coding lookups.
 * @returns {http.Server}
 */
function createServer() {
  return http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/codes")) {
      const [, queryString = ""] = request.url.split("?");
      const params = new URLSearchParams(queryString);
      const search = params.get("search")?.toLowerCase() ?? "";
      const matches = icdCatalog.filter(
        (entry) =>
          entry.code.toLowerCase().includes(search) ||
          entry.description.toLowerCase().includes(search)
      );

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ matches }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not Found" }));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8082);
  const server = createServer();
  server.listen(port, () => {
    console.log(`[coding] listening on http://localhost:${port}`);
  });
}

module.exports = { createServer, icdCatalog };
