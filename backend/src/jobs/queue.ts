import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

export const PUBLISH_TARGET_QUEUE = 'publish-target';

class JobQueueService {
  private boss: PgBoss | null = null;
  private isStarted = false;

  async start(): Promise<PgBoss> {
    if (this.boss && this.isStarted) {
      return this.boss;
    }

    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      max: 5,
      // Prefix schema pg-boss dalam postgres
      schema: 'pgboss',
    });

    this.boss.on('error', (err) => {
      logger.error({ err }, 'pg-boss queue error');
    });

    await this.boss.start();
    await this.boss.createQueue(PUBLISH_TARGET_QUEUE);
    this.isStarted = true;
    logger.info('pg-boss background job queue berhasil dimulai');
    return this.boss;
  }

  async enqueuePublishTarget(
    targetId: string,
    scheduledAt?: Date | null
  ): Promise<string | null> {
    const boss = await this.start();

    const options: PgBoss.SendOptions = {
      retryLimit: 3,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 3600, // 1 hour max
    };

    if (scheduledAt && scheduledAt > new Date()) {
      options.startAfter = scheduledAt;
    }

    const jobId = await boss.send(PUBLISH_TARGET_QUEUE, { targetId }, options);
    logger.info({ targetId, jobId, scheduledAt }, 'Job publikasi target berhasil di-enqueue');
    return jobId;
  }

  async stop(): Promise<void> {
    if (this.boss && this.isStarted) {
      await this.boss.stop();
      this.isStarted = false;
      logger.info('pg-boss background job queue dihentikan');
    }
  }
}

export const jobQueue = new JobQueueService();
