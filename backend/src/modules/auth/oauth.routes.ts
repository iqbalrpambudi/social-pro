import { Hono } from 'hono';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { encryptToken } from '../../security/crypto.js';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import type { AppVariables } from '../../lib/types.js';

export const oauthRouter = new Hono<{ Variables: AppVariables }>();

// In-memory state store dengan TTL 10 menit
const stateStore = new Map<string, { userId: string; expiresAt: number }>();

function cleanupStates() {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (data.expiresAt < now) {
      stateStore.delete(state);
    }
  }
}

// 1. Mulai OAuth YouTube (Mengembalikan authorization URL)
oauthRouter.get('/youtube/connect', async (c) => {
  cleanupStates();

  const user = c.get('user');
  const requestId = c.get('requestId');

  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    return c.json(
      {
        error: {
          code: 'OAUTH_CREDENTIALS_MISSING',
          message:
            'YOUTUBE_CLIENT_ID atau YOUTUBE_CLIENT_SECRET belum dikonfigurasi di file .env. Silakan tambahkan kredensial dari Google Cloud Console.',
          requestId,
        },
      },
      400
    );
  }

  // Buat state unik terikat dengan userId
  const state = crypto.randomBytes(24).toString('hex');
  stateStore.set(state, {
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 menit
  });

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
    `&prompt=consent` +
    `&state=${state}`;

  return c.json({
    authorizationUrl: authUrl,
    state,
  });
});

// 2. OAuth Callback Endpoint (Dipanggil oleh redirect browser dari Google)
oauthRouter.get('/youtube/callback', async (c) => {
  cleanupStates();

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  const frontendUrl = env.FRONTEND_ORIGIN || 'http://localhost:5173';

  if (error) {
    logger.warn({ error }, 'Google OAuth dibatalkan oleh pengguna atau error');
    return c.redirect(`${frontendUrl}/?oauth_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${frontendUrl}/?oauth_error=missing_code_or_state`);
  }

  const stateData = stateStore.get(state);
  if (!stateData) {
    logger.error({ state }, 'Invalid or expired OAuth state');
    return c.redirect(`${frontendUrl}/?oauth_error=invalid_state`);
  }

  const userId = stateData.userId;
  stateStore.delete(state);

  try {
    // 3. Tukar authorization code dengan access token & refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.YOUTUBE_CLIENT_ID!,
        client_secret: env.YOUTUBE_CLIENT_SECRET!,
        redirect_uri: env.YOUTUBE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error({ status: tokenRes.status, errText }, 'Gagal menukar code dengan token Google');
      return c.redirect(`${frontendUrl}/?oauth_error=token_exchange_failed`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 4. Ambil profil Channel YouTube pengguna
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let channelId = 'unknown_channel';
    let channelTitle = 'YouTube Channel';

    if (channelRes.ok) {
      const channelData: any = await channelRes.json();
      if (channelData.items && channelData.items.length > 0) {
        channelId = channelData.items[0].id;
        channelTitle = channelData.items[0].snippet?.title || 'YouTube Channel';
      }
    } else {
      logger.warn('Tidak dapat mengambil detail channel YouTube, menggunakan default');
    }

    // 5. Enkripsi kredensial token dengan AES-256-GCM
    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    // 6. Simpan atau perbarui di database social_accounts
    const existingAccount = await db
      .select()
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.userId, userId),
          eq(schema.socialAccounts.platform, 'youtube'),
          eq(schema.socialAccounts.providerAccountId, channelId)
        )
      )
      .limit(1);

    if (existingAccount.length > 0) {
      await db
        .update(schema.socialAccounts)
        .set({
          displayName: channelTitle,
          accessTokenCiphertext: encryptedAccessToken,
          refreshTokenCiphertext:
            encryptedRefreshToken || existingAccount[0].refreshTokenCiphertext,
          tokenExpiresAt: expiresAt,
          connectionStatus: 'connected',
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, existingAccount[0].id));
      logger.info({ channelTitle, channelId }, 'Akun YouTube berhasil diperbarui');
    } else {
      await db.insert(schema.socialAccounts).values({
        userId,
        platform: 'youtube',
        providerAccountId: channelId,
        displayName: channelTitle,
        accessTokenCiphertext: encryptedAccessToken,
        refreshTokenCiphertext: encryptedRefreshToken,
        tokenExpiresAt: expiresAt,
        connectionStatus: 'connected',
        scopes: ['youtube.upload', 'youtube.readonly'],
        lastVerifiedAt: new Date(),
      });
      logger.info({ channelTitle, channelId }, 'Akun YouTube asli berhasil terhubung!');
    }

    return c.redirect(
      `${frontendUrl}/?connected=youtube&channel=${encodeURIComponent(channelTitle)}`
    );
  } catch (err: any) {
    logger.error({ err }, 'Exception saat memproses OAuth callback YouTube');
    return c.redirect(
      `${frontendUrl}/?oauth_error=${encodeURIComponent(err.message || 'unknown_error')}`
    );
  }
});

