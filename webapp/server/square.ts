import { randomBytes } from "node:crypto";
import { env } from "./env";
import { hmacSha256Base64 } from "./crypto";
import type { PricedOrder } from "./pricing";
import { testHooks } from "./shared";

const API_BASE =
  env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

export interface CheckoutLink {
  url: string;
  squareOrderId: string;
}

/** Creates a Square-hosted checkout page for the order. In dev (no token),
 *  returns a fake link straight to the confirmation page so the flow is testable. */
export async function createCheckout(opts: {
  orderId: string;
  llcName: string;
  priced: PricedOrder;
  buyerEmail: string;
  /** Defaults to the formation confirmation page; portal service orders
   *  redirect back to the portal instead. */
  redirectUrl?: string;
  description?: string;
}): Promise<CheckoutLink> {
  const redirectUrl = opts.redirectUrl ?? `${env.PUBLIC_BASE_URL}/order/confirmed?ref=${opts.orderId}`;
  if (!env.SQUARE_ACCESS_TOKEN) {
    return {
      url: `${redirectUrl}&dev=1`,
      squareOrderId: `dev-${opts.orderId}`,
    };
  }
  const request = (withPrefill: boolean) =>
    fetch(`${API_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
      },
      body: JSON.stringify({
        idempotency_key: randomBytes(16).toString("hex"),
        order: {
          location_id: env.SQUARE_LOCATION_ID,
          reference_id: opts.orderId,
          line_items: opts.priced.lineItems.map((li) => ({
            name: li.name,
            quantity: "1",
            base_price_money: { amount: li.amountCents, currency: "USD" },
          })),
        },
        checkout_options: {
          redirect_url: redirectUrl,
          merchant_support_email: "support@myfloridaseriesllc.com",
        },
        ...(withPrefill ? { pre_populated_data: { buyer_email: opts.buyerEmail } } : {}),
        description: opts.description ?? `Florida Protected Series LLC formation — ${opts.llcName}`,
      }),
    });

  // Square occasionally drops the socket mid-call (seen 25 Aug 2026: an
  // ECONNRESET from the sandbox failed a checkout in the e2e suite). fetch
  // throws only on network-level failures — HTTP errors return normally — so
  // the catch below is exactly the dropped-connection case. Retrying is safe
  // here: a payment link charges nothing until the buyer opens it, each
  // attempt carries its own idempotency key, and the order keeps only the
  // link this function returns. Two retries turn a blip into a short delay.
  const attemptWithRetry = async (withPrefill: boolean): Promise<Response> => {
    let lastError: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await request(withPrefill);
      } catch (e) {
        lastError = e;
        await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
      }
    }
    throw lastError;
  };

  let res = await attemptWithRetry(true);
  let body = (await res.json()) as {
    payment_link?: { url: string; order_id: string };
    errors?: { field?: string }[];
  };
  // The email prefill is a convenience — if Square dislikes the address,
  // retry without it rather than failing the whole checkout.
  if (!res.ok && body.errors?.some((e) => e.field?.includes("buyer_email"))) {
    res = await attemptWithRetry(false);
    body = (await res.json()) as typeof body;
  }
  if (!res.ok || !body.payment_link) {
    throw new Error(`Square payment link failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
  return { url: body.payment_link.url, squareOrderId: body.payment_link.order_id };
}

/* ------------------------- cards on file (16 Sep 2026) ------------------------- */

/** Dev only: how the fake payment should look to the card-saving step. */
export type CardSimulation = "credit" | "prepaid" | "wallet";

export interface SavedCard {
  customerId: string;
  cardId: string;
  last4: string;
  brand: string;
  /** Square marks a prepaid gift card prepaid_type PREPAID; it is never kept. */
  prepaid: boolean;
}

const squareHeaders = () => ({
  Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  "Square-Version": "2025-01-23",
});

/** Saves the card a completed payment was made with, against a new Square
 *  customer (Square: "source_id can be a payment ID from a recent payment";
 *  the payment must be a card payment authorized within 24 hours). A wallet
 *  payment cannot be saved and comes back not ok. */
export async function saveCardFromPayment(opts: {
  paymentId: string;
  givenName: string;
  familyName: string;
  email: string;
  referenceId: string;
  simulate?: CardSimulation;
}): Promise<{ ok: true; card: SavedCard } | { ok: false; reason: string; detail?: string }> {
  if (!env.SQUARE_ACCESS_TOKEN) {
    const sim = opts.simulate ?? "credit";
    if (sim === "wallet") return { ok: false, reason: "wallet payment" };
    return {
      ok: true,
      card: { customerId: `dev-cust-${opts.referenceId.slice(0, 8)}`, cardId: `dev-card-${randomBytes(4).toString("hex")}`, last4: sim === "prepaid" ? "0005" : "1111", brand: sim === "prepaid" ? "MASTERCARD" : "VISA", prepaid: sim === "prepaid" },
    };
  }
  const custRes = await fetch(`${API_BASE}/v2/customers`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: randomBytes(16).toString("hex"),
      given_name: opts.givenName || undefined,
      family_name: opts.familyName || undefined,
      email_address: opts.email,
      reference_id: opts.referenceId,
    }),
  });
  const custBody = (await custRes.json().catch(() => null)) as { customer?: { id: string }; errors?: unknown } | null;
  if (!custRes.ok || !custBody?.customer) return { ok: false, reason: "customer", detail: JSON.stringify(custBody?.errors ?? custBody) };
  const cardRes = await fetch(`${API_BASE}/v2/cards`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: randomBytes(16).toString("hex"),
      source_id: opts.paymentId,
      card: { customer_id: custBody.customer.id, cardholder_name: [opts.givenName, opts.familyName].filter(Boolean).join(" ") || undefined, reference_id: opts.referenceId },
    }),
  });
  const cardBody = (await cardRes.json().catch(() => null)) as { card?: { id: string; last_4?: string; card_brand?: string; prepaid_type?: string }; errors?: unknown } | null;
  if (!cardRes.ok || !cardBody?.card) return { ok: false, reason: "not saveable", detail: JSON.stringify(cardBody?.errors ?? cardBody) };
  return {
    ok: true,
    card: { customerId: custBody.customer.id, cardId: cardBody.card.id, last4: cardBody.card.last_4 ?? "", brand: cardBody.card.card_brand ?? "", prepaid: cardBody.card.prepaid_type === "PREPAID" },
  };
}

