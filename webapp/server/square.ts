import { randomBytes } from "node:crypto";
import { env } from "./env";
import { hmacSha256Base64 } from "./crypto";
import type { PricedOrder } from "./pricing";

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

  let res = await request(true);
  let body = (await res.json()) as {
    payment_link?: { url: string; order_id: string };
    errors?: { field?: string }[];
  };
  // The email prefill is a convenience — if Square dislikes the address,
  // retry without it rather than failing the whole checkout.
  if (!res.ok && body.errors?.some((e) => e.field?.includes("buyer_email"))) {
    res = await request(false);
    body = (await res.json()) as typeof body;
  }
  if (!res.ok || !body.payment_link) {
    throw new Error(`Square payment link failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
  return { url: body.payment_link.url, squareOrderId: body.payment_link.order_id };
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
