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
 * What is "this machine": localhost, 127.0.0.1, ::1, and anything that is not
 * http(s) at all (about:, data:, blob:). Everything else is aborted and its
 * host recorded in `blocked`, which the walk prints at the end.
 */
import type { Browser, BrowserContext, Page, Route } from "playwright";

export type RouteHandler = (route: Route) => Promise<void> | void;
export type RoutePattern = string | RegExp | ((url: URL) => boolean);

export const isLocal = (url: string): boolean => {
  let u: URL;
  try { u = new URL(url); } catch { return true; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "::1";
};

const blockedOf = new WeakMap<object, Set<string>>();
const rawRouteOf = new WeakMap<Page, Page["route"]>();
const rawContextRouteOf = new WeakMap<BrowserContext, BrowserContext["route"]>();
const hostOf = (url: string): string => { try { return new URL(url).host || url; } catch { return url; } };

/** Wrap a handler so the isolation decision precedes it. */
function guard(handler: RouteHandler | undefined, blocked: Set<string>): RouteHandler {
  return async (route) => {
    const url = route.request().url();
    if (!isLocal(url)) { blocked.add(hostOf(url)); await route.abort("blockedbyclient"); return; }
    if (handler) await handler(route);
    else await route.fallback();
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
