import {ioSignal,checkDeadline,activeDeadline} from './operation-deadline';
import { randomBytes, createHash } from 'node:crypto';
import { env } from './env';
import { seal, unseal, isEncrypted } from './encryption';
import { fileURLToPath } from 'node:url';
import { join, dirname, basename, resolve } from 'node:path';
import { mkdir, writeFile, readFile, unlink, readdir, rename, link } from 'node:fs/promises';
export interface StoredFile { storageKey: string; sizeBytes: number }
const root = () => process.env.DEV_STORAGE_DIR || fileURLToPath(new URL('../.dev-data/blob/', import.meta.url));
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export async function putObject(path: string, bytes: Buffer, overwrite = false): Promise<string> {
  checkDeadline();
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    return (await put(path, bytes, { access: 'private', contentType: 'application/octet-stream', addRandomSuffix: false, allowOverwrite: overwrite, token: env.BLOB_READ_WRITE_TOKEN, ...(Number.isFinite(activeDeadline())?{abortSignal:ioSignal()}: {}) })).url;
  }
  if (env.isProd) throw new Error('BLOB_READ_WRITE_TOKEN is required');
  const localRoot = resolve(root()), p = join(localRoot, path);
  // Scratch is outside the object namespace but on the same filesystem.
  // Readers never observe a file until its complete bytes are closed.
  const scratchDir = join(dirname(localRoot), `.${basename(localRoot)}-pending`);
  await mkdir(dirname(p), { recursive: true });
  await mkdir(scratchDir, { recursive: true });
  const scratch = join(scratchDir, randomBytes(24).toString('hex'));
  try {
    await writeFile(scratch, bytes, { flag: 'wx' });
    checkDeadline();
    if (overwrite) await rename(scratch, p);
    else await link(scratch, p); // EEXIST retains an exclusive winner unchanged.
    return `dev:${path}`;
  } finally {
    try { await unlink(scratch); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
}
export async function readObject(key: string): Promise<Buffer | null> {
  checkDeadline();
  if (key.startsWith('dev:') || !env.BLOB_READ_WRITE_TOKEN) {
    if (env.isProd) throw new Error('Private storage is not configured');
    try { return await readFile(join(root(), key.replace(/^dev:/, ''))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  const { get } = await import('@vercel/blob');
  const r = await get(key, { access: 'private', token: env.BLOB_READ_WRITE_TOKEN, useCache: false, ...(Number.isFinite(activeDeadline())?{abortSignal:ioSignal()}: {}) });
  if (!r) return null;
  if (r.statusCode !== 200) throw new Error(`Storage read returned ${r.statusCode}`);
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}
export async function listObjects(prefix: string): Promise<string[]> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { list } = await import('@vercel/blob'); let cursor: string | undefined; const keys: string[] = [];
    do { const r = await list({ prefix, cursor, token: env.BLOB_READ_WRITE_TOKEN }); keys.push(...r.blobs.map(b => b.url)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
    return keys;
  }
  if (env.isProd) throw new Error('Private storage is not configured');
  try { return (await readdir(join(root(), prefix))).map(n => `dev:${prefix}${n}`); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}
export async function putFile(filename: string, data: ArrayBuffer, _contentType: string, sensitive = false): Promise<StoredFile> {
  const bytes = Buffer.from(data), stored = sensitive ? seal(bytes) : bytes;
  const key = `${randomBytes(12).toString('hex')}-${filename.replace(/[^\w.-]+/g, '_')}${sensitive ? '.encrypted' : ''}`;
  return { storageKey: await putObject(env.BLOB_READ_WRITE_TOKEN ? `docs/${key}` : key, stored), sizeBytes: bytes.length };
}
export async function removeStoredFile(key: string): Promise<void> {
  checkDeadline();
  if (key.startsWith('dev:')) {
    try { await unlink(join(root(), key.slice(4))); } catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } return;
  }
  const { del } = await import('@vercel/blob'); await del(key, { token: env.BLOB_READ_WRITE_TOKEN, ...(Number.isFinite(activeDeadline())?{abortSignal:ioSignal()}: {}) });
}
/** Existing ordinary-document callers retain their best-effort cleanup. Tax
 * document deletion uses removeStoredFile and records/retries every failure. */
export async function deleteFile(key: string): Promise<void> {
  try { await removeStoredFile(key); } catch (e) { console.error('[storage] delete failed:', e); }
}
export const deletionPath = (key: string) => `deletions/${digest(key)}.json`;
export async function storageWasDeleted(key: string): Promise<boolean> { return (await readObject(deletionPath(key))) !== null; }
export async function readStoredFile(key: string): Promise<Buffer> {
  if (await storageWasDeleted(key)) throw new Error('This document has been deleted');
  const data = await readObject(key); if (!data) throw new Error('Stored document is missing');
  if (key.endsWith('.encrypted') && !isEncrypted(data)) throw new Error('Encrypted document envelope is missing');
  return data;
}
export async function readFileStream(key: string): Promise<Buffer> {
  const data = await readStoredFile(key); return isEncrypted(data) ? unseal(data) : data;
}
/** Rotate in place so old database snapshots still refer to the same object. */
export async function replaceStoredFile(key: string, data: Buffer): Promise<void> {
  const path = key.startsWith('dev:') ? key.slice(4) : new URL(key).pathname.slice(1);
  await putObject(path, data, true);
  const got = await readObject(key);
  if (!got?.equals(data)) throw new Error('Stored replacement failed byte verification');
}
