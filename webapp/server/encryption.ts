/** Authenticated encryption of stored tax documents and transient taxpayer data.
 * Keys are independent of login sessions, versioned, and never written to backups. */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from './env';
const MAGIC = 'FPSLLC-ENC-1\n';
/** Preserve configuration provenance without changing other callers' handling. */
export class EncryptionKeyError extends Error {}
export function encryptionKeys(): { active: string; keys: Record<string, Buffer> } {
 try {
  const active = process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY || 'dev';
  const raw = process.env.DOCUMENT_ENCRYPTION_KEYS;
  if (!raw) {
    if (env.isProd && !env.OFFLINE) throw new Error('Document encryption keys are not configured; refusing plaintext storage.');
    return { active: 'dev', keys: { dev: createHash('sha256').update('offline-document-test-key').digest() } };
  }
  const parsed = JSON.parse(raw) as Record<string, string>, keys: Record<string, Buffer> = Object.create(null);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid encryption key configuration');
  for (const [id, value] of Object.entries(parsed)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof value !== 'string') throw new Error('Invalid encryption key configuration');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== 32) throw new Error('Encryption keys must contain 32 random bytes');
    keys[id] = bytes;
  }
  if (!keys[active]) throw new Error('The active encryption key is missing');
  return { active, keys };
 } catch (error) {
   throw new EncryptionKeyError(error instanceof Error ? error.message : 'Invalid encryption key configuration');
 }
}
export function isEncrypted(data: Buffer): boolean { return data.subarray(0, MAGIC.length).toString() === MAGIC; }
export function encryptedKeyId(data: Buffer): string | null { return isEncrypted(data) ? JSON.parse(data.subarray(MAGIC.length).toString()).key : null; }
export function seal(data: Buffer): Buffer {
  const { active, keys } = encryptionKeys(), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys[active], iv);
  cipher.setAAD(Buffer.from(`${MAGIC}${active}`));
  const bytes = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.from(MAGIC + JSON.stringify({ key: active, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: bytes.toString('base64') }));
}
export function unseal(data: Buffer): Buffer {
  if (!isEncrypted(data)) throw new Error('Expected an encrypted document');
  const p = JSON.parse(data.subarray(MAGIC.length).toString()), { keys } = encryptionKeys();
  if (!keys[p.key]) throw new EncryptionKeyError(`Required encryption key ${p.key} is unavailable`);
  const decipher = createDecipheriv('aes-256-gcm', keys[p.key], Buffer.from(p.iv, 'base64'));
  decipher.setAAD(Buffer.from(`${MAGIC}${p.key}`));
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]);
}
