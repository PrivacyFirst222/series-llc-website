import { getDb } from './db';
import { env } from './env';
import { squareRead, createCheckout, type AgentPayment } from './square';
import { fulfillPaidOrder, fulfillPaidServiceOrder } from './routes-payments';
import { payAgentTarget } from './ra-checkout';
import { sendMail } from './email';

type Kind = 'order' | 'service';
const tableFor = (kind:Kind) => kind==='order'?'orders':'service_orders';
const escape = (text:string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function paymentAlert(key:string,message:string):Promise<void> {
  const db=await getDb();
  await db.query(`INSERT INTO payment_alerts(alert_key,message) VALUES($1,$2)
    ON CONFLICT(alert_key) DO UPDATE SET message=EXCLUDED.message,updated_at=now()`,[key,message]);
}
export async function deliverPaymentAlerts():Promise<void> {
  if(!env.ADMIN_NOTIFY_EMAIL || !env.RESEND_API_KEY)return;
  const db=await getDb();
  const alerts=await db.query<{alert_key:string;message:string}>(`UPDATE payment_alerts SET lease_until=now()+interval '2 minutes'
    WHERE alert_key IN (SELECT alert_key FROM payment_alerts WHERE (sent_at IS NULL OR (sent_at<updated_at AND sent_at<now()-interval '1 day'))
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at LIMIT 20) AND (lease_until IS NULL OR lease_until<now()) RETURNING alert_key,message`);
  for(const alert of alerts) {
    try {await sendMail({to:env.ADMIN_NOTIFY_EMAIL,subject:'Payment needs office attention',html:`<p>${escape(alert.message)}</p><p>Review the payment in Square. Do not charge the customer again to resolve this notice.</p>`});
      await db.query('UPDATE payment_alerts SET sent_at=now(),lease_until=NULL WHERE alert_key=$1',[alert.alert_key]);
    } catch(error) {console.error('[payment alert]',error);await db.query('UPDATE payment_alerts SET lease_until=NULL WHERE alert_key=$1',[alert.alert_key]);}
  }
}

/** Reads provider facts only. No replacement payment or new card authorization. */
export async function checkCheckout(kind:Kind,id:string):Promise<void> {
  if(!env.SQUARE_ACCESS_TOKEN)return;
  const db=await getDb(), table=tableFor(kind), lease=crypto.randomUUID();
  const [row]=await db.query<{id:string;square_order_id:string|null;checkout_request:Record<string,unknown>|null;total_cents:number;amount_cents:number;status:string;llc_name:string}>(`UPDATE ${table}
    SET payment_check_lease=$2,payment_check_until=now()+interval '3 minutes',payment_check_after=now()+interval '1 minute'
    WHERE id=$1 AND (payment_check_after IS NULL OR payment_check_after<=now()) AND (payment_check_until IS NULL OR payment_check_until<now())
      AND (status='pending_payment' ${kind==='order'?"OR (paid_at IS NOT NULL AND fulfillment_completed_at IS NULL)":''}) RETURNING *`,[id,lease]);
  if(!row)return;
  try {
    const attempts=kind==='order'?await db.query<{id:string}>("SELECT id FROM ra_payment_attempts WHERE kind='order' AND target_id=$1 AND status IN ('pending','approved','completed')",[id]):[];
    if(attempts.length) {
      const result=await payAgentTarget('order',id,{resumeOnly:true,actor:'automatic payment recovery'});
      if(!result.ok)throw new Error(result.message);
    } else {
      if(row.square_order_id?.startsWith('agent-'))return;
      // If link creation succeeded but its reply was lost before persistence,
      // reconstruct the link from the previously frozen request and stable key.
      if(!row.square_order_id && row.checkout_request) {
        const request=row.checkout_request as {order:{line_items:{name:string;base_price_money:{amount:number}}[]};checkout_options:{redirect_url:string};pre_populated_data?:{buyer_email:string};description:string};
        const items=request.order.line_items.map(i=>({name:i.name,amountCents:i.base_price_money.amount}));
        const total=items.reduce((sum,i)=>sum+i.amountCents,0);
        const link=await createCheckout({orderId:id,service:kind==='service',llcName:row.llc_name,buyerEmail:request.pre_populated_data?.buyer_email||'',description:request.description,redirectUrl:request.checkout_options.redirect_url,priced:{serviceFeeCents:total,stateFeesCents:0,totalCents:total,lineItems:items}});
        row.square_order_id=link.squareOrderId;
      }
      if(!row.square_order_id || row.square_order_id.startsWith('dev-'))return;
      const {order}=await squareRead<{order:{id:string;reference_id?:string;location_id:string;tenders?:{id:string;payment_id?:string}[]}}>('/v2/orders/'+encodeURIComponent(row.square_order_id));
      if(!order || order.id!==row.square_order_id || order.reference_id!==id || order.location_id!==env.SQUARE_LOCATION_ID)throw new Error('Square order identity or location does not match the saved checkout');
      for(const tender of order.tenders||[]) {
        const pid=tender.payment_id||tender.id;
        const {payment}=await squareRead<{payment:AgentPayment}>('/v2/payments/'+encodeURIComponent(pid));
        if(!payment || payment.id!==pid || payment.order_id!==order.id || payment.location_id!==env.SQUARE_LOCATION_ID)throw new Error('Square payment identity or location does not match the saved checkout');
        if(payment.status!=='COMPLETED')continue;
        if(payment.amount_money?.amount!==(kind==='order'?row.total_cents:row.amount_cents) || payment.amount_money?.currency!=='USD')throw new Error('Completed payment amount or currency does not match; manual review required');
        if(kind==='order')await fulfillPaidOrder(id,payment.id);else await fulfillPaidServiceOrder(id,payment.id);
      }
    }
    await db.query(`UPDATE ${table} SET payment_check_error=NULL WHERE id=$1 AND payment_check_lease=$2`,[id,lease]);
  } catch(error) {
    const message=String(error).slice(0,500);
    await db.query(`UPDATE ${table} SET payment_check_error=$3 WHERE id=$1 AND payment_check_lease=$2`,[id,lease,message]);
    await paymentAlert('recovery:'+id,`Payment recovery needs attention for ${kind} ${id}: ${message}`);
  } finally {
    // Fair rotation, including indefinitely open legacy links. Never abandon a
    // still-payable checkout merely because a fixed retry window elapsed.
    await db.query(`UPDATE ${table} SET payment_check_until=NULL,payment_check_lease=NULL WHERE id=$1 AND payment_check_lease=$2`,[id,lease]);
  }
}

export async function runCheckoutRecovery():Promise<{checked:number}> {
  if(!env.SQUARE_ACCESS_TOKEN)return {checked:0};
  const db=await getDb();
  // One bounded lane per category: a slow formation queue must never spend
  // the add-ons' entire budget (or vice versa). Each lane retains the durable
  // oldest-check-first rotation and each checkout still claims its own lease.
  const counts=await Promise.all((['order','service'] as const).map(async kind => {
    let checked=0;const deadline=Date.now()+180000;
    const rows=await db.query<{id:string}>(`SELECT id FROM ${tableFor(kind)} WHERE (status='pending_payment' ${kind==='order'?"OR (paid_at IS NOT NULL AND fulfillment_completed_at IS NULL)":''})
      AND (payment_check_after IS NULL OR payment_check_after<=now()) AND (payment_check_until IS NULL OR payment_check_until<now())
      ORDER BY payment_check_after NULLS FIRST,created_at,id LIMIT 25`);
    // A provider outage must not prevent the remaining cases or renewal job.
    for(const row of rows){if(Date.now()>=deadline)break;await checkCheckout(kind,row.id);checked++;}
    return checked;
  }));
  await deliverPaymentAlerts();
  return {checked:counts.reduce((sum,count)=>sum+count,0)};
}
