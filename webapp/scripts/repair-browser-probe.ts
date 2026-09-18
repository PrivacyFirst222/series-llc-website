/** Local sinks only: Chromium maps the forbidden hostname to loopback.
 * This tests the actual target helper. It never sends a probe to the internet.
 */
import { chromium, type Route } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const target = process.argv[process.argv.indexOf("--target") + 1];
const helper = join(target, "webapp/scripts/browser-isolation.ts");
let sinkHits = 0, postHits = 0;
const sink = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { sinkHits++; return new Response("outside sink"); } });
const outside = `http://probe.invalid:${sink.port}/sink`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === "/local-redirect") return new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${sink.port}/sink` } });
  if (u.pathname === "/redirect") return new Response(null, { status: 302, headers: { location: outside } });
  if (u.pathname === "/binary") return new Response(new Uint8Array([0, 1, 127, 255]), { headers: { "content-type": "application/octet-stream" } });
  if (u.pathname === "/json") return Response.json({ retained: true });
  if (u.pathname === "/post") { postHits++; return new Response(`${req.method}:${await req.text()}:${req.headers.get("cookie")}`, { headers: { "content-type": "text/plain" } }); }
  const headers = new Headers({ "content-type": "text/html" });
  headers.append("set-cookie", "probe_cookie=yes; Path=/");
  headers.append("set-cookie", "second_cookie=also; Path=/");
  return new Response("<html><body>local page</body></html>", { headers });
} });
const local = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP probe.invalid 127.0.0.1", "--no-proxy-server"] });
const rows: { name: string; ok: boolean; detail: unknown }[] = [];
const check = (name: string, ok: boolean, detail: unknown) => { rows.push({ name, ok, detail }); console.log(JSON.stringify(rows[rows.length - 1])); };
try {
  let guarded: (page: Awaited<ReturnType<typeof browser.newPage>>, pattern: string, cb: (r: Route) => Promise<void>) => Promise<void>;
  let localFetch: typeof fetch = fetch;
  if (existsSync(helper)) {
    const mod = await import(pathToFileURL(helper).href); mod.isolateBrowser(browser); guarded = mod.guardedRoute;
    localFetch = mod.localFetch ?? fetch;
  } else {
    // Historical r2 adapter: extract and execute its actual inline wrapper;
    // only remove its TypeScript parameter annotation. Never install r3's fix.
    const source = readFileSync(join(target, "webapp/scripts/behavioral.ts"), "utf8");
    const begin = source.indexOf("  const blockedRequests = new Set<string>();"), end = source.indexOf("  const adminLogin", begin);
    if (begin < 0 || end < 0) throw new Error("historical browser adapter: exact inline wrapper not found");
    const code = source.slice(begin, end).replace("new Set<string>()", "new Set()").replace("...a: Parameters<typeof openPage>", "...a");
    new Function("browser", code)(browser);
    // Compatibility adapter calls the old raw page handler, as r2 did.
    guarded = async (page, pattern, cb) => { await page["route"](pattern, cb); };
    console.log(JSON.stringify({ adapter: "r2 actual inline wrapper", source: code }));
  }
  const page = await browser.newPage();
  await page.goto(local);
  check("local HTML and cookie", (await page.context().cookies()).some(c => c.name === "probe_cookie" && c.value === "yes"), await page.context().cookies());
  const cookies = await page.context().cookies();
  check("multiple cookies preserved", cookies.some(c => c.name === "second_cookie" && c.value === "also"), cookies);
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch("/binary")).arrayBuffer())));
  check("binary response preserved", JSON.stringify(bytes) === "[0,1,127,255]", bytes);
  const json = await page.evaluate(async () => (await fetch("/json")).json());
  check("JSON response preserved", json.retained === true, json);
  const body = await page.evaluate(async () => (await fetch("/post", { method: "POST", body: "one-body" })).text());
  check("POST forwarded once with body and cookie", postHits === 1 && body.includes("POST:one-body:probe_cookie=yes"), { postHits, body });
  const probe = async (name: string, action: () => Promise<unknown>) => { const before = sinkHits; await action().catch(() => {}); check(name, sinkHits === before, { sinkHitsBefore: before, sinkHitsAfter: sinkHits }); };
  await probe("direct nonlocal request blocked", () => page.goto(outside, { timeout: 2500 }));
  const context = await browser.newContext(); const cp = await context.newPage();
  await probe("context page nonlocal request blocked", () => cp.goto(outside, { timeout: 2500 }));
  await page.goto(local);
  await probe("popup first request blocked", async () => {
    const opened = page.waitForEvent("popup", { timeout: 2500 }); await page.evaluate(url => { window.open(url); }, outside);
    const popup = await opened; await popup.waitForLoadState("load", { timeout: 1500 }).catch(() => {}); await popup.close();
  });
  await probe("local redirect to nonlocal sink blocked", () => page.goto(`${local}/redirect`, { timeout: 2500 }));
  const withHandler = await browser.newPage();
  await guarded(withHandler, "**/override", r => r.continue({ url: outside }));
  await probe("continue URL override blocked", () => withHandler.goto(`${local}/override`, { timeout: 2500 }));
  const apiPage = await browser.newPage();
  let apiHandlerRan = false;
  await guarded(apiPage, "**/api/**", async r => { apiHandlerRan = true; await r.continue(); });
  await probe("API handler nonlocal request blocked", () => apiPage.goto(outside.replace("/sink", "/api/x"), { timeout: 2500 }));
  check("outside API handler does not run", !apiHandlerRan, { apiHandlerRan });
  const fallbackPage = await browser.newPage();
  await guarded(fallbackPage, "**/fallback", r => r.fallback({ url: outside }));
  await probe("fallback URL override blocked", () => fallbackPage.goto(`${local}/fallback`, { timeout: 2500 }));
  const passPage = await browser.newPage();
  await guarded(passPage, "**/redirect", r => r.continue());
  await probe("handler continue redirect blocked", () => passPage.goto(`${local}/redirect`, { timeout: 2500 }));
  const fetchPage = await browser.newPage();
  await guarded(fetchPage, "**/local-redirect", async r => {
    try { const response = await r.fetch({ timeout: 1500 }); await r.fulfill({ response }); }
    catch { await r.abort().catch(() => {}); }
  });
  await probe("unsupported route.fetch cannot follow redirects", () => fetchPage.goto(`${local}/local-redirect`, { timeout: 2500 }));
  const overridePage = await browser.newPage();
  await guarded(overridePage, "**/post-override", r => r.fallback({ url: `${local}/post`, method: "POST", postData: "override-body", headers: { "content-type": "text/plain" } }));
  await overridePage.goto(`${local}/post-override`);
  check("local fallback overrides preserved", (await overridePage.textContent("body"))?.includes("POST:override-body:") === true && postHits === 2, { postHits, body: await overridePage.textContent("body") });
  const manufactured = await browser.newPage();
  await guarded(manufactured, "**/manufactured", r => r.fulfill({ status: 302, headers: { Location: outside } }));
  await probe("handler manufactured redirect blocked", () => manufactured.goto(`${local}/manufactured`, { timeout: 2500 }));
  const before = sinkHits; let refused = false;
  try { await localFetch(`${local}/local-redirect`); } catch { refused = true; }
  check("API forwarding does not follow redirects", refused && sinkHits === before, { refused, sinkHitsBefore: before, sinkHitsAfter: sinkHits });
} finally { await browser.close(); server.stop(true); sink.stop(true); }
process.exit(rows.every(r => r.ok) ? 0 : 1);
