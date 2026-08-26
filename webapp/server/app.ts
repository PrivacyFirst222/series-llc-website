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

export const app = new Hono().basePath("/api");

const err = (message: string, code: string) => ({ error: { message, code } });

/* ------------------------------- orders ------------------------------- */

/** Ordering goes live only when the production integrations are configured;
 *  until then the form falls back to its legacy Formspree submission. */
const orderingEnabled = () =>
  env.isProd ? Boolean(env.DATABASE_URL && env.SQUARE_ACCESS_TOKEN) : true;

app.get("/config", (c) => c.json({ data: { ordering: orderingEnabled() } }));

app.post("/orders", async (c) => {
  if (!orderingEnabled()) {
    return c.json(err("Online ordering is not enabled yet.", "ORDERING_DISABLED"), 503);
  }
  // Two tiers, because the limit used to be charged before the form was even
  // read: a customer who mistyped a zip ten times was locked out for an hour
  // and told "too many submissions". A rejected attempt costs nothing anyone
  // pays for, so it is charged against a generous abuse ceiling; only an order
  // that validates — the one that creates a checkout and sends mail — is
  // charged against the low limit. The budget is per IP, which an office or a
  // mobile carrier's shared address will share.
  if (!rateLimit(`orders:req:${clientIp(c)}`, 60, 3600_000)) {
    return c.json(err("Too many attempts. Try again in an hour.", "RATE_LIMITED"), 429);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(err("Invalid JSON body", "INVALID_JSON"), 400);
  }
  const parsed = orderFormSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: { message: "Validation failed", code: "INVALID_INPUT", issues: parsed.error.issues.slice(0, 20) } },
      400,
    );
  }
  if (!rateLimit(`orders:ok:${clientIp(c)}`, 10, 3600_000)) {
    return c.json(
      err("Too many submissions. Try again in an hour.", "RATE_LIMITED"),
      429,
    );
  }
  const data = parsed.data as FloridaLLCFormData;

  const raError = validateRegisteredAgentAddress(
    data.registeredAgentStreetAddress1,
    data.registeredAgentStreetAddress2,
    data.registeredAgentState,
  );
  if (raError) return c.json(err(raError, "INVALID_INPUT"), 400);
  // Members are collected at intake only for member-managed companies (they
  // are the AMBRs the Articles list). Manager-managed intakes never see the
  // members step — ownership lives in the operating agreement questionnaire.
  if (data.managementStructure !== "MANAGER_MANAGED" && data.members.length < 1) {
    return c.json(err("At least one member is required.", "INVALID_INPUT"), 400);
  }

  // Names that our mirror of the state's records says are taken or held are
  // refused here, not just in the browser — the client cannot buy a filing
  // the Division will bounce. Waived automatically if the mirror is stale.
  const nameProblems = await unavailableNames(
    [
      data.desiredLlcName ?? "",
      ...(data.exactNameOnly === true ? [] : [data.alternateName1 ?? "", data.alternateName2 ?? ""]),
    ].filter((n) => n.trim().length > 0),
  );
  if (nameProblems && nameProblems.length > 0) {
    const p = nameProblems[0];
    return c.json(
      err(
        `The name "${p.name}" is unavailable — ${
          p.verdict === "taken"
            ? "an existing Florida company already has it"
            : "it belongs to a recently dissolved company, and Florida protects it for up to a year"
        }. Please choose a different name.`,
        "NAME_UNAVAILABLE",
      ),
      400,
    );
  }

  const payload = buildPayload(data);
  const priced = priceOrder({
    isConversion: data.filingPath === "CONVERT",
    seriesCount: data.series.length,
    certificateOfStatus: data.orderCertificateOfStatus,
    certifiedCopy: data.orderCertifiedCopy,
    ein: !!data.orderEin,
    // S election package: new formations only — a converted entity's election
    // window is measured from its original existence, not our filing.
    sElection: !!data.orderSElection && data.filingPath !== "CONVERT",
    // Taking our registered agent service on a conversion changes the agent
    // on file — s. 605.0213(7).
    registeredAgentChange: data.registeredAgentChoice === "SERVICE",
  });
  const llcName = payload.llcName.finalName || payload.llcName.desiredName || "Unnamed LLC";

  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO orders (contact_name, contact_email, package, llc_name, payload, service_fee_cents, state_fees_cents, total_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      // The CLIENT owns the order: portal account, welcome email, and the
      // admin's "Client:" line all come from the up-front card, not from the
      // correspondence contact (which is only where updates go).
      personLegalName(data.clientFirstName, data.clientLastName, data.clientSuffix),
      data.clientEmail.toLowerCase(),
      data.filingPath === "CONVERT" ? "CONVERT" : "NEW",
      llcName,
      JSON.stringify(payload),
      priced.serviceFeeCents,
      priced.stateFeesCents,
      priced.totalCents,
    ],
  );
  const orderId = rows[0].id;

  const checkout = await createCheckout({
    orderId,
    llcName,
    priced,
    buyerEmail: data.correspondentEmail,
  });
  await db.query("UPDATE orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    orderId,
  ]);

  return c.json({ data: { orderId, checkoutUrl: checkout.url, totalCents: priced.totalCents } });
});

app.get("/orders/:id/status", async (c) => {
  const db = await getDb();
  const rows = await db.query<{ status: string; llc_name: string; total_cents: number }>(
    "SELECT status, llc_name, total_cents FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Order not found", "NOT_FOUND"), 404);
  return c.json({ data: { status: rows[0].status, llcName: rows[0].llc_name, totalCents: rows[0].total_cents } });
});

/* ------------------------- payment fulfillment ------------------------- */

async function fulfillPaidOrder(orderId: string, squarePaymentId: string | null): Promise<void> {
  if (failNextFulfillment) {
    failNextFulfillment = false;
    throw new Error("injected fulfillment failure (dev test scaffolding)");
  }
  const db = await getDb();
  // Claim the order atomically. Reading the status and then deciding was a
  // race with two failure modes, both audited 26 Aug 2026: concurrent events
  // could fulfil twice, and a late duplicate could drag an order that had
  // already advanced to `filed`/`formed` back to `paid`. The WHERE clause
  // does the deciding now, so exactly one caller can ever win, and only from
  // pending_payment. Zero rows back = somebody already handled it.
  const claimed = await db.query<{
    id: string; contact_name: string; contact_email: string;
    llc_name: string; total_cents: number; payload: unknown;
  }>(
    `UPDATE orders SET status = 'paid', paid_at = now(), square_payment_id = $1
      WHERE id = $2 AND status = 'pending_payment'
      RETURNING id, contact_name, contact_email, llc_name, total_cents, payload`,
    [squarePaymentId, orderId],
  );
  if (claimed.length === 0) return;
  const order = claimed[0];

  // Upsert the client account for this email.
  const existing = await db.query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM clients WHERE email = $1",
    [order.contact_email],
  );
  let clientId: string;
  if (existing.length > 0) {
    clientId = existing[0].id;
  } else {
    const created = await db.query<{ id: string }>(
      "INSERT INTO clients (email, name) VALUES ($1, $2) RETURNING id",
      [order.contact_email, order.contact_name],
    );
    clientId = created[0].id;
  }
  await db.query("UPDATE orders SET client_id = $1 WHERE id = $2", [clientId, orderId]);

  // An EIN purchased with the formation becomes a paid service order awaiting
  // the responsible party's details, provided through the portal's secure form.
  const payload = (typeof order.payload === "string" ? JSON.parse(order.payload) : order.payload) as {
    optionalDocuments?: { ein?: boolean; sElection?: boolean };
    filingPath?: string;
  } | null;
  if (payload?.optionalDocuments?.ein) {
    await db.query(
      `INSERT INTO service_orders (client_id, type, status, llc_name, details, amount_cents, formation_order_id, paid_at, square_payment_id)
       VALUES ($1, 'ein', 'awaiting_info', $2, $3, $4, $5, now(), $6)`,
      [clientId, order.llc_name, JSON.stringify({ target: "company" }), EIN_FEE_CENTS, orderId, squarePaymentId],
    );
  }
  if (payload?.optionalDocuments?.sElection && payload?.filingPath !== "CONVERT") {
    await db.query(
      `INSERT INTO service_orders (client_id, type, status, llc_name, details, amount_cents, formation_order_id, paid_at, square_payment_id)
       VALUES ($1, 's-election', 'awaiting_info', $2, $3, $4, $5, now(), $6)`,
      [clientId, order.llc_name, JSON.stringify({}), S_ELECTION_FEE_CENTS, orderId, squarePaymentId],
    );
  }

  // First-time clients get a set-password link; returning clients just get notified.
  if (existing.length === 0 || !existing[0].password_hash) {
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'set_password', $3)",
      [tokenHash, clientId, new Date(Date.now() + 7 * 86400_000).toISOString()],
    );
    const mail = welcomeEmail(order.contact_name, `${env.PUBLIC_BASE_URL}/portal/set-password?token=${token}`);
    // Email failures must never unwind a recorded payment; the client can
    // always recover portal access through the forgot-password flow.
    await sendMail({ to: order.contact_email, ...mail }).catch((e) =>
      console.error("[fulfill] welcome email failed:", e),
    );
  }

  if (env.ADMIN_NOTIFY_EMAIL) {
    const mail = orderPaidEmail({
      llcName: order.llc_name,
      contactName: order.contact_name,
      contactEmail: order.contact_email,
      totalCents: order.total_cents,
      orderId: order.id,
      adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
    });
    await sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...mail, replyTo: order.contact_email }).catch((e) =>
      console.error("[fulfill] admin notification email failed:", e),
    );
  }
}

/** Marks a portal service order paid and routes it to the right next state. */
async function fulfillPaidServiceOrder(serviceOrderId: string, squarePaymentId: string | null): Promise<void> {
  const db = await getDb();
  const peek = await db.query<{ type: string }>(
    "SELECT type FROM service_orders WHERE id = $1",
    [serviceOrderId],
  );
  if (peek.length === 0) return;
  const nextStatus = peek[0].type === "ein" || peek[0].type === "s-election" ? "awaiting_info" : "in_progress";
  // Claimed the same way as a formation order — see fulfillPaidOrder.
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown; amount_cents: number;
  }>(
    `UPDATE service_orders SET status = $1, paid_at = now(), square_payment_id = $2
      WHERE id = $3 AND status = 'pending_payment'
      RETURNING id, client_id, type, status, llc_name, details, amount_cents`,
    [nextStatus, squarePaymentId, serviceOrderId],
  );
  if (rows.length === 0) return;
  const so = rows[0];
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    seriesName?: string; target?: string;
  };
  const summary =
    so.type === "series"
      ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
      : so.type === "s-election"
        ? `S Corporation Election Package — ${so.llc_name}`
        : `Federal EIN — ${details.target === "series" ? details.seriesName ?? "series" : so.llc_name}`;
  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [so.client_id],
  );
  const client = clients[0];
  if (client) {
    const mail = serviceOrderClientEmail({
      type: so.type as "series" | "ein" | "s-election",
      summary,
      needsInfo: so.type === "ein" || so.type === "s-election",
      portalUrl: `${env.PUBLIC_BASE_URL}/portal`,
    });
    sendMail({ to: client.email, ...mail }).catch((e) => console.error("[service] client email failed:", e));
    if (env.ADMIN_NOTIFY_EMAIL) {
      const notice = serviceOrderAdminEmail({
        type: so.type,
        summary,
        clientName: client.name,
        clientEmail: client.email,
        amountCents: so.amount_cents,
        adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
      });
      sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...notice, replyTo: client.email }).catch((e) =>
        console.error("[service] admin email failed:", e),
      );
    }
  }
}

/** Square tells us what it actually captured. If that disagrees with what we
 *  charged, the safe move is to deliver NOTHING and put a human on it: a
 *  mismatch is a partial capture, a currency surprise, or a payment attached
 *  to the wrong order, and none of those should silently create an account and
 *  a filing. Events carrying no money data (the dev harness) pass through
 *  unchanged — this reconciles Square's own figures, it is not the
 *  anti-forgery control; the signature check is. */
function moneyMismatch(
  money: { amount?: number | string; currency?: string } | undefined,
  expectedCents: number,
): string | null {
  if (!money || money.amount === undefined || money.amount === null) return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return `unreadable amount ${String(money.amount)}`;
  if (amount !== expectedCents) return `captured ${amount} but the order is ${expectedCents}`;
  const currency = (money.currency ?? "USD").toUpperCase();
  if (currency !== "USD") return `captured in ${currency}, not USD`;
  return null;
}

async function alertMoneyMismatch(reason: string, squareOrderId: string, paymentId: string): Promise<void> {
  console.error(`[webhook] payment does not match the order — nothing fulfilled: ${reason} (square order ${squareOrderId}, payment ${paymentId})`);
  if (!env.ADMIN_NOTIFY_EMAIL) return;
  await sendMail({
    to: env.ADMIN_NOTIFY_EMAIL,
    subject: "Payment did not match the order — nothing was delivered",
    html: `<p>A completed Square payment did not match the order it points at, so no account was created and nothing was delivered.</p>
           <p><strong>${reason}</strong></p>
           <p>Square order: ${squareOrderId}<br/>Payment: ${paymentId}</p>
           <p>Check the payment in Square, then either refund it or fulfil the order by hand from the admin panel.</p>`,
  }).catch((e) => console.error("[webhook] mismatch alert failed:", e));
}

