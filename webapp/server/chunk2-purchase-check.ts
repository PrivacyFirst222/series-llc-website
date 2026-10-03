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
const {newToken}=await import(R+'/server/crypto.ts'),{runRenewals}=await import(R+'/server/renewals.ts');
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
 await db.query("UPDATE orders SET status='parked' WHERE status='formed'");
 const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Fixture Client','old@example.test','NEW','Fixture LLC',$3,49900,12500,62400,$4,$5,$6,$7,'customer','card','on_file','1234')",[id,client,JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SERVICE',renewalCardConsent:true},series:[],optionalDocuments:{}}),opts.status||'formed',opts.status==='pending_payment'?null:new Date().toISOString(),opts.appointment||'2025-09-01',opts.date||'2027-09-01']);return id;
}
const oo=async(id:string)=>(await db.query<any>('SELECT *,ra_renewal_date::text AS date FROM orders WHERE id=$1',[id]))[0];
const auths=(n:number)=>calls.slice(n).filter(c=>c.path==='/v2/payments');
const webhook=async(payment:any,valid=true,eventId:string=crypto.randomUUID())=>{const raw=JSON.stringify({event_id:eventId,type:'payment.updated',data:{object:{payment}}});const sig=createHmac('sha256','fixture-signature').update(env.PUBLIC_BASE_URL+'/api/square/webhook'+raw).digest('base64');const r=await app.request('/api/square/webhook',{method:'POST',headers:{'content-type':'application/json','x-square-hmacsha256-signature':valid?sig:'invalid'},body:raw});return {status:r.status,body:await r.json()}};
const {defaultFormData}=await import(R+'/src/components/forms/florida-llc/defaults.ts');
  const words = ['Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Ginkgo', 'Hazel', 'Ironwood', 'Juniper', 'Kapok', 'Larch', 'Maple', 'Nutmeg', 'Olive', 'Pine', 'Quince', 'Rowan', 'Spruce', 'Tamarind'];
  let ordn = 0;
  const orderData = (email: string, o: { ra?: 'SERVICE' | 'SELF'; convert?: boolean; series?: number; ein?: boolean; se?: boolean; cert?: boolean; copy?: boolean; consent?: boolean } = {}) => {
    const n = ordn++; const nm = `Audit ${words[n % 20]} ${words[Math.floor(n / 20) % 20]} Billing`;
    const series = Array.from({ length: o.series ?? 1 }, (_, i) => ({ id: 's' + i, name: `${nm}, LLC, PS ${String.fromCharCode(65 + i)}` }));
    return { ...structuredClone(defaultFormData), filingPath: o.convert ? 'CONVERT' : 'NEW', ...(o.convert ? { existingLlcName: nm + ', LLC', sunbizDocumentNumber: 'L26000' + String(100000 + n).slice(-6), conversionAuthorityAcknowledgment: true } : {}), isFloridaDomesticEntityOnly: true, notLegalAdvice: true, publicRecordNotice: true,
      desiredLlcName: nm, llcDesignator: 'LLC', alternateName1: nm + ' Backup', nameSearchAcknowledgment: true, governmentAffiliationAcknowledgment: true, lawfulPurposeNameAcknowledgment: true,
      principalAddress: { address1: '100 Ocean Drive', address2: '', city: 'Miami', state: 'FL', zip: '33139', country: 'United States' },
      registeredAgentChoice: o.ra ?? 'SELF', raRenewalCardConsent: o.consent ?? (o.ra === 'SERVICE'), registeredAgentType: 'INDIVIDUAL', registeredAgentFirstName: 'Casey', registeredAgentLastName: 'Member', registeredAgentSuffix: 'Jr.',
      registeredAgentStreetAddress1: '100 Ocean Drive', registeredAgentCity: 'Miami', registeredAgentState: 'FL', registeredAgentZip: '33139', registeredAgentNotSameAsLlc: true, registeredAgentPhysicalAddressAcknowledgment: true,
      registeredAgentResidencyAcknowledgment: true, registeredAgentExistingRecordAcknowledgment: true, registeredAgentSeriesAgreementAcknowledgment: true, registeredAgentAcceptanceCheckbox: true,
      registeredAgentAcceptanceName: 'Casey Member, Jr.', registeredAgentAcceptanceCapacity: 'INDIVIDUAL_AGENT', registeredAgentElectronicSignature: 'Casey Member, Jr.', registeredAgentSignatureAuthorizationCheckbox: true, managementStructure: 'MEMBER_MANAGED',
      members: [{ ...structuredClone(defaultFormData.members[0]), firstName: 'Casey', lastName: 'Member', suffix: 'Jr.', address1: '100 Ocean Drive', city: 'Miami', state: 'FL', zip: '33139' }],
      purposeType: 'GENERAL', effectiveDateOption: 'FILED_BY_DIVISION', clientFirstName: 'Casey', clientLastName: 'Member', clientSuffix: 'Jr.',
      clientAddress: { address1: '100 Ocean Drive', address2: '', city: 'Miami', state: 'FL', zip: '33139', country: 'United States' }, clientEmail: email, confirmClientEmail: email,
      correspondentName: 'Casey Member, Jr.', correspondentEmail: email, confirmCorrespondentEmail: email, series, seriesOwnershipAcknowledgment: true,
      authorizedRepresentativeName: 'Casey Member, Jr.', authorizedRepresentativeSignature: 'Casey Member, Jr.', authorizedRepresentativeSignatureCheckbox: true, atLeastOneMemberAcknowledgment: true,
      accuracyAcknowledgment: true, addressAccuracyAcknowledgment: true, termsOfServiceAcknowledgment: true, orderEin: !!o.ein, orderSElection: !!o.se, sElectionFilingAcknowledgment: !!o.se,
      orderCertificateOfStatus: !!o.cert, orderCertifiedCopy: !!o.copy, publicRecordAcknowledgment: true, legalAdviceAcknowledgment: true };
  };


