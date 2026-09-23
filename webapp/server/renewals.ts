import { ensureAgentPaymentLink, deliverAgentCorrespondence, queueAgentCorrespondence, retryAgentCorrespondence } from './agent-correspondence';
import { obligationPurpose } from './agent-obligations';
import { getDb, type Db } from "./db";
import { RA_RENEWAL_FEE_CENTS } from "./pricing";
import { disableCard, saveCardFromPayment, type CardSimulation } from "./square";
import { payAgentTarget } from "./ra-checkout";
import { RA_NOTICE_DAYS, RA_CANCEL_DAYS, RA_CHARGE_DAYS, RA_RESIGNATION_CENTS } from "../src/lib/agentBilling";
import { easternDateIso } from "./datetime";

/** How the money is written everywhere the client reads it. */
export const raRenewalFeeWords = (): string => `$${(RA_RENEWAL_FEE_CENTS / 100).toFixed(RA_RENEWAL_FEE_CENTS % 100 === 0 ? 0 : 2)}`;

/** Documents and notices follow the current account address, never the
 * historical contact recorded on the formation order. Resolve at send time so
 * both client confirmation and office corrections apply without rewriting it. */
export async function currentAgentNoticeEmail(db: Db, orderId: string): Promise<string> {
  const [client] = await db.query<{ email: string }>(
    "SELECT c.email FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = $1",
    [orderId],
  );
  if (!client?.email?.trim()) throw new Error("No current client email is available for this registered-agent notice");
  return client.email;
}

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
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + n);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return toIso(d);
};
/** "September 16, 2027" */
export const longDate = (iso: string): string =>
  parse(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const isoOf = (v: unknown): string | null => {
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

export const tookService = (payload: unknown): boolean =>
  ((typeof payload === "string" ? JSON.parse(payload) : payload) as { registeredAgent?: { choice?: string } } | null)?.registeredAgent?.choice === "SERVICE";
export const gaveConsent = (payload: unknown): boolean =>
  ((typeof payload === "string" ? JSON.parse(payload) : payload) as { registeredAgent?: { renewalCardConsent?: boolean } } | null)?.registeredAgent?.renewalCardConsent === true;

/** Keeps the card the formation was paid with, for the renewals, when the
 *  order took our service and the client agreed. Failure holds fulfillment. */
export async function saveRenewalCard(db: Db, order: PaidOrderRow, paymentId: string | null, simulate?: CardSimulation): Promise<boolean> {
  if (!tookService(order.payload)) return true;
  if (!gaveConsent(order.payload)) return false;
  const [current] = await db.query<{ card_status: string; square_card_id: string; square_customer_id: string }>("SELECT card_status,square_card_id,square_customer_id FROM orders WHERE id=$1",[order.id]);
  if (current?.card_status === "on_file" && current.square_card_id && current.square_customer_id) return true;
  if (!paymentId) {
    await db.query("UPDATE orders SET card_status = 'none', card_note = 'no payment id' WHERE id = $1", [order.id]);
    return false;
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
    return false;
  }
  if (saved.card.prepaid) {
    // Our agent-service policy excludes prepaid cards.
    await disableCard(saved.card.cardId).catch((e) => console.error("[renewals] disable prepaid card failed:", e));
    await db.query(
      "UPDATE orders SET square_customer_id = $2, card_status = 'gift_card', card_note = 'prepaid gift card', card_last4 = NULL, card_brand = NULL, square_card_id = NULL WHERE id = $1",
      [order.id, saved.card.customerId],
    );
    return false;
  }
  await db.query(
    "UPDATE orders SET square_customer_id = $2, square_card_id = $3, card_last4 = $4, card_brand = $5, card_status = 'on_file', card_note = NULL WHERE id = $1",
    [order.id, saved.card.customerId, saved.card.cardId, saved.card.last4, saved.card.brand],
  );
  return true;
}

/* The daily job records work actually done. Renewal reminders do not gate
 * authorized billing. A resignation task is not a filed resignation. */
interface RenewalOrder {ra_payment_target?:string|null;id:string;contact_name:string;contact_email:string;llc_name:string;ra_appointment_date:unknown;ra_renewal_date:unknown;ra_cancellation_requested_at:unknown;ra_replaced_at:unknown;ra_proof_received_at:unknown;ra_resignation_due:unknown;ra_ended_date:unknown;square_customer_id:string|null;square_card_id:string|null;card_last4:string|null;card_status:string|null;payload:unknown}
interface RenewalRow {id:string;order_id:string;renewal_date:unknown;amount_cents:number;status:string;purpose:string;charge_due:unknown;retry_after:unknown;retries:number;notice_sent_at:unknown;billing_hold:boolean;lock_until:unknown;link_url:string|null}
export async function runRenewals(today:string):Promise<{notices:number;charged:number;declined:number;cancelled:number;retried:number}> {
 const db=await getDb(),out={notices:0,charged:0,declined:0,cancelled:0,retried:0};
 const orders=await db.query<RenewalOrder>("SELECT * FROM orders WHERE status='formed' AND ra_renewal_date IS NOT NULL AND payload->'registeredAgent'->>'choice'='SERVICE' AND ra_ended_date IS NULL AND ra_replaced_at IS NULL AND ra_resignation_submitted IS NULL");
 for(const o of orders) {
  const date=isoOf(o.ra_renewal_date)!;const cancel=o.ra_cancellation_requested_at?easternDateIso(new Date(String(o.ra_cancellation_requested_at))):null;
  const timely=!!cancel && cancel<=addDays(date,-RA_CANCEL_DAYS);
  let [row]=await db.query<RenewalRow>('SELECT * FROM ra_renewals WHERE order_id=$1 AND renewal_date=$2 ORDER BY purpose ASC LIMIT 1',[o.id,date]);
  const resolving=row&&(o.ra_payment_target===row.id||(await db.query("SELECT id FROM ra_payment_attempts WHERE target_id=$1 AND status IN ('pending','approved','completed')",[row.id])).length>0);
  if(timely&&!resolving) {
   if(today<date){if(row&&!['charged','paid_by_link','cancelled'].includes(row.status)){await db.query("UPDATE ra_renewals SET status='cancelled',retry_after=NULL WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=ra_renewals.order_id AND o.ra_payment_target IS NOT NULL)",[row.id]);out.cancelled++;}continue;}
   if(o.ra_proof_received_at)continue;
   await db.query('UPDATE orders SET ra_resignation_due=COALESCE(ra_resignation_due,$2) WHERE id=$1',[o.id,date]);
   if(!row) { [row]=await db.query<RenewalRow>("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose,charge_due) VALUES($1,$2,$3,'notice_pending','resignation',$2) ON CONFLICT(order_id,renewal_date,purpose) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *",[o.id,date,RA_RESIGNATION_CENTS]); }
   else if(row.purpose!=='resignation'&&!['charged','paid_by_link'].includes(row.status)){[row]=await db.query<RenewalRow>("UPDATE ra_renewals SET purpose='resignation',status='notice_pending',amount_cents=$2,charge_due=renewal_date,notice_sent_at=NULL,billing_hold=false,retry_after=NULL,retries=0 WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=ra_renewals.order_id AND o.ra_payment_target IS NOT NULL) RETURNING *",[row.id,RA_RESIGNATION_CENTS]);}
  } else if(!row&&today>=addDays(date,-RA_NOTICE_DAYS)) {
   [row]=await db.query<RenewalRow>("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,charge_due) VALUES($1,$2,$3,'notice_pending',$4) ON CONFLICT(order_id,renewal_date,purpose) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *",[o.id,date,RA_RENEWAL_FEE_CENTS,addDays(date,-RA_CHARGE_DAYS)]);
  }
  if(!row||['charged','paid_by_link','cancelled'].includes(row.status))continue;
  const [locked]=await db.query<RenewalRow>("UPDATE ra_renewals SET lock_until=now()+interval '2 minutes' WHERE id=$1 AND (lock_until IS NULL OR lock_until<now()) RETURNING *",[row.id]);
  if(!locked)continue; row=locked;
  try {
   const hasCard=o.card_status==='on_file'&&!!o.square_card_id&&!!o.square_customer_id&&gaveConsent(o.payload);
   // Retire old notice-only holds without altering payment or cancellation rules.
   if(row.purpose==='renewal'&&row.billing_hold){
    await db.query('UPDATE ra_renewals SET billing_hold=false WHERE id=$1',[row.id]);
    row={...row,billing_hold:false};
   }
   await ensureAgentPaymentLink(db,row.id);
   if(!row.notice_sent_at){if(await deliverAgentCorrespondence(row.id,today))out.notices++;const [fresh]=await db.query<RenewalRow>('SELECT * FROM ra_renewals WHERE id=$1',[row.id]);row=fresh;}
   // The owner's revised policy applies to annual renewals. Keep the separate
   // resignation workflow unchanged, including its actual-notice prerequisite.
   if(!hasCard||(row.purpose==='resignation'&&(!row.notice_sent_at||row.billing_hold)))continue;
   const retry=row.status==='declined'&&row.retries<2&&!!row.retry_after&&today>=isoOf(row.retry_after)!;
   const first=['notice_pending','notice_sent','link_sent'].includes(row.status)&&today>=isoOf(row.charge_due)!;
   const recover=row.status==='charging';
   if(!first&&!retry&&!recover)continue;
   await db.query("UPDATE ra_renewals SET status='charging' WHERE id=$1 AND status NOT IN ('charged','paid_by_link','cancelled')",[row.id]);
   const result=await payAgentTarget('renewal',row.id,{cardId:o.square_card_id!,customerId:o.square_customer_id!,automatic:true,cardLast4:o.card_last4});
   if(result.ok){out.charged++;if(retry)out.retried++;}
   else if(result.code!=='UNRESOLVED'&&result.code!=='PROCESSING') {
    const attempt=row.retries+1,retryAfter=result.code==='INSUFFICIENT_FUNDS'&&attempt<2?addDays(today,2):null;
    await db.query("UPDATE ra_renewals SET status='declined',retries=$2,retry_after=$3,decline_code=$4 WHERE id=$1 AND status='charging'",[row.id,attempt,retryAfter,result.code]);
    await ensureAgentPaymentLink(db,row.id);await queueAgentCorrespondence(db,row.id,'decline',result.declinedCardLast4);await deliverAgentCorrespondence(row.id,today);out.declined++;if(retry)out.retried++;
   }
  } catch(e){console.error('[renewal] company needs attention',o.id,e);await db.query('UPDATE ra_renewals SET notice_error=$2 WHERE id=$1',[row.id,String(e).slice(0,300)]);}
  finally {await db.query('UPDATE ra_renewals SET lock_until=NULL WHERE id=$1',[row.id]);}
 }
 out.notices+=await retryAgentCorrespondence(today);
 return out;
}

/** Atomic fulfillment: never move an anniversary twice, including a replay
 * after payment succeeded but the client lost the HTTP response. */
export async function fulfillPaidRenewal(renewalId:string,paymentId:string|null,simulate?:CardSimulation,cardAlreadySaved=false,automatic=false):Promise<void> {
 const db=await getDb();
 const [row]=await db.query<RenewalRow & RenewalOrder>(`SELECT r.*,o.contact_name,o.contact_email,o.llc_name,o.payload,o.ra_appointment_date,o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date,o.ra_cancellation_requested_at FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,[renewalId]);
 if(!row||['charged','paid_by_link','cancelled'].includes(row.status))return;
 // Payment eligibility was checked before authorization. Preserve the existing
 // fulfillment boundary when cancellation arrives during provider reconciliation;
 // resignation/replacement remain protected by the order reservation.
 const purpose=obligationPurpose({...row,ra_cancellation_requested_at:null});if(purpose==='unavailable')throw new Error('This service renewal is unavailable');
 if(purpose==='service_fee'&&row.purpose!=='service_fee'){await db.query("UPDATE ra_renewals SET purpose='service_fee' WHERE id=$1",[renewalId]);row.purpose='service_fee';}
 if(!cardAlreadySaved && row.purpose==='renewal' && !await saveRenewalCard(db,{...row,id:row.order_id},paymentId,simulate))throw new Error('An eligible renewal card must be saved before renewal fulfillment');
 const renewalDate=isoOf(row.renewal_date)!;
 const nextYear=Number(renewalDate.slice(0,4))+1;
 const appointment=isoOf(row.ra_appointment_date);
 const through=appointment?addYears(appointment,nextYear-Number(appointment.slice(0,4))):addYears(renewalDate,1);
 const done=await db.query(`WITH paid AS (UPDATE ra_renewals SET status=$3,charged_at=now(),square_payment_id=$2,retries=GREATEST(retries,(SELECT count(*)::int FROM ra_payment_attempts a WHERE a.target_id=$1 AND a.automatic)),retry_after=NULL,updated_at=now(),correspondence=jsonb_build_object('kind','receipt','event',gen_random_uuid()::text,'pending',true) WHERE id=$1 AND status NOT IN ('charged','paid_by_link','cancelled') RETURNING order_id,purpose) UPDATE orders o SET ra_renewal_date=CASE WHEN paid.purpose='renewal' THEN $4::date ELSE o.ra_renewal_date END FROM paid WHERE o.id=paid.order_id RETURNING o.id`,[renewalId,paymentId,automatic?'charged':'paid_by_link',through]);
 if(!done.length)return;
 await deliverAgentCorrespondence(renewalId);
}