app.post("/square/webhook", async (c) => {
  const rawBody = await c.req.text();
  const ok = verifyWebhookSignature({
    signatureHeader: c.req.header("x-square-hmacsha256-signature"),
    rawBody,
    notificationUrl: `${env.PUBLIC_BASE_URL}/api/square/webhook`,
  });
  if (!ok) return c.json(err("Bad signature", "BAD_SIGNATURE"), 401);

  const event = JSON.parse(rawBody) as {
    event_id?: string;
    type?: string;
    data?: { object?: { payment?: { id: string; status: string; order_id?: string; amount_money?: { amount?: number | string; currency?: string } } } };
  };

  const db = await getDb();
  if (event.event_id) {
    // Claim the event only if it has never been processed to completion. An
    // earlier delivery that died mid-fulfillment leaves processed_at NULL and
    // is therefore retryable — recording the id up front and refusing every
    // later delivery is exactly how a paid order could vanish.
    const claimedEvent = await db.query(
      `INSERT INTO webhook_events (event_id) VALUES ($1)
       ON CONFLICT (event_id) DO UPDATE SET received_at = now()
         WHERE webhook_events.processed_at IS NULL
       RETURNING event_id`,
      [event.event_id],
    );
    if (claimedEvent.length === 0) return c.json({ data: { ok: true, duplicate: true } });
  }

  const payment = event.data?.object?.payment;
  if (event.type?.startsWith("payment.") && payment?.status === "COMPLETED" && payment.order_id) {
    const rows = await db.query<{ id: string; total_cents: number }>(
      "SELECT id, total_cents FROM orders WHERE square_order_id = $1",
      [payment.order_id],
    );
    if (rows.length > 0) {
      const mismatch = moneyMismatch(payment.amount_money, rows[0].total_cents);
      if (mismatch) await alertMoneyMismatch(mismatch, payment.order_id, payment.id);
      else await fulfillPaidOrder(rows[0].id, payment.id);
    } else {
      const svc = await db.query<{ id: string; amount_cents: number }>(
        "SELECT id, amount_cents FROM service_orders WHERE square_order_id = $1",
        [payment.order_id],
      );
      if (svc.length > 0) {
        const mismatch = moneyMismatch(payment.amount_money, svc[0].amount_cents);
        if (mismatch) await alertMoneyMismatch(mismatch, payment.order_id, payment.id);
        else await fulfillPaidServiceOrder(svc[0].id, payment.id);
      }
    }
  }
  // Only now is the event genuinely handled. Anything above that throws leaves
  // processed_at NULL, so Square's retry is accepted rather than dismissed.
  if (event.event_id) {
    await db.query("UPDATE webhook_events SET processed_at = now() WHERE event_id = $1", [event.event_id]);
  }
  return c.json({ data: { ok: true } });
});

/** Test scaffolding (dev only): makes the next fulfillment throw once, so the
 *  suite can reproduce a transient failure mid-webhook and prove the retry
 *  still fulfills. Codex's RUN-PAY-01 reproduction, automated. */
