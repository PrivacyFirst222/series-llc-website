import { getDb, type Db } from './db';
import { sendMail, raRenewalNoticeEmail, raRenewalDeclinedEmail, raRenewalReceiptEmail } from './email';
import { agentCheckoutLink } from './ra-checkout';
import { addDays, addYears, isoOf, longDate, currentAgentNoticeEmail, hasRenewalCard } from './renewals';
import { obligationPurpose, type AgentObligation } from './agent-obligations';
import { easternDateIso } from './datetime';
interface Correspondence {declinedCardLast4?:string|null;kind?:string;event?:string;pending?:boolean;error?:string|null;sentAt?:string}
interface Row extends AgentObligation {id:string;order_id:string;amount_cents:number;status:string;contact_name:string;llc_name:string;card_last4:string|null;card_status:string|null;square_card_id:string|null;square_customer_id:string|null;created_at:unknown;payload:unknown;notice_sent_at:unknown;charge_due:unknown;retry_after:unknown;retries:number;ra_appointment_date:unknown;correspondence:Correspondence}
export async function queueAgentCorrespondence(db:Db,id:string,kind:'decline'|'receipt',declinedCardLast4?:string|null):Promise<void>{
 await db.query("UPDATE ra_renewals SET correspondence=jsonb_build_object('kind',$2::text,'event',gen_random_uuid()::text,'pending',true,'declinedCardLast4',$3::text) WHERE id=$1",[id,kind,declinedCardLast4??null]);
}
/** Links are part of the obligation, never a side effect of successful email. */
export async function ensureAgentPaymentLink(db:Db,id:string):Promise<string>{
 const link=await agentCheckoutLink('renewal',id);
 await db.query('UPDATE ra_renewals SET link_url=$2 WHERE id=$1',[id,link]);
 return link;
}
export async function deliverAgentCorrespondence(id:string,today=easternDateIso()):Promise<boolean>{
 const db=await getDb();
 const claim=await db.query("UPDATE ra_renewals SET correspondence_lock_until=now()+interval '5 minutes' WHERE id=$1 AND (correspondence_lock_until IS NULL OR correspondence_lock_until<now()) RETURNING id",[id]);
 if(!claim.length)return false;
 try{
  const [r]=await db.query<Row>(`SELECT r.*,o.contact_name,o.llc_name,o.card_last4,o.card_status,o.square_card_id,o.square_customer_id,o.payload,o.ra_appointment_date,o.ra_resignation_submitted,o.ra_replaced_at,o.ra_ended_date,o.ra_cancellation_requested_at FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,[id]);
  if(!r||r.status==='cancelled'||(r.notice_sent_at&&!r.correspondence?.pending))return false;
  const paid=['charged','paid_by_link'].includes(r.status);
  const declined=r.correspondence?.pending && r.correspondence.kind==='decline' || r.status==='declined';
  // A missing historical marker is never authority to recreate a receipt.
  if(paid&&!(r.correspondence?.pending&&r.correspondence.kind==='receipt'))return false;
  if(!r.correspondence?.pending){
   const [policy]=await db.query<{first_notice_cutoff:unknown}>("SELECT first_notice_cutoff FROM launch_policy WHERE id='initial-launch'");
   if(!policy)throw Error('Initial launch notice policy is missing');
   if(new Date(String(r.created_at))<new Date(String(policy.first_notice_cutoff))){
    await db.query("UPDATE ra_renewals SET notice_suppression_reason='pre-launch sample record' WHERE id=$1",[id]);return false;
   }
  }
  const purpose=obligationPurpose(r);if(purpose==='unavailable')return false;
  const date=isoOf(r.renewal_date)!,amount=`$${(r.amount_cents/100).toFixed(r.amount_cents%100?2:0)}`;
  const link=await ensureAgentPaymentLink(db,id);
  const cancelBy=addDays(date,-30),deadlinePassed=today>cancelBy;
  const deadlines=purpose==='renewal'?`<p>${deadlinePassed?`The cancellation deadline for this renewal was ${longDate(cancelBy)} and has passed. You may still give cancellation notice in your client portal or by emailing support@myfloridaseriesllc.com. A late reminder does not extend the cancellation or replacement deadlines.`:`To cancel, give notice by ${longDate(cancelBy)} in your client portal or by emailing support@myfloridaseriesllc.com. Provide replacement-agent proof by ${longDate(date)}.`}</p>`:'';
  let mail:{subject:string;html:string};
  if(paid){
   if(purpose==='service_fee')mail={subject:`Outstanding registered-agent service fees paid — ${r.llc_name}`,html:`<p>We received ${amount} toward the outstanding registered-agent service fees for ${escape(r.llc_name)}. This payment does not renew service or change the recorded resignation or appointment end date.</p>`};
   else if(purpose==='resignation')mail={subject:`Registered-agent resignation payment — ${r.llc_name}`,html:'<p>We received $99 for state filing fees and processing of the registered-agent resignation. This does not purchase another year of service. Your portal shows the actual resignation status.</p>'};
   else {const appointment=isoOf(r.ra_appointment_date);const through=appointment?addYears(appointment,Number(date.slice(0,4))+1-Number(appointment.slice(0,4))):addYears(date,1);mail=raRenewalReceiptEmail({name:r.contact_name,llcName:r.llc_name,amount,last4:'',throughDate:longDate(through),recovered:!r.notice_sent_at,deadlinesHtml:'<p>Your renewal date is shown on the Registered agent service card in your client portal.</p>'});}
  }else if(purpose==='service_fee'&&declined){
   const retry=isoOf(r.retry_after),willRetry=!!retry&&retry>=today&&r.retries<2;
   mail={subject:`Action needed: your outstanding registered-agent service fee charge was declined`,html:`<p>The ${amount} outstanding registered-agent service fee charge${r.correspondence?.declinedCardLast4?` to your card ending ${escape(r.correspondence.declinedCardLast4)}`:''} for ${escape(r.llc_name)} was declined.${willRetry?` We will try the card once more on ${longDate(retry!)}.`:''}</p><p>You may pay now using the same or a different eligible card; there is no two-day waiting period. This payment settles outstanding registered-agent service fees. It does not renew service or change the recorded resignation or appointment end date.</p><p><a href="${link}">Pay outstanding service fees</a></p>`};
  }else if(purpose==='service_fee')mail={subject:`Outstanding registered-agent service fees — ${r.llc_name}`,html:`<p>Outstanding registered-agent service fees of ${amount} remain due for ${escape(r.llc_name)}. This payment settles outstanding registered-agent service fees. It does not renew service or change the recorded resignation or appointment end date.</p><p><a href="${link}">Pay outstanding service fees</a></p>`};
  else if(declined){
   const retry=isoOf(r.retry_after),willRetry=!!retry&&retry>=today&&r.retries<2;
   mail=raRenewalDeclinedEmail({name:r.contact_name,llcName:r.llc_name,last4:r.correspondence?.declinedCardLast4??'',renewalDate:longDate(date),amount,linkUrl:link,willRetry,retryDate:willRetry?longDate(retry!):null,resignation:purpose==='resignation',overdue:today>=date,deadlinesHtml:deadlines});
  }else if(purpose==='resignation')mail={subject:`Registered-agent resignation ${r.ra_resignation_submitted?'charge':'due'} — ${r.llc_name}`,html:`<p>${r.ra_resignation_submitted?'We submitted our registered-agent resignation.':'Your timely cancellation has reached its renewal date without replacement proof. Submission has not yet been recorded.'} The $99 charge represents state fees and processing fees. It does not purchase another year of service. Any unpaid service fees remain due separately.</p><p><a href="${link}">Pay the resignation charge</a></p>`};
  else{mail=raRenewalNoticeEmail({name:r.contact_name,llcName:r.llc_name,renewalDate:longDate(date),amount,last4:hasRenewalCard(r)?r.card_last4:null,chargeDate:longDate(addDays(date,-15)),cancelBy:longDate(cancelBy),linkUrl:link,chargeDue:today>=isoOf(r.charge_due)!,deadlinePassed,overdue:today>=date});}
  try{
   await sendMail({to:await currentAgentNoticeEmail(db,r.order_id),...mail});
   // A concurrent payment may have queued a newer receipt; never acknowledge it
   // using the result of an older decline send.
   await db.query(`UPDATE ra_renewals SET notice_sent_at=COALESCE(notice_sent_at,$2::timestamptz),notice_error=NULL,
    status=CASE WHEN status='notice_pending' THEN CASE WHEN $3 THEN 'notice_sent' ELSE 'link_sent' END ELSE status END,
    correspondence=CASE WHEN COALESCE(correspondence->>'event','')=$4 THEN correspondence||jsonb_build_object('pending',false,'error',NULL,'sentAt',$2::text) ELSE correspondence END
    WHERE id=$1`,[id,today+'T12:00:00Z',hasRenewalCard(r),r.correspondence?.event??'']);
   return true;
  }catch(e){await db.query(`UPDATE ra_renewals SET notice_error=CASE WHEN notice_sent_at IS NULL THEN $2 ELSE notice_error END,correspondence=CASE WHEN COALESCE(correspondence->>'event','')=$3 THEN correspondence||jsonb_build_object('pending',true,'error',$2::text) ELSE correspondence END WHERE id=$1`,[id,String(e).slice(0,300),r.correspondence?.event??'']);return false;}
 }finally{await db.query('UPDATE ra_renewals SET correspondence_lock_until=NULL WHERE id=$1',[id]);}
}
export async function retryAgentCorrespondence(today:string):Promise<number>{
 const db=await getDb();const rows=await db.query<{id:string}>(`SELECT id FROM ra_renewals WHERE status<>'cancelled' AND ((correspondence->>'pending')='true' OR (status NOT IN ('charged','paid_by_link') AND notice_sent_at IS NULL AND notice_suppression_reason IS NULL AND renewal_date-$2::int <= $1::date)) ORDER BY created_at`,[today,70]);
 let sent=0;for(const r of rows)if(await deliverAgentCorrespondence(r.id,today))sent++;return sent;
}
function escape(s:string):string{return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
