import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import { registry } from '../providers/index.js';
import { decryptToken } from '../security/crypto.js';
import { logger } from '../observability/logger.js';
import { sseHub } from '../observability/sse.js';
import { env } from '../config/env.js';
import type { PublishContext, Platform } from '../providers/contracts.js';

/**
 * Memproses publikasi satu target secara independen
 */
export async function processPublishTarget(targetId: string): Promise<void> {
  logger.info({ targetId }, 'Memproses target publikasi...');

  // 1. Ambil target beserta relasi media, akun, dan publikasi
  const [target] = await db
    .select()
    .from(schema.publicationTargets)
    .where(eq(schema.publicationTargets.id, targetId))
    .limit(1);

  if (!target) {
    logger.warn({ targetId }, 'Target publikasi tidak ditemukan di database');
    return;
  }

  // Jika sudah published atau cancelled, jangan proses ulang
  if (target.status === 'published' || target.status === 'cancelled') {
    logger.info({ targetId, status: target.status }, 'Target sudah selesai/dibatalkan, melewati job');
    return;
  }

  const [publication] = await db
    .select()
    .from(schema.publications)
    .where(eq(schema.publications.id, target.publicationId))
    .limit(1);

  if (!target.socialAccountId) {
    logger.error({ targetId }, 'Target tidak memiliki socialAccountId (akun telah diputuskan)');
    await markTargetFailed(
      target.id,
      'ACCOUNT_DISCONNECTED',
      'Akun sosial tujuan publikasi telah diputuskan.'
    );
    return;
  }

  const [socialAccount] = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, target.socialAccountId))
    .limit(1);

  const [media] = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, publication.mediaAssetId))
    .limit(1);

  if (!media || !socialAccount || !publication) {
    logger.error(
      { targetId, hasMedia: !!media, hasAccount: !!socialAccount },
      'Data dependensi target tidak lengkap'
    );
    await markTargetFailed(
      target.id,
      'DEPENDENCY_MISSING',
      'Media atau Akun Sosial tujuan tidak ditemukan.'
    );
    return;
  }

  // Ambil thumbnail opsional jika ada
  let thumbnailMedia: (typeof schema.mediaAssets.$inferSelect) | undefined;
  if (target.thumbnailMediaAssetId) {
    const [thumb] = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, target.thumbnailMediaAssetId))
      .limit(1);
    thumbnailMedia = thumb;
  }

  // 2. Periksa Kuota Harian (khusus YouTube 10.000 unit limit)
  if (target.platform === 'youtube' && !env.ENABLE_MOCK_ADAPTER) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [quota] = await db
      .select()
      .from(schema.dailyQuotas)
      .where(
        and(
          eq(schema.dailyQuotas.date, todayStr),
          eq(schema.dailyQuotas.platform, 'youtube')
        )
      )
      .limit(1);

    if (quota && quota.quotaUsed >= 9600) {
      logger.warn(
        { todayStr, quotaUsed: quota.quotaUsed },
        'Batas kuota harian YouTube mendekati limit (maks 6 video/hari)'
      );
      await markTargetFailed(
        target.id,
        'YOUTUBE_DAILY_QUOTA_REACHED',
        'Batas upload 6 video/hari untuk akun developer YouTube telah tercapai. Video dijadwalkan ulang besok.'
      );
      return;
    }
  }

  // 3. Dekripsi kredensial token
  let accessToken = '';
  let refreshToken: string | undefined;
  try {
    accessToken = decryptToken(socialAccount.accessTokenCiphertext);
    if (socialAccount.refreshTokenCiphertext) {
      refreshToken = decryptToken(socialAccount.refreshTokenCiphertext);
    }
  } catch (decErr) {
    logger.error({ decErr, accountId: socialAccount.id }, 'Gagal mendekripsi token akun');
    await markTargetFailed(
      target.id,
      'TOKEN_DECRYPTION_FAILED',
      'Kredensial akun tidak dapat didekripsi.'
    );
    return;
  }

  // 4. Update status target menjadi 'preparing'
  await updateTargetStatus(target.id, 'preparing', 'Mempersiapkan media dan adapter...');

  // 5. Pilih Adapter Platform
  let platformKey = target.platform as Platform;
  if (target.platform === 'mock') {
    platformKey = 'mock';
  } else if (target.platform === 'tiktok') {
    platformKey = 'tiktok';
  } else if (target.platform === 'youtube') {
    if (env.ENABLE_MOCK_ADAPTER && !accessToken.startsWith('ya29.')) {
      platformKey = 'mock';
    } else if (
      !env.ENABLE_MOCK_ADAPTER &&
      !accessToken.startsWith('ya29.') &&
      !refreshToken
    ) {
      await markTargetFailed(
        target.id,
        'MOCK_ACCOUNT_USED',
        `Akun '${socialAccount.displayName}' adalah akun simulasi (Dev Mode). Karena ENABLE_MOCK_ADAPTER=false di .env, Anda harus menghubungkan channel YouTube asli Anda melalui Google OAuth di tab 'Akun Terhubung'.`
      );
      return;
    }
  }

  const adapter = registry.get(platformKey);

  const publishContext: PublishContext = {
    targetId: target.id,
    publicationId: publication.id,
    accountId: socialAccount.id,
    platform: platformKey,
    media: {
      id: media.id,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      originalFilename: media.originalFilename,
    },
    thumbnailMedia: thumbnailMedia
      ? {
          id: thumbnailMedia.id,
          storageKey: thumbnailMedia.storageKey,
          mimeType: thumbnailMedia.mimeType,
        }
      : undefined,
    metadata: {
      caption: target.caption || undefined,
      title: target.title || media.originalFilename,
      visibility: target.visibility || 'public',
    },
    credentials: {
      accessToken,
      refreshToken,
      providerAccountId: socialAccount.providerAccountId,
    },
    idempotencyKey: `${publication.id}_${target.id}`,
  };

  try {
    // Validasi adapter
    await adapter.validate(publishContext);

    // Update status target menjadi 'uploading'
    await updateTargetStatus(target.id, 'uploading', 'Mengirim media ke platform...');

    // Jalankan publikasi
    const outcome = await adapter.publish(publishContext);

    if (outcome.status === 'published') {
      await db
        .update(schema.publicationTargets)
        .set({
          status: 'published',
          externalPostId: outcome.externalPostId,
          externalPostUrl: outcome.externalPostUrl,
          publishedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.publicationTargets.id, target.id));

      await createEvent(target.id, 'PUBLISHED', 'uploading', 'published', {
        externalPostId: outcome.externalPostId,
        externalPostUrl: outcome.externalPostUrl,
      });

      // Update kuota harian jika YouTube
      if (target.platform === 'youtube') {
        const todayStr = new Date().toISOString().split('T')[0];
        const [existing] = await db
          .select()
          .from(schema.dailyQuotas)
          .where(
            and(
              eq(schema.dailyQuotas.date, todayStr),
              eq(schema.dailyQuotas.platform, 'youtube')
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(schema.dailyQuotas)
            .set({ quotaUsed: existing.quotaUsed + 1600, updatedAt: new Date() })
            .where(eq(schema.dailyQuotas.id, existing.id));
        } else {
          await db.insert(schema.dailyQuotas).values({
            date: todayStr,
            platform: 'youtube',
            quotaUsed: 1600,
          });
        }
      }

      sseHub.broadcast({
        publicationId: publication.id,
        targetId: target.id,
        platform: target.platform,
        status: 'published',
        timestamp: new Date().toISOString(),
        details: {
          url: outcome.externalPostUrl,
        },
      });
    } else {
      await markTargetFailed(
        target.id,
        outcome.errorCode || 'PUBLISH_FAILED',
        outcome.errorMessage || 'Publikasi gagal diproses oleh platform.'
      );
    }
  } catch (error: any) {
    logger.error({ err: error, targetId: target.id }, 'Exception saat mempublikasikan target');
    await markTargetFailed(
      target.id,
      'RUNTIME_ERROR',
      error.message || 'Terjadi kesalahan sistem internal saat publikasi.'
    );
  } finally {
    // Sinkronkan status agregat parent publication
    await syncPublicationAggregateStatus(publication.id);
  }
}