let failNextFulfillment = false;
if (!env.isProd) {
  app.post("/dev/fail-next-fulfillment", async (c) => {
    failNextFulfillment = true;
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
    const { email } = (await c.req.json()) as { email: string };
    const db = await getDb();
    const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'reset_password', $3)",
      [tokenHash, rows[0].id, new Date(Date.now() + 3600_000).toISOString()],
    );
    return c.json({ data: { token } });
  });

  // Dev-only: hand back the pending email-verification token so e2e can
  // confirm an address change without reading the emailed link.
  app.post("/dev/pending-email-token", async (c) => {
    const { email } = (await c.req.json()) as { email: string };
    const db = await getDb();
    const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
    // Mint a fresh token rather than reversing the stored hash.
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'verify_email', $3)",
      [tokenHash, rows[0].id, new Date(Date.now() + 3600_000).toISOString()],
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

/* ---------------------------- address verify ---------------------------- */

const verifyAddressSchema = z.object({
  address1: z.string().min(1).max(200),
  address2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  zip: z.string().min(3).max(20),
});

/** USPS-certified (CASS) verification via Smarty. Never blocks: with no
 *  credentials, on vendor errors, or on timeouts the answer is "skipped" and
 *  the form proceeds.
 *
 *  Driven by Smarty's dpv_match_code, which is the authoritative signal
 *  (footnotes are not: N# means "standardized", e.g. a typo was fixed):
 *    Y -> verified      USPS confirms delivery to this exact address
 *    D -> missing_unit  building is real but needs a suite/unit number
 *    S -> invalid_unit  building is real but that unit is not recognized
 *    N -> unverified    USPS does not recognize the address at all
 *  `normalized` carries Smarty's standardized version, so a typo or wrong
 *  ZIP comes back corrected for the customer to accept. */
app.post("/address/verify", async (c) => {
  if (!rateLimit(`addr:${clientIp(c)}`, 60, 900_000)) {
    return c.json({ data: { status: "skipped" } });
  }
  const body = verifyAddressSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid address payload", "INVALID_INPUT"), 400);
  if (!env.SMARTY_AUTH_ID || !env.SMARTY_AUTH_TOKEN) {
    return c.json({ data: { status: "skipped" } });
  }

  const a = body.data;
  const params = new URLSearchParams({
    "auth-id": env.SMARTY_AUTH_ID,
    "auth-token": env.SMARTY_AUTH_TOKEN,
    street: a.address1,
    ...(a.address2 ? { secondary: a.address2 } : {}),
    city: a.city,
    state: a.state,
    zipcode: a.zip,
    candidates: "1",
    match: "strict",
  });
  try {
    const res = await fetch(`https://us-street.api.smarty.com/street-address?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return c.json({ data: { status: "skipped" } });
    const out = (await res.json()) as
      | {
          delivery_line_1?: string;
          delivery_line_2?: string;
          components?: { city_name?: string; state_abbreviation?: string; zipcode?: string; plus4_code?: string };
          analysis?: { dpv_match_code?: string; footnotes?: string };
        }[]
      | { errors?: unknown };
    if (!Array.isArray(out)) return c.json({ data: { status: "skipped" } });
    const top = out[0];
    // No candidate at all: USPS does not know this address.
    if (!top) return c.json({ data: { status: "unverified", normalized: null } });

    const dpv = (top.analysis?.dpv_match_code ?? "").toUpperCase();
    const status =
      dpv === "Y" ? "verified"
      : dpv === "D" ? "missing_unit"
      : dpv === "S" ? "invalid_unit"
      : "unverified";
    const comp = top.components ?? {};
    const normalized = {
      address1: [top.delivery_line_1, top.delivery_line_2].filter(Boolean).join(" "),
      city: comp.city_name ?? "",
      state: comp.state_abbreviation ?? "",
      zip: comp.zipcode ?? "",
    };
    return c.json({
      data: {
        status,
        normalized: normalized.address1 ? normalized : null,
      },
    });
  } catch {
    return c.json({ data: { status: "skipped" } });
  }
});

/* --------------------------------- auth -------------------------------- */

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

app.post("/auth/login", async (c) => {
  if (!rateLimit(`login:${clientIp(c)}`, 10, 900_000)) {
    return c.json(err("Too many attempts. Try again in a few minutes.", "RATE_LIMITED"), 429);
  }
  const body = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Email and password are required.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM clients WHERE email = $1",
    [body.data.email.toLowerCase()],
  );
  const bad = () => c.json(err("Incorrect email or password.", "BAD_CREDENTIALS"), 401);
  if (rows.length === 0 || !rows[0].password_hash) return bad();
  if (!(await verifyPassword(body.data.password, rows[0].password_hash))) return bad();
  await createSession(c, { clientId: rows[0].id });
  return c.json({ data: { ok: true } });
});

app.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ data: { ok: true } });
});

app.get("/auth/me", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ email: string; name: string; pending_email: string | null; ra_cancellation_requested_at: string | null }>(
    "SELECT email, name, pending_email, ra_cancellation_requested_at FROM clients WHERE id = $1",
    [session.clientId],
  );
  return c.json({
    data: {
      email: rows[0]?.email ?? "",
      name: rows[0]?.name ?? "",
      pendingEmail: rows[0]?.pending_email ?? null,
      raCancellationRequestedAt: rows[0]?.ra_cancellation_requested_at ?? null,
    },
  });
});

app.post("/auth/forgot", async (c) => {
  if (!rateLimit(`forgot:${clientIp(c)}`, 5, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
  // Always report success — never reveal whether an account exists.
  if (!body.success) return c.json({ data: { ok: true } });
  const db = await getDb();
  const rows = await db.query<{ id: string }>("SELECT id FROM clients WHERE email = $1", [
    body.data.email.toLowerCase(),
  ]);
  if (rows.length > 0) {
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'reset_password', $3)",
      [tokenHash, rows[0].id, new Date(Date.now() + 3600_000).toISOString()],
    );
    const mail = resetEmail(`${env.PUBLIC_BASE_URL}/portal/set-password?token=${token}`);
    await sendMail({ to: body.data.email, ...mail });
  }
  return c.json({ data: { ok: true } });
});

app.post("/auth/set-password", async (c) => {
  const body = z
    .object({ token: z.string().min(10), password: z.string().min(8, "Use at least 8 characters.") })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error?.issues[0]?.message ?? "Invalid request", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ token_hash: string; client_id: string }>(
    "SELECT token_hash, client_id FROM auth_tokens WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL",
    [hashToken(body.data.token)],
  );
  if (rows.length === 0) {
    return c.json(err("This link is invalid or has expired. Use “Forgot password” to get a new one.", "BAD_TOKEN"), 400);
  }
  await db.query("UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1", [rows[0].token_hash]);
  await db.query("UPDATE clients SET password_hash = $1 WHERE id = $2", [
    await hashPassword(body.data.password),
    rows[0].client_id,
  ]);
  await db.query("DELETE FROM sessions WHERE client_id = $1", [rows[0].client_id]);
  await createSession(c, { clientId: rows[0].client_id });
  return c.json({ data: { ok: true } });
});

/* -------------------------------- portal ------------------------------- */

app.get("/portal/documents", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const docs = await db.query<{
    id: string; kind: string; title: string; size_bytes: number; created_at: string;
  }>(
    "SELECT id, kind, title, size_bytes, created_at FROM documents WHERE client_id = $1 ORDER BY created_at DESC",
    [session.clientId],
  );
  return c.json({ data: docs });
});

app.get("/portal/documents/:id/download", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId && !session?.isAdmin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ storage_key: string; title: string; content_type: string; client_id: string }>(
    "SELECT storage_key, title, content_type, client_id FROM documents WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const doc = rows[0];
  if (!session.isAdmin && doc.client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const stream = await readFileStream(doc.storage_key);
  const filename = doc.title.replace(/[^\w.-]+/g, "_") || "document";
  return new Response(stream as BodyInit, {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/* ------------------------- operating agreement ------------------------- */

interface SeedPayload {
  filingPath?: string;
  llcName?: { finalName?: string; desiredName?: string };
  principalOfficeAddress?: { address1?: string; address2?: string; city?: string; state?: string; zip?: string };
  management?: {
    structure?: string;
    managersOrAuthorizedRepresentatives?: { role?: string; firstName?: string; lastName?: string; suffix?: string; fullName?: string; businessEntityName?: string }[];
  };
  members?: { memberList?: { firstName?: string; lastName?: string; suffix?: string; fullLegalName?: string; address1?: string; address2?: string; city?: string; state?: string; zip?: string }[] };
  series?: { id: string; name: string }[];
}

async function oaSeed(clientId: string): Promise<{
  llcName: string;
  filingPath: string;
  managementStructure: string;
  managerNames: string[];
  principalAddress: string;
  members: { name: string; address: string }[];
  series: { name: string; purpose: string }[];
} | null> {
  const db = await getDb();
  const orders = await db.query<{ payload: unknown; llc_name: string }>(
    // paid_at, not status = 'paid'. "Paid" stopped being the last status on
    // 16 August when filed and formed were added, and every query that asked
    // for the string rather than the fact broke silently — this one by telling
    // a client whose LLC had just been formed that they had no formed LLC.
    "SELECT payload, llc_name FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC NULLS LAST LIMIT 1",
    [clientId],
  );
  if (orders.length === 0) return null;
  const p = (typeof orders[0].payload === "string" ? JSON.parse(orders[0].payload) : orders[0].payload) as SeedPayload;
  const addr = p.principalOfficeAddress ?? {};
  const principalAddress = [addr.address1, addr.address2, [addr.city, addr.state].filter(Boolean).join(", "), addr.zip]
    .filter((x) => x && String(x).trim())
    .join(", ");
  const members = (p.members?.memberList ?? []).map((m) => ({
    name:
      personLegalName(m.firstName, m.lastName, m.suffix) || (m.fullLegalName ?? ""),
    address: [m.address1, m.address2, [m.city, m.state].filter(Boolean).join(", "), m.zip]
      .filter((x) => x && String(x).trim())
      .join(", "),
  }));
  const managementStructure = p.management?.structure ?? "";
  // Every MGR entry becomes a Manager. Authorized representatives sign the
  // Articles and manage nothing, so a listed AR must never be named Manager —
  // and the list is not ordered, so taking the first entry named whoever the
  // client happened to type first.
  const managerNames = (p.management?.managersOrAuthorizedRepresentatives ?? [])
    .filter((e) => (e.role ?? "MGR") === "MGR")
    .map((e) =>
      (
        personLegalName(e.firstName, e.lastName, e.suffix) ||
        e.fullName ||
        e.businessEntityName ||
        ""
      ).trim(),
    )
    .filter(Boolean);
  // No fallback. Naming the first member as Manager because the list was
  // empty appoints someone to an office the client never put them in — the
  // same fault as the comment above warns about for authorized
  // representatives, one step removed. The order should never have been
  // accepted without a Manager (server/validation.ts, check 6); if one
  // reaches here, refuse rather than invent.
  if (managementStructure === "MANAGER_MANAGED" && managerNames.length === 0) {
    throw new Error(
      "This order is manager-managed but lists no Manager. Correct the order before generating an agreement.",
    );
  }
  // Series = intake series + any fulfilled portal series orders
  const svcSeries = await db.query<{ details: unknown }>(
    "SELECT details FROM service_orders WHERE client_id = $1 AND type = 'series' AND status IN ('in_progress','fulfilled')",
    [clientId],
  );
  const series: { name: string; purpose: string }[] = (p.series ?? []).map((sr) => ({ name: sr.name, purpose: "" }));
  for (const row of svcSeries) {
    const d = (typeof row.details === "string" ? JSON.parse(row.details) : row.details) as { seriesName?: string; purpose?: string };
    if (d.seriesName && !series.some((sr) => sr.name === d.seriesName)) {
      series.push({ name: d.seriesName, purpose: d.purpose ?? "" });
    }
  }
  return {
    llcName: p.llcName?.finalName || orders[0].llc_name,
    filingPath: p.filingPath ?? "NEW",
    managementStructure,
    managerNames,
    principalAddress,
    members,
    series,
  };
}

const oaAnswersSchema = z.object({
  firstOrAmended: z.enum(["first", "amended"]).optional(),
  sElection: z.boolean().optional(), // true = build on the S corporation form
  // Asked, not derived. The intake list is where the owners START; a client can
  // take on a partner or buy one out before the agreement is written.
  multiOwner: z.boolean().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorized: z.boolean().optional(),
  contributionToCompany: z.string().max(300).optional(),
  ownershipMode: z.enum(["percent", "fraction"]).optional(),
  members: z
    .array(
      z.object({
        // Name and address travel WITH the owner. Held in a second array keyed
        // by position, a deletion would shift every share onto the wrong person.
        name: z.string().max(200).optional(),
        address: z.string().max(300).optional(),
        percentage: z.number().min(0).max(100).optional(),
        numerator: z.number().int().min(0).max(100_000).optional(),
        denominator: z.number().int().min(1).max(100_000).optional(),
        contribution: z.string().max(300).optional(),
        todBeneficiary: z.string().max(300).optional(),
      }),
    )
    .max(20)
    .optional(),
  series: z
    .array(
      z.object({
        purpose: z.string().max(300).optional(),
        contribution: z.string().max(300).optional(),
      }),
    )
    .optional(),
  includeCapitalCalls: z.boolean().optional(),
  capitalCallCap: z.number().min(0).max(100_000_000).optional(),
  competition: z.enum(["A", "B"]).optional(),
  includeShotgun: z.boolean().optional(),
  borrowingThreshold: z.number().min(0).max(100_000_000).optional(),
  couples: z
    .array(
      z.object({
        a: z.number().int().min(0),
        b: z.number().int().min(0),
        form: z.enum(["TBE", "JTWROS"]),
        percentage: z.number().min(0).max(100).optional(),
        numerator: z.number().int().min(0).max(100_000).optional(),
        denominator: z.number().int().min(1).max(100_000).optional(),
        contribution: z.string().max(300).optional(),
        todBeneficiary: z.string().max(300).optional(),
      }),
    )
    .max(10)
    .optional(),
});

const SPOUSAL_FORM_LABEL: Record<"TBE" | "JTWROS", string> = {
  TBE: "tenants by the entirety",
  JTWROS: "joint tenants with right of survivorship",
};

// Who owns the company, as the client last said. The intake list is only the
// starting point: members are never filed with the Division (server/filing.ts
// has no member field), so nothing about the formation record fixes it. An
// untouched draft carries shares but no names, which is how the two are told
// apart. Every document that names the owners resolves them HERE — otherwise
// two documents generated the same afternoon disagree about who owns the company.
/** A person's printed legal name, suffix set off by a comma — the form's
 *  fullPersonName, server-side. Exhibit A and the signature blocks print
 *  this verbatim, so "John Smith, Jr." must survive the whole path. */
export function personLegalName(first?: string, last?: string, suffix?: string): string {
  const base = [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const sfx = (suffix ?? "").trim().replace(/^,\s*/, "");
  if (!base) return sfx;
  return sfx ? `${base}, ${sfx}` : base;
}

export function effectiveOwners(
  seedMembers: { name: string; address: string }[],
  answers: { members?: { name?: string; address?: string }[] } | null | undefined,
): { name: string; address: string }[] {
  const answered = answers?.members ?? [];
  const edited = answered.some((m) => (m.name ?? "").trim() !== "");
  return edited
    ? answered.map((m) => ({ name: (m.name ?? "").trim(), address: (m.address ?? "").trim() }))
    : seedMembers.map((m) => ({ name: m.name, address: m.address }));
}

async function savedOaAnswers(clientId: string): Promise<{ members?: { name?: string; address?: string }[] } | null> {
  const db = await getDb();
  const rows = await db.query<{ answers: unknown }>("SELECT answers FROM oa_profiles WHERE client_id = $1", [clientId]);
  if (rows.length === 0) return null;
  const raw = rows[0].answers;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as { members?: { name?: string; address?: string }[] };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

app.get("/portal/oa", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const seed = await oaSeed(session.clientId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const db = await getDb();
  const saved = await db.query<{ answers: unknown }>("SELECT answers FROM oa_profiles WHERE client_id = $1", [session.clientId]);
  const gens = await db.query(
    `SELECT id, document_id, template_version, amended_restated, created_at,
            COALESCE(generation_number, 0) AS generation_number,
            inputs->>'version' AS version
       FROM oa_generations WHERE client_id = $1 ORDER BY created_at DESC`,
    [session.clientId],
  );
  const savedAnswers =
    saved.length > 0
      ? ((typeof saved[0].answers === "string" ? JSON.parse(saved[0].answers as string) : saved[0].answers) as Record<string, unknown>)
      : {};
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Reports where the client actually is, not where they started: an owner
  // added in the portal makes this true even though the intake list had one.
  const multiOwner = effectiveOwners(seed.members, savedAnswers as { members?: { name?: string }[] }).length > 1;
  // The S election is an ANSWER, not a fact about the order, so the seed cannot
  // know it. It reports the two structural facts and the version they imply
  // before any election — never a second, differently-shaped version string.
  const version = oaVersion({ multiOwner, memberManaged, sElection: false });
  return c.json({
    data: {
      seed,
      version,
      multiOwner,
      memberManaged,
      blocked: false,
      templateVersion: OA_TEMPLATE_VERSION,
      answers: savedAnswers,
      generations: gens,
    },
  });
});

app.put("/portal/oa/answers", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = oaAnswersSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid answers.", "INVALID_INPUT"), 400);
  const db = await getDb();
  // A revision, when the client supplies one, makes the write monotonic: an
  // earlier keystroke that arrives late is ignored rather than allowed to bury
  // a newer answer. Callers without a revision keep the old unconditional
  // behaviour and leave the stored revision untouched.
  const revRaw = c.req.query("rev");
  const rev = revRaw !== undefined && revRaw !== "" ? Number(revRaw) : null;
  if (rev !== null && Number.isFinite(rev)) {
    const wrote = await db.query<{ rev: number }>(
      `INSERT INTO oa_profiles (client_id, answers, rev, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (client_id) DO UPDATE SET answers = $2, rev = $3, updated_at = now()
         WHERE oa_profiles.rev < $3
       RETURNING rev`,
      [session.clientId, JSON.stringify(body.data), rev],
    );
    if (wrote.length === 0) return c.json({ data: { ok: true, stale: true } });
    return c.json({ data: { ok: true, rev } });
  }
  await db.query(
    `INSERT INTO oa_profiles (client_id, answers, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (client_id) DO UPDATE SET answers = $2, updated_at = now()`,
    [session.clientId, JSON.stringify(body.data)],
  );
  return c.json({ data: { ok: true } });
});

app.post("/portal/oa/generate", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`oagen:${session.clientId}`, 10, 3600_000)) {
    return c.json(err("Too many generations. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = oaAnswersSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid answers.", "INVALID_INPUT"), 400);
  const a = body.data;
  const seed = await oaSeed(session.clientId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  // The owners are an answer, not a reading of the formation record. Members
  // are never filed with the Division — server/filing.ts has no member field —
  // so the intake list is where the list starts, not what it is fixed to.
  // Untouched drafts carry shares but no names, which is how we tell them apart.
  const owners = effectiveOwners(seed.members, a);
  if (owners.length === 0) {
    return c.json(err("An operating agreement needs at least one owner.", "INVALID_INPUT"), 400);
  }
  if (owners.some((o) => !o.name || !o.address)) {
    return c.json(
      err("Every owner needs a full legal name and an address — both are printed in Exhibit A and the signature block.", "INVALID_INPUT"),
      400,
    );
  }
  const multiOwner = owners.length > 1;
  // The answer to "more than one owner?" and the list itself must agree, or one
  // of the two is wrong and we cannot know which.
  if (a.multiOwner !== undefined && a.multiOwner !== multiOwner) {
    return c.json(
      err(
        a.multiOwner
          ? "You answered that the LLC has more than one owner, but only one is listed. Add the others."
          : "You answered that the LLC has one owner, but more than one is listed. Remove the others.",
        "INVALID_INPUT",
      ),
      400,
    );
  }
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Management structure × tax posture, all four structures by both postures.
  // A sole owner CAN be member-managed and often is: managementStructure comes
  // off the formation record, which is what was filed with the Division, and
  // handing a member-managed filer a manager-managed agreement contradicts
  // their own Articles. Until 16 August this collapsed every sole owner onto
  // the manager-managed forms because the member-managed single-member forms
  // did not exist yet.
  const version = oaVersion({ multiOwner, memberManaged, sElection: !!a.sElection });
  if (a.authorized !== true) {
    return c.json(err("Please confirm you are authorized to provide this information.", "INVALID_INPUT"), 400);
  }
  if (!a.effectiveDate) return c.json(err("An effective date is required.", "INVALID_INPUT"), 400);
  if (!a.firstOrAmended) return c.json(err("Choose first agreement or amended and restated.", "INVALID_INPUT"), 400);

  const db = await getDb();
  const priorGens = await db.query<{ created_at: unknown }>(
    "SELECT created_at FROM oa_generations WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
    [session.clientId],
  );
  // Drivers differ: Neon returns ISO strings, PGlite returns Date objects.
  const priorDate =
    priorGens.length > 0
      ? new Date(String(priorGens[0].created_at)).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  // Never reuse a number: it is printed on the PDF, and a client may still hold
  // a copy of an agreement they later deleted. The counter lives on the client,
  // so deleting a row cannot roll it back.
  const bumped = await db.query<{ oa_generation_seq: number }>(
    "UPDATE clients SET oa_generation_seq = oa_generation_seq + 1 WHERE id = $1 RETURNING oa_generation_seq",
    [session.clientId],
  );
  const nextGenerationNumber = Number(bumped[0]?.oa_generation_seq ?? 1);

  // Spousal joint-ownership units: two seed members merge into one marital
  // interest ("A and B, husband and wife, as tenants by the entirety").
  const ownershipMode: OwnershipMode = a.ownershipMode ?? "percent";
  const couples = multiOwner ? (a.couples ?? []) : [];
  const pairedIdx = new Set<number>();
  for (const cpl of couples) {
    if (
      cpl.a === cpl.b ||
      !owners[cpl.a] ||
      !owners[cpl.b] ||
      pairedIdx.has(cpl.a) ||
      pairedIdx.has(cpl.b)
    ) {
      return c.json(err("Invalid spousal pairing.", "INVALID_INPUT"), 400);
    }
    pairedIdx.add(cpl.a);
    pairedIdx.add(cpl.b);
  }
  const coupleAt = (i: number) => couples.find((cpl) => cpl.a === i || cpl.b === i);
  // Names only. The words around them — " as …" — belong to the master's
  // Exhibit A row, not to this file; and Adam's rule is that "John Doe and Jane
  // Doe as tenants by the entirety" is sufficient, so "husband and wife," is
  // gone from the document entirely.
  const coupleName = (cpl: (typeof couples)[number]) =>
    `${owners[cpl.a].name} and ${owners[cpl.b].name}`;

  const members: OaInputs["members"] = [];
  const emittedCouples = new Set<(typeof couples)[number]>();
  owners.forEach((m, i) => {
    const cpl = coupleAt(i);
    if (cpl) {
      if (emittedCouples.has(cpl)) return;
      emittedCouples.add(cpl);
      const cplShare: OwnershipShare = { percentage: cpl.percentage, numerator: cpl.numerator, denominator: cpl.denominator };
      members.push({
        name: coupleName(cpl),
        address: owners[cpl.a].address,
        percentage: shareValue(ownershipMode, cplShare),
        percentageLabel: shareLabel(ownershipMode, cplShare),
        jointHolding: SPOUSAL_FORM_LABEL[cpl.form],
        contribution: cpl.contribution ?? "",
        todBeneficiary: cpl.todBeneficiary
          ? `${cpl.todBeneficiary} (effective at the death of the last surviving spouse)`
          : "",
        signatories: [owners[cpl.a].name, owners[cpl.b].name],
      });
    } else {
      const mShare: OwnershipShare = multiOwner
        ? { percentage: a.members?.[i]?.percentage, numerator: a.members?.[i]?.numerator, denominator: a.members?.[i]?.denominator }
        : { percentage: 100 };
      members.push({
        name: m.name,
        address: m.address,
        percentage: shareValue(multiOwner ? ownershipMode : "percent", mShare),
        percentageLabel: shareLabel(multiOwner ? ownershipMode : "percent", mShare),
        contribution: a.members?.[i]?.contribution ?? "",
        todBeneficiary: a.members?.[i]?.todBeneficiary ?? "",
      });
    }
  });
  const isSCorp =
    version === "s" || version === "member-s" ||
    version === "single-s" || version === "member-single-s";
  if (isSCorp && !multiOwner && !members[0].contribution) {
    // sole owner on the S form: the single flow collects the contribution as contributionToCompany
    members[0].contribution = a.contributionToCompany ?? "";
  }
  // One ownership unit — a couple holding jointly with no third owner — owns
  // the whole company by definition. The questionnaire doesn't ask, so nothing
  // is stored; fill it in rather than failing a total check against nothing.
  if (members.length === 1) {
    members[0].percentage = 100;
    members[0].percentageLabel = "100%";
  }
  if (multiOwner && members.length > 1) {
    // Exact arithmetic: three owners at 1/3 each must total one whole, which
    // no float comparison of 33.33 can honestly report.
    const shares: OwnershipShare[] = [];
    const seenCouples = new Set<(typeof couples)[number]>();
    owners.forEach((_, i) => {
      const cpl = coupleAt(i);
      if (cpl) {
        if (seenCouples.has(cpl)) return;
        seenCouples.add(cpl);
        shares.push({ percentage: cpl.percentage, numerator: cpl.numerator, denominator: cpl.denominator });
      } else {
        shares.push({
          percentage: a.members?.[i]?.percentage,
          numerator: a.members?.[i]?.numerator,
          denominator: a.members?.[i]?.denominator,
        });
      }
    });
    if (!sharesAreComplete(ownershipMode, shares)) {
      return c.json(
        err(
          ownershipMode === "fraction"
            ? "Ownership fractions must add up to exactly one whole."
            : "Percentage interests must total exactly 100%.",
          "INVALID_INPUT",
        ),
        400,
      );
    }
    if (a.competition !== "A" && a.competition !== "B") {
      return c.json(err("Choose a competition alternative.", "INVALID_INPUT"), 400);
    }
    if (a.includeCapitalCalls === undefined || a.includeShotgun === undefined) {
      return c.json(err("Answer the optional-provision questions.", "INVALID_INPUT"), 400);
    }
    if (a.includeCapitalCalls && !a.capitalCallCap) {
      return c.json(err("Set the annual capital-call cap.", "INVALID_INPUT"), 400);
    }
  }
  // s. 5.4 exists in every form except the member-managed single-owner ones —
  // the same predicate oa.ts uses to decide whether to fill $[THRESHOLD]. Until
  // 17 August this check sat inside the multi-owner block, so a sole owner was
  // never asked and the agreement said $25,000 on nobody's authority.
  const hasApprovalGate = !(memberManaged && !multiOwner);
  if (hasApprovalGate && !a.borrowingThreshold) {
    return c.json(err("Set the manager's borrowing limit.", "INVALID_INPUT"), 400);
  }

  // Every Protected Series is wholly owned by the Company (ss. 605.2302(1),
  // 605.2303(2), Fla. Stat.), so a series carries no member-level ownership.
  const series = seed.series.map((sr, i) => ({
    name: sr.name,
    purpose: a.series?.[i]?.purpose ?? sr.purpose ?? "",
    contribution: a.series?.[i]?.contribution ?? "",
  }));

  const inputs: OaInputs = {
    version,
    companyName: seed.llcName,
    principalAddress: seed.principalAddress,
    managerNames: seed.managerNames,
    effectiveDate: fmtDate(a.effectiveDate),
    amendedRestated: a.firstOrAmended === "amended",
    priorAgreementDate: priorDate,
    members,
    series,
    // A sole owner on the S corp form skips the multi-member option questions;
    // sensible defaults: no capital calls, competition permitted, no shotgun.
    includeCapitalCalls: a.includeCapitalCalls ?? (isSCorp && !multiOwner ? false : undefined),
    capitalCallCap: a.capitalCallCap,
    competition: a.competition ?? (isSCorp && !multiOwner ? "B" : undefined),
    includeShotgun: a.includeShotgun ?? (isSCorp && !multiOwner ? false : undefined),
    borrowingThreshold: a.borrowingThreshold,
    contributionToCompany: a.contributionToCompany,
    generationNumber: nextGenerationNumber,
  };

  const clients = await db.query<{ email: string; name: string }>("SELECT email, name FROM clients WHERE id = $1", [
    session.clientId,
  ]);
  const client = clients[0];

  let pdf: Uint8Array;
  let title: string;
  // One instant for the footer, the filename, and the portal row, so the three
  // can never disagree by a minute.
  const generatedOn = new Date();
  try {
    const assembled = assembleOa(inputs);
    title = assembled.title;
    pdf = await renderMarkdownPdf({
      markdown: assembled.markdown,
      watermark: {
        name: client?.name || members[0].name,
        email: client?.email ?? "",
        note: OA_TEMPLATE_VERSION,
        generatedAt: stampEastern(generatedOn),
      },
      title,
    });
  } catch (e) {
    console.error("[oa] generation failed:", e);
    return c.json(err("We could not generate the agreement. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  await db.query(
    `INSERT INTO oa_profiles (client_id, answers, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (client_id) DO UPDATE SET answers = $2, updated_at = now()`,
    [session.clientId, JSON.stringify(a)],
  );
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename(generatedOn)}.pdf`,
    buf,
    "application/pdf",
  );
  const doc = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes],
  );
  const gen = await db.query<{ id: string }>(
    `INSERT INTO oa_generations (client_id, document_id, template_version, amended_restated, inputs, generation_number)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [session.clientId, doc[0].id, OA_TEMPLATE_VERSION, inputs.amendedRestated, JSON.stringify(inputs), nextGenerationNumber],
  );
  // `version` names which of the eight masters was used. Without it the only
  // way to know is to re-read the generations list, so nothing that calls this
  // route can tell a correct routing from a wrong one.
  return c.json({ data: { generationId: gen[0].id, documentId: doc[0].id, title, version } });
});

/** Consent + Series Exhibit for a series established after formation.
 *  Regenerating the whole agreement as Amended & Restated also carries the new
 *  exhibit; this produces just the two documents that actually change hands. */
app.post("/portal/series/consent", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({
      seriesName: z.string().min(1).max(300),
      seriesNumber: z.string().min(1).max(40),
      purpose: z.string().max(600).optional().default(""),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Series name, identifier, and date are required.", "INVALID_INPUT"), 400);

  const seed = await oaSeed(session.clientId);
  if (!seed) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);

  // s. 605.2202 requires every protected series name to begin with the
  // company's full name; a designation filed otherwise is rejected.
  if (!body.data.seriesName.trim().toLowerCase().startsWith(seed.llcName.trim().toLowerCase())) {
    return c.json(
      err(`The series name must begin with "${seed.llcName}" (s. 605.2202, Fla. Stat.).`, "INVALID_INPUT"),
      400,
    );
  }
  if (!hasProtectedSeriesPhrase(body.data.seriesName)) {
    return c.json(
      err('The series name must contain "protected series", "P.S.", or "PS" (s. 605.2202, Fla. Stat.).', "INVALID_INPUT"),
      400,
    );
  }

  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Same owners the operating agreement uses — a client who added or removed an
  // owner must not get a series document that names the intake list.
  const seriesOwners = effectiveOwners(seed.members, await savedOaAnswers(session.clientId));
  const generatedOn = new Date();
  let pdf: Uint8Array;
  let title: string;
  try {
    const assembled = assembleNewSeries({
      companyName: seed.llcName,
      seriesName: body.data.seriesName.trim(),
      seriesNumber: body.data.seriesNumber.trim(),
      purpose: body.data.purpose,
      effectiveDate: fmtDate(body.data.effectiveDate),
      memberNames: seriesOwners.map((m) => m.name),
      managerNames: seed.managerNames,
      memberManaged,
    });
    title = assembled.title;
    const dbc = await getDb();
    const clients = await dbc.query<{ email: string; name: string }>(
      "SELECT email, name FROM clients WHERE id = $1",
      [session.clientId],
    );
    pdf = await renderMarkdownPdf({
      markdown: assembled.markdown,
      watermark: {
        name: clients[0]?.name || seed.members[0]?.name || "",
        email: clients[0]?.email ?? "",
        note: OA_TEMPLATE_VERSION,
        generatedAt: stampEastern(generatedOn),
      },
      title,
    });
  } catch (e) {
    console.error("[new-series] generation failed:", e);
    return c.json(err("We could not generate the documents. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  const db = await getDb();
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename(generatedOn)}.pdf`,
    buf,
    "application/pdf",
  );
  const doc = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes],
  );
  return c.json({ data: { documentId: doc[0].id, title } });
});

/** A client may remove a draft they generated. Documents WE posted — the
 *  formation package, EIN letter, legal mail, the 2553 package — are not
 *  reachable here, which keeps the download-only rule intact. */
app.delete("/portal/oa/generations/:id", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; document_id: string | null }>(
    "SELECT id, client_id, document_id FROM oa_generations WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  if (rows[0].document_id) {
    const docs = await db.query<{ storage_key: string }>(
      "SELECT storage_key FROM documents WHERE id = $1 AND client_id = $2",
      [rows[0].document_id, session.clientId],
    );
    await db.query("DELETE FROM oa_generations WHERE id = $1", [rows[0].id]);
    await db.query("DELETE FROM documents WHERE id = $1 AND client_id = $2", [
      rows[0].document_id,
      session.clientId,
    ]);
    if (docs[0]?.storage_key) await deleteFile(docs[0].storage_key);
  } else {
    await db.query("DELETE FROM oa_generations WHERE id = $1", [rows[0].id]);
  }
  return c.json({ data: { ok: true } });
});

