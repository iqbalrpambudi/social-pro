import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { jobQueue } from '../../jobs/queue.js';
import { sseHub } from '../../observability/sse.js';
import type { AppVariables } from '../../lib/types.js';

export const publicationsRouter = new Hono<{ Variables: AppVariables }>();

const targetInputSchema = z.object({
  socialAccountId: z.string().uuid(),
  caption: z.string().max(5000).optional(),
  title: z.string().max(200).optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  thumbnailMediaId: z.string().uuid().optional(),
});

const createPublicationSchema = z.object({
  mediaId: z.string().uuid(),
  targets: z.array(targetInputSchema).min(1).max(10),
  scheduleAt: z.string().datetime().nullable().optional(),
  clientReference: z.string().max(255).optional(),
});

// 1. Buat Permintaan Publikasi Baru
publicationsRouter.post('/', async (c) => {
  const user = c.get('user');
  const requestId = c.get('requestId');
  const idempotencyKey = c.req.header('Idempotency-Key');
  const body = await c.req.json().catch(() => null);

  const parsed = createPublicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'Payload publikasi tidak valid.',
          requestId,
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const { mediaId, targets, scheduleAt, clientReference } = parsed.data;

  // Cek Idempotency Key jika diberikan
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.userId, user.id),
          eq(schema.publications.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);

    if (existing) {
      const existingTargets = await db
        .select()
        .from(schema.publicationTargets)
        .where(eq(schema.publicationTargets.publicationId, existing.id));

      return c.json(
        {
          id: existing.id,
          status: existing.status,
          mediaId: existing.mediaAssetId,
          scheduleAt: existing.scheduleAt?.toISOString() ?? null,
          targets: existingTargets.map((t) => ({
            id: t.id,
            socialAccountId: t.socialAccountId,
            platform: t.platform,
            status: t.status,
          })),
          createdAt: existing.createdAt.toISOString(),
        },
        200
      );
    }
  }

  // Verifikasi Media Asset siap (status = ready)
  const [media] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId),
        eq(schema.mediaAssets.userId, user.id)
      )
    )
    .limit(1);

  if (!media) {
    return c.json(
      {
        error: {
          code: 'MEDIA_NOT_FOUND',
          message: 'Media video tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  if (media.status !== 'ready') {
    return c.json(
      {
        error: {
          code: 'MEDIA_NOT_READY',
          message: `Media belum siap dipublikasikan (status saat ini: ${media.status}).`,
          requestId,
        },
      },
      409
    );
  }

  // Verifikasi Akun-Akun Sosial Tujuan
  const accountIds = targets.map((t) => t.socialAccountId);
  const userAccounts = await db
    .select()
    .from(schema.socialAccounts)
    .where(
      and(
        eq(schema.socialAccounts.userId, user.id),
        inArray(schema.socialAccounts.id, accountIds)
      )
    );

  const accountMap = new Map(userAccounts.map((a) => [a.id, a]));
  for (const target of targets) {
    const acc = accountMap.get(target.socialAccountId);
    if (!acc) {
      return c.json(
        {
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: `Akun sosial dengan ID ${target.socialAccountId} tidak ditemukan atau bukan milik Anda.`,
            requestId,
          },
        },
        404
      );
    }
  }

  const parsedSchedule = scheduleAt ? new Date(scheduleAt) : null;
  const initialTargetStatus = parsedSchedule && parsedSchedule > new Date() ? 'scheduled' : 'queued';

  // Buat Publication & Targets dalam Transaksi Database
  const result = await db.transaction(async (tx) => {
    const [pub] = await tx
      .insert(schema.publications)
      .values({
        userId: user.id,
        mediaAssetId: media.id,
        idempotencyKey: idempotencyKey || null,
        status: initialTargetStatus,
        scheduleAt: parsedSchedule,
        clientReference: clientReference || null,
      })
      .returning();

    const createdTargets = [];
    for (const target of targets) {
      const acc = accountMap.get(target.socialAccountId)!;
      const [t] = await tx
        .insert(schema.publicationTargets)
        .values({
          publicationId: pub.id,
          userId: user.id,
          socialAccountId: acc.id,
          platform: acc.platform,
          caption: target.caption || null,
          title: target.title || null,
          visibility: target.visibility,
          thumbnailMediaAssetId: target.thumbnailMediaId || null,
          scheduledAt: parsedSchedule,
          status: initialTargetStatus,
        })
        .returning();

      createdTargets.push(t);
    }

    return { publication: pub, targets: createdTargets };
  });

  // Enqueue background jobs untuk setiap target
  for (const t of result.targets) {
    await jobQueue.enqueuePublishTarget(t.id, parsedSchedule);
  }

  sseHub.broadcast({
    publicationId: result.publication.id,
    status: initialTargetStatus,
    timestamp: new Date().toISOString(),
    message: 'Publikasi berhasil dibuat dan masuk antrian.',
  });

  return c.json(
    {
      id: result.publication.id,
      status: result.publication.status,
      mediaId: result.publication.mediaAssetId,
      scheduleAt: result.publication.scheduleAt?.toISOString() ?? null,
      targets: result.targets.map((t) => ({
        id: t.id,
        socialAccountId: t.socialAccountId,
        platform: t.platform,
        status: t.status,
      })),
      createdAt: result.publication.createdAt.toISOString(),
    },
    202
  );
});

