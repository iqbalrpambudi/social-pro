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
        logger.info({ jobId: job.id, targetId }, 'Worker mengambil job target publikasi');

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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Menerima sinyal shutdown, menghentikan worker secara graceful...');
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