// 3. Mulai OAuth TikTok (Mengembalikan authorization URL)
oauthRouter.get('/tiktok/connect', async (c) => {
  cleanupStates();

  const user = c.get('user');
  const requestId = c.get('requestId');

  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    return c.json(
      {
        error: {
          code: 'OAUTH_CREDENTIALS_MISSING',
          message:
            'TIKTOK_CLIENT_KEY atau TIKTOK_CLIENT_SECRET belum dikonfigurasi di file .env. Silakan buat App di TikTok for Developers (developers.tiktok.com) dan masukkan Client Key & Secret.',
          requestId,
        },
      },
      400
    );
  }

  // Buat state unik terikat dengan userId
  const state = crypto.randomBytes(24).toString('hex');
  stateStore.set(state, {
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 menit
  });

  const scopes = 'user.info.basic,video.upload,video.publish';

  const authUrl =
    `https://www.tiktok.com/v2/auth/authorize/?` +
    `client_key=${encodeURIComponent(env.TIKTOK_CLIENT_KEY)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(env.TIKTOK_REDIRECT_URI)}` +
    `&state=${state}`;

  return c.json({
    authorizationUrl: authUrl,
    state,
  });
});

// 4. OAuth Callback Endpoint TikTok
oauthRouter.get('/tiktok/callback', async (c) => {
  cleanupStates();

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error') || c.req.query('error_description');

  const frontendUrl = env.FRONTEND_ORIGIN || 'http://localhost:5173';

  if (error) {
    logger.warn({ error }, 'TikTok OAuth dibatalkan oleh pengguna atau error');
    return c.redirect(`${frontendUrl}/?oauth_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${frontendUrl}/?oauth_error=missing_code_or_state`);
  }

  const stateData = stateStore.get(state);
  if (!stateData) {
    logger.error({ state }, 'Invalid or expired TikTok OAuth state');
    return c.redirect(`${frontendUrl}/?oauth_error=invalid_state`);
  }

  const userId = stateData.userId;
  stateStore.delete(state);

  try {
    // Tukar authorization code dengan access token & refresh token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY!,
        client_secret: env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: env.TIKTOK_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error({ status: tokenRes.status, errText }, 'Gagal menukar code dengan token TikTok');
      return c.redirect(`${frontendUrl}/?oauth_error=token_exchange_failed`);
    }

    const tokenData: any = await tokenRes.json();
    const tokenInfo = tokenData.data;

    if (!tokenInfo?.access_token) {
      logger.error({ tokenData }, 'TikTok response missing access_token');
      return c.redirect(`${frontendUrl}/?oauth_error=invalid_token_payload`);
    }

    const accessToken = tokenInfo.access_token;
    const refreshToken = tokenInfo.refresh_token;
    const openId = tokenInfo.open_id;
    const expiresIn = tokenInfo.expires_in || 86400;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Ambil profil TikTok Creator
    let displayName = `TikTok Creator (${openId.slice(-6)})`;
    try {
      const userRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (userRes.ok) {
        const userData: any = await userRes.json();
        if (userData.data?.user?.display_name) {
          displayName = userData.data.user.display_name;
        }
      }
    } catch (uErr) {
      logger.warn({ uErr }, 'Peringatan saat mengambil user info TikTok');
    }

    // Enkripsi token
    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    // Simpan atau perbarui di database social_accounts
    const existingAccount = await db
      .select()
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.userId, userId),
          eq(schema.socialAccounts.platform, 'tiktok'),
          eq(schema.socialAccounts.providerAccountId, openId)
        )
      )
      .limit(1);

    if (existingAccount.length > 0) {
      await db
        .update(schema.socialAccounts)
        .set({
          displayName,
          accessTokenCiphertext: encryptedAccessToken,
          refreshTokenCiphertext:
            encryptedRefreshToken || existingAccount[0].refreshTokenCiphertext,
          tokenExpiresAt: expiresAt,
          connectionStatus: 'connected',
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, existingAccount[0].id));
      logger.info({ displayName, openId }, 'Akun TikTok berhasil diperbarui');
    } else {
      await db.insert(schema.socialAccounts).values({
        userId,
        platform: 'tiktok',
        providerAccountId: openId,
        displayName,
        accessTokenCiphertext: encryptedAccessToken,
        refreshTokenCiphertext: encryptedRefreshToken,
        tokenExpiresAt: expiresAt,
        connectionStatus: 'connected',
        scopes: ['user.info.basic', 'video.upload', 'video.publish'],
        lastVerifiedAt: new Date(),
      });
      logger.info({ displayName, openId }, 'Akun TikTok asli berhasil terhubung!');
    }

    return c.redirect(
      `${frontendUrl}/?connected=tiktok&channel=${encodeURIComponent(displayName)}`
    );
  } catch (err: any) {
    logger.error({ err }, 'Exception saat memproses OAuth callback TikTok');
    return c.redirect(
      `${frontendUrl}/?oauth_error=${encodeURIComponent(err.message || 'unknown_error')}`
    );
  }
});
