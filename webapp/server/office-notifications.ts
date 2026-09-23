import { getDb } from './db';
import { env } from './env';
import { legalMailEmail, newDocumentEmail, llcFormedEmail, sendMail } from './email';
import { seriesNames } from './filing';
import { associateLegacyServices } from './company-scope';
const fmtDate = (s:string) => s ? new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}) : 'date not recorded';
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** A document-specific send attempt. A provider acceptance is recorded as sent,
 * not inbox delivery. Failure never removes the document or its retry action. */
export async function notifyDocument(id:string):Promise<boolean> {
 const db=await getDb();
 const [d]=await db.query<{id:string;client_id:string;order_id:string|null;kind:string;title:string;meta:{receivedOn?:string;noticeKind?:string};name:string;email:string}>(`WITH locked AS (
 UPDATE documents SET notice_status='sending',notice_lock_until=now()+interval '2 minutes'
 WHERE id=$1 AND (kind='legal_mail' OR meta->>'noticeKind' IN ('document','formation')) AND deleted_at IS NULL AND (notice_lock_until IS NULL OR notice_lock_until<now()) RETURNING *)
 SELECT locked.*,c.name,c.email FROM locked JOIN clients c ON c.id=locked.client_id`,[id]);
 if(!d)return false;
 try {
  const portalUrl=env.PUBLIC_BASE_URL+'/portal';
  let mail = d.kind==='legal_mail'
    ? legalMailEmail({clientName:d.name,title:d.title,receivedOn:fmtDate(d.meta?.receivedOn||''),portalUrl})
    : newDocumentEmail(portalUrl);
  if(d.meta?.noticeKind==='formation') {
   const [order]=await db.query<{llc_name:string;payload:unknown}>("SELECT llc_name,payload FROM orders WHERE id=$1 AND client_id=$2",[d.order_id,d.client_id]);
   if(!order)throw new Error('Formation order is unavailable');
   const payload=typeof order.payload==='string'?JSON.parse(order.payload):order.payload;
   const docs=await db.query<{kind:string}>("SELECT kind FROM documents WHERE order_id=$1 AND deleted_at IS NULL",[d.order_id]);
   await associateLegacyServices(d.client_id);
   const services=await db.query<{type:'ein'|'s-election';status:'awaiting_info'|'in_progress';details:unknown}>("SELECT type,status,details FROM service_orders WHERE client_id=$1 AND formation_order_id=$2 AND type IN ('ein','s-election') AND status IN ('awaiting_info','in_progress')",[d.client_id,d.order_id]);
   mail=llcFormedEmail({clientName:d.name,llcName:order.llc_name,isConversion:payload?.filingPath==='CONVERT',seriesNames:seriesNames(payload),portalUrl,
    otherDocuments:[...docs.some(x=>x.kind==='statement')?['Statement of Authorized Representative']:[],...docs.some(x=>x.kind==='certificate-of-status')?['Certificate of Status']:[],...docs.some(x=>x.kind==='certified-copy')?['Certified Copy of the Articles']:[]],
    outstandingServices:services.map(s=>{const detail=typeof s.details==='string'?JSON.parse(s.details):s.details as {target?:string;seriesName?:string}|null;return {type:s.type,status:s.status,...s.type==='ein'&&detail?.target==='series'&&detail.seriesName?{seriesName:detail.seriesName}:{}};})});
  }
  await sendMail({to:d.email,...mail});
  await db.query("UPDATE documents SET notice_status='sent',notice_sent_at=now(),notice_error=NULL,notice_recipient=$2,notice_lock_until=NULL WHERE id=$1",[id,d.email]);return true;
 }catch(e){await db.query("UPDATE documents SET notice_status='failed',notice_error=$2,notice_recipient=$3,notice_lock_until=NULL WHERE id=$1",[id,String(e).slice(0,300),d.email]);return false;}
}
/** Kept for callers that specifically handle legal mail. */
export async function notifyLegalMail(id:string):Promise<boolean> {
 const db=await getDb();
 const [d]=await db.query("SELECT id FROM documents WHERE id=$1 AND kind='legal_mail'",[id]);
 return d ? notifyDocument(id) : false;
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
