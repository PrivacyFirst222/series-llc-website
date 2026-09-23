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
export function obligationPurpose(row: AgentObligation): 'renewal'|'resignation'|'service_fee'|'unavailable' {
 if(row.purpose==='resignation')return 'resignation';
 if(row.purpose==='service_fee')return 'service_fee';
 if(['charged','paid_by_link'].includes(row.status??''))return 'renewal';
 if(row.status==='cancelled')return 'unavailable';
 const date=iso(row.renewal_date);
 if(!row.reconcilingPayment&&row.ra_cancellation_requested_at&&date){const deadline=new Date(date+'T12:00:00Z');deadline.setUTCDate(deadline.getUTCDate()-30);if(easternDateIso(new Date(String(row.ra_cancellation_requested_at)))<=deadline.toISOString().slice(0,10))return 'unavailable';}
 const cutoff=[iso(row.ra_resignation_submitted),iso(row.ra_replaced_at),iso(row.ra_ended_date)].filter((x):x is string=>!!x).sort()[0];
 return cutoff ? date&&date<=cutoff ? 'service_fee':'unavailable' : 'renewal';
}
/** Paid rows retain the category actually purchased. Unpaid rows are classified
 * on read too, so older records and interrupted office requests remain safe. */
export async function normalizeAgentObligations(db:Db,orderId:string):Promise<void>{
 const rows=await db.query<AgentObligation&{id:string}>(`SELECT r.*,o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date,o.ra_cancellation_requested_at FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.order_id=$1 AND r.purpose='renewal' AND r.status NOT IN ('charged','paid_by_link','cancelled')`,[orderId]);
 for(const row of rows){const purpose=obligationPurpose(row);if(purpose==='service_fee')await db.query("UPDATE ra_renewals SET purpose='service_fee',retry_after=NULL WHERE id=$1 AND purpose='renewal' AND status NOT IN ('charged','paid_by_link','cancelled')",[row.id]);else if(purpose==='unavailable')await db.query("UPDATE ra_renewals SET status='cancelled',retry_after=NULL WHERE id=$1 AND status NOT IN ('charged','paid_by_link')",[row.id]);}
}
