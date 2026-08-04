import { Hono } from "hono";
import { z } from "zod";
import { orderFormSchema } from "./validation";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { validateRegisteredAgentAddress } from "../src/components/forms/florida-llc/validation";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";
import { getDb } from "./db";
import { env } from "./env";
import { priceOrder, EIN_FEE_CENTS, SERIES_ADDON_PREP_CENTS, SERIES_ADDON_STATE_CENTS } from "./pricing";
import { createCheckout, verifyWebhookSignature } from "./square";
import { hashPassword, verifyPassword, newToken, hashToken, encryptSecret, decryptSecret } from "./crypto";
import { hasProtectedSeriesPhrase } from "../src/components/forms/florida-llc/validation";
import { createSession, getSession, destroySession, rateLimit, clientIp } from "./auth";
import { putFile, readFileStream } from "./storage";
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
  serviceFulfilledClientEmail,
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
    optionalDocuments?: { ein?: boolean };
  } | null;
  if (payload?.optionalDocuments?.ein) {
    await db.query(
      `INSERT INTO service_orders (client_id, type, status, llc_name, details, amount_cents, formation_order_id, paid_at, square_payment_id)
       VALUES ($1, 'ein', 'awaiting_info', $2, $3, $4, $5, now(), $6)`,
      [clientId, order.llc_name, JSON.stringify({ target: "company" }), EIN_FEE_CENTS, orderId, squarePaymentId],
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
  const nextStatus = so.type === "ein" ? "awaiting_info" : "in_progress";
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
      : `Federal EIN — ${details.target === "series" ? details.seriesName ?? "series" : so.llc_name}`;
  const clients = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [so.client_id],
  );
  const client = clients[0];
  if (client) {
    const mail = serviceOrderClientEmail({
      type: so.type as "series" | "ein",
      summary,
      needsInfo: so.type === "ein",
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
  const rows = await db.query<{ email: string; name: string; ra_cancellation_requested_at: string | null }>(
    "SELECT email, name, ra_cancellation_requested_at FROM clients WHERE id = $1",
    [session.clientId],
  );
  return c.json({
    data: {
      email: rows[0]?.email ?? "",
      name: rows[0]?.name ?? "",
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

app.get("/portal/services", async (c) => {
  const session = await getSession(c);
  if (!session?.clientId) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const orders = await db.query(
    `SELECT ${SERVICE_SAFE_COLUMNS} FROM service_orders WHERE client_id = $1 ORDER BY created_at DESC`,
    [session.clientId],
  );
  return c.json({
    data: {
      llcName: await clientLlcName(session.clientId),
      dev: !env.isProd && !env.SQUARE_ACCESS_TOKEN,
      pricing: {
        seriesCents: SERIES_ADDON_PREP_CENTS + SERIES_ADDON_STATE_CENTS,
        einCents: EIN_FEE_CENTS,
      },
      orders,
    },
  });
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

app.get("/admin/services", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json(err("Not signed in", "UNAUTHENTICATED"), 401);
  const db = await getDb();
  const rows = await db.query(
    `SELECT so.id, so.type, so.status, so.llc_name, so.details, so.amount_cents,
            so.created_at, so.paid_at, so.fulfilled_at,
            (so.ein_secret IS NOT NULL) AS has_secret,
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
  if (so.ein_secret) {
    try {
      tin = decryptSecret(so.ein_secret);
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
    },
  });
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
  const details = (typeof so.details === "string" ? JSON.parse(so.details) : so.details) as {
    seriesName?: string; target?: string;
  };
  const summary =
    so.type === "series"
      ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
      : `Federal EIN — ${details.target === "series" ? details.seriesName ?? "series" : so.llc_name}`;

  let documentId: string | null = null;
  if (file) {
    const title =
      titleOverride ||
      (so.type === "series"
        ? `Protected Series Designation — ${details.seriesName ?? so.llc_name}`
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
