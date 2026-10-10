import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
}

/**
 * Mendapatkan 32-byte Buffer key dari string konfigurasi
 */
function getKeyBuffer(): Buffer {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Enkripsi plaintext menggunakan AES-256-GCM
 */
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();
  const version = env.TOKEN_ENCRYPTION_KEY_VERSION;

  // Format penyimpanan terpadu: v1:iv:tag:ciphertext
  return `v${version}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Dekripsi ciphertext terenkripsi menggunakan AES-256-GCM
 */
export function decryptToken(encryptedString: string): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 4) {
    throw new Error('Format token terenkripsi tidak valid.');
  }

  const [versionStr, ivHex, tagHex, ciphertextHex] = parts;
  const version = parseInt(versionStr.replace('v', ''), 10);

  // Jika diperlukan rotasi key di masa depan, gunakan version untuk memilih key yang sesuai
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
