import { Hono } from "hono";
import { z } from "zod";
import { orderFormSchema } from "./validation";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { validateRegisteredAgentAddress } from "../src/components/forms/florida-llc/validation";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";
import { getDb } from "./db";
import { env } from "./env";
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
import { stampEastern, stampForFilename } from "./datetime";
import { assembleOa, OA_TEMPLATE_VERSION, type OaInputs } from "./oa";
import { renderMarkdownPdf, stampExistingPdf } from "./pdf-render";
import { createSession, getSession, destroySession, rateLimit, clientIp } from "./auth";
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
} from "./email";

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
  if (!rateLimit(`orders:${clientIp(c)}`, 10, 3600_000)) {
    return c.json(err("Too many submissions. Try again later.", "RATE_LIMITED"), 429);
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
  const data = parsed.data as FloridaLLCFormData;

  const raError = validateRegisteredAgentAddress(
    data.registeredAgentStreetAddress1,
    data.registeredAgentStreetAddress2,
    data.registeredAgentState,
  );
  if (raError) return c.json(err(raError, "INVALID_INPUT"), 400);
  if (data.members.length < 1) {
    return c.json(err("At least one member is required.", "INVALID_INPUT"), 400);
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
      data.correspondentName,
      data.correspondentEmail.toLowerCase(),
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
  const db = await getDb();
  const orders = await db.query<{
    id: string; status: string; contact_name: string; contact_email: string;
    llc_name: string; total_cents: number; payload: unknown;
  }>("SELECT id, status, contact_name, contact_email, llc_name, total_cents, payload FROM orders WHERE id = $1", [orderId]);
  if (orders.length === 0 || orders[0].status === "paid") return;
  const order = orders[0];

  await db.query(
    "UPDATE orders SET status = 'paid', paid_at = now(), square_payment_id = $1 WHERE id = $2",
    [squarePaymentId, orderId],
  );

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
  const rows = await db.query<{
    id: string; client_id: string; type: string; status: string; llc_name: string; details: unknown; amount_cents: number;
  }>("SELECT id, client_id, type, status, llc_name, details, amount_cents FROM service_orders WHERE id = $1", [serviceOrderId]);
  if (rows.length === 0 || rows[0].status !== "pending_payment") return;
  const so = rows[0];
  const nextStatus = so.type === "ein" || so.type === "s-election" ? "awaiting_info" : "in_progress";
  await db.query(
    "UPDATE service_orders SET status = $1, paid_at = now(), square_payment_id = $2 WHERE id = $3",
    [nextStatus, squarePaymentId, so.id],
  );
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
    data?: { object?: { payment?: { id: string; status: string; order_id?: string } } };
  };

  const db = await getDb();
  if (event.event_id) {
    const seen = await db.query(
      "INSERT INTO webhook_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [event.event_id],
    );
    if (seen.length === 0) return c.json({ data: { ok: true, duplicate: true } });
  }

  const payment = event.data?.object?.payment;
  if (event.type?.startsWith("payment.") && payment?.status === "COMPLETED" && payment.order_id) {
    const rows = await db.query<{ id: string }>(
      "SELECT id FROM orders WHERE square_order_id = $1",
      [payment.order_id],
    );
    if (rows.length > 0) {
      await fulfillPaidOrder(rows[0].id, payment.id);
    } else {
      const svc = await db.query<{ id: string }>(
        "SELECT id FROM service_orders WHERE square_order_id = $1",
        [payment.order_id],
      );
      if (svc.length > 0) await fulfillPaidServiceOrder(svc[0].id, payment.id);
    }
  }
  return c.json({ data: { ok: true } });
});

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
      "UPDATE orders SET paid_at = now() - ($1 || ' days')::interval WHERE client_id = $2 AND status = 'paid'",
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
  management?: { structure?: string; managersOrAuthorizedRepresentatives?: { fullName?: string; businessEntityName?: string }[] };
  members?: { memberList?: { fullLegalName?: string; address1?: string; address2?: string; city?: string; state?: string; zip?: string }[] };
  series?: { id: string; name: string }[];
}

