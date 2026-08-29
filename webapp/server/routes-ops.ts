// Split from app.ts on 29 Aug 2026 — one domain per file, code moved
// verbatim (the two dev test flags became shared.testHooks so they stay
// mutable across modules). Routes register inside registerOpsRoutes(app),
// which app.ts calls after creating the app — no circular imports.
import { Hono } from "hono";
import { z } from "zod";
import { orderFormSchema } from "./validation";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { validateRegisteredAgentAddress } from "../src/components/forms/florida-llc/validation";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";
import { getDb } from "./db";
import { env } from "./env";
import { listBackups, runDbBackup } from "./backup";
import { mirrorStatus, runFileMirror } from "./dropbox";
import {
  priceOrder,
  EIN_FEE_CENTS,
  S_ELECTION_FEE_CENTS,
  S_ELECTION_WINDOW_DAYS,
  SERIES_ADDON_PREP_CENTS,
  SERIES_ADDON_STATE_CENTS,
} from "./pricing";
import { buildSElectionPackage, type SElectionDetails } from "./s-election";
import {
  sharesAreComplete,
  shareLabel,
  shareValue,
  type OwnershipMode,
  type OwnershipShare,
} from "../src/lib/ownership";
import { createCheckout, verifyWebhookSignature } from "./square";
import { hashPassword, verifyPassword, newToken, hashToken, encryptSecret, decryptSecret } from "./crypto";
import { hasProtectedSeriesPhrase } from "../src/components/forms/florida-llc/validation";
import { assembleNewSeries } from "./new-series";
import { stampEastern, stampForFilename } from "./datetime";
import { assembleOa, oaVersion, OA_TEMPLATE_VERSION, type OaInputs } from "./oa";
import { renderMarkdownPdf, stampExistingPdf } from "./pdf-render";
import { createSession, getSession, destroySession, rateLimit, clientIp } from "./auth";
import { checkName, getSyncState, syncDailies, unavailableNames } from "./sunbiz";
import { createHash } from "node:crypto";
import ownersManualMd from "../../docs/owners-manual.md";
import { deleteFile, putFile, readFileStream } from "./storage";
import {
  sendMail,
  welcomeEmail,
  resetEmail,
  newDocumentEmail,
  orderPaidEmail,
  raCancellationEmail,
  raCancellationAdminEmail,
  serviceOrderClientEmail,
  serviceOrderAdminEmail,
  einDetailsSubmittedAdminEmail,
  passwordChangedEmail,
  verifyNewEmail,
  emailChangeRequestedEmail,
  emailChangedEmail,
  serviceFulfilledClientEmail,
  sElectionReadyEmail,
  llcFormedEmail,
} from "./email";
import { filingGroups, seriesNames } from "./filing";
import { err, testHooks, MAX_UPLOAD_BYTES, looksLikePdf, maskEmail, requireAdmin } from "./shared";
import { fulfillPaidOrder, fulfillPaidServiceOrder } from "./routes-payments";
import { oaSeed, purgeExpiredSElections } from "./routes-portal";
import { refreshOwnersManual } from "./routes-admin";