// 2. Daftar Publikasi Milik User
publicationsRouter.get('/', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const pubs = await db
    .select({
      id: schema.publications.id,
      status: schema.publications.status,
      mediaId: schema.publications.mediaAssetId,
      scheduleAt: schema.publications.scheduleAt,
      clientReference: schema.publications.clientReference,
      createdAt: schema.publications.createdAt,
      mediaFilename: schema.mediaAssets.originalFilename,
    })
    .from(schema.publications)
    .innerJoin(schema.mediaAssets, eq(schema.publications.mediaAssetId, schema.mediaAssets.id))
    .where(eq(schema.publications.userId, user.id))
    .orderBy(desc(schema.publications.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(schema.publications)
    .where(eq(schema.publications.userId, user.id));
  const total = countResult?.total ?? pubs.length;

  // Ambil target untuk tiap publikasi
  const pubIds = pubs.map((p) => p.id);
  const targets =
    pubIds.length > 0
      ? await db
          .select({
            id: schema.publicationTargets.id,
            publicationId: schema.publicationTargets.publicationId,
            socialAccountId: schema.publicationTargets.socialAccountId,
            platform: schema.publicationTargets.platform,
            title: schema.publicationTargets.title,
            caption: schema.publicationTargets.caption,
            visibility: schema.publicationTargets.visibility,
            status: schema.publicationTargets.status,
            attemptCount: schema.publicationTargets.attemptCount,
            externalPostId: schema.publicationTargets.externalPostId,
            externalPostUrl: schema.publicationTargets.externalPostUrl,
            publishedAt: schema.publicationTargets.publishedAt,
            lastErrorCode: schema.publicationTargets.lastErrorCode,
            lastErrorMessage: schema.publicationTargets.lastErrorMessage,
            error: {
              code: schema.publicationTargets.lastErrorCode,
              message: schema.publicationTargets.lastErrorMessage,
            },
            updatedAt: schema.publicationTargets.updatedAt,
          })
          .from(schema.publicationTargets)
          .where(inArray(schema.publicationTargets.publicationId, pubIds))
      : [];

  const targetsByPub = new Map<string, typeof targets>();
  for (const t of targets) {
    const list = targetsByPub.get(t.publicationId) || [];
    list.push(t);
    targetsByPub.set(t.publicationId, list);
  }

  const data = pubs.map((p) => ({
    id: p.id,
    status: p.status,
    mediaId: p.mediaId,
    mediaFilename: p.mediaFilename,
    scheduleAt: p.scheduleAt?.toISOString() ?? null,
    targets: targetsByPub.get(p.id) || [],
    createdAt: p.createdAt.toISOString(),
  }));

  return c.json({ data, total, limit, offset });
});

// 3. Detail Publikasi Beserta Status Seluruh Target
publicationsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const pubId = c.req.param('id');
  const requestId = c.get('requestId');

  const [pub] = await db
    .select({
      id: schema.publications.id,
      status: schema.publications.status,
      mediaId: schema.publications.mediaAssetId,
      scheduleAt: schema.publications.scheduleAt,
      clientReference: schema.publications.clientReference,
      createdAt: schema.publications.createdAt,
      updatedAt: schema.publications.updatedAt,
      mediaFilename: schema.mediaAssets.originalFilename,
    })
    .from(schema.publications)
    .innerJoin(schema.mediaAssets, eq(schema.publications.mediaAssetId, schema.mediaAssets.id))
    .where(
      and(
        eq(schema.publications.id, pubId),
        eq(schema.publications.userId, user.id)
      )
    )
    .limit(1);

  if (!pub) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Publikasi tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  const targets = await db
    .select({
      id: schema.publicationTargets.id,
      socialAccountId: schema.publicationTargets.socialAccountId,
      platform: schema.publicationTargets.platform,
      caption: schema.publicationTargets.caption,
      title: schema.publicationTargets.title,
      status: schema.publicationTargets.status,
      externalPostId: schema.publicationTargets.externalPostId,
      externalPostUrl: schema.publicationTargets.externalPostUrl,
      publishedAt: schema.publicationTargets.publishedAt,
      error: {
        code: schema.publicationTargets.lastErrorCode,
        message: schema.publicationTargets.lastErrorMessage,
      },
    })
    .from(schema.publicationTargets)
    .where(eq(schema.publicationTargets.publicationId, pub.id));

  return c.json({
    id: pub.id,
    status: pub.status,
    mediaId: pub.mediaId,
    mediaFilename: pub.mediaFilename,
    scheduleAt: pub.scheduleAt?.toISOString() ?? null,
    targets,
    createdAt: pub.createdAt.toISOString(),
    updatedAt: pub.updatedAt.toISOString(),
  });
});