const serviceRow=async(id:string)=>(await db.query<any>('SELECT * FROM service_orders WHERE id=$1',[id]))[0];
async function paidFixture(id:string,amount:number,service=true){
 const table=service?'service_orders':'orders';const row=(await db.query<any>('SELECT * FROM '+table+' WHERE id=$1',[id]))[0];
 const payment={id:'captured-'+id,order_id:row.square_order_id,status:'COMPLETED',location_id:env.SQUARE_LOCATION_ID,amount_money:{amount,currency:'USD'}};
 payments.set(payment.id,payment);hostedLedger.set(row.square_order_id,{id:row.square_order_id,reference_id:id,location_id:env.SQUARE_LOCATION_ID,state:'COMPLETED',tenders:[{id:payment.id,payment_id:payment.id}]});return payment;
}
for(const [type,body,amount] of [['ein',{target:'company'},5000],['ein',{target:'series',seriesName:'Fixture LLC - PS A'},5000],['s-election',{},9500],['certificate',{kind:'certificate-of-status'},1500],['certificate',{kind:'certified-copy'},4000],['series',{suffix:'PS B'},5000]] as const)await test('purchase-'+type+'-'+JSON.stringify(body),async()=>{
 const o=await company();await db.query(`UPDATE orders SET formed_at=now(),payload=jsonb_set(payload,'{series}','[{"name":"PS A"}]'::jsonb) WHERE id=$1`,[o]);
 const path=`portal/services/${type}?company=${o}`;
 const result=await Promise.all([request(path,body),request(path,body)]);
 const ids=result.map(r=>r.body.data?.serviceOrderId);
 check('same-checkout-'+type+'-'+JSON.stringify(body),result.every(r=>r.status===200)&&!!ids[0]&&ids[0]===ids[1],result);
 if(!ids[0])throw Error('First purchase failed');
 const payment=await paidFixture(ids[0],amount);
 const paid=await Promise.all([webhook(payment),webhook(payment)]);
 const row=await serviceRow(ids[0]);
 check('one-paid-work-'+type+'-'+JSON.stringify(body),paid.every(r=>r.status===200)&&['awaiting_info','in_progress'].includes(row.status),{paid,row});
 const after=await request(path,body);check('no-paid-repurchase-'+type+'-'+JSON.stringify(body),after.status===400,after);
 if(type==='certificate'){
  await db.query("UPDATE service_orders SET status='fulfilled',fulfilled_at=now() WHERE id=$1",[ids[0]]);
  const next=await request(path,body);check('certificate-reorder-'+JSON.stringify(body),next.status===200&&next.body.data.serviceOrderId!==ids[0],next);
 }
});
await test('series-existing',async()=>{
 const o=await company();await db.query(`UPDATE orders SET payload=jsonb_set(payload,'{series}','[{"name":"PS Existing"}]'::jsonb) WHERE id=$1`,[o]);
 for(const suffix of ['PS Existing','ps existing',' PS   Existing ']){const r=await request('portal/services/series?company='+o,{suffix});check('formation-series-'+suffix,r.status===400,r);}
 const other=await company();const r=await request('portal/services/series?company='+other,{suffix:'PS Existing'});check('different-company-allowed',r.status===200,r);
});
await test('duplicate-refusals-preserve-allowance',async()=>{
 const o=await company();await db.query(`UPDATE orders SET payload=jsonb_set(payload,'{series}','[{"name":"PS Existing"}]'::jsonb) WHERE id=$1`,[o]);
 const refusals:Awaited<ReturnType<typeof request>>[]=[];for(let i=0;i<21;i++)refusals.push(await request('portal/services/series?company='+o,{suffix:'PS Existing'}));
 const next=await request('portal/services/series?company='+o,{suffix:'PS New'});
 check('duplicate-refusals-do-not-consume-purchase-allowance',refusals.every(r=>r.status===400)&&next.status===200,{refusals:refusals.map(r=>r.status),newPurchase:next.status});
});
await test('lost-link',async()=>{
 const o=await company();lostLink=true;const n=links.size;
 const r=await request('portal/services/ein?company='+o,{target:'company'});const retry=await request('portal/services/ein?company='+o,{target:'company'});
 check('lost-link-one-provider-identity',r.status===200&&retry.status===200&&r.body.data.serviceOrderId===retry.body.data.serviceOrderId&&links.size===n+1,{r,retry,created:links.size-n});
});
await test('legacy-links',async()=>{
 const o=await company();const a=await request('portal/services/ein?company='+o,{target:'company'});const id=a.body.data.serviceOrderId;
 const [legacy]=await db.query<any>(`INSERT INTO service_orders(client_id,formation_order_id,type,llc_name,details,amount_cents,square_order_id) SELECT client_id,formation_order_id,type,llc_name,details,amount_cents,'old-square-'||id::text FROM service_orders WHERE id=$1 RETURNING *`,[id]);
 const one=await paidFixture(id,5000),two=await paidFixture(legacy.id,5000);
 await Promise.all([webhook(one),webhook(two)]);
 const rows=await db.query<any>('SELECT status FROM service_orders WHERE id=ANY($1::uuid[])',[[id,legacy.id]]);
 check('legacy-one-work-one-refund',rows.filter(r=>r.status==='awaiting_info').length===1&&rows.filter(r=>r.status==='duplicate_payment').length===1,rows);
 const receipts=await db.query<any>('SELECT * FROM checkout_payment_receipts WHERE service_order_id=ANY($1::uuid[])',[[id,legacy.id]]);
 check('legacy-both-payments-accounted',receipts.length===2&&receipts.some(r=>r.disposition==='refund_required'),receipts);
 const dup=(await db.query<any>("SELECT id FROM service_orders WHERE id=ANY($1::uuid[]) AND status='duplicate_payment'",[[id,legacy.id]]))[0];
 const fulfill=dup?await request('admin/services/'+dup.id+'/fulfill',{}):null;check('duplicate-cannot-start-work',fulfill?.status===404,fulfill);
});