export function registerOpsRoutes(app: Hono) {

if (!env.isProd) {
  // Which external integrations this server would actually talk to. The e2e
  // suite refuses to run against an online server (OPS-ENV-001).
  app.get("/dev/env-summary", (c) =>
    c.json({
      data: {
        offline: env.OFFLINE,
        externals: {
          database: Boolean(env.DATABASE_URL),
          square: Boolean(env.SQUARE_ACCESS_TOKEN),
          blob: Boolean(env.BLOB_READ_WRITE_TOKEN),
          resend: Boolean(env.RESEND_API_KEY),
          dropbox: Boolean(env.DROPBOX_APP_KEY || env.DROPBOX_REFRESH_TOKEN),
          smarty: Boolean(env.SMARTY_AUTH_ID),
          // Credential-less: the Sunbiz SFTP login is public and hardcoded,
          // so this connector is external whenever the server is not offline.
          sunbiz: !env.OFFLINE,
        },
      },
    }),
  );

  app.post("/dev/fail-formation-put", async (c) => {
    const { after } = (await c.req.json().catch(() => ({}))) as { after?: number };
    testHooks.failFormationPutAfter = typeof after === "number" ? after : 0;
    return c.json({ data: { ok: true, after: testHooks.failFormationPutAfter } });
  });

  app.post("/dev/fail-next-fulfillment", async (c) => {
    testHooks.failNextFulfillment = true;
    return c.json({ data: { armed: true } });
  });
}


// Dev-only stand-in for the Square webhook while no Square account is connected.
if (!env.SQUARE_ACCESS_TOKEN && !env.isProd) {
  app.post("/dev/simulate-payment", async (c) => {
    const { orderId } = (await c.req.json()) as { orderId: string };
    const db = await getDb();
    const isFormation = await db.query("SELECT id FROM orders WHERE id = $1", [orderId]);
    if (isFormation.length > 0) {
      await fulfillPaidOrder(orderId, "dev-payment");
    } else {
      await fulfillPaidServiceOrder(orderId, "dev-payment");
    }
    return c.json({ data: { ok: true } });
  });
}


// Dev-only: the e2e suite's window into the database. The suite must NEVER
// open the database itself — with PGlite the server process is the embedded
// database's single owner, and a second process opening the same data
// directory aborts the WASM engine. Everything the suite needs to read or
// seed goes through these routes instead.
if (!env.isProd) {
  // The stored inputs of an OA generation — the exact markdown source the PDF
  // was rendered from, used to assert a named owner actually reached the text.
  app.get("/dev/oa-generation-inputs/:id", async (c) => {
    const db = await getDb();
    const rows = await db.query<{ inputs: unknown }>(
      "SELECT inputs FROM oa_generations WHERE id = $1",
      [c.req.param("id")],
    );
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    const raw = rows[0].inputs;
    return c.json({ data: { inputs: typeof raw === "string" ? JSON.parse(raw) : raw } });
  });

  // Save/seed/restore the Sunbiz sync state around name-check fixtures.
  app.get("/dev/sunbiz-sync-state", async (c) => {
    const db = await getDb();
    const rows = await db.query<{ baseline_label: string | null; last_daily: string | null }>(
      "SELECT baseline_label, last_daily::text AS last_daily FROM fl_sync_state WHERE id = 1",
    );
    return c.json({ data: rows.length > 0 ? rows[0] : null });
  });
  app.post("/dev/sunbiz-sync-state", async (c) => {
    const body = (await c.req.json()) as { baseline_label: string | null; last_daily: string | null } | null;
    const db = await getDb();
    if (body === null) {
      await db.query("DELETE FROM fl_sync_state WHERE id = 1");
    } else {
      await db.query(
        `INSERT INTO fl_sync_state (id, baseline_label, last_daily, updated_at) VALUES (1, $1, $2::date, now())
         ON CONFLICT (id) DO UPDATE SET baseline_label = $1, last_daily = $2::date, updated_at = now()`,
        [body.baseline_label, body.last_daily],
      );
    }
    return c.json({ data: { ok: true } });
  });

  // Seed and remove E2ETEST% name-check fixtures. The delete is hard-scoped to
  // the E2ETEST prefix so this route cannot touch real mirror rows.
  app.post("/dev/seed-test-entities", async (c) => {
    const { rows } = (await c.req.json()) as {
      rows: Array<{ docNumber: string; name: string; status: string; filingType: string; fileDate: string; lastTxnDate: string | null; normKey: string }>;
    };
    if (rows.some((r) => !r.docNumber.startsWith("E2ETEST"))) {
      return c.json(err("Only E2ETEST fixtures", "BAD_REQUEST"), 400);
    }
    const db = await getDb();
    for (const r of rows) {
      await db.query(
        `INSERT INTO fl_entities (doc_number, name, status, filing_type, file_date, last_txn_date, norm_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (doc_number) DO NOTHING`,
        [r.docNumber, r.name, r.status, r.filingType, r.fileDate, r.lastTxnDate, r.normKey],
      );
    }
    return c.json({ data: { ok: true } });
  });
  app.post("/dev/delete-test-entities", async (c) => {
    const db = await getDb();
    await db.query("DELETE FROM fl_entities WHERE doc_number LIKE 'E2ETEST%'");
    return c.json({ data: { ok: true } });
  });
}


// Dev-only: mint a set-password token so e2e can walk the portal without
// reading the emailed link from the API process's stdout.
if (!env.isProd) {
  app.post("/dev/mint-reset-token", async (c) => {
    // purpose override is test-only: the suite mints a verify_email token to
    // prove set-password refuses tokens issued for any other purpose.
    const { email, purpose = "reset_password" } = (await c.req.json()) as {
      email: string;
      purpose?: string;
    };
    const db = await getDb();
    const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, $3, $4)",
      [tokenHash, rows[0].id, purpose, new Date(Date.now() + 3600_000).toISOString()],
    );
    return c.json({ data: { token } });
  });

  // Dev-only: hand back the pending email-verification token so e2e can
  // confirm an address change without reading the emailed link.
  app.post("/dev/pending-email-token", async (c) => {
    const { email } = (await c.req.json()) as { email: string };
    const db = await getDb();
    const rows = await db.query<{ id: string; pending_email: string | null }>(
      "SELECT id, pending_email FROM clients WHERE email = $1",
      [email.toLowerCase()],
    );
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    // Mint a fresh token rather than reversing the stored hash — bound to the
    // current pending address exactly as the production request path binds it.
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at, payload) VALUES ($1, $2, 'verify_email', $3, $4)",
      [tokenHash, rows[0].id, new Date(Date.now() + 3600_000).toISOString(), rows[0].pending_email],
    );
    return c.json({ data: { token } });
  });

  // Dev-only: backdate a client's formation payment so e2e can exercise the
  // S election 65-day ordering window without waiting.
  app.post("/dev/age-formation", async (c) => {
    const { email, days } = (await c.req.json()) as { email: string; days: number };
    const db = await getDb();
    const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [email.toLowerCase()]);
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    await db.query(
      "UPDATE orders SET paid_at = now() - ($1 || ' days')::interval WHERE client_id = $2 AND paid_at IS NOT NULL",
      [String(Math.round(days)), rows[0].id],
    );
    return c.json({ data: { ok: true } });
  });

  /** Backdate an S election order past its edit window so the purge can be
   *  proven end to end instead of waited out for two weeks. */
  app.post("/dev/expire-s-election", async (c) => {
    const { orderId } = (await c.req.json()) as { orderId: string };
    const db = await getDb();
    await db.query(
      "UPDATE service_orders SET fulfilled_at = now() - interval '15 days' WHERE id = $1 AND type = 's-election'",
      [orderId],
    );
    return c.json({ data: { ok: true } });
  });
}


