import { createMiddleware } from 'hono/factory';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import type { AppVariables } from '../../lib/types.js';

export const authMiddleware = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const requestId = c.get('requestId') || 'req_unknown';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Header Authorization dengan Bearer token wajib disertakan.',
            requestId,
          },
        },
        401
      );
    }

    const token = authHeader.substring(7).trim();

    // 1. Cek apakah token cocok dengan API_SECRET_TOKEN dev
    if (token === env.API_SECRET_TOKEN) {
      const defaultUser = await db.select().from(schema.users).limit(1);
      if (defaultUser.length > 0) {
        c.set('user', {
          id: defaultUser[0].id,
          email: defaultUser[0].email,
          name: defaultUser[0].name,
        });
        return next();
      }
    }

    // 2. Cek token hash di tabel api_tokens
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const foundTokens = await db
      .select({
        tokenId: schema.apiTokens.id,
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.apiTokens)
      .innerJoin(schema.users, eq(schema.apiTokens.userId, schema.users.id))
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .limit(1);

    if (foundTokens.length === 0) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token otentikasi tidak valid atau telah dicabut.',
            requestId,
          },
        },
        401
      );
    }

    const matched = foundTokens[0];
    // Update last_used_at secara background
    db.update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, matched.tokenId))
      .catch(() => {});

    c.set('user', {
      id: matched.userId,
      email: matched.email,
      name: matched.name,
    });

    return next();
  }
);
