/**
 * The isolated site used for Adam's review and for page assertions
 * (17 Sep 2026; Codex, round 3: "local review must be demonstrably isolated —
 * not assumed safe because it runs on your Mac"). The Mac's .env carries a
 * real Square sandbox token and the real file-storage token, so a local
 * server is only cut off from them when it is started offline.
 *
 * This starts the API with E2E_OFFLINE=1 on a throwaway database, then ASKS
 * the running server what it would talk to (/api/dev/env-summary — the same
 * signal the server checks rely on when they refuse an online server). If
 * the answer is not "offline, no externals", it stops and nothing opens.
 * The site itself is a fresh production build made with the address-lookup
 * key blanked, served with /api passed through to that API only.
 */
import { spawn, type Subprocess } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Stack { api: string; web: string; proof: { offline: boolean; externals: Record<string, boolean> }; stop: () => void }

export async function startIsolatedStack(opts: { apiPort: number; webPort: number; quiet?: boolean; apiOnly?: boolean; cwd?: string }): Promise<Stack> {
  const say = (s: string) => { if (!opts.quiet) console.log(s); };
  const pg = mkdtempSync(join(tmpdir(), "review-pg-"));
  const out = mkdtempSync(join(tmpdir(), "review-dist-"));
  const apiUrl = `http://localhost:${opts.apiPort}`;
  const webUrl = `http://localhost:${opts.webPort}`;
  const api: Subprocess = spawn(["bun", "server/dev.ts"], {
    cwd: opts.cwd,
    env: { ...process.env, DEV_PG_DIR: pg, PORT: String(opts.apiPort), E2E_OFFLINE: "1", PUBLIC_BASE_URL: webUrl },
    stdout: "ignore", stderr: "ignore",
  });
  const stopApi = () => { try { api.kill(); } catch { /* gone */ } rmSync(pg, { recursive: true, force: true }); };
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${apiUrl}/api/health`)).status === 200) break; } catch { /* not up yet */ }
      if (i === 80) throw new Error("the review API never became healthy");
      await new Promise((r) => setTimeout(r, 500));
    }
    const res = await fetch(`${apiUrl}/api/dev/env-summary`);
    const proof = ((await res.json()) as { data?: Stack["proof"] }).data;
    if (!proof || proof.offline !== true) throw new Error(`REFUSED: the server did not report offline (${JSON.stringify(proof)})`);
    const live = Object.entries(proof.externals).filter(([, v]) => v).map(([k]) => k);
    if (live.length > 0) throw new Error(`REFUSED: the server reports live connections: ${live.join(", ")}`);
    say(`review server reports: offline = true; live connections: none (${Object.keys(proof.externals).join(", ")} all off); database: throwaway folder`);

    if (opts.apiOnly) return { api: apiUrl, web: "", proof, stop: () => { stopApi(); rmSync(out, { recursive: true, force: true }); } };
    const build = spawn(["bunx", "vite", "build", "--outDir", out, "--emptyOutDir"], { env: { ...process.env, VITE_SMARTY_EMBEDDED_KEY: "" }, stdout: "ignore", stderr: opts.quiet ? "ignore" : "inherit" });
    if ((await build.exited) !== 0) throw new Error("the review build failed");
    const web = Bun.serve({
      port: opts.webPort,
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
    return { api: apiUrl, web: webUrl, proof, stop: () => { web.stop(true); stopApi(); rmSync(out, { recursive: true, force: true }); } };
  } catch (e) {
    stopApi();
    rmSync(out, { recursive: true, force: true });
    throw e;
  }
}