async function oaSeed(clientId: string): Promise<{
  llcName: string;
  filingPath: string;
  managementStructure: string;
  managerName: string;
  principalAddress: string;
  members: { name: string; address: string }[];
  series: { name: string; purpose: string }[];
} | null> {
  const db = await getDb();
  const orders = await db.query<{ payload: unknown; llc_name: string }>(
    "SELECT payload, llc_name FROM orders WHERE client_id = $1 AND status = 'paid' ORDER BY paid_at DESC NULLS LAST LIMIT 1",
    [clientId],
  );
  if (orders.length === 0) return null;
  const p = (typeof orders[0].payload === "string" ? JSON.parse(orders[0].payload) : orders[0].payload) as SeedPayload;
  const addr = p.principalOfficeAddress ?? {};
  const principalAddress = [addr.address1, addr.address2, [addr.city, addr.state].filter(Boolean).join(", "), addr.zip]
    .filter((x) => x && String(x).trim())
    .join(", ");
  const members = (p.members?.memberList ?? []).map((m) => ({
    name: m.fullLegalName ?? "",
    address: [m.address1, m.address2, [m.city, m.state].filter(Boolean).join(", "), m.zip]
      .filter((x) => x && String(x).trim())
      .join(", "),
  }));
  const mgr = p.management?.managersOrAuthorizedRepresentatives?.[0];
  const managementStructure = p.management?.structure ?? "";
  const managerName =
    (mgr?.fullName || mgr?.businessEntityName || "").trim() ||
    (members[0]?.name ?? "");
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
    managerName,
    principalAddress,
    members,
    series,
  };
}

