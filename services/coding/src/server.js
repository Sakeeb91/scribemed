'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT ?? 8082);

const CATALOG = [
  { code: 'M54.5', description: 'Low back pain' },
  { code: 'J06.9', description: 'Acute upper respiratory infection' },
  { code: 'I10', description: 'Essential (primary) hypertension' },
];

function createServer() {
  return http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'coding' }));
      return;
    }

    if (request.method === 'GET' && request.url.startsWith('/codes')) {
      const [, query = ''] = request.url.split('?');
      const params = new URLSearchParams(query);
      const search = params.get('search')?.toLowerCase() ?? '';
      const matches = CATALOG.filter(
        (entry) =>
          entry.code.toLowerCase().includes(search) ||
          entry.description.toLowerCase().includes(search)
      );

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ matches }));
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
    console.log(`[coding] listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  CATALOG,
};
