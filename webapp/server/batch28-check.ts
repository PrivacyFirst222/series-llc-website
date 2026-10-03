/** Batch28: real routes and failure paths in a fresh offline database. */
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const oldBaseline='00663979fc6559eda50d3de9317f42a52de46953';
function baselineMode(): boolean {
 const requested=process.env.BATCH28_BASELINE_COMMIT;
 if(!requested)return false;
 const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:import.meta.dir,encoding:'utf8'}).trim();
 if(requested!==oldBaseline||actual!==requested)throw Error('Batch28 baseline mode requires its exact pre-repair commit');
 console.log('Explicit Batch28 baseline compatibility: '+actual);
 return true;
}
const historicalBaseline=baselineMode();
const prefix='B28:';
const results:{label:string;ok:boolean;detail:unknown}[]=[];
const check=(label:string,ok:boolean,detail:unknown={})=>{results.push({label,ok,detail});console.log(prefix+JSON.stringify({label,ok,detail}));};
async function child(){
 const {app}=await import('./app'),{getDb}=await import('./db'),{env}=await import('./env'),{newToken,encryptSecret}=await import('./crypto');
 const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline proof refused');
 const db=await getDb(),query=db.query.bind(db);let failMail=false;
 const mails:{to:string[];subject:string;html:string}[]=[];
 globalThis.fetch=(async(url:RequestInfo|URL,init?:RequestInit)=>{if(String(url)!=='https://api.resend.com/emails')throw Error('Unexpected external call '+url);mails.push(JSON.parse(String(init?.body)));return failMail?new Response('Injected mail outage',{status:503}):Response.json({id:'fixture'});}) as typeof fetch;
 env.RESEND_API_KEY='fixture';env.ADMIN_NOTIFY_EMAIL='office@example.test';
 const admin=newToken(),client=newToken(),cid=crypto.randomUUID();
 await query("INSERT INTO clients(id,email,name) VALUES($1,'current@example.test','Test Client')",[cid]);
 await query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
 await query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[client.tokenHash,cid]);
 const req=(path:string,body?:unknown,as='admin')=>app.request('/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:as==='admin'?`fpsllc_admin=${admin.token}`:as==='client'?`fpsllc_session=${client.token}`:'',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const company=async(name:string,renewal='2030-06-01')=>{const id=crypto.randomUUID();const payload={filingPath:'NEW',llcName:{finalName:name},registeredAgent:{choice:'SERVICE',renewalCardConsent:true},management:{structure:'MEMBER_MANAGED'},principalOfficeAddress:{address1:'100 Main Street',city:'Orlando',state:'FL',zip:'32803'},members:{memberList:[{firstName:'Test',lastName:'Client'}]},series:[]};await query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Test Client','old@example.test','NEW',$3,$4,0,0,0,'formed',now(),now(),'2026-01-01',$5,'old-customer','old-card','on_file','1111')",[id,cid,name,JSON.stringify(payload),renewal]);return id;};
 const {runRenewals,addDays}=await import('./renewals');const {RA_CANCEL_DAYS}=await import('../src/lib/agentBilling');
 const renewal='2030-06-01',co=await company('Notice Test LLC',renewal);
 await runRenewals(addDays(renewal,-71));const before=await query('SELECT * FROM ra_renewals WHERE order_id=$1',[co]);
 failMail=true;await runRenewals(addDays(renewal,-70));const failed=await query('SELECT * FROM ra_renewals WHERE order_id=$1',[co]);
 failMail=false;await runRenewals(addDays(renewal,-69));const recovered=await query('SELECT * FROM ra_renewals WHERE order_id=$1',[co]);
 const late=await company('Late Notice LLC');await runRenewals(addDays(renewal,-59));const held=await query('SELECT * FROM ra_renewals WHERE order_id=$1',[late]);
 check('A06',RA_CANCEL_DAYS===30&&!before.length&&failed[0]?.status==='notice_pending'&&!!failed[0]?.notice_error&&!!recovered[0]?.notice_sent_at&&!recovered[0]?.billing_hold&&held[0]?.billing_hold===false&&!!held[0]?.notice_sent_at&&mails.some(m=>m.html.includes('$99')),{before,failed,recovered,held});
 // A durable contact receipt must survive notification failure; retry sends the same message.
 failMail=true;const contact=await req('/contact',{name:'Message Sender',email:'sender@example.test',message:'Please record this one message.'},'none');const [stored]=await query<{id:string;notice_status:string}>('SELECT * FROM contact_messages');failMail=false;
 const retry=stored?await req(`/admin/contact-messages/${stored.id}/resend`,{}):null;const contacts=await query<{notice_status:string}>('SELECT * FROM contact_messages');
 check('A03',contact.status===200&&contacts.length===1&&stored?.notice_status==='failed'&&retry?.status===200&&contacts[0].notice_status==='sent',{status:contact.status,stored,contacts});
 // Existing legal mail, current address, no duplicate document upload.
 const {PDFDocument}=await import('@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],'mail.pdf',{type:'application/pdf'}));form.set('submissionId',crypto.randomUUID());form.set('clientId',cid);form.set('orderId',co);form.set('kind','legal_mail');form.set('title','Service of process');form.set('receivedOn','2026-09-20');
 failMail=true;const upload=await req('/admin/documents',form);const uploaded=await upload.json();const [mailDoc]=await query('SELECT * FROM documents WHERE id=$1',[uploaded.data?.id]);failMail=false;await query("UPDATE clients SET email='updated@example.test' WHERE id=$1",[cid]);
 const resend=await req(`/admin/documents/${uploaded.data?.id}/resend-notice`,{});const [afterMail]=await query('SELECT * FROM documents WHERE id=$1',[uploaded.data?.id]);const forbidden=await req(`/admin/documents/${uploaded.data?.id}/resend-notice`,{},'client');
 check('A02',upload.status===200&&uploaded.data?.notified===false&&mailDoc?.notice_status==='failed'&&(await resend.json()).data?.notified===true&&afterMail?.notice_recipient==='updated@example.test'&&afterMail?.storage_key===mailDoc?.storage_key&&forbidden.status===401,{mailDoc,afterMail,forbidden:forbidden.status});
 // Actual nonpayment resignation, distinct from annual debt, with replay-safe single fee.
 const resign=await company('Nonpayment LLC');await query("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose) VALUES($1,'2030-06-01',9900,'declined','renewal')",[resign]);
 const {easternDateIso}=await import('./datetime');const today=easternDateIso();const noNote=await req(`/admin/orders/${resign}/agent`,{action:'submitted',date:today,reason:'nonpayment'});
 const submitted=await req(`/admin/orders/${resign}/agent`,{action:'submitted',date:today,reason:'nonpayment',note:'Unpaid invoice retained in office record'});await req(`/admin/orders/${resign}/agent`,{action:'submitted',date:today,reason:'nonpayment',note:'Same record'});
 const fees=await query<{purpose:string;amount_cents:number}>('SELECT * FROM ra_renewals WHERE order_id=$1',[resign]);check('A04',noNote.status===400&&submitted.status===200&&fees.filter(r=>r.purpose==='resignation'&&r.amount_cents===9900).length===1&&fees.filter(r=>r.purpose==='renewal').length===1,{noNote:noNote.status,submitted:submitted.status,fees});
 // Late cancellation survives the already-paid anniversary advancing.
 const cancel=await company('Late Cancel LLC',addDays(today,370));await query("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose,charged_at) VALUES($1,$2,9900,'charged','renewal',now())",[cancel,addDays(today,5)]);await req('/portal/registered-agent/cancel',{company:cancel},'client');const companies=await(await req('/portal/companies',undefined,'client')).json();const cancelView=companies.data?.find((r:{orderId:string})=>r.orderId===cancel);
 const officeCancel=await company('Office Cancel LLC',addDays(today,370));await query("INSERT INTO ra_renewals(order_id,renewal_date,amount_cents,status,purpose,charged_at) VALUES($1,$2,9900,'charged','renewal',now())",[officeCancel,addDays(today,5)]);await req(`/admin/orders/${officeCancel}/agent`,{action:'cancellation',date:today,note:'Client email retained'});const officeView=(await(await req('/portal/companies',undefined,'client')).json()).data.find((r:{orderId:string})=>r.orderId===officeCancel);
 const portal=readFileSync(join(import.meta.dir,'../src/pages/portal/PortalDashboard.tsx'),'utf8');check('A05',officeView?.raCancellationLate===true&&cancelView?.raCancellationLate===true&&cancelView?.renewals.some((r:{status:string})=>r.status==='charged')&&mails.some(m=>m.html.includes('full annual renewal fee remains due'))&&portal.indexOf('data-testid="renewal-line"')>portal.indexOf('company.raCancellationLate'),{cancelView,officeView});
 await query("UPDATE orders SET ra_cancellation_requested_at=now(),ra_ended_date=$2 WHERE id=$1",[co,addDays(today,10)]);const ended=await company('Ended LLC');await query("UPDATE orders SET ra_cancellation_requested_at=now(),ra_ended_date=$2 WHERE id=$1",[ended,addDays(today,-1)]);const cl=(await(await req('/admin/clients')).json()).data.find((r:{id:string})=>r.id===cid);
 check('A07',!!cl.ra_cancellation_requested_at&&cl.ra_llcs.some((n:string)=>n.includes('Notice Test LLC')&&n.includes('cancellation requested'))&&!cl.ra_llcs.some((n:string)=>n.includes('Ended LLC')),cl.ra_llcs);
 // Store-only route, replay, consent, ownership and failed card preserving prior.
 const cardCo=await company('Card Test LLC');const cardURL=`/portal/companies/${cardCo}/renewal-card`;const attempt=crypto.randomUUID();const notConsent=await req(cardURL,{attemptId:attempt,source:'offline-credit'},'client');const unauth=await req(cardURL,{attemptId:attempt,source:'offline-credit',consent:true},'none');
 const oldProd=env.isProd;env.isProd=true;const missingProvider=await req(cardURL,{attemptId:attempt,source:'offline-credit',consent:true},'client');env.isProd=oldProd;
 const cardBefore=(await query('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[cardCo]))[0];const prepaid=await req(cardURL,{attemptId:crypto.randomUUID(),source:'offline-prepaid',consent:true},'client');const afterBad=(await query('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[cardCo]))[0];
 const saved=await req(cardURL,{attemptId:attempt,source:'offline-credit',consent:true},'client');const replay=await req(cardURL,{attemptId:attempt,consent:true},'client');const afterGood=(await query('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[cardCo]))[0];
 if(saved.status!==200){check('A10',false,{defect:'No standalone card-update route',status:saved.status});}else{
 // Exercise the production Square request shape through a transport double,
 // including an accepted provider request whose response is lost.
 const mailFetch=globalThis.fetch,requests:{path:string;body:Record<string,unknown>}[]=[];
 let lose=true,hold=false,entered:()=>void=()=>{},unblock:()=>void=()=>{};
 const enteredPromise=new Promise<void>(r=>{entered=r}),holdPromise=new Promise<void>(r=>{unblock=r});
 env.SQUARE_ACCESS_TOKEN='fixture-square-token';
 globalThis.fetch=(async(url:RequestInfo|URL,init?:RequestInit)=>{
  const path=new URL(String(url)).pathname;if(path!=='/v2/cards')throw Error('Unexpected Square endpoint '+path);
  const body=JSON.parse(String(init?.body));requests.push({path,body});
  if(hold){entered();await holdPromise;}
  if(lose){lose=false;throw Error('Provider stored card, response lost');}
  return Response.json({card:{id:'fixture-card-'+body.idempotency_key,last_4:'9876',card_brand:'VISA',prepaid_type:'NOT_PREPAID',enabled:true}});
 }) as typeof fetch;
 const transportAttempt=crypto.randomUUID();const lost=await req(cardURL,{attemptId:transportAttempt,source:'fixture-token',consent:true},'client');
 const lostCard=(await query('SELECT square_card_id FROM orders WHERE id=$1',[cardCo]))[0];
 await query("UPDATE clients SET name='Changed account name',email='changed@example.test' WHERE id=$1",[cid]);
 const transportRetry=await req(cardURL,{attemptId:transportAttempt,consent:true},'client');
 const consistent=JSON.stringify(requests[0])===JSON.stringify(requests[1]);
 // A second pending attempt cannot replace or charge anything while the first is in flight.
 hold=true;const concurrentId=crypto.randomUUID();const inFlight=req(cardURL,{attemptId:concurrentId,source:'fixture-next-token',consent:true},'client');await enteredPromise;
 const parallel=await req(cardURL,{attemptId:crypto.randomUUID(),source:'different-token',consent:true},'client');
 unblock();const completed=await inFlight;hold=false;
 const foreignId=crypto.randomUUID();await query("INSERT INTO clients(id,email,name) VALUES($1,'foreign@example.test','Foreign Client')",[foreignId]);const foreignCompany=await company('Foreign Company');await query('UPDATE orders SET client_id=$2 WHERE id=$1',[foreignCompany,foreignId]);
 const foreign=await req(`/portal/companies/${foreignCompany}/renewal-card`,{attemptId:crypto.randomUUID(),source:'fixture-token',consent:true},'client');
 const stableCard=(await query('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[cardCo]))[0];await req(cardURL,{attemptId:transportAttempt,consent:true},'client');const afterOldReplay=(await query('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[cardCo]))[0];
 globalThis.fetch=mailFetch;env.SQUARE_ACCESS_TOKEN='';
 check('A10',missingProvider.status===503&&notConsent.status===400&&unauth.status===401&&prepaid.status===400&&JSON.stringify(cardBefore)===JSON.stringify(afterBad)&&saved.status===200&&replay.status===200&&afterGood.square_card_id!==cardBefore.square_card_id&&String(afterGood.ra_renewal_date)===String(cardBefore.ra_renewal_date)&&lost.status===503&&lostCard.square_card_id===afterGood.square_card_id&&transportRetry.status===200&&consistent&&parallel.status===409&&completed.status===200&&foreign.status===404&&JSON.stringify(stableCard)===JSON.stringify(afterOldReplay)&&requests.every(r=>r.path==='/v2/cards'),{statuses:[missingProvider.status,notConsent.status,unauth.status,prepaid.status,saved.status,replay.status,lost.status,transportRetry.status,parallel.status,completed.status,foreign.status],cardBefore,afterBad,afterGood,stableCard,consistent,requests});
 }
 const so=async(age:number,status='in_progress')=>{const id=crypto.randomUUID();await query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,ein_secret,created_at,fulfilled_at) VALUES($1,$2,$3,'s-election',$4,'Card Test LLC',9500,$5,$6,now()-$7::int*interval '1 day',CASE WHEN $4='fulfilled' THEN now()-interval '15 days' ELSE NULL END)",[id,cid,cardCo,status,JSON.stringify({shareholders:[{name:'Test Client',ssnLast4:'6789'}],phone:'4075550100'}),encryptSecret('["123456789"]'),age]);return id;};
 const expired=await so(91),fresh=await so(10),delivered=await so(91,'fulfilled');const {purgeExpiredSElections}=await import('./routes-portal');await purgeExpiredSElections();const states=await query<{id:string;ein_secret:string|null;details:Record<string,unknown>}>('SELECT id,ein_secret,details FROM service_orders');const x=states.find(r=>r.id===expired),y=states.find(r=>r.id===fresh),z=states.find(r=>r.id===delivered);
 check('A11',x?.ein_secret===null&&x.details.taxpayerNumbersRequired===true&&x.details.phone==='4075550100'&&!JSON.stringify(x.details).includes('6789')&&!!y?.ein_secret&&z?.ein_secret===null,{expired:x,freshHasSecret:!!y?.ein_secret,deliveredHasSecret:!!z?.ein_secret});
 // The remaining probes exercise actual document storage and backup restore.
 const {putFile,readFileStream,readObject,deletionPath}=await import('./storage');
 const old=await putFile('old.pdf',bytes.buffer as ArrayBuffer,'application/pdf',true);const priorId=crypto.randomUUID();await query("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta) VALUES($1,$2,$3,'package','Prior S package',$4,'application/pdf',$5,'{\"sensitive\":true}')",[priorId,cid,cardCo,old.storageKey,bytes.length]);
 await query("UPDATE service_orders SET details=details||jsonb_build_object('documentId',$2::text) WHERE id=$1",[fresh,priorId]);
 const baseRows=await query('SELECT id FROM documents');let storageModule:typeof import('./s-election-package-storage')|null=null;try{storageModule=await import('./s-election-package-storage');}catch(error){if(!historicalBaseline)throw new Error('Required current package-storage module could not load', {cause:error});}
 if(storageModule && (typeof storageModule.storeElectionPackage!=='function'||typeof storageModule.cleanupStagedDocuments!=='function'))throw Error('Required current package-storage exports are missing');
 let replacementOk=!!storageModule;const observations:unknown[]=[];
 if(storageModule){
  const args={serviceId:fresh,clientId:cid,companyId:cardCo,title:'Replacement',pdf:Buffer.from(bytes),details:{phone:'4075550100'},ssns:['123456789'],priorDocumentId:priorId};
  for(const fault of ['upload','insert','order-update']){
   if(fault==='upload'){const staged=join(process.env.DEV_STORAGE_DIR!,'staged');mkdirSync(staged,{recursive:true});renameSync(staged,staged+'.hold');writeFileSync(staged,'blocked');}
   else {await query("CREATE OR REPLACE FUNCTION batch28_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected database write failure'; END $$");await query(`CREATE TRIGGER batch28_reject BEFORE ${fault==='insert'?'INSERT ON documents':'UPDATE ON service_orders'} FOR EACH ROW EXECUTE FUNCTION batch28_reject_write()`);}
   let refused=false;try{await storageModule.storeElectionPackage(db,args);}catch{refused=true;}finally{if(fault==='upload'){const staged=join(process.env.DEV_STORAGE_DIR!,'staged');rmSync(staged);renameSync(staged+'.hold',staged);}else{await query(`DROP TRIGGER batch28_reject ON ${fault==='insert'?'documents':'service_orders'}`);await query('DROP FUNCTION batch28_reject_write()');}}
   await storageModule.cleanupStagedDocuments();const rows=await query('SELECT id FROM documents');const still=await readFileStream(old.storageKey);const jobs=await query<{state:string;storage_path:string}>('SELECT state,storage_path FROM staged_documents');const clean=jobs.every(j=>j.state!=='cleanup'||!existsSync(join(process.env.DEV_STORAGE_DIR!,j.storage_path.replace(/^dev:/,''))));
   replacementOk&&=refused&&rows.length===baseRows.length&&still.equals(Buffer.from(bytes))&&clean;observations.push({fault,refused,count:rows.length,clean});
  }
  await query("UPDATE service_orders SET fulfilled_at=now()-interval '3 days' WHERE id=$1",[fresh]);const clockBefore=(await query('SELECT fulfilled_at FROM service_orders WHERE id=$1',[fresh]))[0].fulfilled_at;
  const newId=await storageModule.storeElectionPackage(db,args);const clockAfter=(await query('SELECT fulfilled_at FROM service_orders WHERE id=$1',[fresh]))[0].fulfilled_at;let staleRefused=false;try{await storageModule.storeElectionPackage(db,args);}catch{staleRefused=true;}replacementOk&&=String(clockBefore)===String(clockAfter)&&staleRefused;const [doc]=await query<{order_id:string;storage_key:string;meta:{sensitive:boolean}}>('SELECT * FROM documents WHERE id=$1',[newId]);const raw=await readObject(doc.storage_key);replacementOk&&=doc.order_id===cardCo&&doc.meta.sensitive&&!!raw?.toString().startsWith('FPSLLC-ENC-1')&&!!await readObject(deletionPath(old.storageKey));observations.push({newId,encrypted:raw?.toString().startsWith('FPSLLC-ENC-1'),clockPreserved:String(clockBefore)===String(clockAfter),staleRefused});
 }
 if(!storageModule){
  const {postSElectionPackage}=await import('./routes-portal');let injected=false;
  db.query=(async(text:string,params?:unknown[])=>{if(text.includes('UPDATE service_orders')&&text.includes('fulfilled_at')){injected=true;throw Error('Injected order-update failure');}return query(text,params);}) as typeof db.query;
  try{await postSElectionPackage({so:{id:fresh,client_id:cid,llc_name:'Card Test LLC'},priorDocumentId:priorId,merged:{ein:'12-3456789',dateIncorporated:'2026-09-01',officerName:'Test Client',officerTitle:'Manager',phone:'4075550100',shareholders:[{name:'Test Client',address:'100 Main Street, Orlando, FL 32803',percentage:100,dateAcquired:'2026-09-01',ssnLast4:'6789'}]},ssns:['123456789']});}catch{/* injected database failure */}finally{db.query=query;}
  const afterRows=await query('SELECT id FROM documents');replacementOk=injected&&afterRows.length===baseRows.length;observations.push({injected,clientDocumentsBefore:baseRows.length,clientDocumentsAfter:afterRows.length,defect:'Order-update failure leaves an unassociated delivered document'});
 }
 check('A09',replacementOk,observations);
 const {runDbBackup}=await import('./backup');const {requestDocumentDeletion}=await import('./document-retention');
 const kept=await putFile('kept.pdf',bytes.buffer as ArrayBuffer,'application/pdf',true),gone=await putFile('gone.pdf',bytes.buffer as ArrayBuffer,'application/pdf',true);const goneId=crypto.randomUUID();
 await query("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta)VALUES($1,$2,$3,'package','Delete later',$4,'application/pdf',$5,'{\"sensitive\":true}')",[goneId,cid,cardCo,gone.storageKey,bytes.length]);await query("INSERT INTO documents(client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta)VALUES($1,$2,'package','Keep me',$3,'application/pdf',$4,'{\"sensitive\":true}')",[cid,cardCo,kept.storageKey,bytes.length]);
 const backup=await runDbBackup();const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString());
 const deletedBefore=await requestDocumentDeletion(goneId,cid);const next=await runDbBackup();const nextDump=JSON.parse(gunzipSync((await readObject('backups/'+next.key))!).toString());
 check('A08',next.complete&&next.rowCounts.documents===nextDump.tables.documents.length&&nextDump.tables.documents.every((d:{id:string})=>d.id!==goneId),{counts:next.rowCounts,documents:nextDump.tables.documents.length});
 // A still-present old file must not be revived when primary storage is gone.
 const mirror=await import('./dropbox');const decision=(await(await import('./document-retention')).deletionJournal()).find(d=>d.documentId===goneId)!;if('compareWriteMirror' in mirror)await mirror.compareWriteMirror(decision.mirrorPath,Buffer.from(await readObject(kept.storageKey)||''),null);else {if(!historicalBaseline)throw Error('Current mirror API is missing');const path=join(process.env.DEV_MIRROR_DIR!,decision.mirrorPath.replace(/^\//,''));mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,Buffer.from(await readObject(kept.storageKey)||''));}

 // Empty target uses the exact migrated schema via a second child below.
 writeFileSync(join(process.env.BATCH28_DIR!,'dump.json'),JSON.stringify(dump));writeFileSync(join(process.env.BATCH28_DIR!,'want.json'),JSON.stringify({goneId,kept:kept.storageKey}));
 const oldRoot=process.env.DEV_STORAGE_DIR!;renameSync(oldRoot,oldRoot+'.lost');mkdirSync(oldRoot);
 const proc=Bun.spawn([process.execPath,import.meta.filename,'--restore'],{env:{...process.env,DEV_PG_DIR:join(process.env.BATCH28_DIR!,'restored')},stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);check('A01',deletedBefore&&code===0&&out.includes('RESTORE_OK'),{code,out,err});
}
async function restore(){
 const {getDb}=await import('./db'),{restoreBackup}=await import('./restore');const db=await getDb();const dump=JSON.parse(readFileSync(join(process.env.BATCH28_DIR!,'dump.json'),'utf8'));const want=JSON.parse(readFileSync(join(process.env.BATCH28_DIR!,'want.json'),'utf8'));
 const journal=join(process.env.DEV_MIRROR_DIR!,'recovery/deletion-journal-v1.json');if(!existsSync(journal)){try{await restoreBackup(db,dump);}catch(e){throw Error('Actual restore after primary loss: '+String(e));}const revived=await db.query('SELECT id FROM documents WHERE id=$1',[want.goneId]);throw Error('Restore after primary loss revived '+revived.length+' deleted document(s); no independent deletion journal consulted');}renameSync(journal,journal+'.hold');let missing=false;try{await restoreBackup(db,dump);}catch{missing=true;}renameSync(journal+'.hold',journal);if(!missing)throw Error('Missing journal accepted');
 // A syntactically valid journal can still omit a decision the snapshot knows.
 const original=readFileSync(journal);const parsed=JSON.parse(original.toString());
 const omitted=parsed.records.find((r:{documentId:string})=>r.documentId===want.goneId);
 if(!omitted)throw Error('Incomplete-journal fixture lacks the known deletion');
 const incomplete={...parsed,records:parsed.records.filter((r:{storageKey:string})=>r.storageKey!==omitted.storageKey)};
 incomplete.sha=createHash('sha256').update(JSON.stringify(incomplete.version>=2?{version:incomplete.version,records:incomplete.records,packages:incomplete.packages,...(incomplete.firstNoticeCutoff?{firstNoticeCutoff:incomplete.firstNoticeCutoff}:{}),...(incomplete.version===4?{copies:incomplete.copies}:{})}:incomplete.records)).digest('hex');
 const partialDump=structuredClone(dump);partialDump.deletionCheckpoint=[...(dump.deletionCheckpoint||[]),omitted.storageKey];
 const files=()=>readdirSync(process.env.DEV_STORAGE_DIR!,{recursive:true}).sort();
 const beforeFiles=JSON.stringify(files());let writes=0,refusal='';const realQuery=db.query.bind(db);
 db.query=(async(text:string,params?:unknown[])=>{if(/^\s*(INSERT|UPDATE|DELETE)/i.test(text))writes++;return realQuery(text,params);}) as typeof db.query;
 writeFileSync(journal,JSON.stringify(incomplete));
 try{await restoreBackup(db,partialDump);}catch(e){refusal=String(e);}finally{db.query=realQuery;writeFileSync(journal,original);}
 if(!refusal.includes('Independent deletion journal is missing a recorded decision')||writes!==0||JSON.stringify(files())!==beforeFiles)throw Error('Incomplete journal did not stop restore before writes: '+JSON.stringify({refusal,writes}));
 console.log('INCOMPLETE_JOURNAL_REFUSED_BEFORE_WRITES');
 await restoreBackup(db,dump);if((await db.query('SELECT id FROM documents WHERE id=$1',[want.goneId])).length)throw Error('Deleted document revived');const {readFileStream}=await import('./storage');if(!(await readFileStream(want.kept)).length)throw Error('Retained document missing');console.log('RESTORE_OK');
}
export async function batch28Checks(report:(label:string,ok:boolean,detail?:unknown)=>void){
 const dir=mkdtempSync(join(tmpdir(),'batch28-'));try{const child=Bun.spawn([process.execPath,import.meta.filename,'--child'],{env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'files'),DEV_MIRROR_DIR:join(dir,'mirror'),BATCH28_DIR:dir},stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);const rows=out.split('\n').filter(l=>l.startsWith(prefix)).map(l=>JSON.parse(l.slice(prefix.length)));for(let n=1;n<=11;n++){const label='A'+String(n).padStart(2,'0'),r=rows.find(r=>r.label===label);report('batch28 '+label,r?.ok===true,r?.detail||{code,out,err});}if(process.env.BATCH28_EVIDENCE_DIR){mkdirSync(process.env.BATCH28_EVIDENCE_DIR,{recursive:true});writeFileSync(join(process.env.BATCH28_EVIDENCE_DIR,'runtime.json'),JSON.stringify({code,rows,out,err},null,2));}}finally{rmSync(dir,{recursive:true,force:true});}
}
if(import.meta.main){if(process.argv.includes('--child'))await child();else if(process.argv.includes('--restore'))await restore();else {let fail=0;await batch28Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)fail++;});process.exitCode=fail?1:0;}}