/* ----------------------------- library docs ---------------------------- */

app.get("/portal/library", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query("SELECT key, title, edition, size_bytes, updated_at FROM library_documents ORDER BY title");
  return c.json({ data: rows });
});

// The admin page's view of the same list. It cannot use /portal/library: that
// route requires a CLIENT session, and an admin-only session 401s — which
// rendered the library card as "Not yet published" while the manual was live.
app.get("/admin/library", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query("SELECT key, title, edition, size_bytes, updated_at FROM library_documents ORDER BY title");
  return c.json({ data: rows });
});

app.get("/portal/library/:key/download", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ storage_key: string; title: string; edition: string }>(
    "SELECT storage_key, title, edition FROM library_documents WHERE key = $1",
    [c.req.param("key")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const clients = await db.query<{ email: string; name: string }>("SELECT email, name FROM clients WHERE id = $1", [
    session.clientId,
  ]);
  const src = await readFileStream(rows[0].storage_key);
  const bytes = src instanceof Buffer ? src : Buffer.from(await new Response(src as ReadableStream).arrayBuffer());
  let out: Uint8Array;
  try {
    out = await stampExistingPdf({
      bytes,
      watermark: { name: clients[0]?.name ?? "", email: clients[0]?.email ?? "", note: rows[0].edition },
      title: rows[0].title,
    });
  } catch (e) {
    console.error("[library] stamp failed; serving original:", e);
    out = bytes;
  }
  const filename = rows[0].title.replace(/[^\w.-]+/g, "_");
  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** Renders the Owner's Manual PDF from the markdown master bundled with
 *  this deployment and publishes it to the client library. Hash-gated: a
 *  deployment whose manual is unchanged publishes nothing. This is what
 *  keeps "always the latest edition" true — the nightly cron calls it, and
 *  the admin Library section has a button for right-now. */
async function refreshOwnersManual(force = false): Promise<{ published: boolean; pages?: number; edition?: string }> {
  const hash = createHash("sha256").update(ownersManualMd).digest("hex").slice(0, 16);
  const db = await getDb();
  const rows = await db.query<{ meta: unknown }>(
    "SELECT meta FROM library_documents WHERE key = 'owners-manual'",
  );
  const meta = rows[0] ? ((typeof rows[0].meta === "string" ? JSON.parse(rows[0].meta) : rows[0].meta) as { hash?: string }) : null;
  if (!force && meta?.hash === hash) return { published: false };
  const { renderManualPdf } = await import("./manual-pdf");
  const { pdf, pages, edition } = await renderManualPdf(ownersManualMd);
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile("owners-manual.pdf", buf, "application/pdf");
  await db.query(
    `INSERT INTO library_documents (key, title, edition, storage_key, content_type, size_bytes, meta, updated_at)
     VALUES ('owners-manual', $1, $2, $3, 'application/pdf', $4, $5, now())
     ON CONFLICT (key) DO UPDATE SET title = $1, edition = $2, storage_key = $3,
       content_type = 'application/pdf', size_bytes = $4, meta = $5, updated_at = now()`,
    ["Series LLC Owner's Manual", edition, stored.storageKey, stored.sizeBytes, JSON.stringify({ hash, pages })],
  );
  return { published: true, pages, edition };
}

app.post("/admin/library/owners-manual/regenerate", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const r = await refreshOwnersManual(true);
  return c.json({ data: r });
});

/** Nightly: republish the manual if this deployment carries a newer master. */
app.get("/cron/library-refresh", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  if (!secret && env.isProd) return c.json(err("Not authorized", "UNAUTHENTICATED"), 401);
  const r = await refreshOwnersManual(false);
  return c.json({ data: r });
});

