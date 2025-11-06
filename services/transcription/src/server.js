'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT ?? 8080);

function createServer() {
  return http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'transcription' }));
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
