/**
 * The browser side of "offline": nothing a check script drives in Chromium
 * may contact another machine. Revision 2 of the fix ledger wrapped
 * browser.newPage only, and Codex's review of it reproduced three escapes —
 * a page made from browser.newContext, a popup's first request, and a page
 * whose own API handler ran before the block. This closes all three:
 *
 *   - isolateBrowser(browser): every context the browser makes — through
 *     newContext, or the one behind newPage — is created with service
 *     workers blocked, and gets a context-wide route, before any page exists
 *     in it, that ABORTS every request whose destination is not this machine
 *     (popups and pages nobody installed a handler on included). Every later
 *     page.route and context.route made on those objects is wrapped too, so
 *     no handler, whatever its registration order, sees an outside request.
 *   - guardedRoute(page, pattern, handler): the one way a script installs a
 *     route handler. The isolation decision is taken first; the handler runs
 *     only for a request that stays on this machine. A lint rule refuses a
 *     bare page.route in this folder.
 *
 * What is "this machine": localhost, 127.0.0.1, ::1, and the non-network schemes
 * about:, data:, blob:. HTTP redirects are refused before they can
 * leave the intercepted request. Everything else is aborted and its
 * host recorded in `blocked`, which the walk prints at the end.
 */
import type { Browser, BrowserContext, Page, Route } from "playwright";

export type RouteHandler = (route: Route) => Promise<void> | void;
export type RoutePattern = string | RegExp | ((url: URL) => boolean);

export const isLocal = (url: string): boolean => {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return ["about:", "data:", "blob:"].includes(u.protocol);
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "::1";
};

const blockedOf = new WeakMap<object, Set<string>>();
const rawRouteOf = new WeakMap<Page, Page["route"]>();
const rawContextRouteOf = new WeakMap<BrowserContext, BrowserContext["route"]>();
const hostOf = (url: string): string => { try { return new URL(url).host || url; } catch { return url; } };

/** Native API forwarding uses the same no-redirect policy. A local first
 * hop is insufficient: neither fetch nor Chromium may follow a 30x. */
export const localFetch: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!isLocal(url) || !/^https?:/.test(url)) throw new Error(`offline request refused: ${url}`);
  const response = await fetch(input, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
    await response.body?.cancel();
    throw new Error(`offline redirect refused: ${url} -> ${response.headers.get("location")}`);
  }
  return response;
}, { preconnect: fetch.preconnect });

/** Forward once through native fetch. Playwright route.fetch currently fails
 * on Set-Cookie under the installed Bun runtime; keeping redirects manual
 * here also stops a redirect before any second network request. */
async function forward(route: Route, options: Parameters<Route["continue"]>[0] = {}): Promise<void> {
  const request = route.request();
  const method = options.method ?? request.method();
  if (options.postData !== undefined && typeof options.postData !== "string" && !Buffer.isBuffer(options.postData)) throw new Error("offline forwarding supports string or Buffer postData only");
  const response = await localFetch(options.url ?? request.url(), {
    method, headers: options.headers ?? await request.allHeaders(),
    body: method === "GET" || method === "HEAD" ? undefined : options.postData ?? request.postDataBuffer(),
  });
  const headers = Object.fromEntries(response.headers.entries());
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies.join("\n");
  // Native fetch returns the decoded body, so encoded transport headers no
  // longer describe it. Playwright supplies the final length itself.
  for (const key of ["content-encoding", "content-length", "transfer-encoding"]) delete headers[key];
  await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
}

