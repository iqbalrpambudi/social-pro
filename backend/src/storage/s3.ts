import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

export const s3Client = new S3Client({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
});

/**
 * Memastikan bucket storage tersedia pada saat startup
 */
export async function ensureBucketExists(): Promise<void> {
  const bucketName = env.STORAGE_BUCKET;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    logger.info({ bucket: bucketName }, 'Bucket storage siap');
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        logger.info({ bucket: bucketName }, 'Bucket storage berhasil dibuat');
      } catch (createErr) {
        logger.error({ err: createErr, bucket: bucketName }, 'Gagal membuat bucket storage');
        throw createErr;
      }
    } else {
      logger.warn({ err: error, bucket: bucketName }, 'Peringatan saat memeriksa bucket');
    }
  }
}

/**
 * Membuat presigned URL untuk upload langsung dari browser (PUT)
 */
export async function generatePresignedUploadUrl(
  storageKey: string,
  contentType: string
): Promise<{ url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string }> {
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });

  const expiresIn = env.PRESIGNED_URL_TTL_SECONDS;
  const url = await getSignedUrl(s3Client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    url,
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    expiresAt,
  };
}

/**
 * Membuat presigned URL sementara untuk download / streaming / passing ke platform (GET)
 */
export async function generatePresignedDownloadUrl(
  storageKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Verifikasi apakah file benar-benar ada di storage dan dapatkan metadata ukurannya
 */
export async function verifyMediaObject(storageKey: string): Promise<{
  exists: boolean;
  sizeBytes: number;
  contentType?: string;
}> {
  try {
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: storageKey,
      })
    );

    return {
      exists: true,
      sizeBytes: head.ContentLength ?? 0,
      contentType: head.ContentType,
    };
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') {
      return { exists: false, sizeBytes: 0 };
    }
    throw error;
  }
}

/**
 * Menghapus file dari object storage
 */
export async function deleteMediaObject(storageKey: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: storageKey,
      })
    );
    logger.info({ storageKey }, 'File berhasil dihapus dari storage');
  } catch (error) {
    logger.error({ err: error, storageKey }, 'Gagal menghapus file dari storage');
    throw error;
  }
}