const oaAnswersSchema = z.object({
  firstOrAmended: z.enum(["first", "amended"]).optional(),
  sElection: z.boolean().optional(), // true = build on the S corporation form
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorized: z.boolean().optional(),
  contributionToCompany: z.string().max(300).optional(),
  ownershipMode: z.enum(["percent", "fraction"]).optional(),
  members: z
    .array(
      z.object({
        percentage: z.number().min(0).max(100).optional(),
        numerator: z.number().int().min(0).max(100_000).optional(),
        denominator: z.number().int().min(1).max(100_000).optional(),
        contribution: z.string().max(300).optional(),
        todBeneficiary: z.string().max(300).optional(),
      }),
    )
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
  TBE: "tenants by the entireties",
  JTWROS: "joint tenants with right of survivorship",
};

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
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  const version = seed.members.length > 1 ? (memberManaged ? "member" : "multi") : "single";
  return c.json({
    data: {
      seed,
      version,
      memberManaged,
      blocked: false,
      templateVersion: OA_TEMPLATE_VERSION,
      answers: saved.length > 0 ? (typeof saved[0].answers === "string" ? JSON.parse(saved[0].answers as string) : saved[0].answers) : {},
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
  const multiOwner = seed.members.length > 1;
  const memberManaged = seed.managementStructure === "MEMBER_MANAGED";
  // Management structure × tax posture. A single owner is always the
  // disregarded form unless they elect S; member-managed only applies with
  // more than one owner (a sole owner has no one to share management with).
  const version: OaInputs["version"] = a.sElection
    ? multiOwner && memberManaged
      ? "member-s"
      : "s"
    : multiOwner
      ? memberManaged
        ? "member"
        : "multi"
      : "single";
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
  // interest ("A and B, husband and wife, as tenants by the entireties").
  const ownershipMode: OwnershipMode = a.ownershipMode ?? "percent";
  const couples = multiOwner ? (a.couples ?? []) : [];
  const pairedIdx = new Set<number>();
  for (const cpl of couples) {
    if (
      cpl.a === cpl.b ||
      !seed.members[cpl.a] ||
      !seed.members[cpl.b] ||
      pairedIdx.has(cpl.a) ||
      pairedIdx.has(cpl.b)
    ) {
      return c.json(err("Invalid spousal pairing.", "INVALID_INPUT"), 400);
    }
    pairedIdx.add(cpl.a);
    pairedIdx.add(cpl.b);
  }
  const coupleAt = (i: number) => couples.find((cpl) => cpl.a === i || cpl.b === i);
  const coupleName = (cpl: (typeof couples)[number]) =>
    `${seed.members[cpl.a].name} and ${seed.members[cpl.b].name}, husband and wife, as ${SPOUSAL_FORM_LABEL[cpl.form]}`;

  const members: OaInputs["members"] = [];
  const emittedCouples = new Set<(typeof couples)[number]>();
  seed.members.forEach((m, i) => {
    const cpl = coupleAt(i);
    if (cpl) {
      if (emittedCouples.has(cpl)) return;
      emittedCouples.add(cpl);
      const cplShare: OwnershipShare = { percentage: cpl.percentage, numerator: cpl.numerator, denominator: cpl.denominator };
      members.push({
        name: coupleName(cpl),
        address: seed.members[cpl.a].address,
        percentage: shareValue(ownershipMode, cplShare),
        percentageLabel: shareLabel(ownershipMode, cplShare),
        jointHolding: `husband and wife, as ${SPOUSAL_FORM_LABEL[cpl.form]}`,
        contribution: cpl.contribution ?? "",
        todBeneficiary: cpl.todBeneficiary
          ? `${cpl.todBeneficiary} (effective at the death of the last surviving spouse)`
          : "",
        signatories: [seed.members[cpl.a].name, seed.members[cpl.b].name],
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
  const isSCorp = version === "s" || version === "member-s";
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
    seed.members.forEach((_, i) => {
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
    if (!a.borrowingThreshold) {
      return c.json(err("Set the manager's borrowing limit.", "INVALID_INPUT"), 400);
    }
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
    managerName: seed.managerName,
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
    borrowingThreshold: a.borrowingThreshold ?? (isSCorp && !multiOwner ? 25000 : undefined),
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
  return c.json({ data: { generationId: gen[0].id, documentId: doc[0].id, title } });
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
    "SELECT llc_name FROM orders WHERE client_id = $1 AND status = 'paid' ORDER BY paid_at DESC NULLS LAST LIMIT 1",
    [clientId],
  );
  return rows[0]?.llc_name ?? "";
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
    "SELECT paid_at FROM orders WHERE client_id = $1 AND status = 'paid' AND package = 'NEW' ORDER BY paid_at DESC NULLS LAST LIMIT 1",
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
  const orders = await db.query<{ id: string; type: string; details: unknown; fulfilled_at: unknown }>(
    `SELECT ${SERVICE_SAFE_COLUMNS} FROM service_orders WHERE client_id = $1 ORDER BY created_at DESC`,
    [session.clientId],
  );
  // The owner dropdown is built from the members on the formation record, so a
  // client picks a name instead of retyping one.
  const seed = await oaSeed(session.clientId);
  return c.json({
    data: {
      llcName: await clientLlcName(session.clientId),
      dev: !env.isProd && !env.SQUARE_ACCESS_TOKEN,
      members: seed?.members ?? [],
      pricing: {
        seriesCents: SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS,
        einCents: EIN_FEE_CENTS,
        sElectionCents: S_ELECTION_FEE_CENTS,
      },
      sElection: await sElectionEligibility(session.clientId),
      orders: orders.map((o) => {
        if (o.type !== "s-election") return o;
        const d = (typeof o.details === "string" ? JSON.parse(o.details) : o.details) as SElectionStoredDetails;
        const w = sElectionWindow(o.fulfilled_at);
        return { ...o, editableUntil: w.deleteOn, editable: w.open, documentId: d?.documentId ?? null };
      }),
    },
  });
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

const einDetailsSchema = z.object({
  responsibleName: z.string().min(1, "The responsible party's name is required.").max(200),
  tin: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .refine((s) => /^\d{9}$/.test(s), "Enter a 9-digit SSN or ITIN."),
  note: z.string().max(1000).optional(),
  certified: z.literal(true, {
    errorMap: () => ({ message: "You must confirm the certification before submitting." }),
  }),
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
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as Record<string, unknown>;
  const merged = {
    ...details,
    responsibleName: body.data.responsibleName,
    tinLast4: body.data.tin.slice(-4),
    note: body.data.note ?? "",
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
  const rows = await db.query(
    `SELECT id, client_id, contact_name, contact_email, package, llc_name, status,
            service_fee_cents, state_fees_cents, total_cents, created_at, paid_at
     FROM orders ORDER BY created_at DESC LIMIT 200`,
  );
  return c.json({ data: rows });
});

app.get("/admin/orders/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query("SELECT * FROM orders WHERE id = $1", [c.req.param("id")]);
  if (rows.length === 0) return c.json(err("Not found", "NOT_FOUND"), 404);
  return c.json({ data: rows[0] });
});

app.get("/admin/clients", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    `SELECT cl.id, cl.email, cl.name, cl.created_at, cl.ra_cancellation_requested_at,
            (cl.password_hash IS NOT NULL) AS has_password,
            COUNT(d.id)::int AS document_count
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
