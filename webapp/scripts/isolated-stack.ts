/**
 * The isolated site used for Adam's review and for page assertions. The Mac's
 * .env carries a real Square sandbox token and the real file-storage token,
 * so a local server is only cut off from them when it is started offline —
 * and "it runs on your Mac" proves nothing (Codex, design round 3).
 *
 * Revision 2 (Codex's review of revision 1, findings 6 and 11). Revision 1
 * asked "is anything healthy on this port?" and believed whatever answered,
 * so a server that was already there could pass as the new one. Now:
 *   - the port is one the operating system says is FREE, unless a test forces
 *     one to prove the refusal;
 *   - the API is OUR child process: if it exits, the start fails, and the
 *     process LISTENING on the port must be that child (checked with lsof);
 *   - only then is the server asked what it would talk to
 *     (/api/dev/env-summary), and anything but "offline, no connections"
 *     stops everything;
 *   - the database is a throwaway folder (DEV_PG_DIR); uploaded test files go
 *     to .dev-data inside the checkout being run, and the review runs an
 *     isolated checkout that is deleted afterwards, so nothing is shared with
 *     or left in the repository's own folder;
 *   - every build uses ONE sanitized environment (SANITIZED): no address-
 *     lookup key and no outside API address baked into the pages.
 * `cwd` is the checkout to run — the review passes an isolated checkout of
 * the exact commit. `serveDir` serves a build that was preserved earlier
 * instead of building again.
 */
import { spawn, type Subprocess } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What every review and test build and server runs with. */
export const SANITIZED: Record<string, string> = { E2E_OFFLINE: "1", VITE_SMARTY_EMBEDDED_KEY: "", VITE_BACKEND_URL: "" };

export interface Stack { api: string; web: string; pid: number; proof: { offline: boolean; externals: Record<string, boolean> }; stop: () => void }

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, () => { const a = s.address(); const port = typeof a === "object" && a ? a.port : 0; s.close(() => resolve(port)); });
});

/** The process ids listening on a TCP port, as the operating system reports them. */
function listeners(port: number): number[] {
  try { return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number); } catch { return []; }
}

export async function buildSite(cwd: string, outDir: string, quiet = true): Promise<void> {
  const build = spawn(["bunx", "vite", "build", "--outDir", outDir, "--emptyOutDir"], { cwd, env: { ...process.env, ...SANITIZED }, stdout: "ignore", stderr: quiet ? "ignore" : "inherit" });
  if ((await build.exited) !== 0) throw new Error("the review build failed");
}

export async function startIsolatedStack(opts: { apiPort?: number; webPort?: number; quiet?: boolean; apiOnly?: boolean; cwd?: string; serveDir?: string }): Promise<Stack> {
  const say = (s: string) => { if (!opts.quiet) console.log(s); };
  const cwd = opts.cwd ?? process.cwd();
  const pg = mkdtempSync(join(tmpdir(), "review-pg-"));
  const out = opts.serveDir ?? mkdtempSync(join(tmpdir(), "review-dist-"));
  const apiPort = opts.apiPort || (await freePort());
  const webPort = opts.webPort || (await freePort());
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;
  if (listeners(apiPort).length > 0) { rmSync(pg, { recursive: true, force: true }); throw new Error(`REFUSED: another process (${listeners(apiPort).join(", ")}) is already listening on port ${apiPort}; the review server did not start, and a server that was already there is not the process under review`); }
  const api: Subprocess = spawn(["bun", "server/dev.ts"], {
    cwd,
    env: { ...process.env, ...SANITIZED, DEV_PG_DIR: pg, PORT: String(apiPort), PUBLIC_BASE_URL: webUrl },
    stdout: "ignore", stderr: "ignore",
  });
  const cleanup = () => { try { api.kill(); } catch { /* gone */ } rmSync(pg, { recursive: true, force: true }); if (!opts.serveDir) rmSync(out, { recursive: true, force: true }); };
  try {
    for (let i = 0; ; i++) {
      if (api.exitCode !== null) throw new Error(`REFUSED: the review server exited (code ${api.exitCode}) before it was ready — nothing on port ${apiPort} is the process under review`);
      try { if ((await fetch(`${apiUrl}/api/health`)).status === 200) break; } catch { /* not up yet */ }
      if (i === 80) throw new Error("the review API never became healthy");
      await new Promise((r) => setTimeout(r, 500));
    }
    const owners = listeners(apiPort);
    if (api.exitCode !== null || !owners.includes(api.pid)) throw new Error(`REFUSED: port ${apiPort} is answered by process ${owners.join(", ") || "unknown"}, which is not the process this review started (${api.pid})`);
    const res = await fetch(`${apiUrl}/api/dev/env-summary`);
    const proof = ((await res.json()) as { data?: Stack["proof"] }).data;
    if (!proof || proof.offline !== true) throw new Error(`REFUSED: the server did not report offline (${JSON.stringify(proof)})`);
    const live = Object.entries(proof.externals).filter(([, v]) => v).map(([k]) => k);
    if (live.length > 0) throw new Error(`REFUSED: the server reports live connections: ${live.join(", ")}`);
    say(`review server: process ${api.pid}, started by this command from ${cwd}, owns port ${apiPort}; it reports offline = true and no live connections (${Object.keys(proof.externals).join(", ")} all off); database: a throwaway folder`);

    if (opts.apiOnly) return { api: apiUrl, web: "", pid: api.pid, proof, stop: cleanup };
    if (!opts.serveDir) await buildSite(cwd, out, opts.quiet ?? false);
    const web = Bun.serve({
      port: webPort,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/api/")) {
          const headers = new Headers(req.headers); headers.delete("host");
          return fetch(`${apiUrl}${url.pathname}${url.search}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(), redirect: "manual" });
        }
        const file = Bun.file(join(out, url.pathname === "/" ? "index.html" : url.pathname));
        return new Response((await file.exists()) ? file : Bun.file(join(out, "index.html")));
      },
    });
    return { api: apiUrl, web: webUrl, pid: api.pid, proof, stop: () => { web.stop(true); cleanup(); } };
  } catch (e) {
    cleanup();
    throw e;
  }
}
