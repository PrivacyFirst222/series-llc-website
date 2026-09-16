/**
 * Automatic renewal of registered agent service (Adam, 16 Sep 2026: "there
 * is supposed to be automatic renewal of the annual registered agent fee if
 * they hire us for that"). What the Terms promise, this runs:
 *
 *   9(c) the service renews on the anniversary at the annual rate ($99);
 *   9(d) a notice 30 to 60 days before the cancellation deadline — sent 45
 *        days before the renewal date, so 15 days before the deadline;
 *   9(e) the fee is charged to the card on file 15 days before the renewal
 *        date; a decline makes the service delinquent;
 *   9(g) notice of cancellation at least 30 days before the renewal date
 *        stops the charge.
 *
 * The card is saved with Square from the formation payment the moment the
 * order is paid (Square: "source_id can be a payment ID from a recent
 * payment", authorized within 24 hours), against a Square customer, with the
 * client's permission given by a required tick on the order form. A prepaid
 * gift card (Square marks it prepaid_type PREPAID) is never kept — Adam,
 * 16 Sep 2026: "gift cards ... are not acceptable" — and neither is a wallet
 * payment, which Square cannot save; those clients get a payment link with
 * the notice instead, and paying it saves that card for the following year.
 * Declines follow Square's guidance: one retry after two days for
 * insufficient funds, none otherwise, and the client is told either way.
 */
import { getDb, type Db } from "./db";
import { env } from "./env";
import { sendMail } from "./email";
import {
  giftCardNotKeptEmail,
  raRenewalDeclinedEmail,
  raRenewalNoticeEmail,
  raRenewalReceiptEmail,
} from "./email";
import { RA_RENEWAL_FEE_CENTS } from "./pricing";
import { chargeCardOnFile, createCheckout, disableCard, saveCardFromPayment, type CardSimulation } from "./square";

/** How the money is written everywhere the client reads it. */
export const raRenewalFeeWords = (): string => `$${(RA_RENEWAL_FEE_CENTS / 100).toFixed(RA_RENEWAL_FEE_CENTS % 100 === 0 ? 0 : 2)}`;

/* ------------------------------- dates -------------------------------- */

