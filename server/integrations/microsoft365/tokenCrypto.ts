import crypto from 'crypto';

/**
 * Sprint 10A — at-rest protection for Microsoft OAuth tokens.
 *
 * AES-256-GCM with a random 96-bit IV per value and the 128-bit auth tag
 * stored alongside. The key comes only from MICROSOFT_TOKEN_ENCRYPTION_KEY;
 * there is deliberately no fallback key, so a missing or malformed key means
 * tokens are never stored.
 */

const FORMAT_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Accepts 64 hex characters or base64/base64url for exactly 32 bytes; anything else is rejected. */
export function parseEncryptionKey(raw: string | undefined | null): Buffer | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(value)) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === KEY_BYTES) return decoded;
  }
  return null;
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Throws when the value was not produced by encryptToken with this key (tampered, wrong key, or wrong format). */
export function decryptToken(encrypted: string, key: Buffer): string {
  const parts = String(encrypted ?? '').split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Stored Microsoft token has an unrecognised format.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
