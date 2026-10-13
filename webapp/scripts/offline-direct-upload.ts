/**
 * Test-only. The office upload (src/lib/officeUpload.ts) encrypts the file in the
 * browser and sends it straight to private storage with a token from the server.
 * The offline review site has no storage token, so the browser sends nothing and
 * the server answers that the file never arrived. This stands in for the storage
 * step: it remembers the files the walk selects, and when the real server issues a
 * ticket without a token, it encrypts the same file the way the browser would
 * (AES-256-GCM, the ticket's key and iv, the file id as authenticated data) and
 * writes it where the server looks for it when there is no storage token
 * (server/storage.ts, readObject: DEV_STORAGE_DIR, or webapp/.dev-data/blob).
 *
 * Production code is untouched. It acts only on a ticket whose grant carries no
 * token, and only for a file the walk itself selected (matched by its SHA-256).
 */
import { createCipheriv, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright";
import { onForwardedResponse } from "./browser-isolation";

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const known = new Map<string, Buffer>();
const root = () => process.env.DEV_STORAGE_DIR || fileURLToPath(new URL("../.dev-data/blob/", import.meta.url));

type Selected = string | { name: string; mimeType: string; buffer: Buffer };
let patched = false;
function rememberSelections(page: Page): void {
  if (patched) return;
  patched = true;
  const proto = Object.getPrototypeOf(page.locator("html")) as { setInputFiles: (files: Selected | Selected[], options?: unknown) => Promise<void> };
  const original = proto.setInputFiles;
  proto.setInputFiles = function (this: unknown, files: Selected | Selected[], options?: unknown) {
    for (const f of Array.isArray(files) ? files : [files]) {
      const bytes = typeof f === "string" ? readFileSync(f) : f?.buffer;
      if (bytes) known.set(sha256(Buffer.from(bytes)), Buffer.from(bytes));
    }
    return original.call(this, files, options);
  };
}

interface Grant { id: string; field: string; path: string; key: string; iv: string; token: string | null }
/** Runs on every request the isolation layer forwards to the real server. */
function storeIfTicket(request: { method(): string; url(): string; postData(): string | null }, status: number, body: Buffer): void {
  if (request.method() !== "POST" || !/\/api\/admin\/uploads$/.test(new URL(request.url()).pathname) || status !== 200) return;
  const asked = JSON.parse(request.postData() ?? "{}") as { files?: { sha: string }[] };
  const grants = (JSON.parse(body.toString("utf8")) as { data?: { files?: Grant[] } }).data?.files ?? [];
  grants.forEach((grant, i) => {
    if (grant.token) return; // a real storage token: the browser sends the file itself
    const plain = known.get(asked.files?.[i]?.sha ?? "");
    if (!plain) return;
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(grant.key, "base64"), Buffer.from(grant.iv, "base64"));
    cipher.setAAD(Buffer.from(grant.id));
    const bytes = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    const target = join(resolve(root()), grant.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  });
}

/** Call once, right after isolateBrowser(browser). */
export function installOfflineDirectUpload(browser: Browser): void {
  onForwardedResponse(storeIfTicket);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options?: Parameters<Browser["newPage"]>[0]) => {
    const page = await newPage(options);
    rememberSelections(page);
    return page;
  };
}