app.post("/admin/library/:key", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const file = form.file;
  const title = typeof form.title === "string" ? form.title.trim() : "";
  const edition = typeof form.edition === "string" ? form.edition.trim() : "";
  if (!(file instanceof File) || !title) {
    return c.json(err("title and file are required.", "INVALID_INPUT"), 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
  const db = await getDb();
  await db.query(
    `INSERT INTO library_documents (key, title, edition, storage_key, content_type, size_bytes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (key) DO UPDATE SET title = $2, edition = $3, storage_key = $4, content_type = $5, size_bytes = $6, updated_at = now()`,
    [c.req.param("key"), title, edition, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
  );
  return c.json({ data: { ok: true } });
});

/** Confirmation-page "resend my portal invitation" — only for paid orders
 *  whose client has not yet set a password. */
app.post("/orders/:id/resend-welcome", async (c) => {
  if (!rateLimit(`resend:${clientIp(c)}`, 5, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const db = await getDb();
  const orders = await db.query<{ client_id: string | null; status: string; contact_name: string; contact_email: string }>(
    "SELECT client_id, status, contact_name, contact_email FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  // Always report success — never confirm order existence to a guesser.
  if (orders.length === 0 || orders[0].status !== "paid" || !orders[0].client_id) {
    return c.json({ data: { ok: true } });
  }
  const clients = await db.query<{ id: string; password_hash: string | null }>(
    "SELECT id, password_hash FROM clients WHERE id = $1",
    [orders[0].client_id],
  );
  if (clients.length > 0 && !clients[0].password_hash) {
    const { token, tokenHash } = newToken();
    await db.query(
      "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'set_password', $3)",
      [tokenHash, clients[0].id, new Date(Date.now() + 7 * 86400_000).toISOString()],
    );
    const mail = welcomeEmail(orders[0].contact_name, `${env.PUBLIC_BASE_URL}/portal/set-password?token=${token}`);
    await sendMail({ to: orders[0].contact_email, ...mail }).catch((e) =>
      console.error("[resend-welcome] failed:", e),
    );
  }
  return c.json({ data: { ok: true } });
});

/* --------------------------- portal services --------------------------- */

const SERVICE_SAFE_COLUMNS =
  "id, type, status, llc_name, details, amount_cents, created_at, paid_at, fulfilled_at";

/** The client's company name comes from their latest paid formation order. */
async function clientLlcName(clientId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.query<{ llc_name: string }>(
    "SELECT llc_name FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC NULLS LAST LIMIT 1",
    [clientId],
  );
  return rows[0]?.llc_name ?? "";
}

/** Whether the client's LLC is formed — the Articles are in their portal.
 *  Gates the EIN and S-election detail forms: neither IRS process exists
 *  for a company that doesn't. */
async function clientLlcFormed(clientId: string): Promise<boolean> {
  const db = await getDb();
  // ANY formed order means the LLC exists — a client can have later paid
  // orders (services, extra series) that never carry formed_at themselves.
  const rows = await db.query<{ ok: number }>(
    "SELECT 1 AS ok FROM orders WHERE client_id = $1 AND formed_at IS NOT NULL LIMIT 1",
    [clientId],
  );
  return rows.length > 0;
}

/** The client's protected series as full filed names ("LLC - PS 1"):
 *  formation-order series (stored as bare identifiers) plus paid portal
 *  series orders (stored as full names). The EIN dialog offers exactly this
 *  list — a client picks a series they actually have instead of typing one. */
async function clientSeries(clientId: string): Promise<{ name: string; einOrdered: boolean }[]> {
  const db = await getDb();
  const llcName = await clientLlcName(clientId);
  if (!llcName) return [];
  const names: string[] = [];
  const formation = await db.query<{ payload: unknown }>(
    "SELECT payload FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at ASC",
    [clientId],
  );
  for (const r of formation) {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    for (const n of seriesNames(p)) {
      names.push(n.toLowerCase().startsWith(llcName.toLowerCase()) ? n : `${llcName} - ${n}`);
    }
  }
  const svc = await db.query<{ type: string; details: unknown }>(
    `SELECT type, details FROM service_orders
     WHERE client_id = $1 AND type IN ('series', 'ein') AND status <> 'pending_payment'`,
    [clientId],
  );
  const einSeries = new Set<string>();
  for (const r of svc) {
    const d = (typeof r.details === "string" ? JSON.parse(r.details) : r.details) as {
      seriesName?: string;
      target?: string;
    } | null;
    if (r.type === "series" && d?.seriesName) names.push(d.seriesName);
    if (r.type === "ein" && d?.target === "series" && d.seriesName) einSeries.add(d.seriesName.trim().toLowerCase());
  }
  const seen = new Set<string>();
  const out: { name: string; einOrdered: boolean }[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: n.trim(), einOrdered: einSeries.has(k) });
  }
  return out;
}

/** S election package gate: NEW formations we filed, purchasable only through
 *  day 65 after the formation order was paid (the IRS election deadline is
 *  2 months + 15 days — the shorter window leaves time to prepare and mail). */
async function sElectionEligibility(clientId: string): Promise<{
  eligible: boolean;
  reason: "ok" | "no_new_formation" | "window_closed" | "already_ordered";
  orderBy: string | null;
  formationPaidAt: string | null;
}> {
  const db = await getDb();
  const formed = await db.query<{ paid_at: unknown }>(
    "SELECT paid_at FROM orders WHERE client_id = $1 AND paid_at IS NOT NULL AND package = 'NEW' ORDER BY paid_at DESC NULLS LAST LIMIT 1",
    [clientId],
  );
  if (formed.length === 0 || !formed[0].paid_at) {
    return { eligible: false, reason: "no_new_formation", orderBy: null, formationPaidAt: null };
  }
  const paidAt = new Date(String(formed[0].paid_at));
  const orderBy = new Date(paidAt.getTime() + S_ELECTION_WINDOW_DAYS * 86400_000);
  const existing = await db.query(
    "SELECT id FROM service_orders WHERE client_id = $1 AND type = 's-election' AND status <> 'cancelled'",
    [clientId],
  );
  if (existing.length > 0) {
    return { eligible: false, reason: "already_ordered", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
  }
  if (Date.now() > orderBy.getTime()) {
    return { eligible: false, reason: "window_closed", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
  }
  return { eligible: true, reason: "ok", orderBy: orderBy.toISOString(), formationPaidAt: paidAt.toISOString() };
}

/** How long a client may edit and re-download the S election package before we
 *  destroy it. The package IS the clients' copy of Form 2553, complete with
 *  every owner's Social Security number, so it does not live here longer than
 *  it has to. */
const S_ELECTION_EDIT_DAYS = 14;

interface SElectionStoredDetails {
  ein?: string;
  einPending?: boolean;
  dateIncorporated?: string;
  effectiveDate?: string;
  officerName?: string;
  officerTitle?: string;
  phone?: string;
  certifiedAt?: string;
  documentId?: string;
  purgedAt?: string;
  shareholders?: { name: string; address: string; percentage: number; dateAcquired: string; ssnLast4: string }[];
}

/** The edit/download window for one order. Drivers differ: Neon returns ISO
 *  strings, PGlite returns Date objects. */
function sElectionWindow(fulfilledAt: unknown): { open: boolean; deleteOn: string | null } {
  if (!fulfilledAt) return { open: false, deleteOn: null };
  const start = new Date(String(fulfilledAt)).getTime();
  if (Number.isNaN(start)) return { open: false, deleteOn: null };
  const deleteOn = new Date(start + S_ELECTION_EDIT_DAYS * 86400_000);
  return { open: Date.now() < deleteOn.getTime(), deleteOn: deleteOn.toISOString() };
}

/** When the edit window closes, the Social Security numbers are destroyed —
 *  but the client keeps a record of what was prepared. The package is REBUILT
 *  with only the last four digits of each number and stamped unfileable, and
 *  the encrypted numbers are deleted. Rebuilding rather than editing the old
 *  PDF matters: a black box drawn over text leaves the text underneath, still
 *  extractable. Safe to call on any request. */
async function purgeExpiredSElections(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - S_ELECTION_EDIT_DAYS * 86400_000).toISOString();
  const rows = await db.query<{ id: string; client_id: string; llc_name: string; details: unknown }>(
    `SELECT id, client_id, llc_name, details FROM service_orders
      WHERE type = 's-election' AND status = 'fulfilled'
        AND fulfilled_at IS NOT NULL AND fulfilled_at < $1
        AND (ein_secret IS NOT NULL OR details->>'purgedAt' IS NULL)`,
    [cutoff],
  );
  for (const row of rows) {
    const d = (typeof row.details === "string" ? JSON.parse(row.details) : row.details) as SElectionStoredDetails;
    const kept: SElectionStoredDetails = { ...d, purgedAt: new Date().toISOString() };

    if (d?.shareholders?.length && d.dateIncorporated && d.effectiveDate) {
      const seed = await oaSeed(row.client_id);
      try {
        const pdf = await buildSElectionPackage({
          llcName: row.llc_name,
          principalAddress: seed?.principalAddress ?? "",
          ein: d.ein ?? "",
          dateIncorporated: d.dateIncorporated,
          effectiveDate: d.effectiveDate,
          officerName: d.officerName ?? "",
          officerTitle: d.officerTitle ?? "",
          phone: d.phone ?? "",
          recordCopy: true,
          // Only the last four survive in the stored record — that is all the
          // record copy can show, and all it needs to.
          shareholders: d.shareholders.map((s) => ({ ...s, ssn: s.ssnLast4 })),
        });
        const title = `S Corporation Election Package — Record Copy — ${row.llc_name}`;
        const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
        const stored = await putFile(`${title.replace(/[^\w-]+/g, "_")}.pdf`, buf, "application/pdf");
        if (d.documentId) {
          const old = await db.query<{ storage_key: string }>(
            "SELECT storage_key FROM documents WHERE id = $1",
            [d.documentId],
          );
          await db.query(
            `UPDATE documents SET title = $1, storage_key = $2, size_bytes = $3 WHERE id = $4`,
            [title, stored.storageKey, stored.sizeBytes, d.documentId],
          );
          if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
        } else {
          const doc = await db.query<{ id: string }>(
            `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
             VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
            [row.client_id, title, stored.storageKey, stored.sizeBytes],
          );
          kept.documentId = doc[0].id;
        }
      } catch (e) {
        // A rebuild that fails must not leave the full-SSN copy in place: drop
        // it, and the client still has whatever they downloaded.
        console.error("[purge] record copy rebuild failed; removing the original:", e);
        if (d.documentId) {
          const old = await db.query<{ storage_key: string }>(
            "SELECT storage_key FROM documents WHERE id = $1",
            [d.documentId],
          );
          await db.query("DELETE FROM documents WHERE id = $1", [d.documentId]);
          if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
          kept.documentId = undefined;
        }
      }
    }

    await db.query("UPDATE service_orders SET details = $1, ein_secret = NULL WHERE id = $2", [
      JSON.stringify(kept),
      row.id,
    ]);
  }
  if (rows.length > 0) console.log(`[purge] redacted ${rows.length} expired S election package(s)`);
  return rows.length;
}

app.get("/portal/services", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  await purgeExpiredSElections().catch((e) => console.error("[purge] failed:", e));
  const db = await getDb();
  const orders = await db.query<{ id: string; type: string; status: string; details: unknown; fulfilled_at: unknown }>(
    `SELECT ${SERVICE_SAFE_COLUMNS} FROM service_orders WHERE client_id = $1 ORDER BY created_at DESC`,
    [session.clientId],
  );
  // The owner dropdown is built from the owners as the client last stated
  // them: the intake members where those exist (member-managed), overridden
  // by anything answered in the operating-agreement questionnaire — the only
  // ownership source a manager-managed company has.
  const seed = await oaSeed(session.clientId);
  const owners = effectiveOwners(seed?.members ?? [], await savedOaAnswers(session.clientId));
  return c.json({
    data: {
      llcName: await clientLlcName(session.clientId),
      dev: !env.isProd && !env.SQUARE_ACCESS_TOKEN,
      members: owners,
      pricing: {
        seriesCents: SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS,
        einCents: EIN_FEE_CENTS,
        sElectionCents: S_ELECTION_FEE_CENTS,
      },
      sElection: await sElectionEligibility(session.clientId),
      series: await clientSeries(session.clientId),
      llcFormed: await clientLlcFormed(session.clientId),
      einCompanyOrdered: orders.some((o) => {
        if (o.type !== "ein" || o.status === "pending_payment") return false;
        const d = (typeof o.details === "string" ? JSON.parse(o.details) : o.details) as { target?: string } | null;
        return (d?.target ?? "company") === "company";
      }),
      orders: orders.map((o) => {
        if (o.type !== "s-election") return o;
        const d = (typeof o.details === "string" ? JSON.parse(o.details) : o.details) as SElectionStoredDetails;
        const w = sElectionWindow(o.fulfilled_at);
        return { ...o, editableUntil: w.deleteOn, editable: w.open, documentId: d?.documentId ?? null };
      }),
    },
  });
});

/** Name-availability check against our mirror of the Division of
 *  Corporations' public data files (server/sunbiz.ts). Public: the intake
 *  name step calls it before an order exists. Verdicts say "no conflict
 *  found", never "available" — the Division makes the final determination. */
app.post("/name-check", async (c) => {
  if (!rateLimit(`namecheck:${clientIp(c)}`, 30, 600_000)) {
    return c.json(err("Too many checks. Try again in a few minutes.", "RATE_LIMITED"), 429);
  }
  const body = await c.req.json().catch(() => null);
  const names = Array.isArray(body?.names)
    ? (body.names as unknown[]).filter((n): n is string => typeof n === "string" && n.trim().length > 0).slice(0, 5)
    : [];
  if (names.length === 0) return c.json(err("No names given.", "BAD_REQUEST"), 400);
  try {
    const state = await getSyncState();
    // No baseline yet, or the mirror has gone stale — say so instead of
    // returning a verdict the data cannot support. 10 days: dailies are
    // work-days only, so a long holiday weekend must not trip this.
    const asOf = state.lastDaily;
    const stale =
      !state.baselineLabel || !asOf || Date.now() - new Date(asOf).getTime() > 10 * 86_400_000;
    if (stale) return c.json({ data: { available: false, results: [] } });
    const results: Awaited<ReturnType<typeof checkName>>[] = [];
    for (const name of names) results.push(await checkName(name));
    return c.json({ data: { available: true, asOf, results } });
  } catch {
    return c.json({ data: { available: false, results: [] } });
  }
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

app.get("/admin/file-mirror", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await mirrorStatus() });
});

app.post("/admin/file-mirror/run", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const result = await runFileMirror();
  return c.json({ data: { ...result, status: await mirrorStatus() } });
});

app.get("/admin/backups", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await listBackups() });
});

app.post("/admin/backups/run", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  return c.json({ data: await runDbBackup() });
});

// The restore path starts with getting the file — without this route the
// dump is only reachable with the storage token.
app.get("/admin/backups/:key/download", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const key = c.req.param("key");
  const all = await listBackups();
  const hit = all.find((b) => b.key === key);
  if (!hit) return c.json(err("Not found", "NOT_FOUND"), 404);
  const body = await readFileStream(hit.storageKey.startsWith("dev:") ? `dev:backups/${hit.key}` : hit.storageKey);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${hit.key}"`,
    },
  });
});

app.post("/portal/services/s-election", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`svc:${session.clientId}`, 20, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const llcName = await clientLlcName(session.clientId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const gate = await sElectionEligibility(session.clientId);
  if (!gate.eligible) {
    const msg =
      gate.reason === "already_ordered"
        ? "You already have an S election order — see your orders below."
        : gate.reason === "window_closed"
          ? "The ordering window for the S election package has closed. A late election requires IRS relief — please consult a tax professional."
          : "The S election package is available only for new LLCs we formed.";
    return c.json(err(msg, gate.reason === "window_closed" ? "WINDOW_CLOSED" : "NOT_ELIGIBLE"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents)
     VALUES ($1, 's-election', $2, $3, $4) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({}), S_ELECTION_FEE_CENTS],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: S_ELECTION_FEE_CENTS,
      stateFeesCents: 0,
      totalCents: S_ELECTION_FEE_CENTS,
      lineItems: [{ name: `S corporation election package (Form 2553) — ${llcName}`, amountCents: S_ELECTION_FEE_CENTS }],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `S corporation election package — ${llcName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: S_ELECTION_FEE_CENTS } });
});

app.post("/portal/services/series", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`svc:${session.clientId}`, 20, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ suffix: z.string().min(1).max(60), purpose: z.string().max(300).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("A series identifier is required.", "INVALID_INPUT"), 400);
  const llcName = await clientLlcName(session.clientId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  const suffix = body.data.suffix.trim().replace(/\s+/g, " ");
  if (!/^[\w .,'&-]+$/.test(suffix)) {
    return c.json(err("The series identifier contains unsupported characters.", "INVALID_INPUT"), 400);
  }
  const seriesName = `${llcName} - ${suffix}`;
  if (!hasProtectedSeriesPhrase(seriesName)) {
    return c.json(
      err('The series name must include "PS", "P.S.", or "protected series" (§605.2202).', "INVALID_INPUT"),
      400,
    );
  }
  const amountCents = SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS;
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents)
     VALUES ($1, 'series', $2, $3, $4) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({ seriesName, purpose: body.data.purpose ?? "" }), amountCents],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: SERIES_ADDON_PREP_CENTS,
      stateFeesCents: SERIES_ADDON_STATE_CENTS,
      totalCents: amountCents,
      lineItems: [
        { name: `Protected Series Designation (drafting) — ${seriesName}`, amountCents: SERIES_ADDON_PREP_CENTS },
        { name: "FL state fee — Protected Series Designation", amountCents: SERIES_ADDON_STATE_CENTS },
      ],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `Protected Series Designation — ${seriesName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: amountCents } });
});

app.post("/portal/services/ein", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`svc:${session.clientId}`, 20, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ target: z.enum(["company", "series"]), seriesName: z.string().max(300).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Choose what the EIN is for.", "INVALID_INPUT"), 400);
  const llcName = await clientLlcName(session.clientId);
  if (!llcName) return c.json(err("No formed LLC found on your account.", "NO_LLC"), 400);
  if (body.data.target === "series" && !body.data.seriesName?.trim()) {
    return c.json(err("Name the protected series the EIN is for.", "INVALID_INPUT"), 400);
  }
  const target = body.data.target;
  const seriesName = body.data.seriesName?.trim() ?? "";
  const db = await getDb();
  // One EIN per entity: a paid order (formation-included or portal) for the
  // same target refuses a second purchase. Unpaid drafts don't block — an
  // abandoned checkout must not lock the client out forever.
  const existingEin = await db.query<{ details: unknown }>(
    `SELECT details FROM service_orders
     WHERE client_id = $1 AND type = 'ein' AND status <> 'pending_payment'`,
    [session.clientId],
  );
  const alreadyOrdered = existingEin.some((r) => {
    const d = (typeof r.details === "string" ? JSON.parse(r.details) : r.details) as {
      target?: string;
      seriesName?: string;
    } | null;
    if (target === "company") return (d?.target ?? "company") === "company";
    return d?.target === "series" && (d.seriesName ?? "").trim().toLowerCase() === seriesName.toLowerCase();
  });
  if (alreadyOrdered) {
    return c.json(
      err(
        target === "company"
          ? "Your LLC's EIN is already ordered — see your orders below."
          : "An EIN for that protected series is already ordered — see your orders below.",
        "ALREADY_ORDERED",
      ),
      400,
    );
  }
  // A series target must be one of the client's actual series — the dialog
  // offers only those, and no hand-made request creates an order for a
  // series that does not exist.
  if (target === "series") {
    const mine = await clientSeries(session.clientId);
    const match = mine.find((s) => s.name.toLowerCase() === seriesName.toLowerCase());
    if (!match) return c.json(err("That protected series is not on your account.", "UNKNOWN_SERIES"), 400);
    if (match.einOrdered) {
      return c.json(err("An EIN for that protected series is already ordered — see your orders below.", "ALREADY_ORDERED"), 400);
    }
  }
  const rows = await db.query<{ id: string }>(
    `INSERT INTO service_orders (client_id, type, llc_name, details, amount_cents)
     VALUES ($1, 'ein', $2, $3, $4) RETURNING id`,
    [session.clientId, llcName, JSON.stringify({ target, seriesName }), EIN_FEE_CENTS],
  );
  const serviceOrderId = rows[0].id;
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
  const forName = target === "series" ? seriesName : llcName;
  const checkout = await createCheckout({
    orderId: serviceOrderId,
    llcName,
    priced: {
      serviceFeeCents: EIN_FEE_CENTS,
      stateFeesCents: 0,
      totalCents: EIN_FEE_CENTS,
      lineItems: [{ name: `Federal EIN service — ${forName}`, amountCents: EIN_FEE_CENTS }],
    },
    buyerEmail: clients[0]?.email ?? "",
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?paid=${serviceOrderId}`,
    description: `Federal EIN service — ${forName}`,
  });
  await db.query("UPDATE service_orders SET square_order_id = $1 WHERE id = $2", [
    checkout.squareOrderId,
    serviceOrderId,
  ]);
  return c.json({ data: { serviceOrderId, checkoutUrl: checkout.url, totalCents: EIN_FEE_CENTS } });
});

/** Everything the IRS EIN application asks that the formation record cannot
 *  answer — the objective ledger from the assistant walk + Form SS-4
 *  (Rev. 12-2025), 24 Aug 2026. The IRS requires the responsible party's
 *  name SPLIT (first/middle/last/suffix, "must match IRS records"). */
const einDetailsSchema = z
  .object({
    responsibleFirst: z.string().min(1, "The responsible party's first name is required.").max(100),
    responsibleMiddle: z.string().max(100).optional().default(""),
    responsibleLast: z.string().min(1, "The responsible party's last name is required.").max(100),
    responsibleSuffix: z.string().max(10).optional().default(""),
    tin: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ""))
      .refine((s) => /^\d{9}$/.test(s), "Enter a 9-digit SSN or ITIN."),
    phone: z.string().min(7, "A phone number for IRS questions is required.").max(40),
    county: z.string().min(2, "The county of the LLC's principal address is required.").max(60),
    activity: z.enum([
      "Real estate",
      "Rental & leasing",
      "Construction",
      "Retail",
      "Finance & insurance",
      "Health care & social assistance",
      "Accommodation & food service",
      "Transportation & warehousing",
      "Manufacturing",
      "Wholesale",
      "Other",
    ]),
    activityDetail: z
      .string()
      .min(3, "Describe the products or services in a few words — e.g. \"residential rental real estate.\"")
      .max(200),
    employeesExpected: z.boolean(),
    employeeCountOther: z.number().int().min(0).max(9999).optional().default(0),
    employeeCountAg: z.number().int().min(0).max(9999).optional().default(0),
    employeeCountHousehold: z.number().int().min(0).max(9999).optional().default(0),
    firstWageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
    form944Annual: z.boolean().optional().default(false),
    closingMonth: z.enum([
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ]),
    exciseApplies: z.boolean(),
    exciseDetail: z.string().max(300).optional().default(""),
    certified: z.literal(true, {
      errorMap: () => ({ message: "You must confirm the certification before submitting." }),
    }),
  })
  .refine(
    (d) =>
      !d.employeesExpected ||
      (d.firstWageDate !== "" &&
        d.employeeCountOther + d.employeeCountAg + d.employeeCountHousehold > 0),
    { message: "With employees expected, enter the expected count and the first date wages will be paid." },
  )
  .refine((d) => !d.exciseApplies || d.exciseDetail.trim().length > 0, {
    message: "Tell us which of the special activities applies.",
  });

app.post("/portal/services/:id/ein-details", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = einDetailsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid details.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; details: unknown; llc_name: string }>(
    "SELECT id, client_id, type, status, details, llc_name FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const so = rows[0];
  if (so.type !== "ein" || so.status !== "awaiting_info") {
    return c.json(err("This order is not awaiting details.", "BAD_STATE"), 400);
  }
  if (!(await clientLlcFormed(session.clientId))) {
    return c.json(err("Your LLC must be formed before an EIN can be obtained.", "NOT_FORMED"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as Record<string, unknown>;
  const d = body.data;
  const merged = {
    ...details,
    responsibleName: [d.responsibleFirst, d.responsibleMiddle, d.responsibleLast, d.responsibleSuffix]
      .filter(Boolean)
      .join(" "),
    responsibleFirst: d.responsibleFirst,
    responsibleMiddle: d.responsibleMiddle,
    responsibleLast: d.responsibleLast,
    responsibleSuffix: d.responsibleSuffix,
    phone: d.phone,
    county: d.county,
    activity: d.activity,
    activityDetail: d.activityDetail,
    employeesExpected: d.employeesExpected,
    employeeCountOther: d.employeeCountOther,
    employeeCountAg: d.employeeCountAg,
    employeeCountHousehold: d.employeeCountHousehold,
    firstWageDate: d.firstWageDate,
    form944Annual: d.form944Annual,
    closingMonth: d.closingMonth,
    exciseApplies: d.exciseApplies,
    exciseDetail: d.exciseDetail,
    tinLast4: d.tin.slice(-4),
    certifiedAt: new Date().toISOString(),
  };
  await db.query(
    "UPDATE service_orders SET details = $1, ein_secret = $2, status = 'in_progress' WHERE id = $3",
    [JSON.stringify(merged), encryptSecret(body.data.tin), so.id],
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [session.clientId]);
    const summary = `Federal EIN — ${(details.target === "series" ? (details.seriesName as string) : so.llc_name) || so.llc_name}`;
    const mail = einDetailsSubmittedAdminEmail({
      summary,
      clientEmail: clients[0]?.email ?? "",
      adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
    });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...mail }).catch((e) =>
      console.error("[service] ein-details admin email failed:", e),
    );
  }
  return c.json({ data: { ok: true } });
});

const sElectionDetailsSchema = z
  .object({
    ein: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ""))
      .refine((s) => s === "" || /^\d{9}$/.test(s), "Enter the 9-digit EIN, or leave it blank if we're obtaining it."),
    einPending: z.boolean().optional().default(false),
    dateIncorporated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    officerName: z.string().min(1, "The signing officer's name is required.").max(200),
    officerTitle: z.string().min(1).max(100),
    phone: z.string().max(40).optional().default(""),
    shareholders: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          address: z.string().min(1).max(300),
          percentage: z.number().min(0).max(100),
          dateAcquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          // Blank means "keep the number already on file" when re-editing; a
          // first submission is rejected below if any are blank.
          ssn: z
            .string()
            .transform((s) => s.replace(/[\s-]/g, ""))
            .refine((s) => s === "" || /^\d{9}$/.test(s), "Each owner's SSN must be 9 digits."),
        }),
      )
      .min(1, "At least one owner is required.")
      .max(7, "The IRS form holds 7 owners — contact us for more."),
    certified: z.literal(true, {
      errorMap: () => ({ message: "You must confirm the certification before submitting." }),
    }),
  })
  .refine((d) => d.ein !== "" || d.einPending, {
    message: "Provide the EIN, or mark that we are obtaining it for you.",
  })
  .refine((d) => Math.abs(d.shareholders.reduce((a, s) => a + s.percentage, 0) - 100) < 0.01, {
    message: "Ownership percentages must total exactly 100%.",
  });

app.post("/portal/services/:id/s-election-details", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!(await clientLlcFormed(session.clientId))) {
    return c.json(err("Your LLC must be formed before an S election can be made.", "NOT_FORMED"), 400);
  }
  const body = sElectionDetailsSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid details.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string;
    details: unknown; ein_secret: string | null; fulfilled_at: unknown;
  }>(
    "SELECT id, client_id, type, status, llc_name, details, ein_secret, fulfilled_at FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0 || rows[0].client_id !== session.clientId) {
    return c.json(err("Not found", "NOT_FOUND"), 404);
  }
  const so = rows[0];
  if (so.type !== "s-election") return c.json(err("Not found", "NOT_FOUND"), 404);
  const prior = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as SElectionStoredDetails;
  const editable = so.status === "awaiting_info" || sElectionWindow(so.fulfilled_at).open;
  if (!editable) {
    return c.json(
      err(
        "The two-week window for changing this package has closed, and the details have been deleted. Contact us if you need a new one.",
        "WINDOW_CLOSED",
      ),
      400,
    );
  }
  const d = body.data;

  // A blank SSN means "keep the one already on file" — the browser is never
  // sent a Social Security number back, so an edit does not require retyping
  // them. Position is the only link, so the row count must not have changed.
  let onFile: string[] = [];
  if (so.ein_secret) {
    try {
      onFile = JSON.parse(decryptSecret(so.ein_secret)) as string[];
    } catch (e) {
      console.error("[service] s-election secret decrypt failed:", e);
    }
  }
  const ssns: string[] = [];
  for (let i = 0; i < d.shareholders.length; i++) {
    const typed = d.shareholders[i].ssn;
    const kept = d.shareholders.length === onFile.length ? onFile[i] : "";
    const use = typed || kept;
    if (!/^\d{9}$/.test(use)) {
      return c.json(err("Each owner's SSN must be 9 digits.", "INVALID_INPUT"), 400);
    }
    ssns.push(use);
  }

  // SSNs live only in the encrypted secret; the visible record keeps the last
  // four digits so a row is identifiable without exposing the number.
  const merged: SElectionStoredDetails = {
    ein: d.ein,
    einPending: d.einPending,
    dateIncorporated: d.dateIncorporated,
    effectiveDate: d.effectiveDate,
    officerName: d.officerName,
    officerTitle: d.officerTitle,
    phone: d.phone,
    certifiedAt: new Date().toISOString(),
    documentId: prior?.documentId,
    shareholders: d.shareholders.map((s, i) => ({
      name: s.name,
      address: s.address,
      percentage: s.percentage,
      dateAcquired: s.dateAcquired,
      ssnLast4: ssns[i].slice(-4),
    })),
  };

  // Build the package now — the client downloads it themselves; we file
  // nothing. A failure here must not record a submission that produced no
  // document, so it happens before anything is written.
  const seed = await oaSeed(session.clientId);
  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [session.clientId],
  );
  let pdf: Uint8Array;
  try {
    pdf = await buildSElectionPackage({
      llcName: so.llc_name,
      principalAddress: seed?.principalAddress ?? "",
      ein: d.ein,
      dateIncorporated: d.dateIncorporated,
      effectiveDate: d.effectiveDate,
      officerName: d.officerName,
      officerTitle: d.officerTitle,
      phone: d.phone,
      shareholders: d.shareholders.map((s, i) => ({
        name: s.name,
        address: s.address,
        percentage: s.percentage,
        dateAcquired: s.dateAcquired,
        ssn: ssns[i],
      })),
    });
  } catch (e) {
    console.error("[service] s-election package build failed:", e);
    return c.json(err("We could not build the package. Our team has been notified.", "GENERATION_FAILED"), 500);
  }

  // Regenerating replaces the earlier PDF rather than stacking copies of the
  // same form, each carrying the owners' Social Security numbers.
  if (prior?.documentId) {
    const old = await db.query<{ storage_key: string }>(
      "SELECT storage_key FROM documents WHERE id = $1 AND client_id = $2",
      [prior.documentId, session.clientId],
    );
    await db.query("DELETE FROM documents WHERE id = $1 AND client_id = $2", [prior.documentId, session.clientId]);
    if (old[0]?.storage_key) await deleteFile(old[0].storage_key).catch(() => {});
  }
  const title = `S Corporation Election Package (Form 2553) — ${so.llc_name}`;
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const stored = await putFile(
    `${title.replace(/[^\w-]+/g, "_")}_${stampForFilename()}.pdf`,
    buf,
    "application/pdf",
  );
  const docRows = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, 'package', $2, $3, 'application/pdf', $4) RETURNING id`,
    [session.clientId, title, stored.storageKey, stored.sizeBytes],
  );
  merged.documentId = docRows[0].id;

  // fulfilled_at starts the two-week clock, and a re-edit must not extend it.
  await db.query(
    `UPDATE service_orders
        SET details = $1, ein_secret = $2, status = 'fulfilled',
            fulfilled_at = COALESCE(fulfilled_at, now())
      WHERE id = $3`,
    [JSON.stringify(merged), encryptSecret(JSON.stringify(ssns)), so.id],
  );
  const after = await db.query<{ fulfilled_at: unknown }>(
    "SELECT fulfilled_at FROM service_orders WHERE id = $1",
    [so.id],
  );
  const window = sElectionWindow(after[0]?.fulfilled_at ?? null);

  const mail = sElectionReadyEmail({
    llcName: so.llc_name,
    editableUntil: window.deleteOn ? stampEastern(new Date(window.deleteOn)) : "",
    portalUrl: `${env.PUBLIC_BASE_URL}/portal`,
  });
  sendMail({ to: clients[0]?.email ?? "", ...mail }).catch((e) =>
    console.error("[service] s-election ready email failed:", e),
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const adminMail = einDetailsSubmittedAdminEmail({
      summary: `S Corporation Election Package — ${so.llc_name}`,
      clientEmail: clients[0]?.email ?? "",
      adminUrl: `${env.PUBLIC_BASE_URL}/admin`,
    });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...adminMail }).catch((e) =>
      console.error("[service] s-election-details admin email failed:", e),
    );
  }
  return c.json({ data: { ok: true, documentId: merged.documentId, editableUntil: window.deleteOn } });
});

/* ---------------------------- account settings --------------------------- */

/** Masks an address for the anti-hijack notice: a•••@example.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, local.length - 1))}@${domain ?? ""}`;
}

app.post("/portal/account/password", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`acct:${session.clientId}`, 10, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "Use at least 8 characters."),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const db = await getDb();
  const rows = await db.query<{ email: string; password_hash: string | null }>(
    "SELECT email, password_hash FROM clients WHERE id = $1",
    [session.clientId],
  );
  const client = rows[0];
  if (!client?.password_hash || !(await verifyPassword(body.data.currentPassword, client.password_hash))) {
    return c.json(err("That current password is not correct.", "BAD_CREDENTIALS"), 401);
  }
  await db.query("UPDATE clients SET password_hash = $1 WHERE id = $2", [
    await hashPassword(body.data.newPassword),
    session.clientId,
  ]);
  // Sign out every other device; the current session stays valid.
  await db.query("DELETE FROM sessions WHERE client_id = $1 AND token_hash <> $2", [
    session.clientId,
    session.tokenHash,
  ]);
  const mail = passwordChangedEmail(`${env.PUBLIC_BASE_URL}/portal`);
  sendMail({ to: client.email, ...mail }).catch((e) =>
    console.error("[account] password-changed email failed:", e),
  );
  return c.json({ data: { ok: true } });
});

app.post("/portal/account/email", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  if (!rateLimit(`acct:${session.clientId}`, 10, 3600_000)) {
    return c.json(err("Too many requests. Try again later.", "RATE_LIMITED"), 429);
  }
  const body = z
    .object({ newEmail: z.string().email("Enter a valid email address."), currentPassword: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const newEmail = body.data.newEmail.toLowerCase();
  const db = await getDb();
  const rows = await db.query<{ email: string; password_hash: string | null }>(
    "SELECT email, password_hash FROM clients WHERE id = $1",
    [session.clientId],
  );
  const client = rows[0];
  if (!client?.password_hash || !(await verifyPassword(body.data.currentPassword, client.password_hash))) {
    return c.json(err("That password is not correct.", "BAD_CREDENTIALS"), 401);
  }
  if (newEmail === client.email) {
    return c.json(err("That is already the address on your account.", "INVALID_INPUT"), 400);
  }
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [newEmail]);
  if (taken.length > 0) {
    return c.json(err("That address is already in use on another account.", "EMAIL_TAKEN"), 400);
  }
  const { token, tokenHash } = newToken();
  await db.query("UPDATE clients SET pending_email = $1 WHERE id = $2", [newEmail, session.clientId]);
  await db.query(
    "INSERT INTO auth_tokens (token_hash, client_id, purpose, expires_at) VALUES ($1, $2, 'verify_email', $3)",
    [tokenHash, session.clientId, new Date(Date.now() + 3600_000).toISOString()],
  );
  // The link goes to the new address; the old address gets a warning at the
  // same moment, so a hijacker cannot move an account silently.
  const verify = verifyNewEmail(`${env.PUBLIC_BASE_URL}/portal/verify-email?token=${token}`);
  sendMail({ to: newEmail, ...verify }).catch((e) => console.error("[account] verify email failed:", e));
  const notice = emailChangeRequestedEmail(maskEmail(newEmail));
  sendMail({ to: client.email, ...notice }).catch((e) =>
    console.error("[account] change-requested notice failed:", e),
  );
  return c.json({ data: { ok: true, pendingEmail: newEmail } });
});

app.post("/auth/verify-email", async (c) => {
  const body = z.object({ token: z.string().min(10) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid request.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ token_hash: string; client_id: string }>(
    "SELECT token_hash, client_id FROM auth_tokens WHERE token_hash = $1 AND purpose = 'verify_email' AND expires_at > now() AND used_at IS NULL",
    [hashToken(body.data.token)],
  );
  if (rows.length === 0) {
    return c.json(err("This link is invalid or has expired. Request the change again from your portal.", "BAD_TOKEN"), 400);
  }
  const clients = await db.query<{ email: string; pending_email: string | null }>(
    "SELECT email, pending_email FROM clients WHERE id = $1",
    [rows[0].client_id],
  );
  const pending = clients[0]?.pending_email;
  if (!pending) {
    return c.json(err("There is no pending email change on this account.", "BAD_STATE"), 400);
  }
  // Someone else may have claimed the address between request and confirmation.
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [pending]);
  if (taken.length > 0) {
    await db.query("UPDATE clients SET pending_email = NULL WHERE id = $1", [rows[0].client_id]);
    return c.json(err("That address is now in use on another account.", "EMAIL_TAKEN"), 400);
  }
  const previous = clients[0].email;
  await db.query("UPDATE clients SET email = $1, pending_email = NULL WHERE id = $2", [
    pending,
    rows[0].client_id,
  ]);
  await db.query("UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1", [rows[0].token_hash]);
  const mail = emailChangedEmail(pending);
  sendMail({ to: pending, ...mail }).catch((e) => console.error("[account] email-changed (new) failed:", e));
  sendMail({ to: previous, ...mail }).catch((e) => console.error("[account] email-changed (old) failed:", e));
  return c.json({ data: { ok: true, email: pending } });
});

/** Online cancellation of registered agent service — required by §501.165
 *  because the service is accepted online. Recording the request is the
 *  §9(g)(i) notice; the agency itself ends only when proof of a successor
 *  designation arrives (handled by hand from the admin notification). */
app.post("/portal/registered-agent/cancel", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ email: string; name: string; ra_cancellation_requested_at: string | null }>(
    "SELECT email, name, ra_cancellation_requested_at FROM clients WHERE id = $1",
    [session.clientId],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const client = rows[0];
  if (client.ra_cancellation_requested_at) {
    return c.json({ data: { raCancellationRequestedAt: client.ra_cancellation_requested_at } });
  }
  const updated = await db.query<{ ra_cancellation_requested_at: string }>(
    "UPDATE clients SET ra_cancellation_requested_at = now() WHERE id = $1 RETURNING ra_cancellation_requested_at",
    [session.clientId],
  );
  const requestedAt = updated[0]?.ra_cancellation_requested_at ?? new Date().toISOString();
  // Confirmation + admin notice must not unwind the recorded request.
  const confirmation = raCancellationEmail(client.name);
  sendMail({ to: client.email, ...confirmation }).catch((e) =>
    console.error("ra-cancel confirmation email failed", e),
  );
  if (env.ADMIN_NOTIFY_EMAIL) {
    const notice = raCancellationAdminEmail({ clientName: client.name, clientEmail: client.email });
    sendMail({ to: env.ADMIN_NOTIFY_EMAIL, ...notice, replyTo: client.email }).catch((e) =>
      console.error("ra-cancel admin email failed", e),
    );
  }
  return c.json({ data: { raCancellationRequestedAt: requestedAt } });
});

/* --------------------------------- admin ------------------------------- */

app.post("/admin/login", async (c) => {
  if (!rateLimit(`admin:${clientIp(c)}`, 10, 900_000)) {
    return c.json(err("Too many attempts.", "RATE_LIMITED"), 429);
  }
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Password required", "INVALID_INPUT"), 400);
  const expected = env.ADMIN_PASSWORD || (!env.isProd ? "dev-admin" : "");
  if (!expected || body.data.password !== expected) {
    return c.json(err("Incorrect password.", "BAD_CREDENTIALS"), 401);
  }
  await createSession(c, { isAdmin: true });
  return c.json({ data: { ok: true } });
});

async function requireAdmin(c: Parameters<typeof getSession>[0]) {
  const session = await getSession(c);
  return session?.isAdmin ? session : null;
}

app.get("/admin/me", async (c) => {
  const admin = await requireAdmin(c);
  return admin ? c.json({ data: { ok: true } }) : c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
});

app.get("/admin/orders", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  // Optional search: name or email, case-insensitive. Truncation is never
  // silent — the response always says how many exist versus how many were
  // returned, and the search reaches everything the list cannot show.
  const qRaw = (c.req.query("q") ?? "").trim().slice(0, 100);
  const where = qRaw ? `WHERE o.llc_name ILIKE $1 OR o.contact_email ILIKE $1 OR o.contact_name ILIKE $1` : "";
  const params = qRaw ? [`%${qRaw}%`] : [];
  // Everything a card on the board shows, in one query. series_count and
  // ein_purchased are on the card because they change what "finished" means:
  // an order can look complete with a series undesignated or an EIN still owed.
  const rows = await db.query(
    `SELECT o.id, o.client_id, o.contact_name, o.contact_email, o.package, o.llc_name,
            o.status, o.service_fee_cents, o.state_fees_cents, o.total_cents,
            o.created_at, o.paid_at, o.filed_at, o.formed_at,
            COALESCE(jsonb_array_length(o.payload->'series'), 0) AS series_count,
            COALESCE((o.payload->'optionalDocuments'->>'ein')::boolean, false) AS ein_purchased,
            (o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_service,
            EXISTS (
              SELECT 1 FROM service_orders s
               WHERE s.formation_order_id = o.id AND s.type = 'ein'
                 AND s.status <> 'fulfilled'
            ) AS ein_outstanding
       FROM orders o
      ${where}
      ORDER BY o.created_at DESC LIMIT 200`,
    params,
  );
  const total = await db.query<{ c: string }>(
    `SELECT count(*) AS c FROM orders o ${where}`,
    params,
  );
  return c.json({ data: { orders: rows, total: Number(total[0].c), shown: rows.length } });
});

