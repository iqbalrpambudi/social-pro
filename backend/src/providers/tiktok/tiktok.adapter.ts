import type {
  PlatformAdapter,
  PublishContext,
  PublishOutcome,
  PlatformCapabilities,
} from '../contracts.js';
import { generatePresignedDownloadUrl } from '../../storage/s3.js';
import { logger } from '../../observability/logger.js';
import { sseHub } from '../../observability/sse.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { encryptToken } from '../../security/crypto.js';
import { eq } from 'drizzle-orm';

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = 'tiktok' as const;

  readonly capabilities: PlatformCapabilities = {
    supportsScheduledPublish: false,
    supportsResumableUpload: true,
    supportsThumbnail: false,
    supportsVisibility: true,
    maxVideoSizeBytes: 4 * 1024 * 1024 * 1024, // 4 GB max TikTok
    allowedMimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ],
  };

  async validate(ctx: PublishContext): Promise<void> {
    if (!ctx.credentials.accessToken) {
      throw new Error('Access token TikTok tidak ditemukan.');
    }
    if (!ctx.media.storageKey) {
      throw new Error('Storage key media tidak ditemukan.');
    }
    if (!this.capabilities.allowedMimeTypes.includes(ctx.media.mimeType)) {
      throw new Error(`Format video ${ctx.media.mimeType} tidak didukung oleh TikTok. Gunakan MP4, MOV, atau WEBM.`);
    }
  }

  private async refreshTikTokToken(
    refreshToken: string,
    accountId: string
  ): Promise<string | null> {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
      return null;
    }

    try {
      logger.info({ accountId }, 'Mencoba refresh TikTok OAuth access token...');
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
        body: new URLSearchParams({
          client_key: env.TIKTOK_CLIENT_KEY,
          client_secret: env.TIKTOK_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        logger.error({ status: res.status }, 'TikTok token refresh request gagal');
        return null;
      }

      const body: any = await res.json();
      const tokenData = body.data;
      if (!tokenData?.access_token) {
        logger.error({ body }, 'Respon refresh TikTok tidak memiliki access_token');
        return null;
      }

      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || refreshToken;
      const expiresIn = tokenData.expires_in || 86400;

      // Update di database
      const encryptedAccess = encryptToken(newAccessToken);
      const encryptedRefresh = encryptToken(newRefreshToken);

      await db
        .update(schema.socialAccounts)
        .set({
          accessTokenCiphertext: encryptedAccess,
          refreshTokenCiphertext: encryptedRefresh,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, accountId));

      logger.info({ accountId }, 'TikTok access token berhasil diperbarui otomatis!');
      return newAccessToken;
    } catch (err) {
      logger.error({ err }, 'Exception saat refresh TikTok token');
      return null;
    }
  }

  async publish(ctx: PublishContext): Promise<PublishOutcome> {
    logger.info(
      { targetId: ctx.targetId, publicationId: ctx.publicationId },
      'TikTokAdapter: Memulai publikasi video ke TikTok'
    );

    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'uploading',
      timestamp: new Date().toISOString(),
      message: 'Menghubungi TikTok Content Posting API v2...',
    });

    let accessToken = ctx.credentials.accessToken;

    // Mode Mock / Dev: Jika menggunakan akun simulasi atau credentials developer belum diisi
    const isMockAccount = accessToken.startsWith('mock_');
    const isCredentialsMissing = !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET;

    if (isMockAccount || (env.ENABLE_MOCK_ADAPTER && isCredentialsMissing)) {
      logger.info({ targetId: ctx.targetId }, 'TikTokAdapter: Menjalankan simulasi publikasi TikTok (Dev Mode)...');
      
      sseHub.broadcast({
        publicationId: ctx.publicationId,
        targetId: ctx.targetId,
        platform: this.platform,
        status: 'uploading',
        timestamp: new Date().toISOString(),
        message: 'Mengunggah video ke server TikTok Video API...',
      });
      await new Promise((r) => setTimeout(r, 2000));

      sseHub.broadcast({
        publicationId: ctx.publicationId,
        targetId: ctx.targetId,
        platform: this.platform,
        status: 'processing',
        timestamp: new Date().toISOString(),
        message: 'TikTok server sedang memproses dan memvalidasi format video...',
      });
      await new Promise((r) => setTimeout(r, 2000));

      const mockPublishId = `tt_mock_${Date.now()}`;
      const mockPostUrl = `https://www.tiktok.com/@${encodeURIComponent(ctx.credentials.providerAccountId || 'creator')}/video/${Date.now()}`;

      sseHub.broadcast({
        publicationId: ctx.publicationId,
        targetId: ctx.targetId,
        platform: this.platform,
        status: 'published',
        timestamp: new Date().toISOString(),
        message: 'Video berhasil dipublikasikan di akun TikTok!',
      });

      return {
        status: 'published',
        externalPostId: mockPublishId,
        externalPostUrl: mockPostUrl,
      };
    }

    // Alur Nyata ke TikTok Content Posting API v2
    // 1. Mapping Privacy Level
    let privacyLevel = 'PUBLIC_TO_EVERYONE';
    if (ctx.metadata.visibility === 'private') {
      privacyLevel = 'SELF_ONLY';
    } else if (ctx.metadata.visibility === 'unlisted') {
      privacyLevel = 'MUTUAL_FOLLOW_FRIENDS';
    }

    // 2. Judul / Deskripsi TikTok (maksimal 2200 karakter)
    const rawTitle = ctx.metadata.caption || ctx.metadata.title || ctx.media.originalFilename;
    const postTitle = rawTitle.slice(0, 2200);

    const s3DownloadUrl = await generatePresignedDownloadUrl(ctx.media.storageKey, 3600);
    const isLocalUrl = s3DownloadUrl.includes('localhost') || s3DownloadUrl.includes('127.0.0.1');

    const initUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    
    // Siapkan body inisialisasi: FILE_UPLOAD atau PULL_FROM_URL
    let initBody: any;
    if (isLocalUrl) {
      initBody = {
        post_info: {
          title: postTitle,
          privacy_level: privacyLevel,
          disable_duet: ctx.metadata.disableDuet ?? false,
          disable_stitch: ctx.metadata.disableStitch ?? false,
          disable_comment: ctx.metadata.disableComment ?? false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: ctx.media.sizeBytes,
          chunk_size: ctx.media.sizeBytes,
          total_chunk_count: 1,
        },
      };
    } else {
      initBody = {
        post_info: {
          title: postTitle,
          privacy_level: privacyLevel,
          disable_duet: ctx.metadata.disableDuet ?? false,
          disable_stitch: ctx.metadata.disableStitch ?? false,
          disable_comment: ctx.metadata.disableComment ?? false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: s3DownloadUrl,
        },
      };
    }

    let initRes = await fetch(initUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    });

    // Handle token expired (401)
    if (initRes.status === 401 && ctx.credentials.refreshToken) {
      logger.warn('TikTok token 401 expired, mencoba auto-refresh...');
      const freshToken = await this.refreshTikTokToken(
        ctx.credentials.refreshToken,
        ctx.accountId
      );
      if (freshToken) {
        accessToken = freshToken;
        initRes = await fetch(initUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(initBody),
        });
      }
    }

    if (!initRes.ok) {
      const errorText = await initRes.text().catch(() => '');
      logger.error({ status: initRes.status, errorText }, 'TikTok publish initiation gagal');

      if (initRes.status === 401) {
        return {
          status: 'failed',
          errorCode: 'REAUTHORIZATION_REQUIRED',
          errorMessage: 'Token TikTok kadaluarsa atau izin dicabut. Silakan hubungkan kembali akun TikTok.',
        };
      }

      return {
        status: 'failed',
        errorCode: `TIKTOK_HTTP_${initRes.status}`,
        errorMessage: `Gagal inisialisasi posting TikTok: ${initRes.statusText} (${errorText})`,
      };
    }

    const initData: any = await initRes.json();
    if (initData.error && initData.error.code !== 'ok') {
      return {
        status: 'failed',
        errorCode: initData.error.code || 'TIKTOK_API_ERROR',
        errorMessage: initData.error.message || 'Gagal membuat post TikTok dari API.',
      };
    }

    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;

    if (!publishId) {
      throw new Error('TikTok tidak mengembalikan publish_id.');
    }

    // Jika FILE_UPLOAD: kirim buffer video ke upload_url
    if (isLocalUrl && uploadUrl) {
      sseHub.broadcast({
        publicationId: ctx.publicationId,
        targetId: ctx.targetId,
        platform: this.platform,
        status: 'uploading',
        timestamp: new Date().toISOString(),
        message: 'Mengunggah file video langsung ke server TikTok...',
      });

      const videoStreamRes = await fetch(s3DownloadUrl);
      if (!videoStreamRes.ok || !videoStreamRes.body) {
        throw new Error('Gagal mengambil file video dari object storage untuk TikTok.');
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': ctx.media.mimeType,
          'Content-Range': `bytes 0-${ctx.media.sizeBytes - 1}/${ctx.media.sizeBytes}`,
          'Content-Length': String(ctx.media.sizeBytes),
        },
        body: videoStreamRes.body,
        ...({ duplex: 'half' } as any),
      });

      if (!uploadRes.ok) {
        const uploadErrText = await uploadRes.text().catch(() => '');
        logger.error({ status: uploadRes.status, uploadErrText }, 'TikTok chunk upload gagal');
        return {
          status: 'failed',
          errorCode: `TIKTOK_CHUNK_UPLOAD_HTTP_${uploadRes.status}`,
          errorMessage: `Gagal mengunggah file ke server TikTok: ${uploadRes.statusText}`,
        };
      }
    }

    // 3. Polling Status Publish TikTok
    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'processing',
      timestamp: new Date().toISOString(),
      message: 'TikTok sedang memproses dan memvalidasi video...',
    });

    const statusUrl = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
    let finalStatus: 'published' | 'failed' | 'processing' = 'processing';
    let failReason = '';

    // Polling hingga 20 kali (tiap 3 detik = maks 60 detik)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      try {
        const checkRes = await fetch(statusUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ publish_id: publishId }),
        });

        if (checkRes.ok) {
          const checkData: any = await checkRes.json();
          const currentPublishStatus = checkData.data?.status;

          logger.info({ publishId, currentPublishStatus }, 'TikTok status polling...');

          if (currentPublishStatus === 'SUCCESS') {
            finalStatus = 'published';
            break;
          } else if (currentPublishStatus === 'FAILED') {
            finalStatus = 'failed';
            failReason = checkData.data?.fail_reason || 'TikTok menolak publikasi video ini.';
            break;
          }
        }
      } catch (pollErr) {
        logger.warn({ pollErr }, 'Peringatan saat polling status TikTok');
      }
    }

    if (finalStatus === 'failed') {
      return {
        status: 'failed',
        errorCode: 'TIKTOK_PUBLISH_FAILED',
        errorMessage: failReason || 'TikTok gagal memproses video.',
      };
    }

    const postUrl = `https://www.tiktok.com/@${encodeURIComponent(ctx.credentials.providerAccountId || 'creator')}/video/${publishId}`;

    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'published',
      timestamp: new Date().toISOString(),
      message: 'Video berhasil dipublikasikan di TikTok!',
    });

    return {
      status: 'published',
      externalPostId: publishId,
      externalPostUrl: postUrl,
    };
  }
}