/** Forgets a saved card (a prepaid gift card is never kept). */
export async function disableCard(cardId: string): Promise<void> {
  if (!env.SQUARE_ACCESS_TOKEN) return;
  const res = await fetch(`${API_BASE}/v2/cards/${encodeURIComponent(cardId)}/disable`, { method: "POST", headers: squareHeaders() });
  if (!res.ok) throw new Error(`Square disable card failed (${res.status})`);
}

/** A card-on-file payment (Square: the card id as source_id, and
 *  "customer_id ... required if the source_id refers to a card on file"). */
export async function chargeCardOnFile(opts: {
  cardId: string;
  customerId: string;
  amountCents: number;
  idempotencyKey: string;
  referenceId: string;
  note: string;
  buyerEmail: string;
}): Promise<{ ok: true; paymentId: string } | { ok: false; code: string; detail?: string }> {
  if (!env.SQUARE_ACCESS_TOKEN) {
    if (testHooks.declineNextRenewal) {
      const code = testHooks.declineNextRenewal;
      testHooks.declineNextRenewal = "";
      return { ok: false, code };
    }
    return { ok: true, paymentId: `dev-renewal-${randomBytes(6).toString("hex")}` };
  }
  const res = await fetch(`${API_BASE}/v2/payments`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: opts.idempotencyKey,
      source_id: opts.cardId,
      customer_id: opts.customerId,
      amount_money: { amount: opts.amountCents, currency: "USD" },
      location_id: env.SQUARE_LOCATION_ID,
      autocomplete: true,
      reference_id: opts.referenceId.slice(0, 40),
      note: opts.note.slice(0, 500),
      buyer_email_address: opts.buyerEmail,
    }),
  });
  const body = (await res.json().catch(() => null)) as { payment?: { id: string; status?: string }; errors?: { code?: string; detail?: string }[] } | null;
  if (!res.ok || !body?.payment) return { ok: false, code: body?.errors?.[0]?.code ?? `HTTP_${res.status}`, detail: body?.errors?.[0]?.detail };
  return { ok: true, paymentId: body.payment.id };
}

/** Verifies Square's webhook signature (HMAC-SHA256 of notificationUrl + rawBody). */
export function verifyWebhookSignature(opts: {
  signatureHeader: string | undefined;
  rawBody: string;
  notificationUrl: string;
}): boolean {
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) return !env.isProd; // dev: accept, prod: reject
  if (!opts.signatureHeader) return false;
  const expected = hmacSha256Base64(
    env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    opts.notificationUrl + opts.rawBody,
  );
  return expected === opts.signatureHeader;
}
