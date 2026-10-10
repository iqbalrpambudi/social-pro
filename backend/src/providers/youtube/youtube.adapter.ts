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

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;

  readonly capabilities: PlatformCapabilities = {
    supportsScheduledPublish: true,
    supportsResumableUpload: true,
    supportsThumbnail: true,
    supportsVisibility: true,
    maxVideoSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB max for YouTube
    allowedMimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-msvideo',
      'video/mpeg',
    ],
  };

  async validate(ctx: PublishContext): Promise<void> {
    if (!ctx.credentials.accessToken) {
      throw new Error('Access token YouTube tidak ditemukan.');
    }
    if (!ctx.media.storageKey) {
      throw new Error('Storage key media tidak ditemukan.');
    }
  }

  private async refreshGoogleToken(
    refreshToken: string,
    accountId: string
  ): Promise<string | null> {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
      return null;
    }

    try {
      logger.info({ accountId }, 'Mencoba refresh Google OAuth access token...');
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.YOUTUBE_CLIENT_ID,
          client_secret: env.YOUTUBE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        logger.error({ status: res.status }, 'Google token refresh request gagal');
        return null;
      }

      const data: any = await res.json();
      const newAccessToken = data.access_token;
      const expiresIn = data.expires_in || 3600;

      // Update di database
      const encrypted = encryptToken(newAccessToken);
      await db
        .update(schema.socialAccounts)
        .set({
          accessTokenCiphertext: encrypted,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, accountId));

      logger.info({ accountId }, 'Google access token berhasil diperbarui otomatis!');
      return newAccessToken;
    } catch (err) {
      logger.error({ err }, 'Exception saat refresh Google token');
      return null;
    }
  }

  async publish(ctx: PublishContext): Promise<PublishOutcome> {
    logger.info(
      { targetId: ctx.targetId, publicationId: ctx.publicationId },
      'YouTubeAdapter: Memulai publikasi video ke YouTube'
    );

    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'uploading',
      timestamp: new Date().toISOString(),
      message: 'Menghubungi YouTube Data API untuk inisialisasi resumable upload...',
    });

    let accessToken = ctx.credentials.accessToken;

    // 1. Inisialisasi Resumable Upload Session ke YouTube
    const metadata = {
      snippet: {
        title: ctx.metadata.title || ctx.media.originalFilename,
        description: ctx.metadata.caption || '',
        tags: ctx.metadata.tags || [],
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: ctx.metadata.visibility || 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    const initUrl =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

    let initRes = await fetch(initUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(ctx.media.sizeBytes),
        'X-Upload-Content-Type': ctx.media.mimeType,
      },
      body: JSON.stringify(metadata),
    });

    // Jika 401 Unauthorized dan kita punya refreshToken, coba refresh dan retry sekali!
    if (initRes.status === 401 && ctx.credentials.refreshToken) {
      logger.warn('Token 401 expired, mencoba auto-refresh...');
      const freshToken = await this.refreshGoogleToken(
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
            'X-Upload-Content-Length': String(ctx.media.sizeBytes),
            'X-Upload-Content-Type': ctx.media.mimeType,
          },
          body: JSON.stringify(metadata),
        });
      }
    }

    if (!initRes.ok) {
      const errorText = await initRes.text().catch(() => '');
      logger.error({ status: initRes.status, errorText }, 'YouTube upload initiation gagal');

      if (initRes.status === 403 && errorText.includes('quotaExceeded')) {
        return {
          status: 'failed',
          errorCode: 'YOUTUBE_QUOTA_EXCEEDED',
          errorMessage: 'Kuota harian YouTube Data API telah habis (10.000 unit limit). Coba lagi besok.',
        };
      }

      if (initRes.status === 401) {
        return {
          status: 'failed',
          errorCode: 'REAUTHORIZATION_REQUIRED',
          errorMessage: 'Token YouTube kadaluarsa atau izin dicabut. Silakan hubungkan kembali akun.',
        };
      }

      return {
        status: 'failed',
        errorCode: `YOUTUBE_HTTP_${initRes.status}`,
        errorMessage: `Gagal inisialisasi upload ke YouTube: ${initRes.statusText}`,
      };
    }

    const uploadLocation = initRes.headers.get('location');
    if (!uploadLocation) {
      throw new Error('YouTube tidak mengembalikan header Location untuk resumable upload.');
    }

    // 2. Unduh stream video dari S3 presigned URL dan kirim ke YouTube
    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'uploading',
      timestamp: new Date().toISOString(),
      message: 'Mengunggah file video ke server YouTube...',
    });

    const s3DownloadUrl = await generatePresignedDownloadUrl(ctx.media.storageKey, 3600);
    const videoStreamRes = await fetch(s3DownloadUrl);

    if (!videoStreamRes.ok || !videoStreamRes.body) {
      throw new Error('Gagal mengambil file video dari object storage untuk diunggah ke YouTube.');
    }

    const uploadRes = await fetch(uploadLocation, {
      method: 'PUT',
      headers: {
        'Content-Type': ctx.media.mimeType,
        'Content-Length': String(ctx.media.sizeBytes),
      },
      body: videoStreamRes.body,
      ...({ duplex: 'half' } as any),
    });

    if (!uploadRes.ok) {
      const uploadErrorText = await uploadRes.text().catch(() => '');
      logger.error({ status: uploadRes.status, uploadErrorText }, 'YouTube video transfer gagal');
      return {
        status: 'failed',
        errorCode: `YOUTUBE_UPLOAD_HTTP_${uploadRes.status}`,
        errorMessage: `Gagal transfer video ke YouTube: ${uploadRes.statusText}`,
      };
    }

    const uploadedData: any = await uploadRes.json();
    const videoId = uploadedData.id;
    const postUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 3. Pasang Thumbnail Kustom jika disediakan
    if (ctx.thumbnailMedia && videoId) {
      try {
        sseHub.broadcast({
          publicationId: ctx.publicationId,
          targetId: ctx.targetId,
          platform: this.platform,
          status: 'publishing',
          timestamp: new Date().toISOString(),
          message: 'Menerapkan custom thumbnail ke YouTube...',
        });

        const thumbUrl = await generatePresignedDownloadUrl(ctx.thumbnailMedia.storageKey, 3600);
        const thumbRes = await fetch(thumbUrl);
        if (thumbRes.ok && thumbRes.body) {
          const thumbUploadUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`;
          await fetch(thumbUploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': ctx.thumbnailMedia.mimeType,
            },
            body: thumbRes.body,
            ...({ duplex: 'half' } as any),
          });
          logger.info({ videoId }, 'Custom thumbnail berhasil dipasang ke YouTube');
        }
      } catch (thumbErr) {
        logger.warn({ err: thumbErr }, 'Peringatan: Gagal memasang custom thumbnail ke YouTube');
      }
    }

    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: this.platform,
      status: 'published',
      timestamp: new Date().toISOString(),
      message: 'Video berhasil dipublikasikan di YouTube!',
    });

    return {
      status: 'published',
      externalPostId: videoId,
      externalPostUrl: postUrl,
    };
  }
}
