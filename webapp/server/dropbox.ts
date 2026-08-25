import { env } from "./env";
import { getDb } from "./db";
import { readFileStream } from "./storage";

/**
 * Nightly mirror of client files into Adam's Dropbox (app-folder scoped: the
 * token can reach ONE dedicated folder, nothing else in the account). This is
 * the offsite copy of the uploaded documents that otherwise exist only in
 * Vercel Blob. Copies are only ever added or overwritten — a deletion on the
 * live site never propagates; that is what makes it a backup.
 *
 * Dev (no Dropbox credentials): mirrors into .dev-data/dropbox-mirror/ so the
 * sweep, incremental marking, and admin surface are all testable.
 */

const configured = () =>
  Boolean(env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET && env.DROPBOX_REFRESH_TOKEN);

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.DROPBOX_REFRESH_TOKEN,
      client_id: env.DROPBOX_APP_KEY,
      client_secret: env.DROPBOX_APP_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

const safePathPart = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "unnamed";

async function uploadToDropbox(path: string, data: Buffer): Promise<void> {
  const token = await accessToken();
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }),
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}): ${await res.text()}`);
}

async function uploadDev(path: string, data: Buffer): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");
  const root = fileURLToPath(new URL("../.dev-data/dropbox-mirror", import.meta.url));
  await mkdir(dirname(root + path), { recursive: true });
  await writeFile(root + path, data);
}

async function streamToBuffer(body: ReadableStream | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export interface MirrorStatus {
  configured: boolean;
  mirrored: number;
  pending: number;
  lastMirroredAt: string | null;
}

export async function mirrorStatus(): Promise<MirrorStatus> {
  const db = await getDb();
  const rows = await db.query<{ mirrored: string; pending: string; last: string | null }>(
    `SELECT
       count(*) FILTER (WHERE mirrored_at IS NOT NULL) AS mirrored,
       count(*) FILTER (WHERE mirrored_at IS NULL) AS pending,
       max(mirrored_at)::text AS last
     FROM documents`,
  );
  return {
    configured: configured(),
    mirrored: Number(rows[0]?.mirrored ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    lastMirroredAt: rows[0]?.last ?? null,
  };
}

/** Copies every not-yet-mirrored document. One failure doesn't strand the
 *  rest — errors are counted and the document stays pending for the next
 *  sweep. */
export async function runFileMirror(): Promise<{ mirrored: number; failed: number; skipped: boolean }> {
  const db = await getDb();
  const useDropbox = configured();
  if (!useDropbox && env.isProd) return { mirrored: 0, failed: 0, skipped: true };

  const docs = await db.query<{
    id: string;
    title: string;
    kind: string;
    storage_key: string;
    llc_name: string | null;
    email: string | null;
  }>(
    `SELECT d.id, d.title, d.kind, d.storage_key,
            (SELECT o.llc_name FROM orders o WHERE o.client_id = d.client_id AND o.paid_at IS NOT NULL
              ORDER BY o.paid_at DESC LIMIT 1) AS llc_name,
            cl.email
       FROM documents d LEFT JOIN clients cl ON cl.id = d.client_id
      WHERE d.mirrored_at IS NULL
      ORDER BY d.created_at
      LIMIT 200`,
  );

  let mirrored = 0;
  let failed = 0;
  for (const doc of docs) {
    try {
      const bytes = await streamToBuffer(await readFileStream(doc.storage_key));
      const folder = safePathPart(doc.llc_name || doc.email || "unassigned");
      const name = `${doc.id.slice(0, 8)}-${safePathPart(doc.title || doc.kind)}.pdf`;
      const path = `/${folder}/${name}`;
      if (useDropbox) await uploadToDropbox(path, bytes);
      else await uploadDev(path, bytes);
      await db.query("UPDATE documents SET mirrored_at = now() WHERE id = $1", [doc.id]);
      mirrored++;
    } catch (e) {
      failed++;
      console.error(`[mirror] ${doc.id} failed:`, e);
    }
  }
  return { mirrored, failed, skipped: false };
}
