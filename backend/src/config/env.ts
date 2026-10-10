import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),

  // S3 / MinIO Object Storage
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('social-uploader'),
  STORAGE_ACCESS_KEY_ID: z.string().default('minioadmin'),
  STORAGE_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
  PRESIGNED_URL_TTL_SECONDS: z.coerce.number().default(900),
  MAX_UPLOAD_BYTES: z.coerce.number().default(1073741824), // 1 GB default

  // Encryption
  TOKEN_ENCRYPTION_KEY: z.string().min(32, 'TOKEN_ENCRYPTION_KEY harus minimal 32 karakter'),
  TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().default(1),

  // Auth Token
  API_SECRET_TOKEN: z.string().default('smu_secret_token_dev_12345'),

  // YouTube OAuth (Opsional untuk dev)
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().default('http://localhost:4000/v1/oauth/youtube/callback'),
  YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().default(10000),

  // Mock Adapter
  ENABLE_MOCK_ADAPTER: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Konfigurasi Environment tidak valid:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
