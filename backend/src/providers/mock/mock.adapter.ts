import type {
  PlatformAdapter,
  PublishContext,
  PublishOutcome,
  PlatformCapabilities,
} from '../contracts.js';
import { logger } from '../../observability/logger.js';
import { sseHub } from '../../observability/sse.js';

export class MockPlatformAdapter implements PlatformAdapter {
  readonly platform = 'mock' as const;

  readonly capabilities: PlatformCapabilities = {
    supportsScheduledPublish: true,
    supportsResumableUpload: true,
    supportsThumbnail: true,
    supportsVisibility: true,
    maxVideoSizeBytes: 1024 * 1024 * 1024, // 1 GB
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
  };

  async validate(ctx: PublishContext): Promise<void> {
    if (!ctx.media.storageKey) {
      throw new Error('Mock: Storage key media tidak ditemukan.');
    }
    logger.debug({ targetId: ctx.targetId }, 'MockPlatformAdapter: Validasi lolos');
  }

  async publish(ctx: PublishContext): Promise<PublishOutcome> {
    logger.info(
      {
        targetId: ctx.targetId,
        media: ctx.media.originalFilename,
        title: ctx.metadata.title,
      },
      'MockPlatformAdapter: Memulai simulasi upload video...'
    );

    // Broadcast SSE bahwa upload sedang berjalan
    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: ctx.platform,
      status: 'uploading',
      timestamp: new Date().toISOString(),
      message: 'Mengunggah video ke platform (simulasi)...',
    });

    // Simulasi transfer data
    await new Promise((r) => setTimeout(r, 2000));

    // Broadcast SSE bahwa video sedang diproses oleh platform
    sseHub.broadcast({
      publicationId: ctx.publicationId,
      targetId: ctx.targetId,
      platform: ctx.platform,
      status: 'processing',
      timestamp: new Date().toISOString(),
      message: 'Platform sedang memproses dan memvalidasi video...',
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Jika ada thumbnail, simulasikan pemasangan thumbnail
    if (ctx.thumbnailMedia) {
      sseHub.broadcast({
        publicationId: ctx.publicationId,
        targetId: ctx.targetId,
        platform: ctx.platform,
        status: 'publishing',
        timestamp: new Date().toISOString(),
        message: 'Menerapkan custom thumbnail...',
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    const mockPostId = `mock_${Date.now()}`;
    const mockPostUrl = `https://mock-social.example.com/watch?v=${mockPostId}`;

    logger.info(
      { targetId: ctx.targetId, mockPostUrl },
      'MockPlatformAdapter: Video berhasil dipublikasikan (simulasi)'
    );

    return {
      status: 'published',
      externalPostId: mockPostId,
      externalPostUrl: mockPostUrl,
    };
  }
}
