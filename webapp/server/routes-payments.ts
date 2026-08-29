// Split from app.ts on 29 Aug 2026 — one domain per file, code moved
// verbatim (the two dev test flags became shared.testHooks so they stay
// mutable across modules). Routes register inside registerPaymentRoutes(app),
// which app.ts calls after creating the app — no circular imports.
import { Hono } from "hono";
import { z } from "zod";
import { orderFormSchema } from "./validation";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { validateRegisteredAgentAddress } from "../src/components/forms/florida-llc/validation";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";
import { getDb } from "./db";
import { env } from "./env";

import { priceOrder, EIN_FEE_CENTS, S_ELECTION_FEE_CENTS } from "./pricing";

import { createCheckout, verifyWebhookSignature } from "./square";
import { newToken } from "./crypto";

import { rateLimit, clientIp } from "./auth";
import { checkName, getSyncState, unavailableNames } from "./sunbiz";

import { sendMail, welcomeEmail, orderPaidEmail, serviceOrderClientEmail, serviceOrderAdminEmail } from "./email";

import { personLegalName } from "./routes-portal";
import { err, testHooks } from "./shared";

/* ------------------------------- orders ------------------------------- */

/** Ordering goes live only when the production integrations are configured;
 *  until then the form shows a retryable error and keeps the local draft. */
export const orderingEnabled = () =>
  env.isProd ? Boolean(env.DATABASE_URL && env.SQUARE_ACCESS_TOKEN) : true;

/* ------------------------- payment fulfillment ------------------------- */

export async function fulfillPaidOrder(orderId: string, squarePaymentId: string | null): Promise<void> {
  if (testHooks.failNextFulfillment) {
    testHooks.failNextFulfillment = false;
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
export async function fulfillPaidServiceOrder(serviceOrderId: string, squarePaymentId: string | null): Promise<void> {
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
export function moneyMismatch(
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

export async function alertMoneyMismatch(reason: string, squareOrderId: string, paymentId: string): Promise<void> {
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

/* ---------------------------- address verify ---------------------------- */

export const verifyAddressSchema = z.object({
  address1: z.string().min(1).max(200),
  address2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  zip: z.string().min(3).max(20),
});

export function registerPaymentRoutes(app: Hono) {

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
  if (!(await rateLimit(`orders:req:${clientIp(c)}`, 60, 3600_000))) {
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
  if (!(await rateLimit(`orders:ok:${clientIp(c)}`, 10, 3600_000))) {
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
  // Unauthenticated by design — the confirmation page polls it with only the
  // order id from the Square redirect. It answers with the minimum that page
  // renders: status and name. The paid amount stayed in this response long
  // after the page stopped showing it (Codex PRIV-001).
  const rows = await db.query<{ status: string; llc_name: string }>(
    "SELECT status, llc_name FROM orders WHERE id = $1",
    [c.req.param("id")],
  );
  if (rows.length === 0) return c.json(err("Order not found", "NOT_FOUND"), 404);
  return c.json({ data: { status: rows[0].status, llcName: rows[0].llc_name } });
});

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
  if (!(await rateLimit(`addr:${clientIp(c)}`, 60, 900_000))) {
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

/** Confirmation-page "resend my portal invitation" — only for paid orders
 *  whose client has not yet set a password. */
app.post("/orders/:id/resend-welcome", async (c) => {
  if (!(await rateLimit(`resend:${clientIp(c)}`, 5, 3600_000))) {
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

/** Name-availability check against our mirror of the Division of
 *  Corporations' public data files (server/sunbiz.ts). Public: the intake
 *  name step calls it before an order exists. Verdicts say "no conflict
 *  found", never "available" — the Division makes the final determination. */
app.post("/name-check", async (c) => {
  if (!(await rateLimit(`namecheck:${clientIp(c)}`, 30, 600_000))) {
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
}
