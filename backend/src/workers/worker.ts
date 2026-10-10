import { eq, and, or, isNull, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import { jobQueue, PUBLISH_TARGET_QUEUE } from '../jobs/queue.js';
import { processPublishTarget } from '../jobs/publish-target.job.js';
import { initializeAdapters } from '../providers/index.js';
import { ensureBucketExists } from '../storage/s3.js';
import { logger } from '../observability/logger.js';

async function startWorker() {
  logger.info('🚀 Memulai Social Media Uploader Background Worker...');

  // Inisialisasi adapters & S3 storage
  initializeAdapters();
  await ensureBucketExists();

  // Jalankan queue
  const boss = await jobQueue.start();

  // Daftarkan worker handler dengan batchSize = 2 (sesuai dokumen arsitektur sec 10.2)
  await boss.work(
    PUBLISH_TARGET_QUEUE,
    {
      batchSize: 2,
    },
    async (jobs) => {
      for (const job of jobs) {
        const { targetId } = job.data as { targetId: string };
        logger.info({ jobId: job.id, targetId }, 'Worker mengambil job target publikasi dari queue');

        try {
          await processPublishTarget(targetId);
        } catch (err) {
          logger.error({ err, targetId }, 'Worker gagal memproses job target');
          throw err;
        }
      }
    }
  );

  logger.info('✅ Worker siap memproses antrian job publikasi.');

  // Reconciliation loop (Section 10.5 & 19 Dokumen Arsitektur):
  // Menemukan target yang masih berstatus 'queued' di database dan memastikan job dieksekusi
  let isReconciling = false;
  const runReconciliation = async () => {
    if (isReconciling) return;
    isReconciling = true;

    try {
      const pendingTargets = await db
        .select()
        .from(schema.publicationTargets)
        .where(
          and(
            eq(schema.publicationTargets.status, 'queued'),
            or(
              isNull(schema.publicationTargets.scheduledAt),
              lte(schema.publicationTargets.scheduledAt, new Date())
            )
          )
        )
        .limit(5);

      for (const target of pendingTargets) {
        logger.info(
          { targetId: target.id, platform: target.platform },
          'Reconciliation: Menemukan target pending di database, memproses...'
        );
        await processPublishTarget(target.id);
      }

      // 2. Stale / orphaned targets recovery (Section 10.5 & 19 Dokumen Arsitektur):
      // Target yang tersangkut di status non-terminal ('preparing' atau 'uploading') lebih dari 2 menit
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
      const staleTargets = await db
        .select()
        .from(schema.publicationTargets)
        .where(
          and(
            or(
              eq(schema.publicationTargets.status, 'preparing'),
              eq(schema.publicationTargets.status, 'uploading')
            ),
            lte(schema.publicationTargets.updatedAt, staleThreshold)
          )
        )
        .limit(5);

      for (const stale of staleTargets) {
        logger.warn(
          { targetId: stale.id, status: stale.status, updatedAt: stale.updatedAt },
          'Reconciliation: Menemukan target macet/stale (worker crash recovery), memproses ulang...'
        );
        await processPublishTarget(stale.id);
      }
    } catch (recErr) {
      logger.error({ recErr }, 'Error saat menjalankan reconciliation loop');
    } finally {
      isReconciling = false;
    }
  };

  // Jalankan segera saat startup dan berulang tiap 5 detik
  await runReconciliation();
  const reconTimer = setInterval(runReconciliation, 5000);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Menerima sinyal shutdown, menghentikan worker secara graceful...');
    clearInterval(reconTimer);
    await jobQueue.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startWorker().catch((err) => {
  logger.fatal({ err }, 'Worker gagal dijalankan');
  process.exit(1);
});
