import type { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from './db';
import { env } from './env';
import { newToken, hashToken, encryptSecret, decryptSecret } from './crypto';
import { agentSquarePayment, saveCardFromPayment, disableCard, SquareDecline } from './square';
import { fulfillPaidOrder } from './routes-payments';
import { fulfillPaidRenewal } from './renewals';
import { obligationPurpose, RENEWAL_UNAVAILABLE, type AgentObligation } from './agent-obligations';
import { err } from './shared';
import { rateLimit, clientIp } from './auth';
import { RA_PREPAID_ERROR } from '../src/lib/agentBilling';
export type PaymentKind = 'order' | 'renewal';
interface Target extends AgentObligation { id:string; order_id:string; status:string; amount:number; email:string; name:string; llc_name:string; payload:unknown; checkout_token:string|null; purpose?:string }
async function target(kind:PaymentKind,id:string):Promise<Target|undefined> {
 const db=await getDb();
 return (await db.query<Target>(kind==='order' ? `SELECT id,id AS order_id,status,total_cents AS amount,contact_email AS email,contact_name AS name,llc_name,payload,checkout_token FROM orders WHERE id=$1` : `SELECT r.id,r.order_id,r.status,r.amount_cents AS amount,o.contact_email AS email,o.contact_name AS name,o.llc_name,o.payload,r.checkout_token,r.purpose,r.renewal_date,(r.status NOT IN ('charged','paid_by_link','cancelled') AND EXISTS(SELECT 1 FROM ra_payment_attempts a WHERE a.target_id=r.id AND a.status IN ('pending','approved','completed'))) AS "reconcilingPayment",o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date,o.ra_cancellation_requested_at FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,[id]))[0];
}
export async function agentCheckoutLink(kind:PaymentKind,id:string):Promise<string> {
 const db=await getDb(), table=kind==='order'?'orders':'ra_renewals';
 const row=await target(kind,id); if(!row)throw new Error('Payment target missing');
 // Stable capability link. Tokens expose payment metadata only, never portal documents.
 const token=row.checkout_token ?? newToken().token;
 const [saved]=await db.query<{checkout_token:string}>(`UPDATE ${table} SET checkout_token=COALESCE(checkout_token,$2) WHERE id=$1 RETURNING checkout_token`,[id,token]);
 return `${env.PUBLIC_BASE_URL}/agent-checkout?kind=${kind}&id=${id}&token=${saved.checkout_token}`;
}
interface Source { token?:string; cardId?:string; customerId?:string; automatic?:boolean; cardLast4?:string|null; resumeOnly?:boolean }
interface Attempt { id:string;source_token:string;status:string;square_payment_id:string|null;failure_code:string|null }
export async function payAgentTarget(kind:PaymentKind,id:string,source:Source):Promise<{ok:boolean; code?:string; message?:string; paymentId?:string; automatic?:boolean; declinedCardLast4?:string|null}> {
 if ((!env.OFFLINE && !env.SQUARE_ACCESS_TOKEN) || (env.isProd && env.OFFLINE)) return {ok:false,code:'UNAVAILABLE',message:'Card checkout is unavailable. Please contact support; no payment was taken.'};
 const db=await getDb();let t=await target(kind,id); if(!t)throw new Error('Payment target missing');
 if(kind==='order' && t.status!=='pending_payment') { await fulfillPaidOrder(id,null); return {ok:true}; }
 if(kind==='renewal' && ['charged','paid_by_link'].includes(t.status)){await db.query('UPDATE orders SET ra_payment_target=NULL WHERE id=$1 AND ra_payment_target=$2',[t.order_id,id]);return {ok:true};}
 if(kind==='renewal'){
  const reserved=await db.query('UPDATE orders SET ra_payment_target=$2 WHERE id=$1 AND (ra_payment_target IS NULL OR ra_payment_target=$2) RETURNING id',[t.order_id,id]);
  if(!reserved.length)return {ok:false,code:'PROCESSING',message:'Another payment is being checked for this company. Retry that payment before starting another.'};
  t=(await target(kind,id))!;
 }
 const release=async()=>{if(kind==='renewal')await db.query('UPDATE orders SET ra_payment_target=NULL WHERE id=$1 AND ra_payment_target=$2',[t!.order_id,id]);};
 // An existing attempt passed eligibility under the order reservation. A
 // cancellation received while its provider result is pending remains recorded,
 // but cannot reinterpret that same payment. New attempts still use the notice.
 const existing=kind==='renewal'?(await db.query("SELECT id FROM ra_payment_attempts WHERE target_id=$1 AND status IN ('pending','approved','completed')",[id])).length>0:false;
 if(source.resumeOnly&&!existing){await release();return {ok:false,code:'NO_PENDING_PAYMENT',message:'No payment is awaiting confirmation. Reload to see the current balance.'};}
 if(!existing&&!source.token&&!source.cardId){await release();return {ok:false,code:'CARD_REQUIRED',message:'Enter an eligible payment card.'};}
 const purpose=kind==='renewal'?obligationPurpose({...t,reconcilingPayment:existing}):'order';
 if(purpose==='unavailable'||t.status==='cancelled'){await release();return {ok:false,code:'CANCELLED',message:t.ra_resignation_submitted?RENEWAL_UNAVAILABLE:'This service renewal is cancelled. Any outstanding service fees and resignation charge are shown separately.'};}
 const p=typeof t.payload==='string'?JSON.parse(t.payload):t.payload;
 if ((purpose==='renewal'||purpose==='order') && p?.registeredAgent?.renewalCardConsent!==true){await release();return {ok:false,code:'CARD_CONSENT',message:'Automatic renewal and card storage consent are required for registered-agent service.'};}
 if(purpose==='service_fee'&&source.automatic){await release();return {ok:false,code:'CANCELLED',message:'Outstanding service fees require a separate payment; this is not a service renewal.'};}
 if(purpose==='service_fee'&&t.purpose!=='service_fee')await db.query("UPDATE ra_renewals SET purpose='service_fee',retry_after=NULL WHERE id=$1",[id]);
 if(!existing)await db.query(`INSERT INTO ra_payment_attempts(target_id,kind,source_token,automatic) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id,kind,encryptSecret(JSON.stringify(source)),source.automatic===true]);
 const [a]=await db.query<Attempt>(`UPDATE ra_payment_attempts SET lock_until=now()+interval '2 minutes' WHERE target_id=$1 AND status IN ('pending','approved','completed') AND (lock_until IS NULL OR lock_until<now()) RETURNING *`,[id]);
 if(!a)return {ok:false,code:'PROCESSING',message:'A payment is being checked. Please retry shortly; do not submit another payment elsewhere.'};
 let actual:Source=source;
 try {
  actual=a.source_token?JSON.parse(decryptSecret(a.source_token)):source;
  if(a.status==='completed') { if(kind==='order')await fulfillPaidOrder(id,a.square_payment_id);else await fulfillPaidRenewal(id,a.square_payment_id,undefined,true,actual.automatic===true);await db.query("UPDATE ra_payment_attempts SET source_token='' WHERE id=$1",[a.id]);await release();return {ok:true,paymentId:a.square_payment_id!,automatic:actual.automatic}; }
  let pay=a.square_payment_id ? await agentSquarePayment('get',{id:a.square_payment_id}) : await agentSquarePayment('authorize',{key:a.id,source:actual.token??actual.cardId,customerId:actual.customerId,amount:t.amount,email:t.email,reference:id,customerInitiated:!actual.automatic});
  await db.query("UPDATE ra_payment_attempts SET square_payment_id=$2,status='approved' WHERE id=$1",[a.id,pay.id]);
  if(pay.status==='CANCELED'||pay.status==='FAILED')throw new SquareDecline(a.failure_code??'PAYMENT_CANCELLED');
  if(a.failure_code){await agentSquarePayment('cancel',{id:pay.id});throw new SquareDecline(a.failure_code);}
  if(pay.status!=='APPROVED'&&pay.status!=='COMPLETED')throw new Error('Payment has not reached an actionable state');
  if(pay.status!=='COMPLETED' && actual.token && purpose!=='resignation') {
   let refusal:string|null=pay.card_details?.card?.prepaid_type==='PREPAID'?'PREPAID_CARD':null;
   if(!refusal && purpose!=='service_fee') {
    const [givenName,...names]=t.name.split(/\s+/);
    const saved=await saveCardFromPayment({paymentId:pay.id,givenName,familyName:names.join(' '),email:t.email,referenceId:`${t.order_id}:${a.id}`,simulate:actual.token.includes('wallet')?'wallet':actual.token.includes('prepaid')?'prepaid':'credit'});
    if(!saved.ok)refusal='CARD_NOT_SAVED';
    else if(saved.card.prepaid){await disableCard(saved.card.cardId);refusal='PREPAID_CARD';}
    else await db.query("UPDATE orders SET square_customer_id=$2,square_card_id=$3,card_last4=$4,card_brand=$5,card_status='on_file',card_note=NULL WHERE id=$1",[t.order_id,saved.card.customerId,saved.card.cardId,saved.card.last4,saved.card.brand]);
   }
   if(refusal){await db.query('UPDATE ra_payment_attempts SET failure_code=$2 WHERE id=$1',[a.id,refusal]);await agentSquarePayment('cancel',{id:pay.id});throw new SquareDecline(refusal);}
  }
  if(pay.status==='APPROVED')pay=await agentSquarePayment('complete',{id:pay.id});
  if(pay.status!=='COMPLETED')throw new Error('Payment completion is unconfirmed');
  // Save provider completion before fulfillment. A retry replays setup only.
  await db.query("UPDATE ra_payment_attempts SET status='completed' WHERE id=$1",[a.id]);
  if(kind==='order')await fulfillPaidOrder(id,pay.id);
  else await fulfillPaidRenewal(id,pay.id,undefined,true,actual.automatic===true);
  await db.query("UPDATE ra_payment_attempts SET source_token='' WHERE id=$1",[a.id]);
  await release();
  return {ok:true,paymentId:pay.id,automatic:actual.automatic};
 } catch(e) {
  if(e instanceof SquareDecline) {
   await db.query("UPDATE ra_payment_attempts SET status='failed',failure_code=$2,source_token='' WHERE id=$1",[a.id,e.code]);
   await release();
   return {ok:false,code:e.code,automatic:actual.automatic,declinedCardLast4:actual.cardLast4&&/^\d{4}$/.test(actual.cardLast4)?actual.cardLast4:null,message:e.code==='PREPAID_CARD'?RA_PREPAID_ERROR:e.code==='CARD_NOT_SAVED'?'Square could not save this card. We have not completed the purchase. Try another eligible card.':'Payment was declined. Try again now or use another card. Your issuer can explain the decline.'};
  }
  console.error('[agent-payment] unresolved',e);
  return {ok:false,code:'UNRESOLVED',message:'We could not confirm the payment result. Retry to check this same payment; we will not start a second charge.'};
 } finally {await db.query('UPDATE ra_payment_attempts SET lock_until=NULL WHERE id=$1',[a.id]);}
}
export function registerAgentCheckout(app:Hono) {
 const schema=z.union([z.object({sourceId:z.string().min(1).max(2048),consent:z.literal(true)}),z.object({resume:z.literal(true)})]);
 const identify=async(kind:string,id:string,token:string)=>{
  if(!['order','renewal'].includes(kind)||!z.string().uuid().safeParse(id).success)return null;
  const t=await target(kind as PaymentKind,id);return t?.checkout_token && hashToken(token)===hashToken(t.checkout_token)?t:null;
 };
 app.get('/agent-checkout/:kind/:id',async c=>{
  const t=await identify(c.req.param('kind'),c.req.param('id'),c.req.query('token')??'');if(!t)return c.json(err('Payment link not found.','NOT_FOUND'),404);
  if((!env.OFFLINE&&(!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_APPLICATION_ID||!env.SQUARE_LOCATION_ID))||(env.isProd&&env.OFFLINE))return c.json(err('Card checkout is not configured yet. Please contact support.','UNAVAILABLE'),503);
  const purpose=c.req.param('kind')==='renewal'?obligationPurpose(t):'order';
  if(purpose==='unavailable')return c.json(err(t.ra_resignation_submitted?RENEWAL_UNAVAILABLE:'This service renewal is cancelled. Any outstanding service fees and resignation charge are shown separately.','CANCELLED'),400);
  return c.json({data:{company:t.llc_name,amountCents:t.amount,purpose,reconciling:t.reconcilingPayment===true&&!['charged','paid_by_link'].includes(t.status),paid:['paid','filed','formed','charged','paid_by_link'].includes(t.status),applicationId:env.SQUARE_APPLICATION_ID,locationId:env.SQUARE_LOCATION_ID,sandbox:env.SQUARE_ENV!=='production',offline:env.OFFLINE,email:t.email}});
 });
 app.post('/agent-checkout/:kind/:id',async c=>{
  const kind=c.req.param('kind'),id=c.req.param('id');const t=await identify(kind,id,c.req.query('token')??'');if(!t)return c.json(err('Payment link not found.','NOT_FOUND'),404);
  if(!(await rateLimit(`agent-pay:${clientIp(c)}`,30,3600000)))return c.json(err('Too many payment attempts. Please contact support.','RATE_LIMITED'),429);
  const b=schema.safeParse(await c.req.json().catch(()=>null));if(!b.success)return c.json(err('Payment authorization is required.','INVALID_INPUT'),400);
  const result=await payAgentTarget(kind as PaymentKind,id,'resume' in b.data?{resumeOnly:true}:{token:b.data.sourceId});
  if(!result.ok)return c.json(err(result.message??'Payment could not be completed.',result.code??'PAYMENT_FAILED'),result.code==='PROCESSING'?409:result.code==='UNRESOLVED'?503:400);
  return c.json({data:{ok:true,redirect:kind==='order'?`/order/confirmed?ref=${id}`:'/portal'}});
 });
}