await test('legacy-link-reuse',async()=>{
 const o=await company();const path='portal/services/ein?company='+o;const first=await request(path,{target:'company'});const id=first.body.data.serviceOrderId,n=links.size;
 await db.query('UPDATE service_orders SET checkout_url=NULL,checkout_request=NULL WHERE id=$1',[id]);
 const second=await request(path,{target:'company'});
 check('legacy-provider-link-reused',second.status===200&&second.body.data.serviceOrderId===id&&second.body.data.checkoutUrl===first.body.data.checkoutUrl&&links.size===n,{first,second,linksAdded:links.size-n});
});
await test('payment-record-rollback',async()=>{
 const o=await company();const r=await request('portal/services/ein?company='+o,{target:'company'});const id=r.body.data.serviceOrderId,p=await paidFixture(id,5000);
 await db.query(`CREATE FUNCTION c2_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'C2_INJECTED_DB_FAILURE'; END $$`);
 await db.query('CREATE TRIGGER c2_fault BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION c2_fault()');
 let failed;try{failed=await webhook(p,true,'fault-'+id);}finally{await db.query('DROP TRIGGER c2_fault ON service_orders');}
 const before=await serviceRow(id),receipts=await db.query('SELECT * FROM checkout_payment_receipts WHERE payment_id=$1',[p.id]);
 check('payment-atomic-rollback',failed.status===500&&before.status==='pending_payment'&&receipts.length===0,{failed,beforeStatus:before.status,receipts});
 const retry=await webhook(p,true,'fault-'+id);check('payment-retry-after-rollback',retry.status===200&&(await serviceRow(id)).status==='awaiting_info',retry);
});
for(const fault of ['amount','currency','location','order','provider-down'])await test('provider-verification-'+fault,async()=>{
 const o=await company();const r=await request('portal/services/ein?company='+o,{target:'company'});const id=r.body.data.serviceOrderId,p=await paidFixture(id,5000);
 if(fault==='amount')p.amount_money.amount=1;
 if(fault==='currency')p.amount_money.currency='EUR';
 if(fault==='location')p.location_id='foreign-location';
 if(fault==='order')p.order_id='foreign-order';
 if(fault==='provider-down')hostedLedger.delete(p.order_id);
 const recovery=await import(R+'/server/checkout-recovery.ts');await recovery.checkCheckout('service',id);
 const blocked=await serviceRow(id);check('refuse-provider-'+fault,blocked.status==='pending_payment'&&!!blocked.payment_check_error,{status:blocked.status,error:blocked.payment_check_error});
 const good=await paidFixture(id,5000);await db.query('UPDATE service_orders SET payment_check_after=NULL WHERE id=$1',[id]);
 await recovery.checkCheckout('service',id);check('recover-after-provider-'+fault,(await serviceRow(id)).status==='awaiting_info',{payment:good,status:(await serviceRow(id)).status});
});
await test('webhook-recovery-race',async()=>{
 const o=await company();const r=await request('portal/services/ein?company='+o,{target:'company'});const id=r.body.data.serviceOrderId,p=await paidFixture(id,5000),n=mail.length;
 const recovery=await import(R+'/server/checkout-recovery.ts');await Promise.all([webhook(p),recovery.checkCheckout('service',id),recovery.checkCheckout('service',id)]);
 const receipts=await db.query('SELECT * FROM checkout_payment_receipts WHERE service_order_id=$1',[id]);
 check('webhook-recovery-single-fulfillment',receipts.length===1&&(await serviceRow(id)).status==='awaiting_info'&&mail.length-n===1,{receipts,messages:mail.length-n});
});
await test('portal-return-priority-and-ownership',async()=>{
 const o=await company();await db.query('UPDATE orders SET formed_at=now() WHERE id=$1',[o]);
 const r=await request('portal/services/ein?company='+o,{target:'company'}),id=r.body.data.serviceOrderId;
 await paidFixture(id,5000);
 for(let i=0;i<4;i++)await request('portal/services/series?company='+o,{suffix:'PS Pending '+i});
 const other=await company();await db.query('UPDATE orders SET formed_at=now() WHERE id=$1',[other]);
 const wrong=await request('portal/services?company='+other+'&paid='+id);
 check('return-id-cannot-cross-selected-company',wrong.status===200&&(await serviceRow(id)).status==='pending_payment',{status:wrong.status,purchaseStatus:(await serviceRow(id)).status});
 const correct=await request('portal/services?company='+o+'&paid='+id);
 check('return-prioritizes-paid-purchase-over-newer-checkouts',correct.status===200&&(await serviceRow(id)).status==='awaiting_info',{status:correct.status,purchaseStatus:(await serviceRow(id)).status});
});
await test('payment-alert-delivery',async()=>{
 const recovery=await import(R+'/server/checkout-recovery.ts');const old=env.ADMIN_NOTIFY_EMAIL;env.ADMIN_NOTIFY_EMAIL='office@example.test';
 try {
  const bad=await webhook({id:'bad-signature'},false);
  let [alert]=await db.query<any>("SELECT * FROM payment_alerts WHERE alert_key='webhook-signature'");
  check('signature-rejection-creates-durable-office-alert',bad.status===401&&!!alert,{status:bad.status,alert:!!alert});
  mailFail=true;await recovery.deliverPaymentAlerts();
  [alert]=await db.query<any>("SELECT * FROM payment_alerts WHERE alert_key='webhook-signature'");
  check('failed-alert-remains-retryable',!alert.sent_at&&!alert.lease_until,alert);
  mailFail=false;const n=mail.length;await recovery.deliverPaymentAlerts();
  [alert]=await db.query<any>("SELECT * FROM payment_alerts WHERE alert_key='webhook-signature'");
  const sent=mail.length;await recovery.deliverPaymentAlerts();
  check('alert-retry-delivers-once',!!alert.sent_at&&sent>n&&mail.length===sent,{sent:!!alert.sent_at,messages:sent-n,repeated:mail.length-sent});
 }finally{env.ADMIN_NOTIFY_EMAIL=old;}
});
await test('recovery-job-authentication',async()=>{
 const old=env.CRON_SECRET;env.CRON_SECRET='fixture-cron';
 try {const no=await app.request('/api/cron/payment-recovery');const yes=await app.request('/api/cron/payment-recovery',{headers:{Authorization:'Bearer fixture-cron'}});
 check('recovery-job-requires-configured-secret',no.status===401&&yes.status===200,{withoutSecret:no.status,withSecret:yes.status});
 }finally{env.CRON_SECRET=old;}
});
await test('initial-no-attempt-no-charge',async()=>{
 const r=await request('orders',orderData('no-attempt@example.test',{ra:'SERVICE'}));const n=calls.length,id=r.body.data.orderId;
 const recovery=await import(R+'/server/checkout-recovery.ts');await recovery.checkCheckout('order',id);
 check('initial-check-never-starts-new-charge',auths(n).length===0&&(await oo(id)).status==='pending_payment',{authorizations:auths(n).length});
});
for(const kind of ['formation','ein'])await test('lost-webhook-'+kind,async()=>{
 let id:string,amount:number;
 if(kind==='formation'){
   const placed=await request('orders',orderData('current@example.test',{ra:'SELF'}));
   check(kind+'-created-real-checkout',placed.status===200&&!!placed.body.data?.checkoutUrl,placed);
   id=placed.body.data.orderId;amount=placed.body.data.totalCents;
 }else{
   const o=await company({date:'2027-09-26'});await db.query('UPDATE orders SET formed_at=now() WHERE id=$1',[o]);
   const placed=await request('portal/services/ein?company='+o,{target:'company'});
   check(kind+'-created-real-checkout',placed.status===200&&!!placed.body.data?.checkoutUrl,placed);
   id=placed.body.data.serviceOrderId;amount=placed.body.data.totalCents;
 }
 const table=kind==='formation'?'orders':'service_orders';
 const before=(await db.query<any>('SELECT id,status,square_order_id FROM '+table+' WHERE id=$1',[id]))[0];
 const payment={id:'captured-'+id,order_id:before.square_order_id,status:'COMPLETED',location_id:env.SQUARE_LOCATION_ID,reference_id:id,amount_money:{amount,currency:'USD'}};
 payments.set(payment.id,payment);
 hostedLedger.set(before.square_order_id,{id:before.square_order_id,state:'COMPLETED',location_id:env.SQUARE_LOCATION_ID,reference_id:id,total_money:payment.amount_money,tenders:[{id:payment.id,payment_id:payment.id,amount_money:payment.amount_money}]});
 const ledger=await (await fetch('https://connect.squareupsandbox.com/v2/orders/'+before.square_order_id)).json();
 check(kind+'-provider-independently-confirms-paid',ledger.order.state==='COMPLETED'&&ledger.order.tenders[0].payment_id===payment.id,{ledger,payment});
 const n=calls.length;
 const statusPolls:any[]=[];
 if(kind==='formation')for(let i=0;i<3;i++)statusPolls.push(await request('orders/'+id+'/status'));
 else for(let i=0;i<3;i++)statusPolls.push(await request('portal/services'));
 await runRenewals('2026-09-26');await runRenewals('2026-09-27');await runRenewals('2026-09-28');
 const board=await request('admin/orders?pageSize=500');
 const detail=await request(kind==='formation'?'admin/orders/'+id:'admin/services/'+id);
 const after=(await db.query<any>('SELECT id,status,paid_at FROM '+table+' WHERE id=$1',[id]))[0];
 const lookup=calls.slice(n).filter(x=>x.path.includes('/v2/orders/')||x.path.includes('/v2/payments/'));
 check(kind+'-lost-notification-payment-recovered',!!after.paid_at,{before,after,statusPolls,detail,boardContains:JSON.stringify(board).includes(id),providerLookupCount:lookup.length,providerState:hostedLedger.get(before.square_order_id)});
 const delivered=await webhook(payment,true,'delivered-'+id);
 const paid=(await db.query<any>('SELECT id,status,paid_at FROM '+table+' WHERE id=$1',[id]))[0];
 const detailPaid=await request(kind==='formation'?'admin/orders/'+id:'admin/services/'+id);
 const replay=await webhook(payment,true,'delivered-'+id);
 check(kind+'-same-payment-notification-control',delivered.status===200&&!!paid.paid_at&&detailPaid.status===200&&replay.body.data?.duplicate===true,{delivered,paid,detailPaidStatus:detailPaid.status,replay});
 check(kind+'-no-additional-charge-created',calls.slice(n).filter(x=>x.path==='/v2/payments'&&x.method==='POST').length===0,{calls:calls.slice(n)});
});

