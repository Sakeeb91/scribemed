'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT ?? 8081);

function createServer() {
  return http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'documentation' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/templates/default') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          subjective: 'Patient reports mild discomfort.',
          objective: 'Vitals stable and within normal limits.',
          assessment: 'Likely musculoskeletal strain.',
          plan: 'Rest, hydration, and follow-up in one week.',
        })
      );
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
    console.log(`[documentation] listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
};
