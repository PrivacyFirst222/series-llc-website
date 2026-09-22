import { getDb } from './db';
import { env } from './env';
import { legalMailEmail, sendMail } from './email';
const fmtDate = (s:string) => s ? new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}) : 'date not recorded';
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** A document-specific send attempt. A provider acceptance is recorded as sent,
 * not inbox delivery. Failure never removes the document or its retry action. */
export async function notifyLegalMail(id:string):Promise<boolean> {
 const db=await getDb();
 const [d]=await db.query<{id:string;title:string;meta:{receivedOn?:string};name:string;email:string}>(`WITH locked AS (
 UPDATE documents SET notice_status='sending',notice_lock_until=now()+interval '2 minutes'
 WHERE id=$1 AND kind='legal_mail' AND deleted_at IS NULL AND (notice_lock_until IS NULL OR notice_lock_until<now()) RETURNING *)
 SELECT locked.*,c.name,c.email FROM locked JOIN clients c ON c.id=locked.client_id`,[id]);
 if(!d)return false;
 try {
  await sendMail({to:d.email,...legalMailEmail({clientName:d.name,title:d.title,receivedOn:fmtDate(d.meta?.receivedOn||''),portalUrl:env.PUBLIC_BASE_URL+'/portal'})});
  await db.query("UPDATE documents SET notice_status='sent',notice_sent_at=now(),notice_error=NULL,notice_recipient=$2,notice_lock_until=NULL WHERE id=$1",[id,d.email]);return true;
 }catch(e){await db.query("UPDATE documents SET notice_status='failed',notice_error=$2,notice_recipient=$3,notice_lock_until=NULL WHERE id=$1",[id,String(e).slice(0,300),d.email]);return false;}
}
export async function notifyContact(id:string):Promise<boolean> {
 const db=await getDb();
 const [m]=await db.query<{name:string;email:string;message:string}>(`UPDATE contact_messages SET notice_status='sending',notice_lock_until=now()+interval '2 minutes' WHERE id=$1 AND (notice_lock_until IS NULL OR notice_lock_until<now()) RETURNING *`,[id]);
 if(!m)return false;
 try {
  if(!env.ADMIN_NOTIFY_EMAIL)throw new Error('Office notification address is not configured');
  await sendMail({to:env.ADMIN_NOTIFY_EMAIL,replyTo:m.email,subject:`Contact form: ${m.name}`,html:`<p><strong>${escape(m.name)}</strong> &lt;${escape(m.email)}&gt; wrote:</p><p>${escape(m.message).replace(/\n/g,'<br>')}</p>`});
  await db.query("UPDATE contact_messages SET notice_status='sent',notice_sent_at=now(),notice_error=NULL,notice_lock_until=NULL WHERE id=$1",[id]);return true;
 }catch(e){await db.query("UPDATE contact_messages SET notice_status='failed',notice_error=$2,notice_lock_until=NULL WHERE id=$1",[id,String(e).slice(0,300)]);return false;}
}