/** Nightly: republish the manual if this deployment carries a newer master. */
app.get("/cron/library-refresh", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const r = await refreshOwnersManual(false);
  return c.json({ data: r });
});


/** Nightly top-up of the fl_entities mirror from the Division's SFTP dailies.
 *  Same auth as /cron/purge. Fetches every YYYYMMDDc.txt newer than the last
 *  one ingested (work days only — gaps are normal). */
app.get("/cron/sunbiz-sync", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const report = await syncDailies();
  return c.json({ data: report });
});


/** Daily sweep so expired packages are destroyed even if nobody signs in.
 *  Vercel cron calls this; a shared secret keeps it from being public. */
app.get("/cron/purge", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const purged = await purgeExpiredSElections();
  // Rate-limit windows are minutes-to-hours; anything older than two days is
  // inert bookkeeping. Swept here so the table cannot grow without bound.
  const db = await getDb();
  await db.query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'");
  return c.json({ data: { purged } });
});


/** Nightly logical dump of the irreplaceable tables to private Blob storage —
 *  the copy that exists OUTSIDE the database's own company. Same auth as the
 *  other crons. Restore: docs/db-restore.md. */
app.get("/cron/db-backup", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const result = await runDbBackup();
  console.log(`[backup] ${result.key}: ${result.sizeBytes} bytes`, result.rowCounts);
  return c.json({ data: result });
});


/** Nightly Dropbox mirror of client files — the offsite copy of what
 *  otherwise exists only in Vercel Blob. Same auth as the other crons. */
app.get("/cron/file-mirror", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const result = await runFileMirror();
  console.log(`[mirror] mirrored=${result.mirrored} failed=${result.failed} skipped=${result.skipped}`);
  return c.json({ data: result });
});
}
