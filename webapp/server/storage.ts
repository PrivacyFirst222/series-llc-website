import { randomBytes } from "node:crypto";
import { env } from "./env";

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
}

/** Vercel Blob in production; .dev-data/blob/ locally. Downloads always stream
 *  through the API after an auth check — storage URLs are never exposed. */
export async function putFile(filename: string, data: ArrayBuffer, contentType: string): Promise<StoredFile> {
  const key = `${randomBytes(12).toString("hex")}-${filename.replace(/[^\w.-]+/g, "_")}`;
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`docs/${key}`, data, {
      access: "private", // store is private; downloads go through the authed API
      contentType,
      addRandomSuffix: false,
    });
    return { storageKey: blob.url, sizeBytes: data.byteLength };
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../.dev-data/blob/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(dir + key, Buffer.from(data));
  return { storageKey: `dev:${key}`, sizeBytes: data.byteLength };
}

export async function readFileStream(storageKey: string): Promise<ReadableStream | Buffer> {
  if (storageKey.startsWith("dev:")) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../.dev-data/blob/", import.meta.url));
    return readFile(dir + storageKey.slice(4));
  }
  const res = await fetch(storageKey, {
    headers: { authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!res.ok || !res.body) throw new Error(`blob fetch failed: ${res.status}`);
  return res.body;
}
