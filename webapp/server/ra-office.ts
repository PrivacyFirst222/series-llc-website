import { normalizeAgentObligations, PAYMENT_RECONCILE } from './agent-obligations';
import { ensureAgentPaymentLink, deliverAgentCorrespondence } from './agent-correspondence';
import type { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from './db';
import { requireAdmin, err, looksLikePdf, MAX_UPLOAD_BYTES } from './shared';
import { putFile, readFileStream } from './storage';
import { addYears, addDays, isoOf, gaveConsent, currentAgentNoticeEmail } from './renewals';
import { easternDateIso } from './datetime';
import { sendMail } from './email';
import { payAgentTarget } from './ra-checkout';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s,'Enter a valid calendar date.');
export function registerAgentOffice(app:Hono) {
 app.get('/admin/orders/:id/agent',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const db=await getDb();const [o]=await db.query('SELECT ra_appointment_date,ra_renewal_date,ra_cancellation_requested_at,ra_cancellation_note,ra_replaced_at,ra_proof_received_at,ra_proof_note,ra_resignation_due,ra_resignation_submitted,ra_resignation_filed,ra_resignation_mailed,ra_resignation_emailed_at,ra_resignation_document,ra_resignation_reason,ra_resignation_note,ra_ended_date,card_status,card_note FROM orders WHERE id=$1',[c.req.param('id')]);
  if(!o)return c.json(err('Not found','NOT_FOUND'),404);
  const pending=await db.query(`SELECT DISTINCT r.id,r.amount_cents,r.purpose FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.order_id=$1 AND r.status NOT IN ('charged','paid_by_link','cancelled') AND (o.ra_payment_target=r.id OR EXISTS (SELECT 1 FROM ra_payment_attempts a WHERE a.target_id=r.id AND a.status IN ('pending','approved','completed')))`,[c.req.param('id')]);
  return c.json({data:{...o,pending}});
 });
 app.post('/admin/orders/:id/agent/check-payment',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const db=await getDb();const body=z.object({targetId:z.string().uuid()}).safeParse(await c.req.json().catch(()=>null));
  if(!body.success)return c.json(err('Choose the payment to check.','INVALID_INPUT'),400);
  const [owned]=await db.query('SELECT id FROM ra_renewals WHERE id=$1 AND order_id=$2',[body.data.targetId,c.req.param('id')]);
  if(!owned)return c.json(err('Payment not found.','NOT_FOUND'),404);
  const result=await payAgentTarget('renewal',body.data.targetId,{resumeOnly:true,actor:'authenticated office'});
  return c.json({data:result});
 });
 app.post('/admin/orders/:id/agent',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const db=await getDb(),id=c.req.param('id');const [o]=await db.query<{payload:unknown;card_status:string;square_card_id:string|null;square_customer_id:string|null;ra_appointment_date:unknown;paid_at:unknown;ra_resignation_due:unknown;ra_resignation_submitted:unknown;ra_resignation_filed:unknown}>('SELECT * FROM orders WHERE id=$1',[id]);
  if(!o)return c.json(err('Not found','NOT_FOUND'),404);
  const p=typeof o.payload==='string'?JSON.parse(o.payload):o.payload;
  if(p?.registeredAgent?.choice!=='SERVICE')return c.json(err('This order does not appoint our agent service.','BAD_STATE'),400);
  const body=await c.req.json().catch(()=>null);
  const parsed=z.discriminatedUnion('action',[
   z.object({action:z.literal('appointment'),date}),
   z.object({action:z.literal('cancellation'),date,note:z.string().trim().min(1).max(3000)}),
   z.object({action:z.literal('replacement'),date,note:z.string().trim().min(1).max(3000)}),
   z.object({action:z.literal('submitted'),date,reason:z.enum(['timely-cancellation','nonpayment','inaccurate-contact','unlawful-use']).optional(),note:z.string().trim().max(3000).optional()}),
   z.object({action:z.literal('filed'),date}),
   z.object({action:z.literal('mailed'),date}),
  ]).safeParse(body);
  if(!parsed.success)return c.json(err('Enter a valid date and the required supporting information.','INVALID_INPUT'),400);
  const b=parsed.data,today=easternDateIso();
  if(b.date>today)return c.json(err('Record the actual event after it occurs; do not record a future event as complete.','FUTURE_EVENT'),400);
  if(b.action==='appointment') {
   if(!o.paid_at||o.card_status!=='on_file'||!o.square_card_id||!o.square_customer_id||!gaveConsent(o.payload))return c.json(err('Payment, automatic-renewal consent and an eligible saved card are required before our appointment.','CARD_REQUIRED'),400);
   if(o.ra_appointment_date&&isoOf(o.ra_appointment_date)!==b.date)return c.json(err('The appointment date is already recorded. Document replacement cannot reset it. Contact support to correct a mistaken record.','ALREADY_RECORDED'),409);
   await db.query('UPDATE orders SET ra_appointment_date=COALESCE(ra_appointment_date,$2),ra_renewal_date=COALESCE(ra_renewal_date,$3) WHERE id=$1',[id,b.date,addYears(b.date,1)]);
  }else if(b.action==='cancellation') {
   await db.query("UPDATE orders SET ra_cancellation_requested_at=LEAST(COALESCE(ra_cancellation_requested_at,$2::timestamptz),$2::timestamptz) WHERE id=$1",[id,b.date+'T12:00:00Z']);
   await db.query("UPDATE orders SET ra_cancellation_note=$2, ra_cancellation_renewal_date=LEAST(ra_renewal_date,(SELECT min(renewal_date) FROM ra_renewals WHERE order_id=$1 AND purpose='renewal' AND renewal_date >= (orders.ra_cancellation_requested_at AT TIME ZONE 'America/New_York')::date)) WHERE id=$1",[id,b.note]);
   await normalizeAgentObligations(db,id);
  }else if(b.action==='replacement') {
   const changed=await db.query(`UPDATE orders SET ra_replaced_at=$2,ra_ended_date=LEAST(ra_ended_date,$2::date),ra_proof_received_at=now(),ra_proof_note=$3 WHERE id=$1 AND ra_payment_target IS NULL AND NOT EXISTS (SELECT 1 FROM ra_payment_attempts a JOIN ra_renewals r ON r.id=a.target_id WHERE r.order_id=orders.id AND a.status IN ('pending','approved','completed') AND r.status NOT IN ('charged','paid_by_link','cancelled')) RETURNING id`,[id,b.date,b.note]);
   if(!changed.length)return c.json(err(PAYMENT_RECONCILE,'PROCESSING'),409);
   await normalizeAgentObligations(db,id);
  }else if(b.action==='submitted') {
   const reason=b.reason || 'timely-cancellation';
   if(reason==='timely-cancellation' && (!o.ra_resignation_due||b.date<isoOf(o.ra_resignation_due)!))return c.json(err('The cancellation resignation is not due yet.','NOT_DUE'),400);
   if(reason!=='timely-cancellation' && !b.note?.trim())return c.json(err('Record the Terms ground and supporting record for this resignation.','SUPPORT_REQUIRED'),400);
   if(o.ra_appointment_date && b.date<isoOf(o.ra_appointment_date)!)return c.json(err('Submission cannot precede our appointment.','BAD_STATE'),400);
   if(o.ra_resignation_submitted && b.date!==isoOf(o.ra_resignation_submitted))return c.json(err('The actual submission date is already recorded.','ALREADY_RECORDED'),409);
   // One resignation charge per appointment, independently of any annual debt.
   const [fee]=await db.query<{id:string;notice_sent_at:unknown}>(`WITH recorded AS (
     UPDATE orders SET ra_resignation_submitted=COALESCE(ra_resignation_submitted,$2::date),
       ra_resignation_reason=COALESCE(ra_resignation_reason,$3),ra_resignation_note=COALESCE(ra_resignation_note,$4)
     WHERE id=$1 AND ra_payment_target IS NULL AND NOT EXISTS (SELECT 1 FROM ra_payment_attempts a JOIN ra_renewals r ON r.id=a.target_id WHERE r.order_id=orders.id AND a.status IN ('pending','approved','completed') AND r.status NOT IN ('charged','paid_by_link','cancelled')) RETURNING id)
     INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose,charge_due)
     SELECT id,$2::date,9900,'notice_pending','resignation',$2::date FROM recorded
     ON CONFLICT(order_id) WHERE purpose='resignation' DO UPDATE SET order_id=EXCLUDED.order_id RETURNING id,notice_sent_at`,[id,b.date,reason,b.note||'Timely cancellation without replacement proof']);
   if(!fee)return c.json(err(PAYMENT_RECONCILE,'PROCESSING'),409);
   await normalizeAgentObligations(db,id);
   await ensureAgentPaymentLink(db,fee.id);
   if(!fee.notice_sent_at)await deliverAgentCorrespondence(fee.id,today);
  }else if(b.action==='filed') {
   if(!o.ra_resignation_submitted||b.date<isoOf(o.ra_resignation_submitted)!)return c.json(err('Record submission first, then the actual state filing date.','BAD_STATE'),400);
   await db.query('UPDATE orders SET ra_resignation_filed=$2,ra_ended_date=LEAST(ra_ended_date,ra_replaced_at,$3::date) WHERE id=$1',[id,b.date,addDays(b.date,31)]);
  }else {
   if(!o.ra_resignation_submitted||b.date<isoOf(o.ra_resignation_submitted)!)return c.json(err('Submit the resignation before recording its mailed notice.','BAD_STATE'),400);
   await db.query('UPDATE orders SET ra_resignation_mailed=$2 WHERE id=$1',[id,b.date]);
  }
  return c.json({data:{ok:true}});
 });
 app.post('/admin/orders/:id/agent-copy',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const db=await getDb();const [o]=await db.query<{id:string;client_id:string;llc_name:string;contact_email:string;ra_resignation_submitted:unknown;ra_resignation_document:string|null}>('SELECT * FROM orders WHERE id=$1',[c.req.param('id')]);
  if(!o?.client_id||!o.ra_resignation_submitted)return c.json(err('Record the actual resignation submission first.','BAD_STATE'),400);
  const form=await c.req.parseBody(),f=form.file;
  let key:string;
  if(f instanceof File){
   if(f.size>MAX_UPLOAD_BYTES||!await looksLikePdf(f))return c.json(err('Upload a readable resignation PDF, no larger than 20 MB.','BAD_FILE'),400);
   const stored=await putFile(f.name,await f.arrayBuffer(),'application/pdf');key=stored.storageKey;
   const [d]=await db.query<{id:string}>("INSERT INTO documents(client_id,order_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,'ra-resignation',$3,$4,'application/pdf',$5) RETURNING id",[o.client_id,o.id,`Registered-agent resignation — ${o.llc_name}`,key,stored.sizeBytes]);
   await db.query('UPDATE orders SET ra_resignation_document=$2,ra_resignation_emailed_at=NULL WHERE id=$1',[o.id,d.id]);
  }else{
   const [d]=await db.query<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1 AND order_id=$2',[o.ra_resignation_document,o.id]);if(!d)return c.json(err('Choose the resignation PDF first.','FILE_REQUIRED'),400);key=d.storage_key;
  }
  try{await sendMail({to:await currentAgentNoticeEmail(db,o.id),subject:`Registered-agent resignation — ${o.llc_name}`,html:'<p>A copy of the submitted registered-agent resignation is attached and is also available in your portal. Submission does not end the appointment immediately. We will also mail the notice required by Florida law.</p>',attachments:[{filename:'registered-agent-resignation.pdf',content:Buffer.from(await readFileStream(key)).toString('base64')}]});await db.query('UPDATE orders SET ra_resignation_emailed_at=now() WHERE id=$1',[o.id]);}
  catch{return c.json(err('The copy is in the portal, but email failed. Retry sending the existing copy.','EMAIL_FAILED'),503);}
  return c.json({data:{ok:true}});
 });
}
