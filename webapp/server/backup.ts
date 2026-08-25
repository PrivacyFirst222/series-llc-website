import { gzipSync } from "node:zlib";
import { env } from "./env";
import { getDb } from "./db";

/**
 * Nightly logical backup of the tables that cannot be rebuilt from anywhere
 * else, stored as gzipped JSON in PRIVATE Vercel Blob storage (a different
 * company than the database, so a Neon-side disaster does not take the copy
 * with it). Deliberately excluded:
 *   - fl_entities        — 4.7M rows, fully reloadable from the state's files
 *   - sessions           — ephemeral sign-ins; a restore should not revive them
 *   - auth_tokens        — one-time secrets; same
 * The taxpayer-number ciphertext in service_orders is backed up exactly as
 * stored — encrypted; the key lives only in the server's environment.
 * Restore: scripts/db-restore.ts (see docs/db-restore.md).
 */
export const BACKUP_TABLES = [
  "clients",
  "orders",
  "service_orders",
  "documents",
  "oa_profiles",
  "oa_generations",
  "library_documents",
  "webhook_events",
  "fl_sync_state",
] as const;

const PREFIX = "backups/";

export interface BackupInfo {
  key: string;
  storageKey: string;
  sizeBytes: number;
  uploadedAt: string;
}

async function putBackup(name: string, data: Buffer): Promise<string> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${PREFIX}${name}`, data, {
      access: "private",
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: true, // rerunning a day's backup replaces it
    });
    return blob.url;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../.dev-data/blob/backups/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(dir + name, data);
  return `dev:backups/${name}`;
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: PREFIX, limit: 100 });
    return res.blobs
      .map((b) => ({
        key: b.pathname.slice(PREFIX.length),
        storageKey: b.url,
        sizeBytes: b.size,
        uploadedAt: new Date(b.uploadedAt).toISOString(),
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }
  const { readdir, stat } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../.dev-data/blob/backups/", import.meta.url));
  try {
    const names = await readdir(dir);
    const out: BackupInfo[] = [];
    for (const n of names) {
      const s = await stat(dir + n);
      out.push({
        key: n,
        storageKey: `dev:backups/${n}`,
        sizeBytes: s.size,
        uploadedAt: s.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => (a.key < b.key ? 1 : -1));
  } catch {
    return [];
  }
}

async function deleteBackup(b: BackupInfo): Promise<void> {
  try {
    if (b.storageKey.startsWith("dev:")) {
      const { unlink } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const dir = fileURLToPath(new URL("../.dev-data/blob/backups/", import.meta.url));
      await unlink(dir + b.key);
      return;
    }
    const { del } = await import("@vercel/blob");
    await del(b.storageKey);
  } catch (e) {
    console.error("[backup] prune failed:", e);
  }
}

/** Keep the newest `keep` dumps; a backup that silently grows forever is a
 *  bill, and one that silently stops is a disaster — the admin panel shows
 *  the newest dump's date so a stall is visible. */
export const BACKUP_KEEP = 30;

export async function runDbBackup(): Promise<{
  key: string;
  sizeBytes: number;
  rowCounts: Record<string, number>;
}> {
  const db = await getDb();
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    // Table names come from the constant list above, never from input.
    const rows = await db.query(`SELECT * FROM ${t}`);
    tables[t] = rows;
    rowCounts[t] = rows.length;
  }
  const dump = {
    version: 1,
    dumpedAt: new Date().toISOString(),
    tables,
  };
  const name = `db-${new Date().toISOString().slice(0, 10)}.json.gz`;
  const data = gzipSync(Buffer.from(JSON.stringify(dump)));
  await putBackup(name, data);

  const all = await listBackups();
  for (const old of all.slice(BACKUP_KEEP)) await deleteBackup(old);

  return { key: name, sizeBytes: data.byteLength, rowCounts };
}