/** Sent to the Division. The only transition on the board a person performs —
 *  nothing in this system can observe a filing on sunbiz. */
app.post("/admin/orders/:id/filed", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].status !== "paid") {
    return c.json(err(`An order is filed from "paid", not "${rows[0].status}".`, "BAD_STATE"), 400);
  }
  await db.query("UPDATE orders SET status = 'filed', filed_at = now() WHERE id = $1", [
    c.req.param("id"),
  ]);
  return c.json({ data: { ok: true } });
});

/** Undo — a misclick should not need a database console. */
app.post("/admin/orders/:id/unfiled", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  if (rows[0].status !== "filed") {
    return c.json(err("Only an order sitting with the State can be moved back.", "BAD_STATE"), 400);
  }
  await db.query("UPDATE orders SET status = 'paid', filed_at = NULL WHERE id = $1", [
    c.req.param("id"),
  ]);
  return c.json({ data: { ok: true } });
});

/** Which fields have been copied into the state's form. Stored per order so an
 *  interrupted filing resumes on whatever machine you pick it up on. */
app.post("/admin/orders/:id/copied", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({ key: z.string().min(1).max(64), copied: z.boolean() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid input.", "INVALID_INPUT"), 400);
  const db = await getDb();
  const rows = await db.query<{ copied_fields: unknown }>(
    "SELECT copied_fields FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const raw = rows[0].copied_fields;
  const marks = (typeof raw === "string" ? JSON.parse(raw) : raw ?? {}) as Record<string, boolean>;
  if (body.data.copied) marks[body.data.key] = true;
  else delete marks[body.data.key];
  await db.query("UPDATE orders SET copied_fields = $1 WHERE id = $2", [
    JSON.stringify(marks),
    c.req.param("id"),
  ]);
  return c.json({ data: { copiedFields: marks } });
});

app.get("/admin/orders/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string | null; llc_name: string; status: string;
    payload: unknown; copied_fields: unknown; created_at: string;
    paid_at: string | null; filed_at: string | null; formed_at: string | null;
    contact_name: string; contact_email: string; total_cents: number;
  }>("SELECT * FROM orders WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  const payload = typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload;

  // Documents already delivered for this order, so the panel can show what is
  // covered and what is still owed rather than asking anyone to remember.
  const docs = o.client_id
    ? await db.query<{ id: string; kind: string; title: string; meta: unknown; created_at: string }>(
        `SELECT id, kind, title, meta, created_at FROM documents
          WHERE client_id = $1 AND order_id = $2 ORDER BY created_at`,
        [o.client_id, o.id],
      )
    : [];

  // Services bought against this formation — the EIN is the one that changes
  // what "done" means, and its SSNs stay in the service record, not here.
  const services = o.client_id
    ? await db.query<{ id: string; type: string; status: string; llc_name: string }>(
        `SELECT id, type, status, llc_name FROM service_orders
          WHERE formation_order_id = $1 ORDER BY created_at`,
        [o.id],
      )
    : [];

  const covered = new Set<string>();
  for (const d of docs) {
    if (d.kind !== "psd") continue;
    const meta = (typeof d.meta === "string" ? JSON.parse(d.meta) : d.meta ?? {}) as {
      seriesNames?: string[];
    };
    for (const n of meta.seriesNames ?? []) covered.add(n);
  }
  const allSeries = seriesNames(payload);

  return c.json({
    data: {
      id: o.id,
      clientId: o.client_id,
      llcName: o.llc_name,
      status: o.status,
      // Kept because this endpoint used to return the raw row: reshaping it
      // silently dropped square_order_id, the e2e webhook was posted with an
      // undefined order id, and three payment assertions failed. A response
      // shape is a contract even when nobody wrote it down.
      squareOrderId: (o as unknown as { square_order_id: string | null }).square_order_id,
      contactName: o.contact_name,
      contactEmail: o.contact_email,
      totalCents: o.total_cents,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      filedAt: o.filed_at,
      formedAt: o.formed_at,
      groups: filingGroups(payload),
      alternateNames: ((payload as { llcName?: { alternateNames?: string[] } }).llcName?.alternateNames ?? []).filter(
        (n) => (n ?? "").trim() !== "",
      ),
      copiedFields:
        (typeof o.copied_fields === "string" ? JSON.parse(o.copied_fields) : o.copied_fields) ?? {},
      series: allSeries.map((name) => ({ name, covered: covered.has(name) })),
      documents: docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        createdAt: d.created_at,
      })),
      services,
      hasArticles: docs.some((d) => d.kind === "articles"),
    },
  });
});

