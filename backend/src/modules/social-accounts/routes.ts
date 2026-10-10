import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { encryptToken, decryptToken } from '../../security/crypto.js';
import { env } from '../../config/env.js';
import { registry } from '../../providers/registry.js';
import type { AppVariables } from '../../lib/types.js';

export const socialAccountsRouter = new Hono<{ Variables: AppVariables }>();

// 1. Ambil daftar akun sosial yang terhubung
socialAccountsRouter.get('/', async (c) => {
  const user = c.get('user');

  const accounts = await db
    .select({
      id: schema.socialAccounts.id,
      platform: schema.socialAccounts.platform,
      displayName: schema.socialAccounts.displayName,
      externalAccountId: schema.socialAccounts.providerAccountId,
      status: schema.socialAccounts.connectionStatus,
      scopes: schema.socialAccounts.scopes,
      createdAt: schema.socialAccounts.createdAt,
    })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.userId, user.id));

  const data = accounts.map((acc) => {
    let capabilities = {
      videoUpload: true,
      scheduledPublishing: true,
      customThumbnail: true,
    };
    if (registry.has(acc.platform as any)) {
      const adapter = registry.get(acc.platform as any);
      capabilities = {
        videoUpload: true,
        scheduledPublishing: adapter.capabilities.supportsScheduledPublish,
        customThumbnail: adapter.capabilities.supportsThumbnail,
      };
    }

    return {
      id: acc.id,
      platform: acc.platform,
      displayName: acc.displayName,
      externalAccountId: acc.externalAccountId,
      status: acc.status,
      capabilities,
      createdAt: acc.createdAt.toISOString(),
    };
  });

  return c.json({ data, nextCursor: null });
});

// 2. Inisialisasi OAuth Connect
socialAccountsRouter.post('/:platform/connect', async (c) => {
  const user = c.get('user');
  const platform = c.req.param('platform');
  const requestId = c.get('requestId');

  if (platform === 'youtube') {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
      // Jika credentials Google belum diisi di .env, kita sediakan opsi Mock Connect untuk kemudahan dev
      return c.json(
        {
          error: {
            code: 'OAUTH_NOT_CONFIGURED',
            message:
              'YOUTUBE_CLIENT_ID / SECRET belum dikonfigurasi di .env. Anda dapat menggunakan tombol "Connect Mock Account" untuk pengujian lokal.',
            requestId,
          },
        },
        400
      );
    }

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' ');

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(env.YOUTUBE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(env.YOUTUBE_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&state=${state}` +
      `&prompt=consent`;

    return c.json({
      authorizationUrl: authUrl,
      state,
    });
  }

  // Jika platform lain atau mock
  return c.json(
    {
      error: {
        code: 'PLATFORM_NOT_SUPPORTED',
        message: `Platform '${platform}' belum mendukung alur OAuth otomatis saat ini.`,
        requestId,
      },
    },
    400
  );
});

// 3. Connect Mock Social Account (Sangat membantu untuk pengembangan cepat dan demo lokal)
socialAccountsRouter.post('/mock-connect', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    displayName?: string;
    platform?: 'youtube' | 'mock';
  };

  const platform = body.platform || 'youtube';
  const displayName = body.displayName || `My Channel (${platform.toUpperCase()})`;
  const providerAccountId = `acc_${Date.now()}`;

  const encryptedAccessToken = encryptToken(`mock_token_${Date.now()}`);
  const encryptedRefreshToken = encryptToken(`mock_refresh_${Date.now()}`);

  const [account] = await db
    .insert(schema.socialAccounts)
    .values({
      userId: user.id,
      platform,
      providerAccountId,
      displayName,
      accessTokenCiphertext: encryptedAccessToken,
      refreshTokenCiphertext: encryptedRefreshToken,
      connectionStatus: 'connected',
      scopes: ['upload', 'manage'],
      lastVerifiedAt: new Date(),
    })
    .returning();

  return c.json(
    {
      message: 'Akun sosial (Dev/Simulasi) berhasil dihubungkan!',
      account: {
        id: account.id,
        platform: account.platform,
        displayName: account.displayName,
        status: account.connectionStatus,
      },
    },
    201
  );
});

// 4. Putus koneksi akun sosial
socialAccountsRouter.delete('/:accountId', async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const requestId = c.get('requestId');

  const [account] = await db
    .select()
    .from(schema.socialAccounts)
    .where(
      and(
        eq(schema.socialAccounts.id, accountId),
        eq(schema.socialAccounts.userId, user.id)
      )
    )
    .limit(1);

  if (!account) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Akun sosial tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  // Cek apakah ada publikasi yang sedang aktif memproses upload menggunakan akun ini
  const [activeTarget] = await db
    .select({ id: schema.publicationTargets.id })
    .from(schema.publicationTargets)
    .where(
      and(
        eq(schema.publicationTargets.socialAccountId, account.id),
        inArray(schema.publicationTargets.status, ['queued', 'preparing', 'uploading'])
      )
    )
    .limit(1);

  if (activeTarget) {
    return c.json(
      {
        error: {
          code: 'ACCOUNT_IN_USE',
          message:
            'Akun sedang digunakan oleh publikasi yang aktif berjalan. Tunggu hingga publikasi selesai atau batalkan terlebih dahulu sebelum memutuskan akun.',
          requestId,
        },
      },
      400
    );
  }

  await db
    .delete(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, account.id));

  return c.body(null, 204);
});
