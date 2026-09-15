/**
 * Server environment. Every integration has a dev fallback so the full flow
 * is testable locally before any real account exists:
 *  - no DATABASE_URL   -> embedded PGlite database in .dev-data/
 *  - no SQUARE_*       -> fake checkout that redirects straight to the confirmation page
 *  - no RESEND_API_KEY -> emails are logged, not sent
 *  - no BLOB_*         -> files stored under .dev-data/blob/
 */
/** E2E_OFFLINE=1 severs every external integration no matter what credentials
 *  sit in the ambient environment: each one falls back to its dev behavior
 *  (embedded DB, fake checkout, logged email, local file storage). This
 *  exists because .env legitimately carries real sandbox/storage tokens for
 *  manual testing, and a routine e2e run against a server loaded with them
 *  wrote its fake client documents into the real Blob store (Codex
 *  OPS-ENV-001). The suite refuses to run against an online server. */
const OFFLINE = process.env.E2E_OFFLINE === "1";
const ext = (v: string | undefined): string => (OFFLINE ? "" : v ?? "");

export const env = {
  OFFLINE,
  DATABASE_URL: ext(process.env.DATABASE_URL),
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-secret-change-me",

  SQUARE_ACCESS_TOKEN: ext(process.env.SQUARE_ACCESS_TOKEN),
  SQUARE_LOCATION_ID: ext(process.env.SQUARE_LOCATION_ID),
  SQUARE_ENV: process.env.SQUARE_ENV === "production" ? "production" : "sandbox",
  SQUARE_WEBHOOK_SIGNATURE_KEY: ext(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),

  RESEND_API_KEY: ext(process.env.RESEND_API_KEY),
  MAIL_FROM: process.env.MAIL_FROM ?? "MyFloridaSeriesLLC <onboarding@resend.dev>",
  ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL ?? "",

  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",

  /** Shared secret for the daily purge cron. Required in production. */
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  // Dropbox app-folder credentials for the nightly client-file mirror.
  DROPBOX_APP_KEY: ext(process.env.DROPBOX_APP_KEY),
  DROPBOX_APP_SECRET: ext(process.env.DROPBOX_APP_SECRET),
  DROPBOX_REFRESH_TOKEN: ext(process.env.DROPBOX_REFRESH_TOKEN),

  BLOB_READ_WRITE_TOKEN: ext(process.env.BLOB_READ_WRITE_TOKEN),

  SMARTY_AUTH_ID: ext(process.env.SMARTY_AUTH_ID),
  SMARTY_AUTH_TOKEN: ext(process.env.SMARTY_AUTH_TOKEN),

  /** Public origin for links in emails and Square redirects. */
  PUBLIC_BASE_URL:
    process.env.PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:8000"),

  isProd: !!process.env.VERCEL,
};