/** The Articles and the Protected Series Designations, in one action.
 *
 *  This is the only way an order becomes "formed": the same request that writes
 *  the documents sets the status and emails the client, so the board can never
 *  show a completed order whose client has an empty portal. One PSD document may
 *  cover several series — Florida allows it — so coverage is declared per file
 *  and checked against the order's own series list. Miss one and this refuses. */
app.post("/admin/orders/:id/formation-documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string | null; llc_name: string; status: string; payload: unknown;
  }>("SELECT id, client_id, llc_name, status, payload FROM orders WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const o = rows[0];
  if (!o.client_id) return c.json(err("This order has no client account yet.", "NO_CLIENT"), 400);
  if (o.status === "pending_payment") {
    return c.json(err("This order has not been paid.", "BAD_STATE"), 400);
  }

  const form = await c.req.parseBody({ all: true });
  const articles = form.articles;
  if (!(articles instanceof File)) {
    return c.json(err("The Articles of Organization PDF is required.", "INVALID_INPUT"), 400);
  }
  // psd[] files, each with a matching psdSeries[] entry: a JSON array of the
  // series names that file designates.
  const psdFiles = (Array.isArray(form["psd"]) ? form["psd"] : [form["psd"]]).filter(
    (f): f is File => f instanceof File,
  );
  const psdSeriesRaw = (
    Array.isArray(form["psdSeries"]) ? form["psdSeries"] : [form["psdSeries"]]
  ).filter((v): v is string => typeof v === "string");
  if (psdFiles.length === 0) {
    return c.json(err("At least one Protected Series Designation is required.", "INVALID_INPUT"), 400);
  }
  if (psdFiles.length !== psdSeriesRaw.length) {
    return c.json(err("Every designation must say which series it covers.", "INVALID_INPUT"), 400);
  }
  let psdSeries: string[][];
  try {
    psdSeries = psdSeriesRaw.map((s) => JSON.parse(s) as string[]);
  } catch {
    return c.json(err("Series coverage was not readable.", "INVALID_INPUT"), 400);
  }

  const payload = typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload;
  const required = seriesNames(payload);
  const covered = new Set(psdSeries.flat());
  const missing = required.filter((n) => !covered.has(n));
  if (missing.length > 0) {
    return c.json(
      err(
        `No designation covers: ${missing.join(", ")}. Every series on the order must be designated before it can be marked formed.`,
        "SERIES_UNCOVERED",
      ),
      400,
    );
  }

  const files = [articles, ...psdFiles];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) {
      return c.json(err(`${f.name} is too large (20 MB max).`, "TOO_LARGE"), 400);
    }
  }

  const storedArticles = await putFile(
    articles.name,
    await articles.arrayBuffer(),
    articles.type || "application/pdf",
  );
  await db.query(
    `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
     VALUES ($1, $2, 'articles', $3, $4, $5, $6, '{}'::jsonb)`,
    [
      o.client_id,
      o.id,
      `Articles of Organization — ${o.llc_name}`,
      storedArticles.storageKey,
      articles.type || "application/pdf",
      storedArticles.sizeBytes,
    ],
  );
  for (let i = 0; i < psdFiles.length; i += 1) {
    const f = psdFiles[i];
    const names = psdSeries[i];
    const stored = await putFile(f.name, await f.arrayBuffer(), f.type || "application/pdf");
    await db.query(
      `INSERT INTO documents (client_id, order_id, kind, title, storage_key, content_type, size_bytes, meta)
       VALUES ($1, $2, 'psd', $3, $4, $5, $6, $7)`,
      [
        o.client_id,
        o.id,
        `Protected Series Designation — ${names.join(", ")}`,
        stored.storageKey,
        f.type || "application/pdf",
        stored.sizeBytes,
        JSON.stringify({ seriesNames: names }),
      ],
    );
  }

  await db.query(
    "UPDATE orders SET status = 'formed', formed_at = now(), filed_at = COALESCE(filed_at, now()) WHERE id = $1",
    [o.id],
  );

  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [o.client_id],
  );
  let notified = false;
  if (clients.length > 0) {
    const mail = llcFormedEmail({
      llcName: o.llc_name,
      seriesNames: required,
      portalUrl: `${env.PUBLIC_BASE_URL}/portal`,
    });
    notified = await sendMail({ to: clients[0].email, ...mail }).then(
      () => true,
      (e) => {
        console.error("[admin] formed email failed:", e);
        return false;
      },
    );
  }
  return c.json({ data: { ok: true, notified, documents: files.length } });
});

