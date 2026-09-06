import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb } from "./db";
import { newToken, hashToken } from "./crypto";
import { env } from "./env";

// Two cookies, one table. Admin and client sign-ins used to share ONE cookie,
// so signing into the admin in another tab of the same browser replaced the
// client's session and the portal "kept logging out" (Adam, 6 Sep 2026).
// Each role now owns its cookie and neither evicts the other.
const CLIENT_COOKIE = "fpsllc_session";
const ADMIN_COOKIE = "fpsllc_admin";
const SESSION_DAYS = 30;

export interface SessionInfo {
  clientId: string | null;
  isAdmin: boolean;
  /** Hash of this request's session token — lets a caller sign out every
   *  OTHER device without logging the current one out. */
  tokenHash: string;
}

export async function createSession(c: Context, opts: { clientId?: string; isAdmin?: boolean }): Promise<void> {
  const db = await getDb();
  const { token, tokenHash } = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.query(
    "INSERT INTO sessions (token_hash, client_id, is_admin, expires_at) VALUES ($1, $2, $3, $4)",
    [tokenHash, opts.clientId ?? null, opts.isAdmin ?? false, expires.toISOString()],
  );
  setCookie(c, opts.isAdmin ? ADMIN_COOKIE : CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

async function lookup(c: Context, cookieName: string): Promise<SessionInfo | null> {
  const token = getCookie(c, cookieName);
  if (!token) return null;
  const db = await getDb();
  const tokenHash = hashToken(token);
  const rows = await db.query<{ client_id: string | null; is_admin: boolean }>(
    "SELECT client_id, is_admin FROM sessions WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash],
  );
  if (rows.length === 0) return null;
  return { clientId: rows[0].client_id, isAdmin: rows[0].is_admin, tokenHash };
}

/** The CLIENT's session — the portal's identity. An admin cookie never
 *  stands in for it: a signed-in admin is not a client. */
export async function getSession(c: Context): Promise<SessionInfo | null> {
  const s = await lookup(c, CLIENT_COOKIE);
  return s?.clientId ? s : null;
}

/** The ADMIN's session, from its own cookie. */
export async function getAdminSession(c: Context): Promise<SessionInfo | null> {
  const s = await lookup(c, ADMIN_COOKIE);
  return s?.isAdmin ? s : null;
}

export async function destroySession(c: Context, role: "client" | "admin" = "client"): Promise<void> {
  const cookieName = role === "admin" ? ADMIN_COOKIE : CLIENT_COOKIE;
  const token = getCookie(c, cookieName);
  if (token) {
    const db = await getDb();
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  deleteCookie(c, cookieName, { path: "/" });
}

/** Fixed-window rate limiter backed by the database, so the count survives
 *  serverless recycling and is shared across instances — the in-memory Map it
 *  replaces reset to zero on every restart (Codex AUTH-002). One atomic
 *  upsert does the counting: begin a new window when the old one has lapsed,
 *  otherwise increment. Fails OPEN on a database error: when the database is
 *  down nothing else works either, and locking every client out is the worse
 *  failure. */
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  failMode: "open" | "closed" = "open",
): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.query<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2)
                      THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2)
                             THEN now() ELSE rate_limits.window_start END
       RETURNING count`,
      [key, windowMs / 1000],
    );
    return rows[0].count <= max;
  } catch (e) {
    // "closed" exists for the admin login alone: one account, the highest
    // value brute-force target, and its one legitimate user can wait out a
    // limiter fault. Everything client-facing stays "open" — a limiter-table
    // fault must not lock every client out of their documents.
    console.error(`[rateLimit] check failed, failing ${failMode}:`, e);
    return failMode === "open";
  }
}

export function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "local"
  );
}
