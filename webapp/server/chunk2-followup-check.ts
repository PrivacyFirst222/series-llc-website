/* eslint-disable @typescript-eslint/no-explicit-any */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHmac} from 'node:crypto';
const W=process.env.CHUNK2_OUTPUT!,R=process.env.CHUNK2_WEBAPP||resolve(import.meta.dir,'..'),E=W;
if(!W)throw Error('CHUNK2_OUTPUT must name the disposable evidence directory');
const run=process.argv[2]||'main',temp=E+'/fixtures/independent-'+run+'-'+Date.now();mkdirSync(temp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/files',DEV_MIRROR_DIR:temp+'/mirror',ADMIN_PASSWORD:'fixture'});
const {app}=await import(R+'/server/app.ts'),{env}=await import(R+'/server/env.ts'),{getDb}=await import(R+'/server/db.ts');
const proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof.offline||Object.values(proof.externals).some(Boolean))throw Error('Offline proof failed');
console.log('PROOF:'+JSON.stringify({proof,temp}));
const db:import('./db').Db=await getDb();
const {newToken}=await import(R+'/server/crypto.ts');
const hostedLedger=new Map<string,any>(),links=new Map<string,any>();let lostLink=false;
const checks:any[]=[],calls:any[]=[],mail:any[]=[],payments=new Map<string,any>();let failAction='',decline='',cardType='NOT_PREPAID',mailFail=false,mailLost=false;
function check(id:string,ok:boolean,observed:any){const row={id,result:ok?'pass':'fail',observed};checks.push(row);console.log('CASE:'+JSON.stringify(row));writeFileSync(E+'/independent-'+run+'.json',JSON.stringify(checks,null,2));}
async function test(id:string,fn:()=>Promise<void>){try{await db.query('DELETE FROM rate_limits');await fn()}catch(e){check(id,false,{harnessError:String(e),stack:(e as Error).stack});}finally{failAction='';decline='';cardType='NOT_PREPAID';mailFail=false;mailLost=false;}}
const client=crypto.randomUUID(),admin=newToken(),user=newToken();await db.query("INSERT INTO clients(id,email,name) VALUES($1,'current@example.test','Fixture Client')",[client]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[user.tokenHash,client]);
const request=async(path:string,body?:any)=>{const r=await app.request('/api/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:`fpsllc_admin=${admin.token}; fpsllc_session=${user.token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
globalThis.fetch=(async(input:any,init:any={})=>{
 const url=new URL(String(input));const body:any=init.body?JSON.parse(init.body):{};
 if(url.hostname==='api.resend.com'){mail.push(body);if(mailLost)throw Error('fixture accepted email but response lost');return mailFail?new Response('outage',{status:503}):Response.json({id:'mail-'+mail.length});}
 if(!['connect.squareupsandbox.com','connect.squareup.com'].includes(url.hostname))throw Error('NETWORK REFUSED '+url);
 const path=url.pathname;calls.push({path,method:init.method,body});
 if(path.startsWith('/v2/orders/'))return Response.json({order:hostedLedger.get(decodeURIComponent(path.split('/')[3]))});
 if(path==='/v2/online-checkout/payment-links'){
  if((init.method||'GET')==='GET')return Response.json({payment_links:[...links.values()]});
  const key=body.idempotency_key;let link=links.get(key);if(!link){link={url:'https://fixture.invalid/checkout/'+body.order.reference_id,order_id:'square-'+body.order.reference_id};links.set(key,link);hostedLedger.set(link.order_id,{id:link.order_id,reference_id:body.order.reference_id,location_id:body.order.location_id,tenders:[]});}
  if(lostLink){lostLink=false;throw Error('lost link response after provider commit');}return Response.json({payment_link:link});
 }
 if(path==='/v2/customers')return Response.json({customer:{id:'customer-'+body.idempotency_key}});
 if(path==='/v2/cards')return Response.json({card:{id:'card-'+body.idempotency_key,last_4:'9876',card_brand:'VISA',prepaid_type:cardType,enabled:true}});
 if(path.endsWith('/disable'))return Response.json({});
 let p:any,action='get';
 if(path==='/v2/payments'){
  action='authorize';if(decline){const code=decline;decline='';return Response.json({errors:[{code}]},{status:400});}
  p=payments.get('pay-'+body.idempotency_key);if(!p){p={id:'pay-'+body.idempotency_key,status:'APPROVED',reference_id:body.reference_id,location_id:body.location_id,amount_money:body.amount_money,card_details:{card:{prepaid_type:cardType}}};payments.set(p.id,p);}
 }else{const id=decodeURIComponent(path.split('/')[3]);p=payments.get(id);if(!p)return Response.json({errors:[{code:'NOT_FOUND'}]},{status:404});if(path.endsWith('/complete')){action='complete';p.status='COMPLETED';}if(path.endsWith('/cancel')){action='cancel';p.status='CANCELED';}}
 if(failAction===action){failAction='';throw Error('fixture response lost after '+action);}
 return Response.json({payment:{...p}});
}) as typeof fetch;
Object.assign(env,{SQUARE_ACCESS_TOKEN:'fixture-token',SQUARE_LOCATION_ID:'fixture-location',SQUARE_APPLICATION_ID:'fixture-app',RESEND_API_KEY:'fixture-mail',SQUARE_WEBHOOK_SIGNATURE_KEY:'fixture-signature'});
async function company(opts:any={}){

 const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Fixture Client','old@example.test','NEW','Fixture LLC',$3,49900,12500,62400,$4,$5,$6,$7,'customer','card','on_file','1234')",[id,client,JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SERVICE',renewalCardConsent:true},series:[],optionalDocuments:{}}),opts.status||'formed',opts.status==='pending_payment'?null:new Date().toISOString(),opts.appointment||'2025-09-01',opts.date||'2027-09-01']);return id;
}
const auths=(n:number)=>calls.slice(n).filter(c=>c.path==='/v2/payments');
const webhook=async(payment:any,valid=true,eventId:string=crypto.randomUUID())=>{const raw=JSON.stringify({event_id:eventId,type:'payment.updated',data:{object:{payment}}});const sig=createHmac('sha256','fixture-signature').update(env.PUBLIC_BASE_URL+'/api/square/webhook'+raw).digest('base64');const r=await app.request('/api/square/webhook',{method:'POST',headers:{'content-type':'application/json','x-square-hmacsha256-signature':valid?sig:'invalid'},body:raw});return {status:r.status,body:await r.json()}};
const serviceRow=async(id:string)=>(await db.query<any>('SELECT * FROM service_orders WHERE id=$1',[id]))[0];
async function paidFixture(id:string,amount:number,service=true){
 const table=service?'service_orders':'orders';const row=(await db.query<any>('SELECT * FROM '+table+' WHERE id=$1',[id]))[0];
 const payment={id:'captured-'+id,order_id:row.square_order_id,status:'COMPLETED',location_id:env.SQUARE_LOCATION_ID,amount_money:{amount,currency:'USD'}};
 payments.set(payment.id,payment);hostedLedger.set(row.square_order_id,{id:row.square_order_id,reference_id:id,location_id:env.SQUARE_LOCATION_ID,state:'COMPLETED',tenders:[{id:payment.id,payment_id:payment.id}]});return payment;
}
const {checkCheckout,runCheckoutRecovery}=await import(R+'/server/checkout-recovery.ts');
const {seriesDedupeKey}=await import(R+'/src/components/forms/florida-llc/validation.ts');
const aliases=['PS A','P.S. A','P.S A','PS. A','Protected Series A','PS-A','  p.s.   a  '];
await test('formation-aliases',async()=>{
 for(const stored of ['PS A','Fixture LLC, PS A','Fixture LLC - PS A']) {
  const o=await company();await db.query("UPDATE orders SET payload=jsonb_set(payload,'{series}',$2::jsonb) WHERE id=$1",[o,JSON.stringify([{name:stored}])]);
  for(const suffix of aliases){const response=await request('portal/services/series?company='+o,{suffix});check('owned:'+stored+':'+suffix,response.status===400&&response.body.error.code==='ALREADY_ORDERED',{response});}
 }
});
await test('canonical-boundaries',async()=>{
 const pairs=[['PS A','a'],['PS AN','an'],['P.S. The','the'],['PS Aspen','aspen'],['PS ASP.S.en','asp.s.en'],['PS A-B','a-b'],['PS A B','a b'],['PS Oakes PS A','oakes a'],['PS 001','001'],['PS 1','1']];
 for(const [name,expected] of pairs){const rows=await db.query<{key:string}>('SELECT purchase_series_key($1,$2) AS key',[name,'Fixture LLC']);check('key:'+name,rows[0].key===expected&&rows[0].key===seriesDedupeKey(name).toLowerCase(),{rows,expected});}
 const rows=await db.query<{key:string}>('SELECT purchase_series_key($1,$2) AS key',['ACME_%, LLC, PS A','ACME_%, LLC']);check('literal-company-prefix',rows[0].key==='a',{rows});
 const other=await db.query<{key:string}>('SELECT purchase_series_key($1,$2) AS key',['ACME-X, LLC, PS A','ACME_%, LLC']);check('company-prefix-not-wildcard',other[0].key!=='a',{other});
});
await test('pending-paid-company-boundaries',async()=>{
 const o=await company();const requests=await Promise.all(aliases.map(suffix=>request('portal/services/series?company='+o,{suffix})));
 const ids=requests.map(r=>r.body.data?.serviceOrderId);check('pending-aliases-share-checkout',requests.every(r=>r.status===200)&&new Set(ids).size===1,{requests});
 const payment=await paidFixture(ids[0],5000);await webhook(payment);
 for(const suffix of aliases){const response=await request('portal/services/series?company='+o,{suffix});check('paid-alias:'+suffix,response.status===400&&response.body.error.code==='ALREADY_ORDERED',{response});}
 const other=await company();const allowed=await request('portal/services/series?company='+other,{suffix:'Protected Series A'});check('another-company-same-name',allowed.status===200,{allowed});
 for(const suffix of ['PS B','PS A-B','PS A B']){const response=await request('portal/services/series?company='+o,{suffix});check('genuinely-different:'+suffix,response.status===200,{response});}
});
async function legacySeries(companyId:string,name:string){
 const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,llc_name,details,amount_cents,square_order_id) VALUES($1,$2,$3,'series','Fixture LLC',$4,5000,$5)",[id,client,companyId,JSON.stringify({seriesName:name}),'square-'+id]);return id;
}
await test('legacy-payable-aliases',async()=>{
 const o=await company();await db.query("UPDATE orders SET payload=jsonb_set(payload,'{series}','[{\"name\":\"Fixture LLC, P.S. A\"}]'::jsonb) WHERE id=$1",[o]);
 const legacy=await legacySeries(o,'Fixture LLC - Protected Series A'),p=await paidFixture(legacy,5000);
 await webhook(p);await webhook(p);
 const receipts=await db.query('SELECT * FROM checkout_payment_receipts WHERE payment_id=$1',[p.id]);
 check('legacy-owned-payment-refund-once',receipts.length===1&&receipts[0].disposition==='refund_required'&&(await serviceRow(legacy)).status==='duplicate_payment',{receipts,row:await serviceRow(legacy)});
 const o2=await company(),first=await legacySeries(o2,'Fixture LLC - PS Birch'),second=await legacySeries(o2,'Fixture LLC, P.S. Birch');
 const p1=await paidFixture(first,5000),p2=await paidFixture(second,5000);
 await Promise.all([webhook(p1),webhook(p2)]);await webhook(p2);
 const recorded=await db.query('SELECT * FROM checkout_payment_receipts WHERE service_order_id=ANY($1::uuid[])',[[first,second]]);
 check('legacy-alias-payments-one-work-one-refund',recorded.length===2&&recorded.filter(r=>r.disposition==='applied').length===1&&recorded.filter(r=>r.disposition==='refund_required').length===1,{recorded});
 check('legacy-payments-preserve-both-identities',recorded.some(r=>r.payment_id===p1.id)&&recorded.some(r=>r.payment_id===p2.id),{recorded});
});
await test('recovery-both-directions-and-rotation',async()=>{
 for(const slowKind of ['order','service'] as const){
  await db.query("UPDATE orders SET payment_check_after=now()+interval '1 day'");await db.query("UPDATE service_orders SET payment_check_after=now()+interval '1 day'");
  const owner=await company();const slowIds:string[]=[];
  for(let i=0;i<30;i++){
   const id=crypto.randomUUID();slowIds.push(id);
   if(slowKind==='order')await db.query("INSERT INTO orders(id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,square_order_id) VALUES($1,'Slow','slow@example.test','NEW','Slow LLC','{}',49900,12500,62400,$2)",[id,'slow-'+id]);
   else await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,llc_name,details,amount_cents,square_order_id) VALUES($1,$2,$3,'certificate-of-status','Fixture LLC','{}',4000,$4)",[id,client,owner,'slow-'+id]);
  }
  let id:string;
  if(slowKind==='order'){const buy=await request('portal/services/ein?company='+owner,{target:'company'});id=buy.body.data.serviceOrderId;await paidFixture(id,5000);}
  else {id=await company({status:'pending_payment'});await db.query("UPDATE orders SET square_order_id=$2,payload=jsonb_set(payload,'{registeredAgent,choice}','\"SELF\"'::jsonb) WHERE id=$1",[id,'square-'+id]);await paidFixture(id,62400,false);}
  const original=globalThis.fetch,oldNow=Date.now,start=oldNow(),seen=new Set<string>();let elapsed=0;Date.now=()=>start+elapsed;
  globalThis.fetch=(async(input:any,init:any)=>{if(String(input).includes('/v2/orders/slow-')){seen.add(String(input));elapsed+=15001;throw Error('accelerated 15-second read timeout');}return original(input,init);}) as typeof fetch;
  const beforeAuth=auths(0).length;
  try {
   await runCheckoutRecovery();const row=(await db.query('SELECT * FROM '+(slowKind==='order'?'service_orders':'orders')+' WHERE id=$1',[id]))[0];
   check('progress-beside-slow-'+slowKind,!!row.paid_at,{row,slowChecks:seen.size});
   for(let pass=0;pass<3;pass++){
    // Make attempted rows eligible without erasing their relative check order.
    await db.query('UPDATE '+(slowKind==='order'?'orders':'service_orders')+" SET payment_check_after=payment_check_after-interval '2 minutes' WHERE id=ANY($1::uuid[])",[slowIds]);
    await runCheckoutRecovery();
   }
   check('durable-rotation-'+slowKind,seen.size===30,{count:seen.size});
   check('no-authorization-'+slowKind,auths(0).length===beforeAuth,{beforeAuth,afterAuth:auths(0).length});
  }finally{Date.now=oldNow;globalThis.fetch=original;}
 }
});
await test('concurrent-recovery-leases',async()=>{
 await db.query("UPDATE orders SET payment_check_after=now()+interval '1 day'");await db.query("UPDATE service_orders SET payment_check_after=now()+interval '1 day'");
 const owner=await company(),buy=await request('portal/services/ein?company='+owner,{target:'company'}),id=buy.body.data.serviceOrderId;const payment=await paidFixture(id,5000);const before=calls.length;
 await Promise.all([runCheckoutRecovery(),runCheckoutRecovery(),checkCheckout('service',id),webhook(payment)]);
 const receipts=await db.query('SELECT * FROM checkout_payment_receipts WHERE payment_id=$1',[payment.id]);
 check('overlapping-recovery-one-payment',receipts.length===1&&receipts[0].disposition==='applied'&&!!(await serviceRow(id)).paid_at,{receipts});
 check('overlapping-recovery-no-new-charge',auths(before).length===0,{calls:calls.slice(before)});
});
console.log('SUMMARY:'+JSON.stringify({total:checks.length,failed:checks.filter(c=>c.result==='fail').map(c=>c.id)}));process.exit(checks.some(c=>c.result==='fail')?1:0);
