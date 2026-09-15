import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * AES-256-GCM encryption for sensitive at-rest fields (Aadhaar, PAN, bank
 * account numbers). Output format: base64(iv).base64(authTag).base64(ciphertext)
 * so it round-trips through a single text column.
 *
 * The key comes from ENCRYPTION_KEY (hex or base64, 32 bytes). Fails loudly if
 * encryption is attempted without a configured key so we never silently store
 * plaintext PII.
 */

let cachedKey;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = config.encryptionKey;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not configured — cannot encrypt sensitive data');
  }
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex');
  else buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (256-bit) — use `openssl rand -hex 32`');
  }
  cachedKey = buf;
  return cachedKey;
}

export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decrypt(payload) {
  if (payload === null || payload === undefined || payload === '') return payload;
  const key = getKey();
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Masks a value for safe display, keeping only the last `visible` characters.
 * e.g. maskTail('123456789012', 4) -> '********9012'
 */
export function maskTail(value, visible = 4) {
  if (!value) return value;
  const str = String(value);
  if (str.length <= visible) return str;
  return '*'.repeat(str.length - visible) + str.slice(-visible);
}
