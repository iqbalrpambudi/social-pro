import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  verifyMediaObject,
  deleteMediaObject,
} from '../../storage/s3.js';
import type { AppVariables } from '../../lib/types.js';

export const mediaRouter = new Hono<{ Variables: AppVariables }>();

const createUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),
  sizeBytes: z.number().int().positive().max(env.MAX_UPLOAD_BYTES),
  checksumSha256: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .optional(),
});

// 1. Inisialisasi upload session dan dapatkan presigned URL
mediaRouter.post('/uploads', async (c) => {
  const user = c.get('user');
  const requestId = c.get('requestId');
  const body = await c.req.json().catch(() => null);

  const parsed = createUploadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'Parameter upload media tidak valid.',
          requestId,
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const { fileName, contentType, sizeBytes } = parsed.data;
  const extension = fileName.split('.').pop() || 'bin';
  const storageKey = `media/${user.id}/${Date.now()}_${uuidv4()}.${extension}`;
  const mediaType = contentType.startsWith('image/') ? 'image' : 'video';

  // Simpan record berstatus upload_pending di database
  const [media] = await db
    .insert(schema.mediaAssets)
    .values({
      userId: user.id,
      storageKey,
      originalFilename: fileName,
      mimeType: contentType,
      mediaType,
      sizeBytes,
      status: 'upload_pending',
    })
    .returning();

  // Buat presigned PUT URL
  const upload = await generatePresignedUploadUrl(storageKey, contentType);

  return c.json(
    {
      media: {
        id: media.id,
        status: media.status,
        fileName: media.originalFilename,
        contentType: media.mimeType,
        mediaType: media.mediaType,
        sizeBytes: media.sizeBytes,
        createdAt: media.createdAt.toISOString(),
      },
      upload,
    },
    201
  );
});

// 2. Konfirmasi bahwa upload ke storage telah selesai
mediaRouter.post('/:mediaId/complete', async (c) => {
  const user = c.get('user');
  const requestId = c.get('requestId');
  const mediaId = c.req.param('mediaId');

  const [media] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId),
        eq(schema.mediaAssets.userId, user.id),
        isNull(schema.mediaAssets.deletedAt)
      )
    )
    .limit(1);

  if (!media) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Media tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  // Verifikasi langsung ke S3 storage
  const verification = await verifyMediaObject(media.storageKey);
  if (!verification.exists) {
    return c.json(
      {
        error: {
          code: 'MEDIA_NOT_UPLOADED',
          message: 'Objek belum ditemukan di object storage. Pastikan upload file ke presigned URL telah selesai.',
          requestId,
        },
      },
      409
    );
  }

  // Perbarui status menjadi ready
  const [updated] = await db
    .update(schema.mediaAssets)
    .set({
      status: 'ready',
      sizeBytes: verification.sizeBytes || media.sizeBytes,
    })
    .where(eq(schema.mediaAssets.id, media.id))
    .returning();

  return c.json(
    {
      media: {
        id: updated.id,
        status: updated.status,
        fileName: updated.originalFilename,
        contentType: updated.mimeType,
        sizeBytes: updated.sizeBytes,
      },
    },
    202
  );
});

// 3. Ambil detail media beserta playback/preview URL
mediaRouter.get('/:mediaId', async (c) => {
  const user = c.get('user');
  const requestId = c.get('requestId');
  const mediaId = c.req.param('mediaId');

  const [media] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId),
        eq(schema.mediaAssets.userId, user.id),
        isNull(schema.mediaAssets.deletedAt)
      )
    )
    .limit(1);

  if (!media) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Media tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  let previewUrl: string | null = null;
  if (media.status === 'ready') {
    previewUrl = await generatePresignedDownloadUrl(media.storageKey, 3600);
  }

  return c.json({
    id: media.id,
    status: media.status,
    fileName: media.originalFilename,
    contentType: media.mimeType,
    mediaType: media.mediaType,
    sizeBytes: media.sizeBytes,
    durationMs: media.durationMs,
    width: media.width,
    height: media.height,
    previewUrl,
    createdAt: media.createdAt.toISOString(),
  });
});

// 4. Daftar media milik user
mediaRouter.get('/', async (c) => {
  const user = c.get('user');
  const statusQuery = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const conditions = [
    eq(schema.mediaAssets.userId, user.id),
    isNull(schema.mediaAssets.deletedAt),
  ];

  if (statusQuery) {
    conditions.push(eq(schema.mediaAssets.status, statusQuery));
  }

  const items = await db
    .select()
    .from(schema.mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(schema.mediaAssets.createdAt))
    .limit(limit)
    .offset(offset);

  const data = await Promise.all(
    items.map(async (m) => ({
      id: m.id,
      status: m.status,
      fileName: m.originalFilename,
      contentType: m.mimeType,
      mediaType: m.mediaType,
      sizeBytes: m.sizeBytes,
      previewUrl:
        m.status === 'ready'
          ? await generatePresignedDownloadUrl(m.storageKey, 3600)
          : null,
      createdAt: m.createdAt.toISOString(),
    }))
  );

  return c.json({
    data,
    limit,
    offset,
  });
});

// 5. Hapus media
mediaRouter.delete('/:mediaId', async (c) => {
  const user = c.get('user');
  const requestId = c.get('requestId');
  const mediaId = c.req.param('mediaId');

  const [media] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId),
        eq(schema.mediaAssets.userId, user.id),
        isNull(schema.mediaAssets.deletedAt)
      )
    )
    .limit(1);

  if (!media) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Media tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  // Soft delete di DB dan hapus objek di S3
  await db
    .update(schema.mediaAssets)
    .set({ deletedAt: new Date(), status: 'deleted' })
    .where(eq(schema.mediaAssets.id, media.id));

  await deleteMediaObject(media.storageKey).catch(() => {});

  return c.body(null, 204);
});