async function updateTargetStatus(
  targetId: string,
  status: string,
  message: string
) {
  await db
    .update(schema.publicationTargets)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.publicationTargets.id, targetId));

  await createEvent(targetId, 'STATUS_CHANGE', null, status, { message });
}

async function markTargetFailed(
  targetId: string,
  errorCode: string,
  errorMessage: string
) {
  await db
    .update(schema.publicationTargets)
    .set({
      status: 'failed',
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(schema.publicationTargets.id, targetId));

  await createEvent(targetId, 'FAILED', null, 'failed', {
    errorCode,
    errorMessage,
  });

  const [t] = await db
    .select()
    .from(schema.publicationTargets)
    .where(eq(schema.publicationTargets.id, targetId))
    .limit(1);

  if (t) {
    sseHub.broadcast({
      publicationId: t.publicationId,
      targetId: t.id,
      platform: t.platform,
      status: 'failed',
      timestamp: new Date().toISOString(),
      message: errorMessage,
      details: { errorCode },
    });
  }
}

async function createEvent(
  targetId: string,
  eventType: string,
  fromStatus: string | null,
  toStatus: string,
  metadata?: any
) {
  await db.insert(schema.publicationEvents).values({
    publicationTargetId: targetId,
    eventType,
    fromStatus,
    toStatus,
    metadata,
  });
}

/**
 * Menghitung ulang status keseluruhan parent publication berdasarkan seluruh targetnya
 */
async function syncPublicationAggregateStatus(publicationId: string) {
  const targets = await db
    .select()
    .from(schema.publicationTargets)
    .where(eq(schema.publicationTargets.publicationId, publicationId));

  if (targets.length === 0) return;

  const total = targets.length;
  const publishedCount = targets.filter((t) => t.status === 'published').length;
  const failedCount = targets.filter(
    (t) => t.status === 'failed' || t.status === 'reauthorization_required'
  ).length;

  let newStatus = 'processing';
  if (publishedCount === total) {
    newStatus = 'succeeded';
  } else if (failedCount === total) {
    newStatus = 'failed';
  } else if (publishedCount > 0 && publishedCount + failedCount === total) {
    newStatus = 'partially_succeeded';
  }

  await db
    .update(schema.publications)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(schema.publications.id, publicationId));

  logger.info({ publicationId, newStatus }, 'Status agregat publikasi diperbarui');
}
