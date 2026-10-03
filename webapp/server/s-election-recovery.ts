import {activeDeadline} from './operation-deadline';
import type {Db} from './db';
import {sendMail} from './email';
import {env} from './env';

export interface RecoverableElection {
  id: string; client_id: string; llc_name: string; type?: string;
  status: string; details: unknown; ein_secret?: string | null;
}
type RecoveryDetails = Record<string, unknown> & {
  taxpayerNumbersRequired: true;
  taxpayerNumbersNoticeAt?: string;
};
/** Temporary questionnaire numbers are deliberately absent from a backup.
 * Preserve other answers, but never advertise their last four digits as an
 * available number. Completed/deleted documents have a separate lifecycle. */
export function recoveryDetails(row: RecoverableElection, newRestore = false): RecoveryDetails | null {
  const details = ((typeof row.details === 'string' ? JSON.parse(row.details) : row.details) || {}) as Record<string, unknown>;
  if ((row.type && row.type !== 's-election') || !['awaiting_info', 'in_progress'].includes(row.status) || row.ein_secret || details.recoveryHold || details.documentDeletedAt || !Array.isArray(details.shareholders) || !details.shareholders.length) return null;
  const next: RecoveryDetails = {...details, taxpayerNumbersRequired: true,
    shareholders: details.shareholders.map((s: Record<string, unknown>) => ({...s, ssnLast4: '', ssnLast4Second: ''})),
  };
  if (newRestore) delete next.taxpayerNumbersNoticeAt;
  return next;
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** A failed email does not turn a completed database restore into a failure.
 * The unsent marker remains retryable when the EIN arrives. */
export async function notifyTaxpayerNumbersRequired(db: Db, row: RecoverableElection): Promise<boolean> {
  const [activation]=await db.query<{activated_at:unknown}>("SELECT activated_at FROM recovery_activation WHERE id='restore'");
  // Dev logging is not provider acceptance. Keep the notice pending when mail
  // is unavailable, and never let rehearsal activity consume eligibility.
  if((activation&&!activation.activated_at) || !env.RESEND_API_KEY)return false;
  const [current] = await db.query<{status: string; details: RecoveryDetails; ein_secret: string | null}>(
    'SELECT status, details, ein_secret FROM service_orders WHERE id=$1', [row.id]);
  if (!current || current.details.recoveryHold || !current.details.taxpayerNumbersRequired || current.ein_secret || !['awaiting_info', 'in_progress'].includes(current.status)) return true;
  if (current.details.taxpayerNumbersNoticeAt) return true;
  const claimed=await db.query("UPDATE service_orders SET recovery_notice_lock_until=now()+interval '2 minutes' WHERE id=$1 AND (recovery_notice_lock_until IS NULL OR recovery_notice_lock_until<now()) AND details->>'taxpayerNumbersNoticeAt' IS NULL AND details->>'taxpayerNumbersRequired'='true' AND ein_secret IS NULL AND status IN ('awaiting_info','in_progress') RETURNING id",[row.id]);
  if(!claimed.length)return false;
  const [client] = await db.query<{email: string}>('SELECT email FROM clients WHERE id=$1', [row.client_id]);
  try {
    if (!client?.email) throw new Error('The client email address is unavailable');
    await sendMail({to: client.email, subject: `Action needed for your S election — ${row.llc_name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><p><strong>MyFloridaSeriesLLC</strong></p><p>We need the owners’ Social Security numbers again to complete the S corporation election package for <strong>${escape(row.llc_name)}</strong>. Your other saved answers remain available.</p><p>Sign in to your client portal, select this company, and open <strong>Re-enter taxpayer numbers</strong> under <strong>Orders in progress</strong>. Enter each owner’s number and submit the form securely.</p><p>Do not send Social Security numbers by email.</p><p><a href="${escape(env.PUBLIC_BASE_URL + '/portal')}">Open your client portal</a></p></div>`,
    });
    await db.query("UPDATE service_orders SET details=details||jsonb_build_object('taxpayerNumbersNoticeAt',$2::text) WHERE id=$1 AND ein_secret IS NULL AND details->>'taxpayerNumbersRequired'='true'", [row.id, new Date().toISOString()]);
    return true;
  } catch (e) {
    console.error('[s-election] taxpayer-number recovery notification failed:', row.id, e);
    return false;
  } finally {await db.query("UPDATE service_orders SET recovery_notice_lock_until=NULL WHERE id=$1",[row.id]);}
}

/** Activation and the existing maintenance job retry the same pending rows. */
export async function retryRecoveryNotices(db:Db,options:{deadline?:number}={}):Promise<{sent:number;pending:number}>{
 const rows=await db.query<RecoverableElection>("SELECT id,client_id,llc_name,type,status,details,ein_secret FROM service_orders WHERE type='s-election' AND status IN ('awaiting_info','in_progress') AND ein_secret IS NULL AND details->>'taxpayerNumbersRequired'='true' AND details->>'taxpayerNumbersNoticeAt' IS NULL ORDER BY created_at LIMIT 50");
 let sent=0;for(const row of rows){if(Date.now()>=Math.min(options.deadline??Infinity,activeDeadline()))break;if(await notifyTaxpayerNumbersRequired(db,row))sent++;}
 const [left]=await db.query<{n:number}>("SELECT count(*)::int n FROM service_orders WHERE type='s-election' AND status IN ('awaiting_info','in_progress') AND ein_secret IS NULL AND details->>'taxpayerNumbersRequired'='true' AND details->>'taxpayerNumbersNoticeAt' IS NULL");
 return {sent,pending:left.n};
}
export async function activateRecovery(db:Db,origin:string,operator:string){
 const expected=new URL(env.PUBLIC_BASE_URL).origin;
 if(!operator.trim()||origin!==expected||(!env.OFFLINE&&!/^https:\/\//.test(origin)))throw Error('Confirm the configured production origin and name the operator before activation');
 const [held]=await db.query("SELECT id FROM recovery_holds WHERE status='held' AND acknowledged_at IS NULL LIMIT 1");
 if(held)throw Error('Acknowledge the current held-package manifest before activation');
 const changed=await db.query("UPDATE recovery_activation SET activated_at=COALESCE(activated_at,now()),production_origin=$1,operator=$2 WHERE id='restore' RETURNING id",[origin,operator]);
 if(!changed.length)throw Error('This database has no restored target to activate');
 return {activated:true,notices:await retryRecoveryNotices(db)};
}
