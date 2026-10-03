import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'release-billing-'));
process.env.E2E_OFFLINE='1';process.env.VERCEL='';process.env.DEV_PG_DIR=join(dir,'db');process.env.DEV_STORAGE_DIR=join(dir,'files');process.env.DEV_MIRROR_DIR=join(dir,'mirror');
const root=resolve(process.argv[2]||resolve(import.meta.dir,'../../..'));
const {env}=await import(root+'/webapp/server/env.ts');
if(!env.OFFLINE||[env.DATABASE_URL,env.SQUARE_ACCESS_TOKEN,env.RESEND_API_KEY,env.BLOB_READ_WRITE_TOKEN,env.DROPBOX_REFRESH_TOKEN].some(Boolean))throw Error('Offline boundary absent');
console.log('ISOLATION:'+JSON.stringify({offline:env.OFFLINE,dir}));
const {getDb}=await import(root+'/webapp/server/db.ts'),{payAgentTarget}=await import(root+'/webapp/server/ra-checkout.ts'),{runRenewals}=await import(root+'/webapp/server/renewals.ts'),{normalizeAgentObligations}=await import(root+'/webapp/server/agent-obligations.ts'),{encryptSecret}=await import(root+'/webapp/server/crypto.ts');
const db=await getDb();const mails:any[]=[];
(globalThis as any).fetch=async(url:any,init:any)=>{if(String(url)!=='https://api.resend.com/emails')throw Error('External network forbidden');mails.push(JSON.parse(init.body));return Response.json({id:crypto.randomUUID()});};env.RESEND_API_KEY='fixture';
const results:any[]=[];const check=(id:string,ok:boolean,observed:unknown)=>{const r={id,result:ok?'pass':'fail',...(!ok?{failure_code:id}:{}),observed};results.push(r);console.log(JSON.stringify(r));};
const client=crypto.randomUUID();await db.query("INSERT INTO clients(id,email,name) VALUES($1,'repairs@example.test','Repair Fixture')",[client]);
async function company(date='2026-10-15'){
 await db.query("UPDATE orders SET status='parked' WHERE status='formed'");mails.length=0;
 const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Repair','repairs@example.test','NEW','Repair LLC',$3,0,0,0,'formed',now(),'2025-10-15',$4,'customer','card','on_file','1234')",[id,client,JSON.stringify({registeredAgent:{choice:'SERVICE',renewalCardConsent:true}}),date]);return id;
}
async function renewal(id:string,date='2026-10-15',status='notice_sent',retries=0){const rid=crypto.randomUUID();await db.query("INSERT INTO ra_renewals(id,order_id,renewal_date,charge_due,amount_cents,status,notice_sent_at,retries) VALUES($1,$2,$3,$3::date-15,9900,$4,now(),$5)",[rid,id,date,status,retries]);return rid;}
const row=async(rid:string)=>(await db.query<any>('SELECT * FROM ra_renewals WHERE id=$1',[rid]))[0];
for(const [label,code,retries] of [['plain','GENERIC_DECLINE',0],['exhausted','INSUFFICIENT_FUNDS',1]] as const){
 const id=await company(),rid=await renewal(id,'2026-10-15','charging',retries);
 await db.query("INSERT INTO ra_payment_attempts(target_id,kind,source_token,automatic) VALUES($1,'renewal',$2,true)",[rid,encryptSecret(JSON.stringify({cardId:'decline-card',customerId:'customer',automatic:true,cardLast4:'1234'}))]);
 await db.query('UPDATE orders SET ra_payment_target=$2 WHERE id=$1',[id,rid]);
 const {testHooks}=await import(root+'/webapp/server/shared.ts');testHooks.declineNextRenewal=code;
 await payAgentTarget('renewal',rid,{resumeOnly:true});const before=await row(rid);
 const n=mails.length;await runRenewals('2026-10-01');const attempts=await db.query('SELECT * FROM ra_payment_attempts WHERE target_id=$1',[rid]);
 check('P01-'+label+'-decline-recorded',before.status==='declined'&&before.retries===retries+1&&!before.retry_after,{status:before.status,retries:before.retries,retry:before.retry_after});
 check('P01-'+label+'-no-extra-charge',attempts.length===1,{attempts:attempts.length,status:(await row(rid)).status});
 check('P01-'+label+'-decline-notice',n===1&&mails[0]?.html.includes('1234'),{n,subjects:mails.map(m=>m.subject)});
}
{
 const id=await company('2026-09-15'),rid=await renewal(id,'2026-09-15');
 await db.query("UPDATE orders SET ra_resignation_submitted='2026-09-20' WHERE id=$1",[id]);await normalizeAgentObligations(db,id);
 await db.query("UPDATE orders SET ra_cancellation_requested_at='2026-08-01T12:00:00Z' WHERE id=$1",[id]);await normalizeAgentObligations(db,id);
 const result=await payAgentTarget('renewal',rid,{token:'offline-credit'});check('P02-timely-notice-after-normalization',!result.ok&&result.code==='CANCELLED',{result,row:await row(rid)});
}
{
 const id=await company(),rid=await renewal(id);await db.query("UPDATE orders SET ra_cancellation_requested_at='2026-09-20T12:00:00Z',ra_replaced_at='2026-09-21',ra_ended_date='2026-09-21' WHERE id=$1",[id]);await normalizeAgentObligations(db,id);await runRenewals('2026-09-30');
 const r=await row(rid),o=(await db.query<any>('SELECT ra_renewal_date::text AS date FROM orders WHERE id=$1',[id]))[0];check('P08-late-notice-scheduled-charge',r.status==='charged'&&o.date==='2026-10-15',{status:r.status,purpose:r.purpose,date:o.date});
}
{
 const id=await company(),rid=await renewal(id,'2026-10-15','charged');await db.query('UPDATE ra_renewals SET notice_sent_at=NULL WHERE id=$1',[rid]);await runRenewals('2026-10-01');check('P07-no-inferred-old-receipt',mails.length===0,{subjects:mails.map(m=>m.subject)});
}
console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions:results}));if(results.some(r=>r.result==='fail'))process.exitCode=1;
