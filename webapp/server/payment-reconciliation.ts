import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getDb} from './db';
import {env} from './env';
import {encryptSecret} from './crypto';
import {agentSquarePayment} from './square';
import {payAgentTarget} from './ra-checkout';

// The operator supplies the ORIGINAL persisted request record, not an inferred
// replacement identity. This command only retrieves an already identified
// terminal provider payment; it never authorizes or captures one.
const evidenceSchema=z.object({
 targetId:z.string().uuid(),attemptId:z.string().uuid(),paymentId:z.string().min(1),
 automatic:z.boolean(),priorAutomaticDeclines:z.number().int().nonnegative(),
 cardLast4:z.string().regex(/^\d{4}$/).nullable(),
 originalRecordReference:z.string().min(1),operator:z.string().min(1),
});
export async function reconcileRecordedPayment(input:unknown){
 const evidence=evidenceSchema.parse(input),db=await getDb();
 if(!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID)throw Error('An authenticated Square read and configured location are required');
 const [r]=await db.query<{order_id:string;amount_cents:number;retries:number;status:string;ra_payment_target:string|null}>(`SELECT r.*,o.ra_payment_target FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,[evidence.targetId]);
 if(!r||r.ra_payment_target!==evidence.targetId||['charged','paid_by_link','cancelled'].includes(r.status))throw Error('The exact unresolved reserved obligation is required');
 const payment=await agentSquarePayment('get',{id:evidence.paymentId});
 if(payment.id!==evidence.paymentId||payment.reference_id!==evidence.targetId||payment.location_id!==env.SQUARE_LOCATION_ID||payment.amount_money?.amount!==r.amount_cents||payment.amount_money.currency!=='USD')throw Error('Square payment identity, location, currency or amount does not match the obligation');
 if(!['COMPLETED','FAILED','CANCELED'].includes(payment.status))throw Error('Square result is not terminal; keep the reservation and check again later');
 if(r.retries!==evidence.priorAutomaticDeclines)throw Error('Prior retry history differs from the original request evidence; reconcile the history before proceeding');
 const existing=await db.query<{id:string;square_payment_id:string|null;status:string}>('SELECT id,square_payment_id,status FROM ra_payment_attempts WHERE target_id=$1',[evidence.targetId]);
 if(existing.some(a=>a.id!==evidence.attemptId||a.square_payment_id!==evidence.paymentId))throw Error('Local attempt history conflicts with the supplied original request');
 if(existing[0]?.status==='failed'&&r.status==='charging'){
  await db.query("UPDATE ra_payment_attempts SET status='approved',source_token=$2 WHERE id=$1 AND status='failed'",[evidence.attemptId,encryptSecret(JSON.stringify({automatic:evidence.automatic,cardLast4:evidence.cardLast4}))]);
 }
 if(!existing.length){
  const inserted=await db.query(`WITH owner AS (
    UPDATE orders SET ra_payment_attempt_id=$2 WHERE id=$1 AND ra_payment_target=$3
      AND NOT EXISTS(SELECT 1 FROM ra_payment_attempts WHERE target_id=$3) RETURNING id
   ) INSERT INTO ra_payment_attempts(id,target_id,kind,source_token,automatic,square_payment_id,status)
     SELECT $2,$3,'renewal',$4,$5,$6,'approved' FROM owner RETURNING id`,
   [r.order_id,evidence.attemptId,evidence.targetId,encryptSecret(JSON.stringify({automatic:evidence.automatic,cardLast4:evidence.cardLast4})),evidence.automatic,evidence.paymentId]);
  if(!inserted.length)throw Error('Payment state changed; inspect the current records again');
 }
 await db.query(`INSERT INTO payment_reconciliation_log(order_id,target_id,actor,disposition,evidence) VALUES($1,$2,$3,'original request restored from evidence',$4)`,
 [r.order_id,evidence.targetId,evidence.operator,JSON.stringify({...evidence,providerStatus:payment.status,recordSha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')})]);
 return payAgentTarget('renewal',evidence.targetId,{resumeOnly:true,actor:evidence.operator});
}
