import { getDb, type Db } from "./db";
import { sendMail } from "./email";
import {
  raRenewalDeclinedEmail,
  raRenewalNoticeEmail,
  raRenewalReceiptEmail,
} from "./email";
import { RA_RENEWAL_FEE_CENTS } from "./pricing";
import { disableCard, saveCardFromPayment, type CardSimulation } from "./square";
import { agentCheckoutLink, payAgentTarget } from "./ra-checkout";
import { RA_NOTICE_DAYS, RA_MIN_NOTICE_DAYS, RA_CANCEL_DAYS, RA_CHARGE_DAYS, RA_RESIGNATION_CENTS } from "../src/lib/agentBilling";
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

/* The daily job records work actually done. A pending/late notice cannot
 * authorize an automatic charge. A resignation task is not a filed resignation. */
interface RenewalOrder {id:string;contact_name:string;contact_email:string;llc_name:string;ra_appointment_date:unknown;ra_renewal_date:unknown;ra_cancellation_requested_at:unknown;ra_replaced_at:unknown;ra_proof_received_at:unknown;ra_resignation_due:unknown;ra_ended_date:unknown;square_customer_id:string|null;square_card_id:string|null;card_last4:string|null;card_status:string|null;payload:unknown}
interface RenewalRow {id:string;order_id:string;renewal_date:unknown;amount_cents:number;status:string;purpose:string;charge_due:unknown;retry_after:unknown;retries:number;notice_sent_at:unknown;billing_hold:boolean;lock_until:unknown;link_url:string|null}
export async function runRenewals(today:string):Promise<{notices:number;charged:number;declined:number;cancelled:number;retried:number}> {
 const db=await getDb(),out={notices:0,charged:0,declined:0,cancelled:0,retried:0};
 const orders=await db.query<RenewalOrder>("SELECT * FROM orders WHERE status='formed' AND ra_renewal_date IS NOT NULL AND payload->'registeredAgent'->>'choice'='SERVICE' AND ra_ended_date IS NULL AND ra_replaced_at IS NULL AND ra_resignation_submitted IS NULL");
 for(const o of orders) {
  const date=isoOf(o.ra_renewal_date)!;const cancel=o.ra_cancellation_requested_at?easternDateIso(new Date(String(o.ra_cancellation_requested_at))):null;
  const timely=!!cancel && cancel<=addDays(date,-RA_CANCEL_DAYS);
  let [row]=await db.query<RenewalRow>('SELECT * FROM ra_renewals WHERE order_id=$1 AND renewal_date=$2 ORDER BY purpose ASC LIMIT 1',[o.id,date]);
  if(timely) {
   if(today<date){if(row&&!['charged','paid_by_link','cancelled'].includes(row.status)){await db.query("UPDATE ra_renewals SET status='cancelled',retry_after=NULL WHERE id=$1",[row.id]);out.cancelled++;}continue;}
   if(o.ra_proof_received_at)continue;
   await db.query('UPDATE orders SET ra_resignation_due=COALESCE(ra_resignation_due,$2) WHERE id=$1',[o.id,date]);
   if(!row) { [row]=await db.query<RenewalRow>("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose,charge_due) VALUES($1,$2,$3,'notice_pending','resignation',$2) ON CONFLICT(order_id,renewal_date,purpose) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *",[o.id,date,RA_RESIGNATION_CENTS]); }
   else if(row.purpose!=='resignation'&&!['charged','paid_by_link'].includes(row.status)){[row]=await db.query<RenewalRow>("UPDATE ra_renewals SET purpose='resignation',status='notice_pending',amount_cents=$2,charge_due=renewal_date,notice_sent_at=NULL,billing_hold=false,retry_after=NULL,retries=0 WHERE id=$1 RETURNING *",[row.id,RA_RESIGNATION_CENTS]);}
  } else if(!row&&today>=addDays(date,-RA_NOTICE_DAYS)) {
   [row]=await db.query<RenewalRow>("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,charge_due) VALUES($1,$2,$3,'notice_pending',$4) ON CONFLICT(order_id,renewal_date,purpose) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *",[o.id,date,RA_RENEWAL_FEE_CENTS,addDays(date,-RA_CHARGE_DAYS)]);
  }
  if(!row||['charged','paid_by_link','cancelled'].includes(row.status))continue;
  const [locked]=await db.query<RenewalRow>("UPDATE ra_renewals SET lock_until=now()+interval '2 minutes' WHERE id=$1 AND (lock_until IS NULL OR lock_until<now()) RETURNING *",[row.id]);
  if(!locked)continue; row=locked;
  try {
   const hasCard=o.card_status==='on_file'&&!!o.square_card_id&&!!o.square_customer_id&&gaveConsent(o.payload);
   if(row.status==='notice_pending') {
    const link=await agentCheckoutLink('renewal',row.id);
    const late=row.purpose==='renewal'&&today>addDays(date,-RA_MIN_NOTICE_DAYS);
    const mail=row.purpose==='resignation'?{subject:`Registered-agent resignation due — ${o.llc_name}`,html:`<p>Your timely cancellation has reached its renewal date without replacement proof. A $99 charge for state filing fees and processing is due. This does not purchase another service year. The office must submit the resignation; this notice does not confirm filing.</p><p><a href="${link}">Pay now</a></p>`}:raRenewalNoticeEmail({name:o.contact_name,llcName:o.llc_name,renewalDate:longDate(date),amount:raRenewalFeeWords(),last4:hasCard?o.card_last4:null,chargeDate:longDate(addDays(date,-RA_CHARGE_DAYS)),cancelBy:longDate(addDays(date,-RA_CANCEL_DAYS)),linkUrl:link,billingHold:late});
    try {
     await sendMail({to:await currentAgentNoticeEmail(db,o.id),...mail});
     await db.query("UPDATE ra_renewals SET status=$2,notice_sent_at=$3,billing_hold=$4,notice_error=NULL,link_url=$5 WHERE id=$1",[row.id,hasCard?'notice_sent':'link_sent',`${today}T12:00:00Z`,late,link]);out.notices++;
     row={...row,status:hasCard?'notice_sent':'link_sent',notice_sent_at:`${today}T12:00:00Z`,billing_hold:late};
    }catch(e){await db.query('UPDATE ra_renewals SET notice_error=$2 WHERE id=$1',[row.id,String(e).slice(0,300)]);}
    if(row.purpose!=='resignation'||!row.notice_sent_at)continue;
   }
   if(!row.notice_sent_at||row.billing_hold||!hasCard)continue;
   const retry=row.status==='declined'&&row.retries<2&&!!row.retry_after&&today>=isoOf(row.retry_after)!;
   const first=row.status==='notice_sent'&&today>=isoOf(row.charge_due)!;
   const recover=row.status==='charging';
   if(!first&&!retry&&!recover)continue;
   await db.query("UPDATE ra_renewals SET status='charging' WHERE id=$1 AND status NOT IN ('charged','paid_by_link','cancelled')",[row.id]);
   const result=await payAgentTarget('renewal',row.id,{cardId:o.square_card_id!,customerId:o.square_customer_id!,automatic:true});
   if(result.ok){out.charged++;if(retry)out.retried++;}
   else if(result.code!=='UNRESOLVED'&&result.code!=='PROCESSING') {
    const attempt=row.retries+1,retryAfter=result.code==='INSUFFICIENT_FUNDS'&&attempt<2?addDays(today,2):null;
    await db.query("UPDATE ra_renewals SET status='declined',retries=$2,retry_after=$3,decline_code=$4 WHERE id=$1 AND status='charging'",[row.id,attempt,retryAfter,result.code]);
    const link=await agentCheckoutLink('renewal',row.id);
    const mail=raRenewalDeclinedEmail({name:o.contact_name,llcName:o.llc_name,last4:o.card_last4??'',renewalDate:longDate(date),linkUrl:link,willRetry:!!retryAfter,retryDate:retryAfter?longDate(retryAfter):null,resignation:row.purpose==='resignation'});
    await currentAgentNoticeEmail(db,o.id).then(to=>sendMail({to,...mail})).catch(e=>console.error('[renewal] decline notice failed',e));out.declined++;if(retry)out.retried++;
   }
  } catch(e){console.error('[renewal] company needs attention',o.id,e);await db.query('UPDATE ra_renewals SET notice_error=$2 WHERE id=$1',[row.id,String(e).slice(0,300)]);}
  finally {await db.query('UPDATE ra_renewals SET lock_until=NULL WHERE id=$1',[row.id]);}
 }
 return out;
}

