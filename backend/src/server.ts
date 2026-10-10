import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';
import { ensureDefaultUserAndToken } from './db/client.js';
import { ensureBucketExists } from './storage/s3.js';
import { initializeAdapters } from './providers/index.js';
import { logger } from './observability/logger.js';

async function bootstrap() {
  logger.info('🚀 Menginisialisasi Social Media Uploader API Server...');

  // 1. Inisialisasi adapter platform & S3 storage
  initializeAdapters();
  await ensureBucketExists();

  // 2. Inisialisasi default user dan token
  await ensureDefaultUserAndToken();

  // 3. Jalankan HTTP server
  serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info(
        { port: info.port, url: `http://localhost:${info.port}` },
        `⚡ API Server berjalan di http://localhost:${info.port}`
      );
    }
  );
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Gagal menjalankan server');
  process.exit(1);
});