const toIso = (d: Date): string => d.toISOString().slice(0, 10);
const parse = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
export const addDays = (iso: string, n: number): string => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
export const addYears = (iso: string, n: number): string => {
  const d = parse(iso);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return toIso(d);
};
/** "September 16, 2027" */
export const longDate = (iso: string): string =>
  parse(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const isoOf = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return toIso(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : toIso(new Date(s));
};

/* ------------------------- saving the card ---------------------------- */

interface PaidOrderRow {
  id: string;
  contact_name: string;
  contact_email: string;
  llc_name: string;
  payload: unknown;
}

const tookService = (payload: unknown): boolean =>
  ((typeof payload === "string" ? JSON.parse(payload) : payload) as { registeredAgent?: { choice?: string } } | null)?.registeredAgent?.choice === "SERVICE";
const gaveConsent = (payload: unknown): boolean =>
  ((typeof payload === "string" ? JSON.parse(payload) : payload) as { registeredAgent?: { renewalCardConsent?: boolean } } | null)?.registeredAgent?.renewalCardConsent === true;

/** Keeps the card the formation was paid with, for the renewals, when the
 *  order took our service and the client agreed. Never throws: a card that
 *  cannot be kept is recorded as such and the client is told. */
export async function saveRenewalCard(db: Db, order: PaidOrderRow, paymentId: string | null, simulate?: CardSimulation): Promise<void> {
  if (!tookService(order.payload) || !gaveConsent(order.payload)) return;
  if (!paymentId) {
    await db.query("UPDATE orders SET card_status = 'none', card_note = 'no payment id' WHERE id = $1", [order.id]);
    return;
  }
  const [givenName, ...rest] = (order.contact_name ?? "").trim().split(/\s+/);
  const saved = await saveCardFromPayment({
    paymentId,
    givenName: givenName ?? "",
    familyName: rest.join(" "),
    email: order.contact_email,
    referenceId: order.id,
    simulate,
  });
  if (!saved.ok) {
    await db.query("UPDATE orders SET card_status = 'none', card_note = $2 WHERE id = $1", [order.id, saved.reason]);
    return;
  }
  if (saved.card.prepaid) {
    // A prepaid gift card cannot be kept (Adam, 16 Sep 2026).
    await disableCard(saved.card.cardId).catch((e) => console.error("[renewals] disable prepaid card failed:", e));
    await db.query(
      "UPDATE orders SET square_customer_id = $2, card_status = 'gift_card', card_note = 'prepaid gift card', card_last4 = NULL, card_brand = NULL, square_card_id = NULL WHERE id = $1",
      [order.id, saved.card.customerId],
    );
    const renewal = await db.query<{ ra_renewal_date: unknown; formed_at: unknown }>("SELECT ra_renewal_date, formed_at FROM orders WHERE id = $1", [order.id]);
    const mail = giftCardNotKeptEmail(order.contact_name, order.llc_name, isoOf(renewal[0]?.ra_renewal_date) ? longDate(isoOf(renewal[0].ra_renewal_date) as string) : null);
    sendMail({ to: order.contact_email, ...mail }).catch((e) => console.error("[renewals] gift-card email failed:", e));
    return;
  }
  await db.query(
    "UPDATE orders SET square_customer_id = $2, square_card_id = $3, card_last4 = $4, card_brand = $5, card_status = 'on_file', card_note = NULL WHERE id = $1",
    [order.id, saved.card.customerId, saved.card.cardId, saved.card.last4, saved.card.brand],
  );
}

/* ------------------------------ the job ------------------------------- */

interface RenewalOrder {
  id: string;
  contact_name: string;
  contact_email: string;
  llc_name: string;
  ra_renewal_date: unknown;
  ra_cancellation_requested_at: unknown;
  square_customer_id: string | null;
  square_card_id: string | null;
  card_last4: string | null;
  card_brand: string | null;
  card_status: string | null;
}

interface RenewalRow {
  id: string;
  order_id: string;
  renewal_date: unknown;
  amount_cents: number;
  status: string;
  charge_due: unknown;
  square_order_id: string | null;
  link_url: string | null;
  retry_after: unknown;
  retries: number;
}

const NOTICE_DAYS = 45;
const CHARGE_DAYS = 15;
const CANCEL_DAYS = 30;

async function paymentLinkFor(db: Db, row: RenewalRow, o: RenewalOrder): Promise<string> {
  if (row.link_url) return row.link_url;
  const link = await createCheckout({
    orderId: row.id,
    llcName: o.llc_name,
    priced: {
      serviceFeeCents: row.amount_cents,
      stateFeesCents: 0,
      totalCents: row.amount_cents,
      lineItems: [{ name: `Registered agent service renewal — ${o.llc_name}`, amountCents: row.amount_cents }],
    },
    buyerEmail: o.contact_email,
    redirectUrl: `${env.PUBLIC_BASE_URL}/portal?renewed=${row.id}`,
    description: `Registered agent service renewal — ${o.llc_name}`,
  });
  await db.query("UPDATE ra_renewals SET square_order_id = $2, link_url = $3, updated_at = now() WHERE id = $1", [row.id, link.squareOrderId, link.url]);
  return link.url;
}

/** One pass, as of `today` (an ISO date; Florida's calendar in production).
 *  Safe to run daily and to run twice: every step is keyed on the renewal
 *  row's status. Returns counts for the office and the checks. */
export async function runRenewals(today: string): Promise<{ notices: number; charged: number; declined: number; cancelled: number; retried: number }> {
  const db = await getDb();
  const out = { notices: 0, charged: 0, declined: 0, cancelled: 0, retried: 0 };
  const orders = await db.query<RenewalOrder>(
    `SELECT id, contact_name, contact_email, llc_name, ra_renewal_date, ra_cancellation_requested_at,
            square_customer_id, square_card_id, card_last4, card_brand, card_status
       FROM orders
      WHERE status = 'formed' AND ra_renewal_date IS NOT NULL
        AND payload->'registeredAgent'->>'choice' = 'SERVICE'`,
  );
  for (const o of orders) {
    const renewalDate = isoOf(o.ra_renewal_date);
    if (!renewalDate) continue;
    const cancelledInTime = (() => {
      const c = isoOf(o.ra_cancellation_requested_at);
      return !!c && c <= addDays(renewalDate, -CANCEL_DAYS);
    })();
    const rows = await db.query<RenewalRow>(
      "SELECT id, order_id, renewal_date, amount_cents, status, charge_due, square_order_id, link_url, retry_after, retries FROM ra_renewals WHERE order_id = $1 AND renewal_date = $2",
      [o.id, renewalDate],
    );
    let row = rows[0];
    const hasCard = o.card_status === "on_file" && !!o.square_card_id && !!o.square_customer_id;

    // The notice, 45 days out.
    if (!row && today >= addDays(renewalDate, -NOTICE_DAYS)) {
      if (cancelledInTime) continue;
      const made = await db.query<RenewalRow>(
        `INSERT INTO ra_renewals (order_id, renewal_date, amount_cents, status, charge_due, notice_sent_at)
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id, order_id, renewal_date, amount_cents, status, charge_due, square_order_id, link_url, retry_after, retries`,
        [o.id, renewalDate, RA_RENEWAL_FEE_CENTS, hasCard ? "notice_sent" : "link_sent", addDays(renewalDate, -CHARGE_DAYS)],
      );
      row = made[0];
      const linkUrl = hasCard ? null : await paymentLinkFor(db, row, o);
      const mail = raRenewalNoticeEmail({
        name: o.contact_name,
        llcName: o.llc_name,
        renewalDate: longDate(renewalDate),
        amount: raRenewalFeeWords(),
        last4: hasCard ? o.card_last4 : null,
        chargeDate: longDate(addDays(renewalDate, -CHARGE_DAYS)),
        cancelBy: longDate(addDays(renewalDate, -CANCEL_DAYS)),
        linkUrl,
        giftCard: o.card_status === "gift_card",
      });
      sendMail({ to: o.contact_email, ...mail }).catch((e) => console.error("[renewals] notice failed:", e));
      out.notices += 1;
      continue;
    }
    if (!row) continue;

    // A timely cancellation stops the charge (9(g)).
    if (cancelledInTime && ["notice_sent", "link_sent", "declined"].includes(row.status)) {
      await db.query("UPDATE ra_renewals SET status = 'cancelled', updated_at = now() WHERE id = $1", [row.id]);
      out.cancelled += 1;
      continue;
    }

    // The charge, 15 days out; one retry two days after an insufficient-funds decline.
    const chargeDue = isoOf(row.charge_due) ?? addDays(renewalDate, -CHARGE_DAYS);
    const retryDue = row.status === "declined" && isoOf(row.retry_after) && row.retries < 1 && today >= (isoOf(row.retry_after) as string);
    const firstDue = row.status === "notice_sent" && today >= chargeDue;
    if ((firstDue || retryDue) && hasCard) {
      const attempt = row.retries + 1;
      const charged = await chargeCardOnFile({
        cardId: o.square_card_id as string,
        customerId: o.square_customer_id as string,
        amountCents: row.amount_cents,
        idempotencyKey: `ren-${row.id}-${attempt}`,
        referenceId: o.id,
        note: `Registered agent service renewal — ${o.llc_name}`,
        buyerEmail: o.contact_email,
      });
      if (retryDue) out.retried += 1;
      if (charged.ok) {
        const through = addYears(renewalDate, 1);
        await db.query("UPDATE ra_renewals SET status = 'charged', charged_at = now(), square_payment_id = $2, retries = $3, updated_at = now() WHERE id = $1", [row.id, charged.paymentId, attempt]);
        await db.query("UPDATE orders SET ra_renewal_date = $2 WHERE id = $1", [o.id, through]);
        const mail = raRenewalReceiptEmail({ name: o.contact_name, llcName: o.llc_name, amount: raRenewalFeeWords(), last4: o.card_last4 ?? "", throughDate: longDate(through) });
        sendMail({ to: o.contact_email, ...mail }).catch((e) => console.error("[renewals] receipt failed:", e));
        out.charged += 1;
      } else {
        const retryAfter = charged.code === "INSUFFICIENT_FUNDS" && attempt < 2 ? addDays(today, 2) : null;
        await db.query(
          "UPDATE ra_renewals SET status = 'declined', decline_code = $2, retry_after = $3, retries = $4, updated_at = now() WHERE id = $1",
          [row.id, charged.code, retryAfter, retryDue ? attempt : row.retries],
        );
        const linkUrl = await paymentLinkFor(db, { ...row, retries: attempt }, o);
        const mail = raRenewalDeclinedEmail({ name: o.contact_name, llcName: o.llc_name, last4: o.card_last4 ?? "", renewalDate: longDate(renewalDate), linkUrl, willRetry: !!retryAfter, retryDate: retryAfter ? longDate(retryAfter) : null });
        sendMail({ to: o.contact_email, ...mail }).catch((e) => console.error("[renewals] decline email failed:", e));
        out.declined += 1;
      }
    }
  }
  return out;
}

/** A renewal paid through its payment link (no card on file, a gift card, or
 *  a decline): recorded, the date moved a year, and the card kept for next
 *  year unless it is a prepaid gift card. Idempotent on the row's status. */
export async function fulfillPaidRenewal(renewalId: string, paymentId: string | null, simulate?: CardSimulation): Promise<void> {
  const db = await getDb();
  const rows = await db.query<RenewalRow & { contact_name: string; contact_email: string; llc_name: string; payload: unknown }>(
    `UPDATE ra_renewals r SET status = 'paid_by_link', charged_at = now(), square_payment_id = $2, updated_at = now()
       FROM orders o
      WHERE r.id = $1 AND o.id = r.order_id AND r.status IN ('link_sent', 'declined', 'notice_sent')
      RETURNING r.id, r.order_id, r.renewal_date, r.amount_cents, r.status, r.charge_due, r.square_order_id, r.link_url, r.retry_after, r.retries,
                o.contact_name, o.contact_email, o.llc_name, o.payload`,
    [renewalId, paymentId],
  );
  if (rows.length === 0) return;
  const r = rows[0];
  const renewalDate = isoOf(r.renewal_date) as string;
  const through = addYears(renewalDate, 1);
  await db.query("UPDATE orders SET ra_renewal_date = $2 WHERE id = $1", [r.order_id, through]);
  // The card that paid is kept for next year, with the permission already
  // given on the order; a prepaid gift card is not.
  let last4 = "";
  if (paymentId) {
    const [givenName, ...rest] = (r.contact_name ?? "").trim().split(/\s+/);
    const saved = await saveCardFromPayment({ paymentId, givenName: givenName ?? "", familyName: rest.join(" "), email: r.contact_email, referenceId: r.order_id, simulate });
    if (saved.ok && !saved.card.prepaid) {
      await db.query(
        "UPDATE orders SET square_customer_id = $2, square_card_id = $3, card_last4 = $4, card_brand = $5, card_status = 'on_file', card_note = NULL WHERE id = $1",
        [r.order_id, saved.card.customerId, saved.card.cardId, saved.card.last4, saved.card.brand],
      );
      last4 = saved.card.last4;
    } else if (saved.ok && saved.card.prepaid) {
      await disableCard(saved.card.cardId).catch(() => {});
      await db.query("UPDATE orders SET card_status = 'gift_card', card_note = 'prepaid gift card', square_card_id = NULL, card_last4 = NULL, card_brand = NULL WHERE id = $1", [r.order_id]);
      last4 = saved.card.last4;
    }
  }
  const mail = raRenewalReceiptEmail({ name: r.contact_name, llcName: r.llc_name, amount: raRenewalFeeWords(), last4, throughDate: longDate(through) });
  sendMail({ to: r.contact_email, ...mail }).catch((e) => console.error("[renewals] link receipt failed:", e));
}