/** Atomic fulfillment: never move an anniversary twice, including a replay
 * after payment succeeded but the client lost the HTTP response. */
export async function fulfillPaidRenewal(renewalId:string,paymentId:string|null,simulate?:CardSimulation,cardAlreadySaved=false,automatic=false):Promise<void> {
 const db=await getDb();
 const [row]=await db.query<RenewalRow & RenewalOrder>(`SELECT r.*,o.contact_name,o.contact_email,o.llc_name,o.payload,o.ra_appointment_date FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,[renewalId]);
 if(!row||['charged','paid_by_link','cancelled'].includes(row.status))return;
 if(!cardAlreadySaved && row.purpose!=='resignation' && !await saveRenewalCard(db,{...row,id:row.order_id},paymentId,simulate))throw new Error('An eligible renewal card must be saved before renewal fulfillment');
 const renewalDate=isoOf(row.renewal_date)!;
 const nextYear=Number(renewalDate.slice(0,4))+1;
 const appointment=isoOf(row.ra_appointment_date);
 const through=appointment?addYears(appointment,nextYear-Number(appointment.slice(0,4))):addYears(renewalDate,1);
 const done=await db.query(`WITH paid AS (UPDATE ra_renewals SET status=$3,charged_at=now(),square_payment_id=$2,retries=GREATEST(retries,(SELECT count(*)::int FROM ra_payment_attempts a WHERE a.target_id=$1 AND a.automatic)),retry_after=NULL,updated_at=now() WHERE id=$1 AND status NOT IN ('charged','paid_by_link','cancelled') RETURNING order_id,purpose) UPDATE orders o SET ra_renewal_date=CASE WHEN paid.purpose='renewal' THEN $4::date ELSE o.ra_renewal_date END FROM paid WHERE o.id=paid.order_id RETURNING o.id`,[renewalId,paymentId,automatic?'charged':'paid_by_link',through]);
 if(!done.length)return;
 const mail=row.purpose==='resignation'?{subject:`Registered-agent resignation payment — ${row.llc_name}`,html:'<p>We received $99 for state filing fees and processing of the registered-agent resignation. This does not purchase another year of service. Your portal shows the actual resignation status.</p>'}:raRenewalReceiptEmail({name:row.contact_name,llcName:row.llc_name,amount:`$${(row.amount_cents/100).toFixed(2)}`,last4:'',throughDate:longDate(through)});
 await currentAgentNoticeEmail(db,row.order_id).then(to=>sendMail({to,...mail})).catch(e=>console.error('[renewal] receipt failed',e));
}