app.get("/admin/clients", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  // ra_llcs: the LLCs for which we serve as registered agent — paid orders
  // that took our RA service. Drives the Registered Agent Clients tab; a
  // client who requested cancellation stays listed until we are replaced as
  // agent of record (the cancellation chip carries that state).
  const rows = await db.query(
    `SELECT cl.id, cl.email, cl.name, cl.created_at, cl.ra_cancellation_requested_at,
            (cl.password_hash IS NOT NULL) AS has_password,
            COUNT(d.id)::int AS document_count,
            (SELECT COALESCE(jsonb_agg(DISTINCT o.llc_name), '[]'::jsonb)
               FROM orders o
              WHERE o.client_id = cl.id AND o.status <> 'pending_payment'
                AND o.payload->'registeredAgent'->>'choice' = 'SERVICE') AS ra_llcs
     FROM clients cl LEFT JOIN documents d ON d.client_id = cl.id
     GROUP BY cl.id ORDER BY cl.created_at DESC`,
  );
  return c.json({ data: rows });
});

/** Support override for the case a client can reach neither address. Both the
 *  old and the new address are notified, so a change is never silent. */
app.post("/admin/clients/:id/email", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const body = z
    .object({ newEmail: z.string().email("Enter a valid email address.") })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json(err(body.error.issues[0]?.message ?? "Invalid request.", "INVALID_INPUT"), 400);
  }
  const newEmail = body.data.newEmail.toLowerCase();
  const db = await getDb();
  const rows = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [
    c.req.param("id"),
  ]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const previous = rows[0].email;
  if (previous === newEmail) {
    return c.json(err("That is already the address on this account.", "INVALID_INPUT"), 400);
  }
  const taken = await db.query("SELECT id FROM clients WHERE email = $1", [newEmail]);
  if (taken.length > 0) {
    return c.json(err("That address is already in use on another account.", "EMAIL_TAKEN"), 400);
  }
  await db.query("UPDATE clients SET email = $1, pending_email = NULL WHERE id = $2", [
    newEmail,
    c.req.param("id"),
  ]);
  const mail = emailChangedEmail(newEmail);
  sendMail({ to: newEmail, ...mail }).catch((e) => console.error("[admin] email-changed (new) failed:", e));
  sendMail({ to: previous, ...mail }).catch((e) => console.error("[admin] email-changed (old) failed:", e));
  return c.json({ data: { ok: true, email: newEmail } });
});

app.get("/admin/services", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  await purgeExpiredSElections().catch((e) => console.error("[purge] failed:", e));
  const rows = await db.query(
    `SELECT so.id, so.type, so.status, so.llc_name, so.details, so.amount_cents,
            so.client_id, so.formation_order_id,
            so.created_at, so.paid_at, so.fulfilled_at,
            (so.ein_secret IS NOT NULL) AS has_secret,
            (so.type = 's-election' AND EXISTS (
              SELECT 1 FROM service_orders e
              WHERE e.client_id = so.client_id AND e.type = 'ein'
                AND e.status NOT IN ('fulfilled', 'cancelled')
            )) AS ein_pending,
            cl.email AS client_email, cl.name AS client_name
     FROM service_orders so JOIN clients cl ON cl.id = so.client_id
     ORDER BY so.created_at DESC`,
  );
  return c.json({ data: rows });
});

app.get("/admin/services/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; type: string; status: string; llc_name: string; details: unknown;
    amount_cents: number; ein_secret: string | null; created_at: string; paid_at: string | null;
    square_order_id: string | null;
  }>(
    "SELECT id, type, status, llc_name, details, amount_cents, ein_secret, created_at, paid_at, square_order_id FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  let tin: string | null = null;
  let ssns: string[] | null = null; // s-election: one SSN per listed shareholder
  if (so.ein_secret) {
    try {
      const secret = decryptSecret(so.ein_secret);
      if (so.type === "s-election") ssns = JSON.parse(secret) as string[];
      else tin = secret;
    } catch (e) {
      console.error("[admin] EIN secret decrypt failed:", e);
    }
  }
  return c.json({
    data: {
      id: so.id,
      type: so.type,
      status: so.status,
      llc_name: so.llc_name,
      details: so.details,
      amount_cents: so.amount_cents,
      created_at: so.created_at,
      paid_at: so.paid_at,
      square_order_id: so.square_order_id,
      tin,
      ssns,
    },
  });
});

/** Draft S election package for admin review: instructions + cover letter +
 *  the filled official Form 2553. Generated on demand from the encrypted
 *  details; nothing is stored — Adam reviews and attaches it at fulfillment. */
app.get("/admin/services/:id/s-election-draft", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string;
    details: unknown; ein_secret: string | null;
  }>(
    "SELECT id, client_id, type, status, llc_name, details, ein_secret FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  if (so.type !== "s-election" || !so.ein_secret) {
    return c.json(err("This order has no S election details yet.", "BAD_STATE"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    ein: string; dateIncorporated: string; effectiveDate: string;
    officerName: string; officerTitle: string; phone: string;
    shareholders: { name: string; address: string; percentage: number; dateAcquired: string }[];
  };
  let ssns: string[];
  try {
    ssns = JSON.parse(decryptSecret(so.ein_secret)) as string[];
  } catch (e) {
    console.error("[admin] s-election secret decrypt failed:", e);
    return c.json(err("Could not decrypt the shareholder details.", "DECRYPT_FAILED"), 500);
  }
  const seed = await oaSeed(so.client_id);
  const input: SElectionDetails = {
    llcName: so.llc_name,
    principalAddress: seed?.principalAddress ?? "",
    ein: details.ein ?? "",
    dateIncorporated: details.dateIncorporated,
    effectiveDate: details.effectiveDate,
    officerName: details.officerName,
    officerTitle: details.officerTitle,
    phone: details.phone ?? "",
    shareholders: details.shareholders.map((s, i) => ({ ...s, ssn: ssns[i] ?? "" })),
  };
  try {
    const pdf = await buildSElectionPackage(input);
    return new Response(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="S-Election-Package-${so.llc_name.replace(/[^\w-]+/g, "_")}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[admin] s-election draft failed:", e);
    return c.json(err("Draft generation failed.", "GENERATION_FAILED"), 500);
  }
});

app.post("/admin/services/:id/fulfill", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);

  // JSON (no attachment) or multipart (attachment posted to the client's
  // portal documents in the same action).
  const contentType = c.req.header("content-type") ?? "";
  let notify = true;
  let file: File | null = null;
  let titleOverride = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    if (form.file instanceof File && form.file.size > 0) file = form.file;
    notify = form.notify !== "false";
    if (typeof form.title === "string") titleOverride = form.title.trim();
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { notify?: boolean };
    notify = body.notify !== false;
  }
  if (file && file.size > MAX_UPLOAD_BYTES) {
    return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  }

  const db = await getDb();
  const rows = await db.query<{ id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown }>(
    "SELECT id, client_id, type, status, llc_name, details FROM service_orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  const so = rows[0];
  if (so.status === "pending_payment" || so.status === "fulfilled") {
    return c.json(err("This order is not in a fulfillable state.", "BAD_STATE"), 400);
  }
  // An EIN order's deliverable IS the IRS letter — and fulfillment deletes the
  // TIN, so completing without the letter would strand the client. Required.
  // Same for the S election package: fulfilling deletes the shareholder SSNs.
  if (so.type === "ein" && !file) {
    return c.json(err("Attach the EIN confirmation letter (CP 575) to fulfill an EIN order.", "LETTER_REQUIRED"), 400);
  }
  if (so.type === "s-election" && !file) {
    return c.json(err("Attach the election package PDF to fulfill an S election order.", "PACKAGE_REQUIRED"), 400);
  }
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    seriesName?: string; target?: string;
  };
  const summary =
    so.type === "series"
      ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
      : so.type === "s-election"
        ? `S Corporation Election Package — ${so.llc_name}`
        : `Federal EIN — ${details.target === "series" ? details.seriesName ?? "series" : so.llc_name}`;

  let documentId: string | null = null;
  if (file) {
    const title =
      titleOverride ||
      (so.type === "series"
        ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
        : so.type === "s-election"
          ? `S Corporation Election Package (Form 2553) — ${so.llc_name}`
          : `EIN Confirmation Letter — ${details.target === "series" ? details.seriesName ?? so.llc_name : so.llc_name}`);
    const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
    const doc = await db.query<{ id: string }>(
      `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
       VALUES ($1, 'package', $2, $3, $4, $5) RETURNING id`,
      [so.client_id, title, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
    );
    documentId = doc[0].id;
  }

  // The TIN is deleted the moment the order is fulfilled — this is what makes
  // the Privacy Policy's "not retained after issuance" promise true.
  await db.query(
    "UPDATE service_orders SET status = 'fulfilled', fulfilled_at = now(), ein_secret = NULL WHERE id = $1",
    [so.id],
  );

  if (notify) {
    const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [so.client_id]);
    if (clients[0]) {
      const mail = serviceFulfilledClientEmail({ summary, portalUrl: `${env.PUBLIC_BASE_URL}/portal` });
      sendMail({ to: clients[0].email, ...mail }).catch((e) =>
        console.error("[admin] fulfill email failed:", e),
      );
    }
  }
  return c.json({ data: { ok: true, documentId } });
});

app.get("/admin/clients/:id/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    "SELECT id, kind, title, size_bytes, created_at FROM documents WHERE client_id = $1 ORDER BY created_at DESC",
    [c.req.param("id")],
  );
  return c.json({ data: rows });
});

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

app.post("/admin/documents", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const form = await c.req.parseBody();
  const file = form.file;
  const clientId = typeof form.clientId === "string" ? form.clientId : "";
  const kind = form.kind === "legal_mail" ? "legal_mail" : "package";
  const title = typeof form.title === "string" ? form.title.trim() : "";
  const notify = form.notify === "true";
  if (!(file instanceof File) || !clientId || !title) {
    return c.json(err("clientId, title, and file are required.", "INVALID_INPUT"), 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json(err("File is too large (20 MB max).", "TOO_LARGE"), 400);
  }
  const db = await getDb();
  const clients = await db.query<{ email: string }>("SELECT email FROM clients WHERE id = $1", [clientId]);
  if (clients.length === 0) return c.json(err("Client not found.", "NOT_FOUND"), 404);

  const stored = await putFile(file.name, await file.arrayBuffer(), file.type || "application/pdf");
  const rows = await db.query<{ id: string }>(
    `INSERT INTO documents (client_id, kind, title, storage_key, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [clientId, kind, title, stored.storageKey, file.type || "application/pdf", stored.sizeBytes],
  );

  let notified = false;
  if (notify) {
    const mail = newDocumentEmail(`${env.PUBLIC_BASE_URL}/portal`);
    notified = await sendMail({ to: clients[0].email, ...mail }).then(
      () => true,
      (e) => {
        console.error("[admin] document alert email failed:", e);
        return false;
      },
    );
  }
  return c.json({ data: { id: rows[0].id, notified } });
});

app.notFound((c) => c.json(err("Not found", "NOT_FOUND"), 404));
app.onError((e, c) => {
  console.error("[api]", e);
  return c.json(err("Something went wrong on our end.", "INTERNAL"), 500);
});