await test('agent-captured-client-leaves',async()=>{
 const placed=await request('orders',orderData('agent-current@example.test',{ra:'SERVICE'}));
 if(placed.status!==200)throw Error(JSON.stringify(placed));
 const u=new URL(placed.body.data.checkoutUrl),id=u.searchParams.get('id')!,token=u.searchParams.get('token')!;
 const path='agent-checkout/order/'+id+'?token='+token;
 failAction='complete';const n=calls.length;
 const paidRequest=await request(path,{sourceId:'cnon:fixture-card',consent:true});
 const providerPayment=[...payments.values()].find(p=>p.reference_id===id);
 check('agent-provider-captured-despite-lost-response',providerPayment?.status==='COMPLETED',{paidRequest,providerPayment});
 await runRenewals('2026-09-26');await runRenewals('2026-09-27');await runRenewals('2026-09-28');
 const after=await oo(id);const detail=await request('admin/orders/'+id);
 check('agent-abandoned-paid-order-recovered',!!after.paid_at,{status:after.status,paidAt:after.paid_at,detail,providerPayment});
 const resumed=await request(path,{sourceId:'cnon:fixture-card',consent:true});
 const afterResume=await oo(id);
 check('agent-client-return-positive-control',resumed.status===200&&!!afterResume.paid_at&&auths(n).length===1,{resumed,status:afterResume.status,paidAt:afterResume.paid_at,authorizationCalls:auths(n).length});
});
writeFileSync(E+'/provider-calls-'+run+'.json',JSON.stringify(calls,null,2));
console.log('SUMMARY:'+JSON.stringify({total:checks.length,failed:checks.filter(x=>x.result==='fail').map(x=>x.id)}));
process.exit(checks.some(x=>x.result==='fail')?1:0);
