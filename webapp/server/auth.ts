import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb } from "./db";
import { newToken, hashToken } from "./crypto";
import { env } from "./env";

const SESSION_COOKIE = "fpsllc_session";
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
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export async function getSession(c: Context): Promise<SessionInfo | null> {
  const token = getCookie(c, SESSION_COOKIE);
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

export async function destroySession(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = await getDb();
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Small fixed-window rate limiter (per serverless instance — a speed bump, not a wall). */
const hits = new Map<string, { count: number; windowStart: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

export function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "local"
  );
}
