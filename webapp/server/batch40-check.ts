import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
type Check=(label:string,ok:boolean,detail?:unknown)=>void;
export async function batch40Checks(check:Check){
 const dir=mkdtempSync(join(tmpdir(),'batch40-'));
 try{
  const p=Bun.spawn(['bun',import.meta.filename,'--child'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'files')},stdout:'pipe',stderr:'pipe'});
  const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  const rows=out.split('\n').filter(x=>x.startsWith('B40:')).map(x=>JSON.parse(x.slice(4)));
  check('batch40 renewal reminders do not gate billing',code===0&&rows.length>=14&&rows.every(r=>r.ok),{rows,exit:code,stderr:code?err:undefined});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
async function child(){
 const {app}=await import('./app'),{getDb}=await import('./db'),{env}=await import('./env'),{runRenewals,addDays}=await import('./renewals'),{payAgentTarget}=await import('./ra-checkout');
 const proof=(await(await app.request('/api/dev/env-summary')).json()).data;
 if(!proof?.offline||Object.values(proof.externals).some(Boolean))throw Error('Isolation unproven');
 const db=await getDb();let failMail=false;const mails:{html:string}[]=[];env.RESEND_API_KEY='fixture-only';
 globalThis.fetch=(async(url:RequestInfo|URL,init?:RequestInit)=>{if(String(url)!=='https://api.resend.com/emails')throw Error('Unexpected external request');if(failMail)return Response.json({error:'injected mail outage'},{status:503});mails.push(JSON.parse(String(init?.body)));return Response.json({id:'fixture'});}) as typeof fetch;
 const check=(label:string,ok:boolean,detail?:unknown)=>console.log('B40:'+JSON.stringify({label,ok,detail}));
 const date='2030-06-01',cid=crypto.randomUUID();await db.query("INSERT INTO clients(id,email,name) VALUES($1,'forty@example.test','Forty')",[cid]);
 const company=async()=>{
  await db.query('UPDATE orders SET ra_renewal_date=NULL');failMail=false;mails.length=0;
  const id=crypto.randomUUID(),payload={registeredAgent:{choice:'SERVICE',renewalCardConsent:true}};
  await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Forty','forty@example.test','NEW','Forty LLC',$3,0,0,0,'formed','2026-06-01',$4,'customer-fixture','card-fixture','on_file','1234')",[id,cid,JSON.stringify(payload),date]);return id;
 };
 const rows=async(id:string)=>(await db.query<Record<string,unknown>>('SELECT * FROM ra_renewals WHERE order_id=$1 ORDER BY created_at',[id]));
 for(const days of [70,60,59,15,5]){
  const id=await company();await runRenewals(addDays(date,-days));const sent=await rows(id);
  if(days>15)await runRenewals(addDays(date,-15));
  const paid=await rows(id);await runRenewals(date);const [count]=await db.query<{n:number}>('SELECT count(*)::int n FROM ra_payment_attempts WHERE target_id=$1',[paid[0]?.id]);
  check(`notice ${days} days before renewal`,paid[0]?.status==='charged'&&count.n===1&&!paid[0]?.billing_hold&&(days<=15||!sent[0]?.charged_at),{status:paid[0]?.status,attempts:count.n});
  if(days===5)check('late catch-up email does not promise charging on a past date',mails[0]?.html.includes(addDays(date,-5).slice(0,4))&&!mails[0]?.html.includes('May 17')&&!mails[0]?.html.includes('on hold'),mails[0]);
 }
 let id=await company();await runRenewals(addDays(date,-71));check('70-day schedule preserved',!(await rows(id)).length);
 failMail=true;await runRenewals(addDays(date,-70));const unsent=await rows(id);await runRenewals(addDays(date,-16));check('failed notice recorded, no early charge',!unsent[0]?.notice_sent_at&&!!unsent[0]?.notice_error&&!(await rows(id))[0]?.charged_at);
 await runRenewals(addDays(date,-15));const paid=await rows(id);check('failed notice cannot block due renewal',paid[0]?.status==='charged'&&!paid[0]?.notice_sent_at&&!!paid[0]?.notice_error);
 id=await company();await db.query("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,charge_due,notice_sent_at,billing_hold) VALUES($1,$2,9900,'notice_sent',$3,now(),true)",[id,date,addDays(date,-15)]);await runRenewals(addDays(date,-15));check('legacy notice hold no longer blocks', (await rows(id))[0]?.status==='charged'&&!(await rows(id))[0]?.billing_hold);
 id=await company();await db.query("UPDATE orders SET payload=jsonb_set(payload,'{registeredAgent,renewalCardConsent}','false') WHERE id=$1",[id]);failMail=true;await runRenewals(date);check('no consent still prevents automatic charge',!(await rows(id))[0]?.charged_at);
 id=await company();await db.query("UPDATE orders SET square_card_id=NULL,card_status='none' WHERE id=$1",[id]);await runRenewals(date);check('no card still prevents automatic charge',!(await rows(id))[0]?.charged_at);
 id=await company();await db.query('UPDATE orders SET ra_cancellation_requested_at=$2 WHERE id=$1',[id,addDays(date,-30)+'T12:00:00Z']);await runRenewals(addDays(date,-15));check('timely cancellation prevents renewal charge',!(await rows(id)).length);
 id=await company();failMail=true;await runRenewals(addDays(date,-70));const voluntary=(await rows(id))[0];await payAgentTarget('renewal',String(voluntary.id),{token:'offline-credit'});await runRenewals(addDays(date,-15));check('voluntary payment not charged again',(await rows(id))[0]?.status==='paid_by_link'&&(await db.query<{n:number}>('SELECT count(*)::int n FROM ra_payment_attempts WHERE target_id=$1',[voluntary.id]))[0]?.n===1);
 id=await company();failMail=true;await runRenewals(addDays(date,-70));await Promise.all([runRenewals(addDays(date,-15)),runRenewals(addDays(date,-15))]);check('concurrent jobs keep one payment',(await rows(id))[0]?.status==='charged'&&(await db.query<{n:number}>('SELECT count(*)::int n FROM ra_payment_attempts WHERE target_id=$1',[(await rows(id))[0]?.id]))[0]?.n===1);
 const terms=readFileSync(join(import.meta.dir,'../src/content/terms.md'),'utf8');check('Terms preserve deadlines without notice charge restriction',terms.includes('A missing or late renewal reminder does not postpone renewal, prevent us from charging your authorized payment method')&&terms.includes('70 days before your renewal date')&&terms.includes('at least 30 days before renewal'));
}
if(process.argv.includes('--child'))await child();
else if(import.meta.main)await batch40Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail},null,2));if(!ok)process.exitCode=1;});
