import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import crypto from 'crypto';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';
import { logger } from '../observability/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool background error');
});

export const db = drizzle(pool, { schema });

/**
 * Memastikan user default dan API Token awal tersedia di database untuk dev/MVP
 */
export async function ensureDefaultUserAndToken() {
  try {
    const existingUsers = await db.select().from(schema.users).limit(1);
    let userId: string;

    if (existingUsers.length === 0) {
      const [newUser] = await db
        .insert(schema.users)
        .values({
          email: 'admin@social-pro.local',
          name: 'Default Admin',
        })
        .returning();
      userId = newUser.id;
      logger.info({ userId }, 'Default user dibuat: admin@social-pro.local');
    } else {
      userId = existingUsers[0].id;
    }

    // Hash dari API_SECRET_TOKEN
    const tokenHash = crypto
      .createHash('sha256')
      .update(env.API_SECRET_TOKEN)
      .digest('hex');

    const existingToken = await db
      .select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .limit(1);

    if (existingToken.length === 0) {
      await db.insert(schema.apiTokens).values({
        userId,
        tokenHash,
        name: 'Default Dev API Token',
      });
      logger.info('Default API Token dev berhasil disiapkan');
    }

    return userId;
  } catch (error) {
    logger.error({ error }, 'Gagal menginisialisasi default user / token');
    throw error;
  }
}
