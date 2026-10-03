/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures intentionally inspect untyped SQL rows and intercepted requests. */
import {mkdirSync,writeFileSync,mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const E=process.env.CHECK_OUTPUT_DIR||mkdtempSync(tmpdir()+'/chunk3-delivery-check-'),R=process.env.AUDIT_ROOT||resolve(import.meta.dir,'..'),run='r8-postgres',temp=E+'/fixtures/office-'+run+'-'+Date.now();mkdirSync(temp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/files',DEV_MIRROR_DIR:temp+'/mirror',ADMIN_PASSWORD:'fixture'});
const {mock}=await import('bun:test');
if(!process.env.R8_PG_MODULE)throw Error('Set R8_PG_MODULE to the isolated pg driver entry point');
const {Client}=await import(process.env.R8_PG_MODULE);
const pgName='r8_'+crypto.randomUUID().replace(/-/g,'');
const controller=new Client({connectionString:'postgres://adam@127.0.0.1:55483/postgres'});await controller.connect();await controller.query('CREATE DATABASE '+pgName);
const pgUrl='postgres://adam@127.0.0.1:55483/'+pgName;
const a=new Client({connectionString:pgUrl}),b=new Client({connectionString:pgUrl}),observer=new Client({connectionString:pgUrl});await Promise.all([a.connect(),b.connect(),observer.connect()]);
const queryA=async(sql:string,args:unknown[]=[])=>{const result=await a.query(sql,args);return result.rows;};
const queryB=async(sql:string,args:unknown[]=[])=>{const result=await b.query(sql,args);return result.rows;};
mock.module(Bun.resolveSync('@neondatabase/serverless',R),()=>({neon:()=>({query:(sql:string,args:any[]=[])=>queryA(sql,args)})}));
const {env}=await import(R+'/server/env.ts');env.DATABASE_URL=pgUrl;
const {app}=await import(R+'/server/app.ts'),{getDb}=await import(R+'/server/db.ts'),{newToken}=await import(R+'/server/crypto.ts');
const db:any=await getDb(),rawQuery=db.query.bind(db),proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof.offline||Object.entries(proof.externals).some(([key,value])=>key!=='database'&&Boolean(value)))throw Error('Offline isolation failed');
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(temp+'/files',temp+'/mirror',env):null;
const rows:any[]=[],mail:any[]=[],outside:string[]=[];let mailMode='ok';
globalThis.fetch=(async(input:any,init:any={})=>{const url=String(input);const providerResponse=await providers?.fetch(url,init);if(providerResponse)return providerResponse;if(url!=='https://api.resend.com/emails'){outside.push(url);throw Error('NETWORK REFUSED '+url)}const m=JSON.parse(init.body);if(mailMode==='fail')return new Response('Fixture outage',{status:503});mail.push(m);if(mailMode==='lost')throw Error('Fixture accepted but response lost');return Response.json({id:'mail-'+mail.length})}) as typeof fetch;env.RESEND_API_KEY='fixture';
function check(id:string,ok:boolean,observed:any={}){rows.push({id,result:ok?'pass':'fail',observed});console.log('CASE:'+JSON.stringify(rows.at(-1)));writeFileSync(E+'/office-'+run+'.json',JSON.stringify({proof,temp,rows},null,2));}
async function test(id:string,fn:()=>Promise<void>){try{await rawQuery('DELETE FROM rate_limits');await fn()}catch(e){check(id,false,{harnessError:String(e),stack:(e as Error).stack})}finally{await a.query('ROLLBACK');await b.query('ROLLBACK');db.query=rawQuery;mailMode='ok'}}
const admin=newToken(),user=newToken(),other=newToken(),client=crypto.randomUUID(),client2=crypto.randomUUID();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Current Client','current@example.test'),($2,'Other Client','other@example.test')",[client,client2]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);for(const [t,c]of[[user,client],[other,client2]])await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[t.tokenHash,c]);
const cookies={admin:'fpsllc_admin='+admin.token,client:'fpsllc_session='+user.token,other:'fpsllc_session='+other.token,none:''};
async function req(path:string,body?:any,actor:keyof typeof cookies='admin',method?:string){const multipart=body instanceof FormData;const r=await app.request('/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Cookie:cookies[actor],...(!multipart?{'content-type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});const bytes=new Uint8Array(await r.arrayBuffer());let data:any;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{data={bytes:bytes.length,head:new TextDecoder().decode(bytes.slice(0,8))}}return{status:r.status,body:data,bytes,headers:Object.fromEntries(r.headers)}}
const {PDFDocument}=await import(R+'/node_modules/@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([300,300]);const pdfBytes=await pdf.save();
function form(fields:any={},files:string[]=['file'],bytes:Uint8Array=pdfBytes){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,String(v));for(const k of files)f.set(k,new File([new Uint8Array(bytes)],k+'.pdf',{type:'application/pdf'}));return f}
async function company(opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Historical Client','old@example.test',$3,$4,$5,49900,12500,62400,$6,$7,$8)`,[id,opts.client||client,opts.package||'NEW',opts.name||'Office Audit LLC',JSON.stringify({filingPath:opts.package||'NEW',series:opts.series||[],optionalDocuments:opts.certs?{certificateOfStatus:true,certifiedCopy:true}:{},registeredAgent:{choice:'SELF'},...(opts.payload||{})}),opts.status||'paid',opts.unpaid?null:new Date().toISOString(),opts.status==='formed'?new Date().toISOString():null]);return id}
async function service(type:string,co:string|null,opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,paid_at,ein_secret) VALUES($1,$2,$3,$4,$5,'Office Audit LLC',5000,$6,$7,$8)`,[id,client,co,type,opts.status||'in_progress',JSON.stringify(opts.details||{}),opts.unpaid?null:new Date().toISOString(),opts.secret||null]);return id}
const opFor=async(id:string)=>(await rawQuery("SELECT * FROM office_operations WHERE kind='service' AND target_id=$1",[id]))[0];
const {rmSync}=await import('node:fs');
const {readObject}=await import(R+'/server/storage.ts');
const {hashBytes}=await import(R+'/server/dropbox.ts');
const {readRecoveryJournal}=await import(R+'/server/backup-deletions.ts');
const {unseal,isEncrypted}=await import(R+'/server/encryption.ts');
const {spawnSync}=await import('node:child_process');
const pgProof={database:pgName,connectionA:await queryA("SELECT pg_backend_pid() pid,current_setting('transaction_isolation') isolation,version() version"),connectionB:await queryB("SELECT pg_backend_pid() pid,current_setting('transaction_isolation') isolation")};console.log('POSTGRES:'+JSON.stringify(pgProof));
const pdf2=await PDFDocument.create();pdf2.addPage([360,450]);const correctedBytes=await pdf2.save();
function requireOk(r:any){if(r.status!==200)throw Error(JSON.stringify(r.body));return r.body.data;}
const detail=async(co:string)=>requireOk(await req('admin/orders/'+co));
async function seedPair(signed=true){
 const co=await company({status:'filed',payload:{certifications:{articlesSignedBy:signed?'SERVICE':'SELF'}}});
 requireOk(await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles'])));
 return co;
}
function correction(d:any,bytes=correctedBytes,number='L26000000002'){
 return form({documentNumber:number,documentId:d.articlesCorrection.documentId,revision:d.articlesCorrection.revision},['articles'],bytes);
}
async function freeze(op:any){
 const result:any={};
 for(const [slot,f]of Object.entries(op.files) as [string,any][]){
  const raw=await readObject(f.key);if(!raw)throw Error('Missing pre-fault original');const plain=isEncrypted(raw)?unseal(raw):raw;
  if(hashBytes(plain)!==f.sha||plain.length!==f.size)throw Error('Original fingerprint differs before damage');
  if(slot==='statement'){
   const path=temp+'/statement-'+op.id+'.pdf';writeFileSync(path,plain);
   const text=spawnSync('/opt/homebrew/bin/pdftotext',[path,'-'],{encoding:'utf8'});
   if(text.status!==0||!text.stdout.includes(String(op.payload.documentNumber)))throw Error('Generated Statement number not verified');
  }
  result[slot]={...f,raw:Buffer.from(raw),plain:Buffer.from(plain)};
 }
 return result;
}
async function exactDownloads(originals:any){
 const result:{slot:string;status:number;sha:string;expected:string;equal:boolean}[]=[];
 for(const [slot,f]of Object.entries(originals) as [string,any][]){const r=await req('portal/documents/'+f.id+'/download',undefined,'client');result.push({slot,status:r.status,sha:hashBytes(Buffer.from(r.bytes)),expected:hashBytes(f.plain),equal:r.status===200&&Buffer.from(r.bytes).equals(f.plain)});}
 return result;
}
const dbB={query:async<T=Record<string,unknown>>(sql:string,args:unknown[]=[])=>await queryB(sql,args) as T[]};
const {claimRetirement,persistRetirementSet,completeRetirement,releaseOfficeOperation,officeHash}=await import(R+'/server/office-operation.ts');
const {claimOfficeVerification,verifyOfficeDelivery}=await import(R+'/server/office-file-recovery.ts');
await test('PG-HISTORY-DELETION-COMMIT',async()=>{
 const {acknowledgeHistoryGap,historyId}=await import(R+'/server/office-history-recovery.ts'),{officeRecoveryTables}=await import(R+'/server/office-file-recovery.ts'),{officeFileIdentities,collectOfficeRecoverySources,recoveryTuple}=await import(R+'/server/office-recovery-sources.ts');
 const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const oldOp=await opFor(id),old=await freeze(oldOp);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:oldOp.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),tables=await officeRecoveryTables(db),i=officeFileIdentities(tables).get(old.upload.key)!;
 rmSync(temp+'/files/'+i.file.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const p of collectOfficeRecoverySources(i,await readRecoveryJournal(),tables.documents))rmSync(temp+'/mirror'+p,{force:true});
 let hit!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);let fired=false,settled=false,error:any;
 const gapDb={query:async<T>(q:string,p:unknown[]=[])=>{if(!fired&&q.includes('jsonb_build_object($3::text,$4::jsonb)')){fired=true;hit();await gate;}return await queryB(q,p) as T[];}};
 const before=mail.length,pending=acknowledgeHistoryGap(gapDb,historyId(i),officeHash(recoveryTuple(i)),'fixture').then(()=>{settled=true;},e=>{settled=true;error=e;});
 let locks:any[]=[],deleted:any,waiting=false;
 try{await Promise.race([ready,Bun.sleep(5000).then(()=>{throw Error('Gap commit barrier not reached')})]);await a.query('BEGIN');deleted=await req('portal/documents/'+live.upload.id,undefined,'client','DELETE');release();
  for(let n=0;n<50;n++){locks=(await observer.query('SELECT locktype,mode,granted FROM pg_locks WHERE pid=$1 AND NOT granted',[pgProof.connectionB[0].pid])).rows;if(locks.length)break;await Bun.sleep(10);}waiting=!settled&&locks.length>0;await a.query('COMMIT');await pending;
 }finally{release();await a.query('ROLLBACK');await pending;}
 const [saved]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[oldOp.id]),download=await req('portal/documents/'+live.upload.id+'/download',undefined,'client');
 check('PG-HISTORY-DELETION-COMMIT',fired&&waiting&&deleted.status===200&&error?.code==='DOCUMENT_DELETED'&&!saved.payload.historyRecovery?.upload&&download.status===404&&!await readObject(old.upload.key)&&!await readObject(live.upload.key)&&mail.length===before,{fired,waiting,locks,deleted:deleted?.status,error:String(error),code:error?.code,gap:saved.payload.historyRecovery?.upload,download:download.status,noticeDelta:mail.length-before,connections:pgProof});
});

await test('PG-RETIRE-CLAIM-WINNER',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let injected=false;
 db.query=async(sql:string,args:any[])=>{if(!injected&&sql.includes("SET phase='committed',result=jsonb_build_object('documentId',$3")){injected=true;throw Error('Stop unpublished attempt')}return rawQuery(sql,args)};
 const failed=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;const op=await opFor(id),frozen=await freeze(op),replacement={assignedEin:'881234561',notify:false,attachmentRequired:true},hash=officeHash(replacement);
 await a.query('BEGIN');await a.query('SELECT id FROM office_operations WHERE id=$1 FOR UPDATE',[op.id]);
 const held=await claimRetirement(db,op,hash,replacement);
 let loser:any,settled=false;const pending=claimRetirement(dbB,op,hash,replacement).then(v=>{loser=v;settled=true;},e=>{loser=e;settled=true;});
 let locks:any[]=[];for(let n=0;n<40;n++){locks=(await observer.query('SELECT pid,locktype,mode,granted FROM pg_locks WHERE pid=$1 AND NOT granted',[pgProof.connectionB[0].pid])).rows;if(locks.length)break;await Bun.sleep(10);}
 const waiting=!settled&&locks.length>0;await a.query('COMMIT');await pending;
 const before=await readRecoveryJournal();await persistRetirementSet(db,held);const journal=await readRecoveryJournal();const next=await completeRetirement(db,held);
 const [saved]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[op.id]);
 check('PG-RETIRE-CLAIM-WINNER',failed.status===500&&injected&&waiting&&loser instanceof Error&&next.phase==='open'&&saved.phase==='superseded'&&journal.records.some((r:any)=>r.storageKey===frozen.upload.key)&&before.records.every((r:any)=>r.storageKey!==frozen.upload.key),{failed:failed.status,waiting,locks,loser:String(loser),oldPhase:saved.phase,successor:next.id,connections:pgProof});
});
await test('PG-LEASE-EXPIRED',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let injected=false;
 db.query=async(sql:string,args:any[])=>{if(!injected&&sql.includes("SET phase='committed',result=jsonb_build_object('documentId',$3")){injected=true;throw Error('Stop before publication')}return rawQuery(sql,args)};
 await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;const op=await opFor(id),replacement={assignedEin:'881234561',notify:false,attachmentRequired:true},hash=officeHash(replacement),held=await claimRetirement(db,op,hash,replacement);
 await observer.query("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[op.id]);
 const [currentOp]=await dbB.query<any>('SELECT * FROM office_operations WHERE id=$1',[op.id]),winner=await claimRetirement(dbB,currentOp,hash,replacement),before=await readRecoveryJournal();let stale:any;
 try{await persistRetirementSet(db,held);}catch(e){stale=e;}
 const after=await readRecoveryJournal();await persistRetirementSet(dbB,winner);let staleCommit:any;try{await completeRetirement(db,held);}catch(e){staleCommit=e;}const next=await completeRetirement(dbB,winner);
 check('CLAIM-EXPIRE-postgres',stale instanceof Error&&staleCommit instanceof Error&&JSON.stringify(before)===JSON.stringify(after)&&next.phase==='open'&&next.id===winner.payload.retirement.successorId,{stale:String(stale),staleCommit:String(staleCommit),winnerLease:winner.lease,staleLease:held.lease,next:next.id});
});
await test('PG-DELETION-PROJECTION',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const frozen=await freeze(await opFor(id)),f=frozen.upload,before=mail.length;let fired=0;
 db.query=async(sql:string,args:any[])=>{const rows=await rawQuery(sql,args);if(!fired&&sql.includes('INSERT INTO document_deletions')){fired++;throw Error('Reply lost after deletion SQL commit')}return rows};
 const first=await req('portal/documents/'+f.id,undefined,'client','DELETE');db.query=rawQuery;
 const [seen]=await queryB(`SELECT d.deleted_at,s.details->>'documentDeletedAt' AS service_deleted,j.storage_key FROM documents d JOIN service_orders s ON s.id=$2 JOIN document_deletions j ON j.storage_key=d.storage_key WHERE d.id=$1`,[f.id,id]);
 const list=requireOk(await req('portal/documents',undefined,'client')),download=await req('portal/documents/'+f.id+'/download',undefined,'client'),retry=await req('portal/documents/'+f.id,undefined,'client','DELETE');
 check('PG-DELETION-PROJECTION',fired===1&&first.status===500&&!!seen.deleted_at&&!!seen.service_deleted&&!list.some((r:any)=>r.id===f.id)&&download.status===404&&retry.status===200&&!await readObject(f.key)&&mail.length===before,{first:first.status,observer:seen,download:download.status,retry:retry.status,noticeDelta:mail.length-before,connections:pgProof});
});
await test('PG-FILING-STALE-ARTICLES-CLAIM',async()=>{
 const co=await company({status:'filed',series:[{name:'PS 1'}],payload:{certifications:{articlesSignedBy:'SERVICE'}}});
 let release!:()=>void,reached!:()=>void;const blocked=new Promise<void>(r=>release=r),hit=new Promise<void>(r=>reached=r);let fired=0;
 db.query=async(q:string,p:any[])=>{if(q.includes('WITH owner AS (UPDATE orders SET office_upload_id=$5')&&fired++===0){reached();await blocked;}return queryA(q,p)};
 const initial=req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));
 await Promise.race([hit,Bun.sleep(5000).then(()=>{throw Error('Initial claim barrier not reached')})]);
 let formed:any;db.query=queryB;
 try{formed=await req('admin/orders/'+co+'/formation-documents',form({documentNumber:'L26000000002',psdSeries:JSON.stringify(['PS 1'])},['articles','psd'],correctedBytes));}finally{db.query=rawQuery;release();}
 const delayed=await initial,files=await queryB('SELECT * FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[co]),articles=files.filter((d:any)=>d.kind==='articles'),statements=files.filter((d:any)=>d.kind==='statement'),operations=await queryB("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]);
 const download=articles.length===1?await req('portal/documents/'+articles[0].id+'/download',undefined,'client'):null;
 check('PG-FILING-STALE-ARTICLES-CLAIM',formed.status===200&&delayed.status===409&&articles.length===1&&statements.length===1&&operations.length===0&&download?.status===200&&Buffer.from(download.bytes).equals(Buffer.from(correctedBytes)),{formed:formed.status,delayed:delayed.status,code:delayed.body?.error?.code,articles:articles.length,statements:statements.length,operations:operations.length,connections:pgProof});
});
await test('PG-PAIR-RETIREMENT-RESERVATION',async()=>{
 const co=await company({status:'filed',series:[{name:'PS 1'}],payload:{certifications:{articlesSignedBy:'SERVICE'}}});let fired=0;
 db.query=async(q:string,p:any[])=>{if(!fired&&q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fired++;throw Error('Initial pair unpublished')}return queryA(q,p)};
 const interrupted=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;const [u]=await queryA("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(u);
 if(interrupted.status!==500||fired!==1||Object.keys(old).length!==2)throw Error('Initial pair starting state not reached');
 const payload={documentNumber:'L26000000002',weSigned:true,existingId:null},hash=officeHash({documentNumber:payload.documentNumber,pdf:Buffer.from(correctedBytes).toString('base64')}),before=mail.length;
 // Persist the initial retiring claim, then pause its continuation under an
 // uncommitted owner update. Otherwise connection B sees the old open phase
 // and correctly refuses at the earlier Articles guard without reaching SQL.
 const initialClaim=await claimRetirement(db,u,hash,payload);await releaseOfficeOperation(db,initialClaim);
 await a.query('BEGIN');const held=await claimRetirement(db,initialClaim,hash,payload);let settled=false,formation:any;db.query=queryB;
 const waiting=req('admin/orders/'+co+'/formation-documents',form({documentNumber:'L26000000003',psdSeries:JSON.stringify(['PS 1'])},['articles','psd'])).then(r=>{formation=r;settled=true;});
 let locks:any[]=[],ownerTransaction:any;try{for(let n=0;n<80;n++){locks=(await observer.query("SELECT pid,locktype,mode,granted FROM pg_locks WHERE pid=$1 AND relation='orders'::regclass",[pgProof.connectionA[0].pid])).rows;ownerTransaction=(await observer.query('SELECT pid,state,xact_start FROM pg_stat_activity WHERE pid=$1',[pgProof.connectionA[0].pid])).rows[0];if(settled)break;await Bun.sleep(10);}}finally{await a.query('COMMIT');await waiting;db.query=rawQuery;}
 const [reserved]=await queryB('SELECT status,office_upload_id FROM orders WHERE id=$1',[co]),beforeDocuments=await queryB('SELECT id FROM documents WHERE order_id=$1',[co]);
 await persistRetirementSet(db,held);const v=await completeRetirement(db,held),[transferred]=await queryB('SELECT status,office_upload_id FROM orders WHERE id=$1',[co]);
 const delivered=await req('admin/orders/'+co+'/articles',form({documentNumber:payload.documentNumber},['articles'],correctedBytes)),[done]=await queryA("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),live=await freeze(done),docs=await queryB('SELECT id,kind FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[co]);
 check('PG-PAIR-RETIREMENT-RESERVATION',locks.some(l=>l.granted&&l.mode==='RowExclusiveLock')&&ownerTransaction?.state==='idle in transaction'&&!!ownerTransaction.xact_start&&formation.status===409&&reserved.status==='filed'&&reserved.office_upload_id===u.id&&beforeDocuments.length===0&&transferred.office_upload_id===v.id&&delivered.status===200&&done.id===v.id&&docs.length===2&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{locks,ownerTransaction,formation:formation.body,reserved,transferred,delivered:delivered.status,docs,noticeDelta:mail.length-before,connections:pgProof});
});

await test('PG-PAIR-RESERVATION',async()=>{
 const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
 const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length;
 const held=await claimOfficeVerification(dbB,op);rmSync(temp+'/files/'+originals.statement.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));
 const refused=await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003'));
 await verifyOfficeDelivery(dbB,held);await releaseOfficeOperation(dbB,held);
 const downloads=await exactDownloads(originals),[saved]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[op.id]);
 check('PG-PAIR-RESERVATION',refused.status===409&&refused.body.error?.code==='OFFICE_BUSY'&&downloads.every(r=>r.equal)&&saved.phase==='done'&&mail.length===before,{refused:refused.body,downloads,phase:saved.phase,noticeDelta:mail.length-before,connections:pgProof});
});
await test('ALIAS-GAP-RACE-postgres',async()=>{
 const {acknowledgeHistoryGap,restoreHistoricalOriginal,historyId}=await import(R+'/server/office-history-recovery.ts'),{officeRecoveryTables}=await import(R+'/server/office-file-recovery.ts'),{officeFileIdentities,collectOfficeRecoverySources,recoveryTuple}=await import(R+'/server/office-recovery-sources.ts');
 const co=await seedPair();requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(op);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
 const tables=await officeRecoveryTables(db),i=officeFileIdentities(tables).get(old.statement.key)!,j=await readRecoveryJournal();rmSync(temp+'/files/'+i.file.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const path of collectOfficeRecoverySources(i,j,tables.documents))rmSync(temp+'/mirror'+path,{force:true});
 let arrive!:()=>void,unpause!:()=>void;const reached=new Promise<void>(r=>arrive=r),gate=new Promise<void>(r=>unpause=r);let held=false;
 db.query=async(q:string,p:any[])=>{if(!held&&q.includes("SET payload=jsonb_set(payload,'{historyRecovery}'")){held=true;arrive();await gate;}return rawQuery(q,p)};
 const before=mail.length,first=acknowledgeHistoryGap(db,historyId(i),officeHash(recoveryTuple(i)),'fixture A').then(value=>({value}),error=>({error:String(error),code:error.code}));
 await Promise.race([reached,Bun.sleep(4000).then(()=>{throw Error('Gap claim not reached')})]);
 await observer.query("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[op.id]);
 const bQuery=dbB.query;let bArrive!:()=>void,bRelease!:()=>void;const bReached=new Promise<void>(r=>bArrive=r),bGate=new Promise<void>(r=>bRelease=r);let bPaused=false;
 dbB.query=async<T>(q:string,p:unknown[]=[])=>{const rows=await bQuery<T>(q,p);if(!bPaused&&q.includes('SELECT o.id FROM office_operations o')){bPaused=true;bArrive();await bGate;}return rows;};
 const winner=restoreHistoricalOriginal(dbB,historyId(i),old.statement.plain).then(value=>({value}),error=>({error:String(error),code:error.code}));
 const paused=await Promise.race([bReached.then(()=>true),winner.then(()=>false)]);unpause();const stale=await first;db.query=rawQuery;
 const [reserved]=await observer.query('SELECT office_upload_id FROM orders WHERE id=$1',[co]).then(r=>r.rows);bRelease();const second=await winner;dbB.query=bQuery;
 const [saved]=await rawQuery('SELECT phase,payload FROM office_operations WHERE id=$1',[op.id]),raw=await readObject(i.file.key),plain=raw?(isEncrypted(raw)?unseal(raw):raw):null;
 check('ALIAS-GAP-RACE-postgres','error' in stale&&stale.code==='OFFICE_BUSY'&&'value' in second&&saved.phase==='superseded'&&paused&&reserved.office_upload_id===op.id&&!saved.payload.historyRecovery?.statement&&plain?.equals(old.statement.plain)&&mail.length===before,{stale,second,paused,reserved,phase:saved.phase,gap:saved.payload.historyRecovery,exact:plain?.equals(old.statement.plain),noticeDelta:mail.length-before,connections:pgProof});
});
for(const boundary of ['intent-readback','archive','install'])await test('HG-RESTART-CRASH-'+boundary,async()=>{
 const {runDbBackup}=await import(R+'/server/backup.ts'),{officeRecoveryTables}=await import(R+'/server/office-file-recovery.ts'),{officeFileIdentities,collectOfficeRecoverySources}=await import(R+'/server/office-recovery-sources.ts'),{historyId}=await import(R+'/server/office-history-recovery.ts');
 const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op),tables=await officeRecoveryTables(db),i=officeFileIdentities(tables).get(old.statement.key)!;
 rmSync(temp+'/files/'+i.file.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const p of collectOfficeRecoverySources(i,await readRecoveryJournal(),tables.documents))rmSync(temp+'/mirror'+p,{force:true});
 const b1=await runDbBackup({dispatchAttention:false});if(b1.complete)throw Error('B1 should need current Statement');requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
 const before=mail.length,continued=await runDbBackup({resumeOnly:true,dispatchAttention:false}),jobBytes=await readObject('backup-jobs/current.json'),job=jobBytes?JSON.parse(jobBytes.toString()):{key:continued.key,errors:{}};
 check('HG-FROZEN-CURRENT-'+boundary,!continued.complete&&job.key===b1.key&&job.errors[i.file.key]?.startsWith('SNAPSHOT_CURRENT_FILE_MISSING')&&!await readObject('backups/'+b1.key),{continued,key:job.key,error:job.errors[i.file.key]});
 if(continued.complete)return;
 const stem=E+'/restart-'+boundary,intent='backup-jobs/restarts/'+b1.key+'.json',archive='backup-jobs/abandoned/'+b1.key+'.json',body={expectedJobKey:b1.key,historyId:historyId(i),acknowledge:true},spec={database:pgName,files:temp+'/files',mirror:temp+'/mirror',boundary,intent,archive,body,output:stem+'-frozen-intent.json'};writeFileSync(stem+'-input.json',JSON.stringify(spec));
 const killed=spawnSync(process.execPath,[R+'/server/chunk3-r8-crash-worker.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',killed.stdout+killed.stderr);if(killed.signal!=='SIGKILL')throw Error('Crash worker did not reach boundary: '+killed.stdout+killed.stderr);
 const frozen=JSON.parse(readFileSync(spec.output,'utf8'));await rawQuery("UPDATE backup_progress SET lease_until=now()-interval '1 second' WHERE id='database'");
 const retry=await req('admin/backups/restart-after-history-change',body),twice=await req('admin/backups/restart-after-history-change',body),saved=JSON.parse((await readObject('backup-jobs/current.json'))!.toString()),abandoned=await readObject(archive),[progress]=await rawQuery("SELECT started_at FROM backup_progress WHERE id='database'");
 check('HG-RESTART-CRASH-'+boundary,retry.status===202&&twice.status===202&&saved.key===frozen.successor.key&&saved.dump.dumpedAt===frozen.successor.dump.dumpedAt&&abandoned?.equals(Buffer.from(JSON.stringify(frozen.oldJob)))&&JSON.stringify(saved.dump.tables)===JSON.stringify(frozen.successor.dump.tables)&&!await readObject('backups/'+b1.key)&&new Date(progress.started_at).toISOString()===frozen.successor.dump.dumpedAt&&mail.length===before,{signal:killed.signal,retry:retry.status,twice:twice.status,key:saved.key,expectedKey:frozen.successor.key,dumpedAt:saved.dump.dumpedAt,startedAt:progress.started_at,noticeDelta:mail.length-before});
 if(retry.status!==202||twice.status!==202)return;
 const completed=await runDbBackup({resumeOnly:true,dispatchAttention:false});if(completed.status!=='complete_with_history_gaps')throw Error('Successor did not complete with disclosed gap');
});
check('network-isolated',outside.length===0,{outside});
await Promise.all([a.end(),b.end(),observer.end(),controller.end()]);
process.exit(rows.some(r=>r.result==='fail')?1:0);