function guard(handler: RouteHandler | undefined, blocked: Set<string>): RouteHandler {
  return async route => {
    const url = route.request().url();
    const refuse = async (destination: string) => { blocked.add(hostOf(destination)); await route.abort("blockedbyclient"); };
    if (!isLocal(url)) { await refuse(url); return; }
    const safe = new Proxy(route, { get(target, key) {
      if (key === "continue") return async (opts: Parameters<Route["continue"]>[0] = {}) => {
        if (opts.url && !isLocal(opts.url)) return refuse(opts.url);
        await forward(route, opts);
      };
      if (key === "fallback") return async (opts: Parameters<Route["fallback"]>[0] = {}) => {
        if (opts.url && !isLocal(opts.url)) return refuse(opts.url);
        await route.fallback(opts);
      };
      if (key === "fetch") return async () => { throw new Error("route.fetch is unsupported in the offline harness; use localFetch with manual redirects"); };
      if (key === "fulfill") return async (opts: Parameters<Route["fulfill"]>[0] = {}) => {
        const status = opts.status ?? opts.response?.status() ?? 200;
        const headers = opts.headers ?? opts.response?.headers() ?? {};
        const location = Object.entries(headers).find(([k]) => k.toLowerCase() === "location")?.[1];
        if (status >= 300 && status < 400 && location) return refuse(new URL(location, url).href);
        await route.fulfill(opts);
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    try { if (handler) await handler(safe); else await forward(route); }
    catch (error) {
      blocked.add(`refused ${url}: ${String(error)}`);
      await route.abort("blockedbyclient").catch(() => {});
    }
  };
}

/** Isolate one context: service workers were blocked at creation; here the
 *  context-wide abort is installed and every later route call is wrapped. */
async function isolateContext(ctx: BrowserContext, blocked: Set<string>): Promise<void> {
  blockedOf.set(ctx, blocked);
  const ctxRoute = ctx.route.bind(ctx);
  rawContextRouteOf.set(ctx, ctxRoute);
  ctx.route = ((pattern: Parameters<BrowserContext["route"]>[0], handler: RouteHandler, opts?: Parameters<BrowserContext["route"]>[2]) => ctxRoute(pattern, guard(handler, blocked), opts)) as BrowserContext["route"];
  await ctxRoute("**/*", guard(undefined, blocked));
  const wrapPage = (page: Page) => {
    if (rawRouteOf.has(page)) return;
    blockedOf.set(page, blocked);
    const pageRoute = page.route.bind(page);
    rawRouteOf.set(page, pageRoute);
    page.route = ((pattern: Parameters<Page["route"]>[0], handler: RouteHandler, opts?: Parameters<Page["route"]>[2]) => pageRoute(pattern, guard(handler, blocked), opts)) as Page["route"];
  };
  for (const p of ctx.pages()) wrapPage(p);
  ctx.on("page", wrapPage);
  const newPage = ctx.newPage.bind(ctx);
  ctx.newPage = async () => { const p = await newPage(); wrapPage(p); return p; };
}

/** Install the isolation on a browser. Returns the set of blocked hosts. */
export function isolateBrowser(browser: Browser): { blocked: Set<string> } {
  const blocked = new Set<string>();
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options?: Parameters<Browser["newContext"]>[0]) => {
    const ctx = await newContext({ ...options, serviceWorkers: "block" });
    await isolateContext(ctx, blocked);
    return ctx;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options?: Parameters<Browser["newPage"]>[0]) => {
    const page = await newPage({ ...options, serviceWorkers: "block" });
    await isolateContext(page.context(), blocked);
    return page;
  };
  return { blocked };
}

/** The one way a check script installs a page route: the isolation decision
 *  comes first, whatever was registered before or after. */
export async function guardedRoute(page: Page, pattern: RoutePattern, handler: RouteHandler): Promise<void> {
  const blocked = blockedOf.get(page) ?? blockedOf.get(page.context()) ?? new Set<string>();
  const raw = rawRouteOf.get(page) ?? page.route.bind(page);
  await raw(pattern, guard(handler, blocked));
}
/** The same, for a context-wide handler. */
export async function guardedContextRoute(ctx: BrowserContext, pattern: RoutePattern, handler: RouteHandler): Promise<void> {
  const blocked = blockedOf.get(ctx) ?? new Set<string>();
  const raw = rawContextRouteOf.get(ctx) ?? ctx.route.bind(ctx);
  await raw(pattern, guard(handler, blocked));
}
