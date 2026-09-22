import type {Hono} from 'hono';
import {z} from 'zod';
import {getDb} from './db';
import {err} from './shared';
import {getSession} from './auth';
import {env} from './env';
import {encryptSecret,decryptSecret} from './crypto';
import {storeRenewalCard,disableCard,SquareDecline,type SavedCard} from './square';
import {RA_CARD_CONSENT,RA_PREPAID_ERROR} from '../src/lib/agentBilling';
const schema=z.object({attemptId:z.string().uuid(),source:z.string().min(1).max(4096).optional(),consent:z.literal(true)});
export function registerRenewalCard(app:Hono){
 app.get('/portal/companies/:id/renewal-card',async c=>{
  const session=await getSession(c);if(!session?.clientId)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(env.isProd&&!env.SQUARE_ACCESS_TOKEN)return c.json(err('Card storage is temporarily unavailable. Your existing card is unchanged.','UNAVAILABLE'),503);
  const db=await getDb();const [o]=await db.query("SELECT id FROM orders WHERE id=$1 AND client_id=$2 AND paid_at IS NOT NULL AND payload->'registeredAgent'->>'choice'='SERVICE'",[c.req.param('id'),session.clientId]);if(!o)return c.json(err('Company not found','NOT_FOUND'),404);
  const [a]=await db.query<{id:string}>("SELECT id FROM renewal_card_attempts WHERE order_id=$1 AND status='pending'",[c.req.param('id')]);
  return c.json({data:{applicationId:env.SQUARE_APPLICATION_ID,locationId:env.SQUARE_LOCATION_ID,sandbox:env.SQUARE_ENV!=='production',dev:!env.SQUARE_ACCESS_TOKEN,pendingAttemptId:a?.id||null}});
 });
 app.post('/portal/companies/:id/renewal-card',async c=>{
  const session=await getSession(c);if(!session?.clientId)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(env.isProd&&!env.SQUARE_ACCESS_TOKEN)return c.json(err('Card storage is temporarily unavailable. Your existing card is unchanged.','UNAVAILABLE'),503);
  const parsed=schema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json(err('Confirm card storage and annual-renewal consent.','INVALID_INPUT'),400);
  const db=await getDb(),id=c.req.param('id'),b=parsed.data;
  const [o]=await db.query<{square_customer_id:string|null;email:string;name:string}>(`SELECT o.square_customer_id,c.email,c.name FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.id=$1 AND o.client_id=$2 AND o.paid_at IS NOT NULL AND o.payload->'registeredAgent'->>'choice'='SERVICE'`,[id,session.clientId]);
  if(!o)return c.json(err('Company not found','NOT_FOUND'),404);
  type Attempt={id:string;order_id:string;status:string;source_token:string;card:SavedCard|null};
  let [a]=await db.query<Attempt>('SELECT * FROM renewal_card_attempts WHERE id=$1',[b.attemptId]);
  if(a&&a.order_id!==id)return c.json(err('This update belongs to a different company.','INVALID_INPUT'),400);
  if(!a){
   if(!b.source)return c.json(err('Enter a card first.','CARD_REQUIRED'),400);
   const input={attemptId:b.attemptId,source:b.source,customerId:o.square_customer_id,referenceId:id,email:o.email,name:o.name};
   await db.query("INSERT INTO renewal_card_attempts(id,order_id,source_token,consent) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[b.attemptId,id,encryptSecret(JSON.stringify(input)),RA_CARD_CONSENT]);
   [a]=await db.query<Attempt>('SELECT * FROM renewal_card_attempts WHERE id=$1',[b.attemptId]);
   if(!a)return c.json(err('Another card update is pending. Reopen this dialog to retry that update.','PROCESSING'),409);
  }
  if(a.status==='done')return c.json({data:{ok:true}});
  if(a.status==='failed')return c.json(err('This card was not saved. Start a new update with an eligible card.','CARD_REFUSED'),400);
  const input=JSON.parse(decryptSecret(a.source_token)) as Parameters<typeof storeRenewalCard>[0];
  if(b.source&&b.source!==input.source)return c.json(err('Retry the same update before entering a different card.','ATTEMPT_CHANGED'),409);
  const locked=await db.query("UPDATE renewal_card_attempts SET lock_until=now()+interval '3 minutes' WHERE id=$1 AND status='pending' AND (lock_until IS NULL OR lock_until<now()) RETURNING id",[a.id]);
  if(!locked.length)return c.json(err('Card update is processing. Retry shortly.','PROCESSING'),409);
  try {
   const card=await storeRenewalCard(input);
   if(card.prepaid){await disableCard(card.cardId);throw new SquareDecline('PREPAID');}
   // Card replacement and completion share one transaction; a replay cannot
   // replace a newer card. Neither renewal dates nor payments are touched.
   const done=await db.query(`WITH finished AS (UPDATE renewal_card_attempts SET status='done',source_token='',card=$2,error=NULL,lock_until=NULL WHERE id=$1 AND status='pending' RETURNING order_id,consent)
    UPDATE orders SET square_customer_id=$3,square_card_id=$4,card_last4=$5,card_brand=$6,card_status='on_file',card_note=NULL,agent_billing_consent=finished.consent,
    payload=jsonb_set(payload,'{registeredAgent,renewalCardConsent}','true'::jsonb) FROM finished WHERE orders.id=finished.order_id RETURNING orders.id`,[a.id,JSON.stringify(card),card.customerId,card.cardId,card.last4,card.brand]);
   if(!done.length)throw new Error('Card update could not be confirmed; retry.');
   return c.json({data:{ok:true}});
  }catch(e){
   const definitive=e instanceof SquareDecline;
   await db.query("UPDATE renewal_card_attempts SET status=CASE WHEN $2 THEN 'failed' ELSE status END,source_token=CASE WHEN $2 THEN '' ELSE source_token END,error=$3,lock_until=NULL WHERE id=$1 AND status='pending'",[a.id,definitive,definitive?e.code:'Unconfirmed card update']);
   return c.json(err(definitive?(e.code==='PREPAID'?RA_PREPAID_ERROR:'The card was refused. Your previous card remains unchanged; try another card.'):'We could not confirm the update. Your previous card remains on file. Retry this update.',definitive?'CARD_REFUSED':'UNRESOLVED'),definitive?400:503);
  }
 });
}
