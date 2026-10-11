import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import { env } from './config/env.js';
import { logger } from './observability/logger.js';
import { sseHub, type PublicationStreamEvent } from './observability/sse.js';
import { pool } from './db/client.js';
import { s3Client } from './storage/s3.js';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { authMiddleware } from './modules/auth/middleware.js';
import { oauthRouter } from './modules/auth/oauth.routes.js';
import { mediaRouter } from './modules/media/routes.js';
import { socialAccountsRouter } from './modules/social-accounts/routes.js';
import { publicationsRouter } from './modules/publications/routes.js';
import { openapiSpec } from './openapi.js';
import type { AppVariables } from './lib/types.js';

export const app = new Hono<{ Variables: AppVariables }>();

// 1. Request ID & Logging Middleware
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || `req_${uuidv4()}`;
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
      requestId,
    },
    'HTTP Request selesai'
  );
});

// 2. CORS Middleware
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Izinkan frontend origin atau dev localhost
      if (!origin || origin.includes('localhost') || origin === env.FRONTEND_ORIGIN) {
        return origin || '*';
      }
      return env.FRONTEND_ORIGIN;
    },
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-request-id'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['x-request-id'],
    maxAge: 86400,
  })
);

// 3. Health & Readiness Endpoints
app.get('/health', (c) => c.json({ status: 'ok' }));

// 3.1. OpenAPI Spec & Interactive Scalar API Docs
app.get('/openapi.json', (c) => c.json(openapiSpec));

app.get('/docs', (c) => {
  return c.html(`<!doctype html>
<html lang="id">
  <head>
    <title>Social Pro - API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1'><path d='M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'/></svg>" />
    <style>
      body { margin: 0; background-color: #090d16; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"
      data-configuration='{"theme":"purple","layout":"modern","darkMode":true,"showSidebar":true}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`);
});

app.get('/ready', async (c) => {
  const requestId = c.get('requestId');
  try {
    // Cek koneksi database PostgreSQL
    await pool.query('SELECT 1');
    // Cek koneksi Object Storage
    await s3Client.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }));

    return c.json({
      status: 'ready',
      database: 'connected',
      storage: 'connected',
    });
  } catch (err: any) {
    logger.error({ err }, 'Readiness check gagal');
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service belum siap menerima request.',
          requestId,
        },
      },
      503
    );
  }
});

// 4. SSE (Server-Sent Events) Stream Endpoint
app.get('/v1/events/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    logger.debug('Klien terhubung ke SSE event stream');

    const onEvent = (event: PublicationStreamEvent) => {
      stream.writeSSE({
        event: 'publication_status',
        data: JSON.stringify(event),
      });
    };

    sseHub.on('publication_event', onEvent);

    // Heartbeat keepalive tiap 15 detik
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ time: new Date().toISOString() }),
      });
    }, 15000);

    stream.onAbort(() => {
      logger.debug('Klien memutuskan koneksi dari SSE stream');
      clearInterval(heartbeat);
      sseHub.off('publication_event', onEvent);
    });

    // Kirim pesan sambutan awal
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ message: 'Connected to Social Media Uploader SSE Stream' }),
    });

    // Menjaga stream tetap terbuka
    while (true) {
      await stream.sleep(10000);
    }
  });
});

// 5. Mount OAuth Routes (callback is public)
app.use('/v1/*', async (c, next) => {
  if (c.req.path.startsWith('/v1/oauth/youtube/callback')) {
    return next();
  }
  return authMiddleware(c, next);
});

app.route('/v1/oauth', oauthRouter);
app.route('/v1/media', mediaRouter);
app.route('/v1/social-accounts', socialAccountsRouter);
app.route('/v1/publications', publicationsRouter);

// 6. Global Error Handler
app.onError((err, c) => {
  const requestId = c.get('requestId') || 'req_unknown';
  logger.error({ err, requestId }, 'Unhandled application error');

  return c.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          env.NODE_ENV === 'development'
            ? err.message
            : 'Terjadi kesalahan internal pada server.',
        requestId,
      },
    },
    500
  );
});

// 7. Not Found Handler
app.notFound((c) => {
  const requestId = c.get('requestId') || 'req_unknown';
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${c.req.method} ${c.req.path} tidak ditemukan.`,
        requestId,
      },
    },
    404
  );
});
