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
  if ((row.type && row.type !== 's-election') || !['awaiting_info', 'in_progress'].includes(row.status) || row.ein_secret || details.documentDeletedAt || !Array.isArray(details.shareholders) || !details.shareholders.length) return null;
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
  const [current] = await db.query<{status: string; details: RecoveryDetails; ein_secret: string | null}>(
    'SELECT status, details, ein_secret FROM service_orders WHERE id=$1', [row.id]);
  if (!current || !current.details.taxpayerNumbersRequired || current.ein_secret || !['awaiting_info', 'in_progress'].includes(current.status)) return true;
  if (current.details.taxpayerNumbersNoticeAt) return true;
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
  }
}
