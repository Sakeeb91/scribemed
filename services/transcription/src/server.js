'use strict';

const http = require('node:http');

const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
} = require('@scribemed/health');

const PORT = Number(process.env.PORT ?? 8080);

// Initialize health check handlers
const livenessHandler = createLivenessHandler('transcription');
const readinessHandler = createReadinessHandler({
  serviceName: 'transcription',
  checks: {},
});
const healthHandler = createHealthHandler({
  serviceName: 'transcription',
  checks: {},
});

function createServer() {
  return http.createServer(async (request, response) => {
    // Health check endpoints
    if (request.url === '/health/live') {
      const health = livenessHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/health/ready') {
      const health = await readinessHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === '/health') {
      const health = await healthHandler();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.method === 'POST' && request.url === '/transcriptions') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        response.writeHead(202, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            message: 'Transcription request accepted',
            characters: body.length,
          })
        );
      });
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not Found' }));
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[transcription] listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
};
