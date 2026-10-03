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

const webhook=async(payment:any,valid=true,eventId:string=crypto.randomUUID())=>{const raw=JSON.stringify({event_id:eventId,type:'payment.updated',data:{object:{payment}}});const sig=createHmac('sha256','fixture-signature').update(env.PUBLIC_BASE_URL+'/api/square/webhook'+raw).digest('base64');const r=await app.request('/api/square/webhook',{method:'POST',headers:{'content-type':'application/json','x-square-hmacsha256-signature':valid?sig:'invalid'},body:raw});return {status:r.status,body:await r.json()}};
const serviceRow=async(id:string)=>(await db.query<any>('SELECT * FROM service_orders WHERE id=$1',[id]))[0];
async function paidFixture(id:string,amount:number,service=true){
 const table=service?'service_orders':'orders';const row=(await db.query<any>('SELECT * FROM '+table+' WHERE id=$1',[id]))[0];
 const payment={id:'captured-'+id,order_id:row.square_order_id,status:'COMPLETED',location_id:env.SQUARE_LOCATION_ID,amount_money:{amount,currency:'USD'}};
 payments.set(payment.id,payment);hostedLedger.set(row.square_order_id,{id:row.square_order_id,reference_id:id,location_id:env.SQUARE_LOCATION_ID,state:'COMPLETED',tenders:[{id:payment.id,payment_id:payment.id}]});return payment;
}
const {clientSeries}=await import(R+'/server/routes-portal.ts');
async function legacy(owner:string,name:string,kind='series'){
 const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,llc_name,details,amount_cents,square_order_id) VALUES($1,$2,$3,$4,'Fixture LLC',$5,5000,$6)",[id,client,owner,kind,JSON.stringify({seriesName:name,...(kind==='ein'?{target:'series'}:{})}),'square-'+id]);return id;
}
const forms=(owner:string,suffix:string)=>[suffix,owner+', '+suffix,owner+' - '+suffix,owner+' '+suffix,owner.replace(',','')+' - '+suffix,owner.replace('LLC','L.L.C.')+' '+suffix];
await test('boundaries',async()=>{
 for(const owner of ['Fixture, LLC','ACME_%, LLC',"O’Neil & Sons, LLC",'The PS Company, LLC']){
  for(const id of ['A','AN','THE','7','001','1','A-B','A B','ASP.S.en']){
   const keys:string[]=[];for(const name of forms(owner,'PS '+id)){
    const [row]=await db.query<{key:string}>('SELECT purchase_series_key($1,$2) AS key',[name,owner]);keys.push(row.key);
   }
   check('key:'+owner+':'+id,keys.every(k=>k===id.toLowerCase()),{keys});
  }
 }
 for(const name of ['Fixture LLCX - PS A','Other LLC - PS A','FixtureX LLC PS A']){
  const [row]=await db.query<{key:string}>('SELECT purchase_series_key($1,$2) AS key',[name,'Fixture LLC']);check('foreign-prefix:'+name,row.key!=='a',row);
 }
});
for(const stored of forms('Fixture, LLC','PS A')) await test('workflow:'+stored,async()=>{
 const owner=await company();await db.query("UPDATE orders SET llc_name='Fixture, LLC',payload=jsonb_set(payload,'{series}',$2::jsonb) WHERE id=$1",[owner,JSON.stringify([{name:stored}])]);
 const beforeCalls=calls.length;
 for(const suffix of ['PS A','P.S. A','Protected Series A']){
  const response=await request('portal/services/series?company='+owner,{suffix});check('owned:'+stored+':'+suffix,response.status===400&&response.body.error.code==='ALREADY_ORDERED',{response});
 }
 check('no-provider-checkout:'+stored,calls.length===beforeCalls,{calls:calls.slice(beforeCalls)});
 const old=await legacy(owner,'Fixture LLC PS A'),payment=await paidFixture(old,5000);await webhook(payment);await webhook(payment);
 const receipt=await db.query('SELECT * FROM checkout_payment_receipts WHERE payment_id=$1',[payment.id]);
 const alerts=await db.query('SELECT * FROM payment_alerts WHERE alert_key=$1',['duplicate:'+payment.id]);
 check('old-link-refund:'+stored,receipt.length===1&&receipt[0].disposition==='refund_required'&&(await serviceRow(old)).status==='duplicate_payment'&&alerts.length===1,{receipt,alerts});
 const ein=await request('portal/services/ein?company='+owner,{target:'series',seriesName:'Fixture, LLC - Protected Series A'});
 check('ein-owned-alias:'+stored,ein.status===200,{ein});
 if(ein.status===200){
  const sid=ein.body.data.serviceOrderId;
  const einRow=await serviceRow(sid);const names=await clientSeries(client,owner);
  check('ein-recorded-name:'+stored,einRow.details.seriesName===names[0].name,{einName:einRow.details.seriesName,recorded:names[0].name});
  const second=await request('portal/services/ein?company='+owner,{target:'series',seriesName:stored});check('ein-reuse:'+stored,second.status===200&&second.body.data.serviceOrderId===sid,{second});
  await webhook(await paidFixture(sid,5000));
  const again=await request('portal/services/ein?company='+owner,{target:'series',seriesName:'PS A'});check('ein-paid-refused:'+stored,again.status===400&&again.body.error.code==='ALREADY_ORDERED',{again});
  const listed=await clientSeries(client,owner);check('ein-status:'+stored,listed.length===1&&listed[0].einOrdered&&!listed[0].name.includes('Fixture, LLC - Fixture'),{listed});
 }
 const other=await request('portal/services/series?company='+owner,{suffix:'PS B'});check('distinct:'+stored,other.status===200,{other});
 const unknown=await request('portal/services/ein?company='+owner,{target:'series',seriesName:'PS Unknown'});check('unknown-ein:'+stored,unknown.status===400&&unknown.body.error.code==='UNKNOWN_SERIES',{unknown});
 const saved=await db.query<{payload:{series:{name:string}[]}}>('SELECT payload FROM orders WHERE id=$1',[owner]);check('stored-name-preserved:'+stored,saved[0].payload.series[0].name===stored,{saved});
});
await test('pending-and-payments',async()=>{
 const owner=await company();await db.query("UPDATE orders SET llc_name='Fixture, LLC' WHERE id=$1",[owner]);
 const pending=await legacy(owner,'Fixture LLC PS 7');
 await db.query('UPDATE service_orders SET checkout_url=$2 WHERE id=$1',[pending,'https://fixture.invalid/checkout/'+pending]);
 const requests=await Promise.all(['PS 7','Protected Series 7','P.S. 7'].map(suffix=>request('portal/services/series?company='+owner,{suffix})));
 check('old-pending-reused',requests.every(r=>r.status===200&&r.body.data.serviceOrderId===pending),{requests});
 const other=await legacy(owner,'Fixture, LLC - PS 7');
 const p1=await paidFixture(pending,5000),p2=await paidFixture(other,5000);await Promise.all([webhook(p1),webhook(p2)]);
 const receipts=await db.query('SELECT * FROM checkout_payment_receipts WHERE service_order_id=ANY($1::uuid[])',[[pending,other]]);
 check('concurrent-payments-one-work-one-refund',receipts.length===2&&receipts.filter(r=>r.disposition==='applied').length===1&&receipts.filter(r=>r.disposition==='refund_required').length===1,{receipts});
 check('payment-identities-preserved',receipts.some(r=>r.payment_id===p1.id)&&receipts.some(r=>r.payment_id===p2.id),{receipts});
 const otherCompany=await company();const allowed=await request('portal/services/series?company='+otherCompany,{suffix:'PS 7'});check('separate-company',allowed.status===200,{allowed});
});
console.log('SUMMARY:'+JSON.stringify({total:checks.length,failed:checks.filter(c=>c.result==='fail').map(c=>c.id)}));process.exit(checks.some(c=>c.result==='fail')?1:0);
