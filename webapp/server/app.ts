import { Hono } from "hono";
import { z } from "zod";
import { orderFormSchema } from "./validation";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { validateRegisteredAgentAddress } from "../src/components/forms/florida-llc/validation";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";
import { getDb } from "./db";
import { env } from "./env";
import { priceOrder } from "./pricing";
import { createCheckout, verifyWebhookSignature } from "./square";
import { hashPassword, verifyPassword, newToken, hashToken } from "./crypto";
import { createSession, getSession, destroySession, rateLimit, clientIp } from "./auth";
import { putFile, readFileStream } from "./storage";
import {
  sendMail,
  welcomeEmail,
  resetEmail,
  newDocumentEmail,
  orderPaidEmail,
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
    llc_name: string; total_cents: number;
  }>("SELECT id, status, contact_name, contact_email, llc_name, total_cents FROM orders WHERE id = $1", [orderId]);
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
    if (rows.length > 0) await fulfillPaidOrder(rows[0].id, payment.id);
  }
  return c.json({ data: { ok: true } });
});

// Dev-only stand-in for the Square webhook while no Square account is connected.
if (!env.SQUARE_ACCESS_TOKEN && !env.isProd) {
  app.post("/dev/simulate-payment", async (c) => {
    const { orderId } = (await c.req.json()) as { orderId: string };
    await fulfillPaidOrder(orderId, "dev-payment");
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

/** Soft USPS-backed check via Radar. Never blocks: with no key, on vendor
 *  errors, or on timeouts the answer is "skipped" and the form proceeds. */
app.post("/address/verify", async (c) => {
  if (!rateLimit(`addr:${clientIp(c)}`, 60, 900_000)) {
    return c.json({ data: { status: "skipped" } });
  }
  const body = verifyAddressSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("Invalid address payload", "INVALID_INPUT"), 400);
  if (!env.RADAR_SECRET_KEY) return c.json({ data: { status: "skipped" } });

  const a = body.data;
  const params = new URLSearchParams({
    countryCode: "US",
    stateCode: a.state,
    city: a.city,
    postalCode: a.zip,
    addressLabel: a.address1,
    ...(a.address2 ? { unit: a.address2 } : {}),
  });
  try {
    const res = await fetch(`https://api.radar.io/v1/addresses/validate?${params}`, {
      headers: { Authorization: env.RADAR_SECRET_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return c.json({ data: { status: "skipped" } });
    const out = (await res.json()) as {
      result?: { verificationStatus?: string };
      address?: { addressLabel?: string; city?: string; stateCode?: string; postalCode?: string };
    };
    const status = (out.result?.verificationStatus ?? "unknown").toLowerCase();
    return c.json({
      data: {
        status,
        normalized: out.address
          ? {
              address1: out.address.addressLabel ?? "",
              city: out.address.city ?? "",
              state: out.address.stateCode ?? "",
              zip: out.address.postalCode ?? "",
            }
          : null,
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
  const rows = await db.query<{ email: string; name: string }>(
    "SELECT email, name FROM clients WHERE id = $1",
    [session.clientId],
  );
  return c.json({ data: { email: rows[0]?.email ?? "", name: rows[0]?.name ?? "" } });
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
    `SELECT cl.id, cl.email, cl.name, cl.created_at,
            (cl.password_hash IS NOT NULL) AS has_password,
            COUNT(d.id)::int AS document_count
     FROM clients cl LEFT JOIN documents d ON d.client_id = cl.id
     GROUP BY cl.id ORDER BY cl.created_at DESC`,
  );
  return c.json({ data: rows });
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
