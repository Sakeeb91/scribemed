'use strict';

const http = require('node:http');

const {
  createLivenessHandler,
  createReadinessHandler,
  createHealthHandler,
  createHealthConfigFromEnv,
  getHealthMetricsSnapshot,
} = require('@scribemed/health');

const PORT = Number(process.env.PORT ?? 8080);

function createSynthesizerCheck() {
  const maxLatency = Number(process.env.TRANSCRIPTION_SYNTH_LATENCY_MS ?? 120);
  return async () => {
    const simulatedLatency = Number(process.env.SIMULATED_SYNTH_LATENCY ?? 25);
    const status = simulatedLatency > maxLatency ? 'degraded' : 'healthy';
    return {
      status,
      simulatedLatency,
      maxLatency,
    };
  };
}

function buildHealthHandlers() {
  const healthOptions = createHealthConfigFromEnv('transcription', {
    cache: { ttlMs: Number(process.env.HEALTH_CACHE_TTL_MS ?? 1500) },
    timeouts: { defaultMs: 1200 },
    checks: {
      synthesizer: {
        run: createSynthesizerCheck(),
        impact: 'critical',
        circuitBreaker: {
          failureThreshold: 2,
          cooldownPeriodMs: 8000,
          openStatus: 'unhealthy',
        },
      },
    },
  });

  return {
    liveness: createLivenessHandler(healthOptions.serviceName),
    readiness: createReadinessHandler(healthOptions),
    health: createHealthHandler(healthOptions),
  };
}

const {
  liveness: livenessHandler,
  readiness: readinessHandler,
  health: healthHandler,
} = buildHealthHandlers();

function createServer() {
  return http.createServer(async (request, response) => {
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

    if (request.url === '/metrics') {
      response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      response.end(getHealthMetricsSnapshot());
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
