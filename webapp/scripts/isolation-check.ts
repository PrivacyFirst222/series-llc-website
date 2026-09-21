/** Batch 21: B2-05 and B5-E2E-ISOLATION-FAILOPEN.
 * The real commands run against disposable local sinks. A mutation is recorded,
 * never performed, and terminates the command. No live integration is contacted.
 * --repo allows the same probes to reproduce the pre-fix behavior in a checkout.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const repoArg = process.argv.indexOf("--repo");
const repo = repoArg < 0 ? resolve(import.meta.dir, "../..") : resolve(process.argv[repoArg + 1]);
const webapp = join(repo, "webapp");
const temporary = mkdtempSync(join(tmpdir(), "batch21-isolation-"));
const results: { label: string; ok: boolean; detail: unknown }[] = [];
const flags = { database: false, square: false, blob: false, resend: false, dropbox: false, smarty: false, sunbiz: false };
const valid = { data: { offline: true, externals: flags } };
function record(label: string, ok: boolean, detail: unknown) {
  results.push({ label, ok, detail });
  console.log(JSON.stringify({ label, ok, detail }));
}

async function apiProbe(label: string, response: () => Response | Promise<Response>, allowExternal = false, shouldProceed = false) {
  let mutations = 0;
  const requests: string[] = [];
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  const sink = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
    requests.push(`${req.method} ${new URL(req.url).pathname}`);
    if (req.method !== "GET") { mutations++; child?.kill(); return Response.json({ data: {} }); }
    if (new URL(req.url).pathname === "/api/dev/env-summary") return response();
    return Response.json({ data: {} });
  } });
  let timedOut = false;
  try {
    child = Bun.spawn([process.execPath, "server/e2e.ts"], { cwd: webapp, env: {
      ...process.env, E2E_BASE_URL: `http://127.0.0.1:${sink.port}`, E2E_EXTERNAL: allowExternal ? "1" : "",
      E2E_OFFLINE: "1", CHECK_RESULTS_FILE: "", DEV_PG_DIR: join(temporary, "unused-pg"),
    }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const timer = setTimeout(() => { timedOut = true; child?.kill(); }, 8000);
    const exit = await child.exited;
    clearTimeout(timer);
    const logs = (await output).join("\n");
    const ok = shouldProceed ? mutations === 1 && !timedOut : mutations === 0 && exit !== 0 && !timedOut && /REFUSING/.test(logs);
    record(`API: ${label}`, ok, { mutations, exit, timedOut, requests, logs });
  } finally { child?.kill(); sink.stop(true); }
}

function fixture(name: string, summary: unknown, status = 200, exitEarly = false) {
  const dir = join(temporary, name);
  mkdirSync(join(dir, "server"), { recursive: true });
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist/index.html"), "<!doctype html><main>Isolation fixture</main>");
  writeFileSync(join(dir, "server/dev.ts"), `
import { writeFileSync, appendFileSync, existsSync } from "node:fs";
writeFileSync("child.json", JSON.stringify({pid:process.pid, pg:process.env.DEV_PG_DIR, offline:process.env.E2E_OFFLINE, pgExists:existsSync(process.env.DEV_PG_DIR ?? "")}));
${exitEarly ? "process.exit(37);" : `Bun.serve({port:Number(process.env.PORT), fetch(req) {
 if(req.method !== "GET") appendFileSync("mutations.txt", req.method+" "+new URL(req.url).pathname+"\\n");
 if(new URL(req.url).pathname === "/api/dev/env-summary") return Response.json(${JSON.stringify(summary)}, {status:${status}});
 return Response.json({data:{}});
}});`}
`);
  return dir;
}
function removeFixtureChild(dir: string) {
  if (existsSync(join(dir, "child.json"))) {
    const { pid } = JSON.parse(readFileSync(join(dir, "child.json"), "utf8"));
    try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ }
  }
}

async function behavioralProbe() {
  const dir = fixture("behavioral-malformed", { data: { offline: true, externals: {} } });
  const child = Bun.spawn([process.execPath, join(webapp, "scripts/behavioral.ts")], {
    cwd: dir, env: { ...process.env, E2E_OFFLINE: "1", CHECK_RESULTS_FILE: "", RUN: "NONE" }, stdout: "pipe", stderr: "pipe",
  });
  const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 12000);
  const watch = setInterval(() => { if (existsSync(join(dir, "mutations.txt"))) child.kill(); }, 20);
  try {
    const exit = await child.exited;
    const logs = (await output).join("\n");
    const mutations = existsSync(join(dir, "mutations.txt")) ? readFileSync(join(dir, "mutations.txt"), "utf8") : "";
    record("Behavioral command: malformed owned server refuses before admin login", exit !== 0 && !timedOut && !mutations && /REFUSED.*environment proof/s.test(logs), { exit, timedOut, mutations, logs });
  } finally { clearTimeout(timer); clearInterval(watch); child.kill(); removeFixtureChild(dir); }
}

async function behavioralCollisionProbe() {
  const dir = fixture("behavioral-collision", valid, 200, true);
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let mutations = 0;
  const requests: string[] = [];
  let sink: ReturnType<typeof Bun.serve> | undefined;
  // The old runner chose 3300 + floor(random * 500). Occupy one such port
  // ourselves; never borrow or send requests to an existing local service.
  for (let offset = 0; offset < 500 && !sink; offset++) {
    try {
      const web = Bun.serve({ port: 3900 + offset, fetch: () => new Response("fixture") });
      web.stop(true);
      sink = Bun.serve({ port: 3300 + offset, fetch(req) {
        requests.push(`${req.method} ${new URL(req.url).pathname}`);
        if (req.method !== "GET") { mutations++; child?.kill(); }
        return Response.json(valid);
      } });
    } catch { /* a port belongs to someone else; leave it alone */ }
  }
  if (!sink) throw new Error("isolation fixture could not reserve a port pair");
  writeFileSync(join(dir, "preload.ts"), `Math.random = () => ${(sink.port - 3300 + 0.1) / 500};`);
  let timedOut = false;
  try {
    child = Bun.spawn([process.execPath, "--preload", join(dir, "preload.ts"), join(webapp, "scripts/behavioral.ts")], {
      cwd: dir, env: { ...process.env, E2E_OFFLINE: "1", CHECK_RESULTS_FILE: "", RUN: "NONE" }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const timer = setTimeout(() => { timedOut = true; child?.kill(); }, 12000);
    const exit = await child.exited;
    clearTimeout(timer);
    const logs = (await output).join("\n");
    record("Behavioral command: exited child cannot borrow healthy stranger", requests.length === 0 && mutations === 0 && exit !== 0 && !timedOut && /REFUSED.*server exited/s.test(logs), { mutations, exit, timedOut, requests, logs });
  } finally { child?.kill(); sink.stop(true); removeFixtureChild(dir); }
}

async function freshDatabaseCollisionProbe() {
  const dir = fixture("fresh-database-collision", valid, 200, true);
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  const requests: string[] = [];
  let sink: ReturnType<typeof Bun.serve> | undefined;
  for (let offset = 0; offset < 800 && !sink; offset++) {
    try { sink = Bun.serve({ port: 3200 + offset, fetch(req) {
      requests.push(`${req.method} ${new URL(req.url).pathname}`);
      if (req.method !== "GET") child?.kill();
      return Response.json({ data: {} });
    } }); } catch { /* leave another process's port alone */ }
  }
  if (!sink) throw new Error("fresh-database fixture could not reserve a port");
  const primary = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/api/dev/env-summary") return Response.json(valid);
    if (path === "/api/cron/sunbiz-sync") return Response.json({ data: { skippedOffline: true } });
    return Response.json({ data: {} });
  } });
  writeFileSync(join(dir, "preload.ts"), `Math.random = () => ${(sink.port - 3200 + 0.1) / 800};`);
  let timedOut = false;
  try {
    child = Bun.spawn([process.execPath, "--preload", join(dir, "preload.ts"), join(webapp, "server/e2e.ts")], {
      cwd: dir, env: { ...process.env, E2E_OFFLINE: "1", E2E_EXTERNAL: "", E2E_BASE_URL: `http://127.0.0.1:${primary.port}`, CHECK_RESULTS_FILE: "" }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const timer = setTimeout(() => { timedOut = true; child?.kill(); }, 12000);
    const exit = await child.exited;
    clearTimeout(timer);
    const logs = (await output).join("\n");
    record("API fresh database: exited child cannot borrow healthy stranger", requests.length === 0 && exit !== 0 && !timedOut && /REFUSED.*(?:process|exited)/s.test(logs), { exit, timedOut, requests, logs });
  } finally { child?.kill(); sink.stop(true); primary.stop(true); removeFixtureChild(dir); }
}

try {
  await apiProbe("missing data", () => Response.json({}));
  await apiProbe("null response", () => Response.json(null));
  await apiProbe("malformed JSON", () => new Response("not-json"));
  await apiProbe("HTTP error despite valid-looking body", () => Response.json(valid, { status: 503 }));
  await apiProbe("redirect does not become proof", () => new Response(null, { status: 302, headers: { location: "/accepted" } }));
  await apiProbe("missing externals", () => Response.json({ data: { offline: true } }));
  await apiProbe("empty external map", () => Response.json({ data: { offline: true, externals: {} } }));
  await apiProbe("missing one external", () => Response.json({ data: { offline: true, externals: { ...flags, sunbiz: undefined } } }));
  await apiProbe("nonboolean external", () => Response.json({ data: { offline: true, externals: { ...flags, square: 0 } } }));
  await apiProbe("unknown external", () => Response.json({ data: { offline: true, externals: { ...flags, newService: false } } }));
  await apiProbe("missing offline", () => Response.json({ data: { externals: flags } }));
  await apiProbe("online with false flags", () => Response.json({ data: { offline: false, externals: flags } }));
  await apiProbe("active integration", () => Response.json({ data: { offline: true, externals: { ...flags, square: true } } }));
  await apiProbe("unresponsive summary", () => new Promise<Response>(() => {}));
  await apiProbe("explicit integration still needs valid proof", () => Response.json({}), true);
  await apiProbe("valid offline proceeds", () => Response.json(valid), false, true);
  await apiProbe("explicit valid integration proceeds", () => Response.json({ data: { offline: false, externals: { ...flags, square: true, sunbiz: true } } }), true, true);
  await behavioralProbe();
  await behavioralCollisionProbe();
  await freshDatabaseCollisionProbe();
  const { startIsolatedStack } = await import(pathToFileURL(join(webapp, "scripts/isolated-stack.ts")).href);
  {
    // A process steals the port AFTER the initial free-port test. The dev
    // child remains alive, but its grandchild is the unrelated listener.
    const dir = fixture("port-takeover", valid);
    writeFileSync(join(dir, "stranger.ts"), `
import {writeFileSync,appendFileSync} from "node:fs";
writeFileSync("stranger.json",JSON.stringify({pid:process.pid}));
Bun.serve({port:Number(process.env.PORT),fetch(req){appendFileSync("requests.txt",req.method+" "+new URL(req.url).pathname+"\\n");return Response.json(${JSON.stringify(valid)});}});
`);
    writeFileSync(join(dir, "server/dev.ts"), `
import {writeFileSync} from "node:fs";
writeFileSync("child.json",JSON.stringify({pid:process.pid}));
Bun.spawn([process.execPath,"stranger.ts"],{stdout:"ignore",stderr:"ignore"});
setInterval(()=>{},1000);
`);
    let refused = "";
    try { const stack = await startIsolatedStack({ cwd: dir, apiOnly: true, quiet: true }); stack.stop(); }
    catch (e) { refused = String(e); }
    finally {
      removeFixtureChild(dir);
      if (existsSync(join(dir, "stranger.json"))) {
        const { pid } = JSON.parse(readFileSync(join(dir, "stranger.json"), "utf8"));
        try { process.kill(pid, "SIGTERM"); } catch { /* fixture already exited */ }
      }
    }
    const requests = existsSync(join(dir, "requests.txt")) ? readFileSync(join(dir, "requests.txt"), "utf8") : "";
    record("Stack: port takeover refused before even GET health", /REFUSED.*process/.test(refused) && requests === "", { refused, requests });
  }
  const occupied = Bun.serve({ port: 0, fetch: () => Response.json(valid) });
  try {
    let refused = "";
    try { const stack = await startIsolatedStack({ cwd: fixture("occupied", valid), apiOnly: true, apiPort: occupied.port, quiet: true }); stack.stop(); }
    catch (e) { refused = String(e); }
    record("Stack: occupied port cannot impersonate owned server", /another process.*already listening/.test(refused), refused);
  } finally { occupied.stop(true); }
  for (const [name, summary, status, early] of [
    ["child-exit", valid, 200, true], ["empty-map", { data: { offline: true, externals: {} } }, 200, false], ["bad-status", valid, 503, false],
  ] as const) {
    const dir = fixture(name, summary, status, early);
    let refused = "";
    try { const stack = await startIsolatedStack({ cwd: dir, apiOnly: true, quiet: true }); stack.stop(); }
    catch (e) { refused = String(e); }
    finally { removeFixtureChild(dir); }
    record(`Stack: ${name} refused`, early ? /server exited/.test(refused) : /environment proof/.test(refused), refused);
  }
  const dir = fixture("owned", valid);
  const stack = await startIsolatedStack({ cwd: dir, apiOnly: true, quiet: true });
  const child = JSON.parse(readFileSync(join(dir, "child.json"), "utf8"));
  record("Stack: owned offline child has separate disposable database", stack.pid === child.pid && child.offline === "1" && child.pgExists && child.pg !== process.env.DEV_PG_DIR && stack.proof.offline === true, { child, stackPid: stack.pid, proof: stack.proof });
  stack.stop();
  record("Stack: disposable database removed after stop", !existsSync(child.pg), { pg: child.pg });
} finally { rmSync(temporary, { recursive: true, force: true }); }

const passed = results.filter(r => r.ok).length;
console.log(`Batch 21 isolation: ${passed}/${results.length} probes passed`);
if (passed !== results.length) process.exitCode = 1;
