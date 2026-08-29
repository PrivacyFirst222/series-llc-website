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
      // Names carry a timestamp, so no write can ever replace an earlier
      // backup — a later degraded snapshot silently overwrote the day's good
      // one under the date-only scheme (that is exactly how local test dumps
      // destroyed the production backups in P48; Codex OPS-001).
      allowOverwrite: false,
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
    // Paginate to completion: backups are kept forever (Adam's ruling), and a
    // single page holds 1,000 — the old limit:100 with no cursor meant the
    // admin panel and its download route could see at most 100 backups ever,
    // silently orphaning the rest (Codex BAK-002).
    const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix: PREFIX, limit: 1000, cursor });
      blobs.push(...res.blobs);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return blobs
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


/** Backups are never pruned — Adam's ruling, 29 Aug 2026: at ~17 KB per
 *  nightly dump, years of them cost pennies, and a deleted backup is the one
 *  you needed. The admin panel shows the newest dump's date so a stall is
 *  visible. */

export async function runDbBackup(): Promise<{
  key: string;
  sizeBytes: number;
  rowCounts: Record<string, number>;
}> {
  const db = await getDb();
  // ONE statement reads every table, so the whole dump is a single database
  // instant. The per-table loop it replaces could capture each table at a
  // different moment — an order without the document written between reads —
  // and the Neon HTTP driver offers no multi-statement transaction to wrap
  // them, but per-statement atomicity is exactly enough (Codex BAK-001).
  // Table names come from the constant list above, never from input.
  const selects = BACKUP_TABLES.map(
    (t) => `'${t}', (SELECT coalesce(json_agg(x), '[]'::json) FROM ${t} x)`,
  ).join(", ");
  const snap = await db.query<{ dump: Record<string, unknown[]> }>(
    `SELECT json_build_object(${selects}) AS dump`,
  );
  const tables = snap[0].dump;
  const rowCounts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) rowCounts[t] = (tables[t] ?? []).length;
  const dump = {
    version: 1,
    dumpedAt: new Date().toISOString(),
    tables,
  };
  // Timestamped, immutable: db-YYYY-MM-DD-HHMMSS.json.gz.
  const iso = dump.dumpedAt;
  const name = `db-${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}.json.gz`;
  const data = gzipSync(Buffer.from(JSON.stringify(dump)));
  await putBackup(name, data);
  return { key: name, sizeBytes: data.byteLength, rowCounts };
}
