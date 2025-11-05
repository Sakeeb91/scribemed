"use strict";

/**
 * Lightweight HTTP server that mimics a transcription API.
 * Keeping the logic framework-free helps new contributors trace the request flow.
 */
const http = require("node:http");

/**
 * Creates a pre-configured Node HTTP server.
 * @returns {http.Server} ready-to-use HTTP server
 */
function createServer() {
  return http.createServer((request, response) => {
    if (request.url === "/health") {
      // Dedicated health probe used by orchestrators and smoke tests.
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "POST" && request.url === "/transcriptions") {
      let payload = "";
      request.on("data", (chunk) => {
        payload += chunk;
      });

      request.on("end", () => {
        response.writeHead(202, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            message: "Transcription request accepted",
            length: payload.length,
          })
        );
      });
      return;
    }

    // Fallback keeps the API self-documenting for curious developers.
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not Found" }));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8080);
  const server = createServer();
  server.listen(port, () => {
    console.log(`[transcription] listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