// 4. Retry Target yang Gagal
publicationsRouter.post('/:id/retry', async (c) => {
  const user = c.get('user');
  const pubId = c.req.param('id');
  const requestId = c.get('requestId');

  const [pub] = await db
    .select()
    .from(schema.publications)
    .where(
      and(
        eq(schema.publications.id, pubId),
        eq(schema.publications.userId, user.id)
      )
    )
    .limit(1);

  if (!pub) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Publikasi tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  const failedTargets = await db
    .select()
    .from(schema.publicationTargets)
    .where(
      and(
        eq(schema.publicationTargets.publicationId, pub.id),
        eq(schema.publicationTargets.status, 'failed')
      )
    );

  if (failedTargets.length === 0) {
    return c.json(
      {
        message: 'Tidak ada target gagal yang perlu di-retry.',
      },
      200
    );
  }

  for (const target of failedTargets) {
    await db
      .update(schema.publicationTargets)
      .set({
        status: 'queued',
        attemptCount: target.attemptCount + 1,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.publicationTargets.id, target.id));

    await jobQueue.enqueuePublishTarget(target.id, null);
  }

  await db
    .update(schema.publications)
    .set({ status: 'queued', updatedAt: new Date() })
    .where(eq(schema.publications.id, pub.id));

  return c.json({
    message: `${failedTargets.length} target berhasil di-antrekan ulang.`,
    publicationId: pub.id,
  });
});

// 5. Cek Kuota Harian YouTube Hari Ini
publicationsRouter.get('/quota/today', async (c) => {
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

  const used = quota?.quotaUsed ?? 0;
  const limit = quota?.quotaLimit ?? 10000;
  const remainingUnits = Math.max(0, limit - used);
  const remainingVideos = Math.floor(remainingUnits / 1600);

  return c.json({
    date: todayStr,
    platform: 'youtube',
    quotaUsed: used,
    quotaLimit: limit,
    remainingUnits,
    remainingVideos,
  });
});
