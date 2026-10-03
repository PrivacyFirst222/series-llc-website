import type { Db } from './db';
import { easternDateIso } from './datetime';

/** Terms 9(e): unpaid fees become delinquent at renewal. Terms 10(f):
 * "that resignation charge and any unpaid service fees are due immediately".
 * Closing an appointment cannot erase an accrued debt or sell another year. */
export interface AgentObligation {
 reconcilingPayment?: boolean; purpose?: string; status?: string; renewal_date?: unknown;
 ra_resignation_submitted?: unknown; ra_replaced_at?: unknown; ra_ended_date?: unknown;
 ra_cancellation_requested_at?: unknown;
}
const iso = (value: unknown): string | null => value ? value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10) : null;
export const RENEWAL_UNAVAILABLE = 'This service renewal is unavailable because our resignation has been submitted. Your portal shows any outstanding service fees and resignation charge separately.';
export const PAYMENT_RECONCILE = 'A payment is being checked. Retry that payment to confirm its result before recording this event; do not start another charge.';
export function lateNoticeFee(row: AgentObligation): boolean {
 const date=iso(row.renewal_date), replacement=iso(row.ra_replaced_at);
 if(!date||!replacement||replacement>date)return false;
 if(!row.ra_cancellation_requested_at)return true;
 const deadline=new Date(date+'T12:00:00Z');deadline.setUTCDate(deadline.getUTCDate()-30);
 const notice=easternDateIso(new Date(String(row.ra_cancellation_requested_at)));
 return notice>deadline.toISOString().slice(0,10);
}
export function obligationPurpose(row: AgentObligation): 'renewal'|'resignation'|'service_fee'|'unavailable' {
 if(row.purpose==='resignation')return 'resignation';
 if(['charged','paid_by_link'].includes(row.status??''))return row.purpose==='service_fee'?'service_fee':'renewal';
 if(row.status==='cancelled')return 'unavailable';
 const date=iso(row.renewal_date);
 if(!row.reconcilingPayment&&row.ra_cancellation_requested_at&&date){const deadline=new Date(date+'T12:00:00Z');deadline.setUTCDate(deadline.getUTCDate()-30);if(easternDateIso(new Date(String(row.ra_cancellation_requested_at)))<=deadline.toISOString().slice(0,10))return 'unavailable';}
 if(row.purpose==='service_fee'||lateNoticeFee(row))return 'service_fee';
 const cutoff=[iso(row.ra_resignation_submitted),iso(row.ra_replaced_at),iso(row.ra_ended_date)].filter((x):x is string=>!!x).sort()[0];
 return cutoff ? date&&date<=cutoff ? 'service_fee':'unavailable' : 'renewal';
}
/** Paid rows retain the category actually purchased. Unpaid rows are classified
 * on read too, so older records and interrupted office requests remain safe. */
export async function normalizeAgentObligations(db:Db,orderId:string):Promise<void>{
 // Lock the same order row used by payment reservation/dispatch. Classify
 // from its returned current facts, never from an earlier unlocked read.
 await db.query(`WITH owner AS (
   UPDATE orders SET ra_payment_protocol=ra_payment_protocol
   WHERE id=$1 AND ra_payment_target IS NULL RETURNING *
 ), classified AS (
   SELECT r.id,
     CASE WHEN o.ra_cancellation_requested_at IS NOT NULL AND
       (o.ra_cancellation_requested_at AT TIME ZONE 'America/New_York')::date<=r.renewal_date-30 THEN 'unavailable'
     WHEN r.purpose='service_fee' OR (o.ra_replaced_at<=r.renewal_date AND
       (o.ra_cancellation_requested_at IS NULL OR (o.ra_cancellation_requested_at AT TIME ZONE 'America/New_York')::date>r.renewal_date-30)) THEN 'service_fee'
     WHEN LEAST(o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date) IS NULL THEN 'renewal'
     WHEN r.renewal_date<=LEAST(o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date) THEN 'service_fee'
     ELSE 'unavailable' END AS category,
     (o.ra_replaced_at<=r.renewal_date AND
       (o.ra_cancellation_requested_at IS NULL OR (o.ra_cancellation_requested_at AT TIME ZONE 'America/New_York')::date>r.renewal_date-30)) AS scheduled_fee
   FROM ra_renewals r JOIN owner o ON o.id=r.order_id
   WHERE r.purpose IN ('renewal','service_fee') AND r.status NOT IN ('charged','paid_by_link','cancelled')
     AND NOT EXISTS(SELECT 1 FROM ra_payment_attempts a WHERE a.target_id=r.id AND a.status IN ('pending','approved','completed'))
 ) UPDATE ra_renewals r SET
   purpose=CASE WHEN c.category='service_fee' THEN 'service_fee' ELSE r.purpose END,
   status=CASE WHEN c.category='unavailable' THEN 'cancelled' ELSE r.status END,
   retry_after=CASE WHEN c.category='unavailable' OR (c.category='service_fee' AND NOT COALESCE(c.scheduled_fee,false)) THEN NULL ELSE r.retry_after END
 FROM classified c WHERE r.id=c.id AND r.status NOT IN ('charged','paid_by_link','cancelled')`,[orderId]);
}
