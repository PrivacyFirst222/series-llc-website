/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures intentionally inspect untyped SQL rows and intercepted requests. */
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const E=process.env.CHECK_OUTPUT_DIR||mkdtempSync(tmpdir()+'/chunk3-delivery-check-'),R=process.env.AUDIT_ROOT||resolve(import.meta.dir,'..'),run='r8-'+(process.argv[2]||'pair'),temp=E+'/fixtures/office-'+run+'-'+Date.now();mkdirSync(temp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/files',DEV_MIRROR_DIR:temp+'/mirror',ADMIN_PASSWORD:'fixture'});
const {app}=await import(R+'/server/app.ts'),{env}=await import(R+'/server/env.ts'),{getDb}=await import(R+'/server/db.ts'),{newToken}=await import(R+'/server/crypto.ts');
const db:any=await getDb(),rawQuery=db.query.bind(db),proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof.offline||Object.values(proof.externals).some(Boolean))throw Error('Offline isolation failed');
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(temp+'/files',temp+'/mirror',env):null;
const rows:any[]=[],mail:any[]=[],outside:string[]=[],blockedBrowserRequests:string[]=[];let mailMode='ok';
const mailRequests:any[]=[],mailAccepted=new Map<string,{body:string;id:string}>();
globalThis.fetch=(async(input:any,init:any={})=>{
 const url=String(input);const providerResponse=await providers?.fetch(url,init);if(providerResponse)return providerResponse;if(url!=='https://api.resend.com/emails'){outside.push(url);throw Error('NETWORK REFUSED '+url)}
 const m=JSON.parse(init.body),key=new Headers(init.headers).get('Idempotency-Key');mailRequests.push({body:init.body,key});
 if(mailMode==='fail')return new Response('Fixture outage',{status:503});
 if(key&&mailAccepted.has(key)){const prior=mailAccepted.get(key)!;if(prior.body!==init.body)return new Response('idempotency payload conflict',{status:409});return Response.json({id:prior.id});}
 mail.push(m);const id='mail-'+mail.length;if(key)mailAccepted.set(key,{body:init.body,id});
 if(mailMode==='lost')throw Error('Fixture accepted but response lost');return Response.json({id});
}) as typeof fetch;env.RESEND_API_KEY='fixture';
function check(id:string,ok:boolean,observed:any={}){rows.push({id,result:ok?'pass':'fail',observed});console.log('CASE:'+JSON.stringify(rows.at(-1)));writeFileSync(E+'/office-'+run+'.json',JSON.stringify({proof,temp,rows},null,2));}
async function test(id:string,fn:()=>Promise<void>){try{await rawQuery('DELETE FROM rate_limits');await fn()}catch(e){check(id,false,{harnessError:String(e),stack:(e as Error).stack})}finally{db.query=rawQuery;mailMode='ok'}}
const admin=newToken(),user=newToken(),other=newToken(),client=crypto.randomUUID(),client2=crypto.randomUUID();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Current Client','current@example.test'),($2,'Other Client','other@example.test')",[client,client2]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);for(const [t,c]of[[user,client],[other,client2]])await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[t.tokenHash,c]);
const cookies={admin:'fpsllc_admin='+admin.token,client:'fpsllc_session='+user.token,other:'fpsllc_session='+other.token,none:''};
async function req(path:string,body?:any,actor:keyof typeof cookies='admin',method?:string){const multipart=body instanceof FormData;const r=await app.request('/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Cookie:cookies[actor],...(!multipart?{'content-type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});const bytes=new Uint8Array(await r.arrayBuffer());let data:any;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{data={bytes:bytes.length,head:new TextDecoder().decode(bytes.slice(0,8))}}return{status:r.status,body:data,bytes,headers:Object.fromEntries(r.headers)}}
const {PDFDocument}=await import(R+'/node_modules/@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([300,300]);const pdfBytes=await pdf.save();
function form(fields:any={},files:string[]=['file'],bytes:Uint8Array=pdfBytes){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,String(v));for(const k of files)f.set(k,new File([new Uint8Array(bytes)],k+'.pdf',{type:'application/pdf'}));return f}
async function company(opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Historical Client','old@example.test',$3,$4,$5,49900,12500,62400,$6,$7,$8)`,[id,opts.client||client,opts.package||'NEW',opts.name||'Office Audit LLC',JSON.stringify({filingPath:opts.package||'NEW',series:opts.series||[],optionalDocuments:opts.certs?{certificateOfStatus:true,certifiedCopy:true}:{},registeredAgent:{choice:'SELF'},...(opts.payload||{})}),opts.status||'paid',opts.unpaid?null:new Date().toISOString(),opts.status==='formed'?new Date().toISOString():null]);return id}
async function service(type:string,co:string|null,opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,paid_at,ein_secret) VALUES($1,$2,$3,$4,$5,'Office Audit LLC',5000,$6,$7,$8)`,[id,client,co,type,opts.status||'in_progress',JSON.stringify(opts.details||{}),opts.unpaid?null:new Date().toISOString(),opts.secret||null]);return id}
const docs=async(co:string)=>await db.query('SELECT * FROM documents WHERE order_id=$1 ORDER BY created_at,id',[co]);
const opFor=async(id:string)=>(await rawQuery("SELECT * FROM office_operations WHERE kind='service' AND target_id=$1",[id]))[0];
const {rmSync,writeFileSync:writeBytes}=await import('node:fs');
const {readObject,replaceStoredFile}=await import(R+'/server/storage.ts');
const {mirrorFile,hashBytes}=await import(R+'/server/dropbox.ts');
const {retryDocumentDeletions}=await import(R+'/server/document-retention.ts');
const {readRecoveryJournal,recordDocumentCopy,JOURNAL_PATH}=await import(R+'/server/backup-deletions.ts');
const {officeRecoveryTables}=await import(R+'/server/office-file-recovery.ts');
const {officeFileIdentities,collectOfficeRecoverySources}=await import(R+'/server/office-recovery-sources.ts');
const {unseal,isEncrypted}=await import(R+'/server/encryption.ts');
const {runDbBackup}=await import(R+'/server/backup.ts');
const {gunzipSync}=await import('node:zlib');
const {spawnSync}=await import('node:child_process');
const mode=process.argv[2]||'pair';
const {recoveryModes,recoveryBrowserModes}=await import('./chunk3-recovery-contract-check');
if(![...recoveryModes,...recoveryBrowserModes,'history-reopen-seed'].includes(mode))throw Error('Unknown recovery test mode: '+mode);
const pdf2=await PDFDocument.create();pdf2.addPage([360,450]);const correctedBytes=await pdf2.save();
function requireOk(r:any){if(r.status!==200)throw Error(JSON.stringify(r.body));return r.body.data;}
const current=async(co:string)=>(await docs(co)).filter((d:any)=>!d.deleted_at);
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
  const saved=E+'/originals/'+op.id;mkdirSync(saved,{recursive:true});writeFileSync(saved+'/'+slot+'.pdf',plain);writeFileSync(saved+'/'+slot+'.stored',raw);writeFileSync(saved+'/'+slot+'.json',JSON.stringify({id:f.id,key:f.key,sha:hashBytes(plain),size:plain.length},null,2));
 }
 return result;
}
async function exactDownloads(originals:any){
 const result:{slot:string;status:number;sha:string;expected:string;equal:boolean}[]=[];
 for(const [slot,f]of Object.entries(originals) as [string,any][]){const r=await req('portal/documents/'+f.id+'/download',undefined,'client');result.push({slot,status:r.status,sha:hashBytes(Buffer.from(r.bytes)),expected:hashBytes(f.plain),equal:r.status===200&&Buffer.from(r.bytes).equals(f.plain)});}
 return result;
}
async function pathsFor(key:string){const t=await officeRecoveryTables(db),i=officeFileIdentities(t).get(key);if(!i)throw Error('No original identity');return collectOfficeRecoverySources(i,await readRecoveryJournal(),t.documents);}
async function removeAll(f:any){const paths=await pathsFor(f.key);rmSync(temp+'/files/'+f.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const p of paths)rmSync(temp+'/mirror'+p,{force:true});return paths;}
async function restoreAll(f:any,paths:string[]){await replaceStoredFile(f.key,f.raw);for(const p of paths){await mirrorFile({storageKey:f.key,path:p});}}

let restoreSequence=0;
function originalRecords(frozen:any){return Object.entries(frozen).map(([slot,f]:[string,any])=>({slot,key:f.key,sha:hashBytes(f.plain),size:f.plain.length,id:f.id}));}
function restoreFixture(label:string,dump:any,originals:any[],downloads:any[],expectRefusal=false,resume?:any,attention?:any,claimRestore?:any,staleReview?:any){
 const sequence=++restoreSequence,stem=E+'/fresh-restore-'+sequence,spec={id:label,dump,target:temp+'/restore-'+sequence,mirror:temp+'/mirror',output:stem+'-result.json',client,originals,downloads,expectRefusal,resume,attention,claimRestore,staleReview};writeFileSync(stem+'-input.json',JSON.stringify(spec));
 const r=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:8*1024*1024});writeFileSync(stem+'.log',r.stdout+r.stderr);
 return {ok:r.status===0,status:r.status,evidence:stem+'.log',output:r.stdout,error:r.stderr};
}
if(mode==='older-readers')await test('OLDER-READERS',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const a=await opFor(id);let stopped=0;
 db.query=async(q:string,p:any[])=>{if(!stopped&&q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){stopped++;throw Error('Unpublished replacement B')}return rawQuery(q,p)};
 const failed=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:a.id},['file'],correctedBytes));db.query=rawQuery;const b=await opFor(id),discarded=await freeze(b);if(stopped!==1||failed.status!==500||b.phase!=='open')throw Error('Unpublished B not established');
 requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false,correctionOf:b.id},['file'],pdfBytes)));const live=await freeze(await opFor(id)),backup=await runDbBackup({dispatchAttention:false});if(!backup.complete)throw Error('Compatibility snapshot incomplete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()),journal=await readRecoveryJournal(),start=readFileSync(temp+'/mirror'+JOURNAL_PATH),notices=mail.length;
 if(journal.version!==4||!journal.records.some(r=>r.storageKey===discarded.upload.key&&r.documentId===live.upload.id)||discarded.upload.key===live.upload.key)throw Error('Shared ID retirement fixture not established');
 const base='/Users/adam/Documents/FLPSLLC Website Review',implementation=base+'/chunk-3-r8-implementation-2026-09-27';
 for(const stage of [3,4]){
  const reader=base+'/chunk-3-stage-5-claude-2026-09-27/evidence/fixtures/before-s'+stage+'/webapp',stem=E+'/old-stage'+stage,spec={stage,reader,dump,client,documentId:live.upload.id,target:temp+'/old-stage'+stage,mirror:temp+'/mirror',output:stem+'-result.json'};writeFileSync(stem+'-input.json',JSON.stringify(spec));const old=spawnSync(process.execPath,[implementation+'/scripts/old-restore-reader.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:8*1024*1024});writeFileSync(stem+'.log',old.stdout+old.stderr);
  const currentRestore=restoreFixture('OLDER-READER-Stage'+stage+'-current',dump,originalRecords(live),originalRecords(live)),after=readFileSync(temp+'/mirror'+JOURNAL_PATH);
  check('OLDER-READER-Stage'+stage,old.status===0&&currentRestore.ok&&start.equals(after)&&mail.length===notices,{oldExit:old.status,oldEvidence:stem+'-result.json',currentRestore,journalUnchanged:start.equals(after),noticeDelta:mail.length-notices});
 }
});

if(mode==='deletion-projection'){
 for(const family of ['ein','certificate-of-status'])for(const point of ['registration','hide','cleanup','before'])await test('DELETE-PROJECTION-'+family+'-'+point,async()=>{
  const co=await company({status:'formed'}),id=await service(family,co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));
  const op=await opFor(id),frozen=await freeze(op),f=frozen.upload,before=mail.length,[initialService]=await rawQuery('SELECT details FROM service_orders WHERE id=$1',[id]),linked=initialService.details.documentId===f.id;
  const actor=family==='ein'?'client':'admin',path=(actor==='client'?'portal':'admin')+'/documents/'+f.id;
  const re=point==='hide'?/UPDATE documents SET deleted_at=COALESCE/:point==='cleanup'?/UPDATE document_deletions SET completed_at=now\(\)/:/INSERT INTO document_deletions/;let fired=0;
  db.query=async(sql:string,args:any[])=>{if(!fired&&re.test(sql)){fired++;if(point!=='before')await rawQuery(sql,args);throw Error('Fixture '+point+' deletion reply failure')}return rawQuery(sql,args)};
  const first=await req(path,undefined,actor,'DELETE');db.query=rawQuery;
  const list=requireOk(await req('portal/documents',undefined,'client')),download=await req('portal/documents/'+f.id+'/download',undefined,'client'),[doc]=await rawQuery('SELECT deleted_at FROM documents WHERE id=$1',[f.id]),[so]=await rawQuery('SELECT details,ein_secret FROM service_orders WHERE id=$1',[id]);
  const retry=await req(path,undefined,actor,'DELETE'),[decision]=await rawQuery('SELECT completed_at FROM document_deletions WHERE storage_key=$1',[f.key]);
  check('DELETE-PROJECTION-'+family+'-'+point,fired===1&&(point==='before'?first.status===500:!list.some((d:any)=>d.id===f.id)&&!!doc.deleted_at&&(!linked||(!!so.details.documentDeletedAt&&so.ein_secret===null)))&&download.status===404&&retry.status===200&&!!decision.completed_at&&!await readObject(f.key)&&mail.length===before,{fired,first:first.status,listed:list.some((d:any)=>d.id===f.id),deletedAt:doc.deleted_at,serviceDeletedAt:so.details.documentDeletedAt,download:download.status,retry:retry.status,cleaned:!!decision.completed_at,noticeDelta:mail.length-before});
 });
 await test('DELETE-PROJECTION-SUPERSEDED-SHARED-ID',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const oldOp=await opFor(id),old=await freeze(oldOp);
  requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:oldOp.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),before=mail.length;
  const {appendDeletionMirror}=await import(R+'/server/backup-deletions.ts');await appendDeletionMirror({storageKey:old.upload.key,documentId:old.upload.id,mirrorPath:old.upload.mirrorPath,requestedAt:new Date().toISOString(),reason:'superseded'});await retryDocumentDeletions({documentId:old.upload.id});
  const [doc]=await rawQuery('SELECT storage_key,deleted_at FROM documents WHERE id=$1',[live.upload.id]),[so]=await rawQuery('SELECT details FROM service_orders WHERE id=$1',[id]);
  check('DELETE-PROJECTION-SUPERSEDED-SHARED-ID',old.upload.id===live.upload.id&&old.upload.key!==live.upload.key&&!doc.deleted_at&&doc.storage_key===live.upload.key&&!so.details.documentDeletedAt&&(await exactDownloads(live)).every(r=>r.equal)&&!await readObject(old.upload.key)&&mail.length===before,{sharedId:old.upload.id===live.upload.id,currentKey:doc.storage_key,expectedKey:live.upload.key,deletedAt:doc.deleted_at,serviceDeletedAt:so.details.documentDeletedAt,noticeDelta:mail.length-before});
 });
}

if(mode==='pair'){
 for(const slot of ['articles','statement'])for(const damage of ['missing','same-length-corrupt','truncated','unreadable-envelope'])await test('PAIR-'+slot+'-'+damage,async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),f=originals[slot],before=mail.length,ids=(await current(co)).map((r:any)=>r.id).sort();
  const path=temp+'/files/'+f.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,'');if(damage==='missing')rmSync(path);else writeBytes(path,damage==='same-length-corrupt'?Buffer.alloc(f.raw.length,88):damage==='truncated'?f.raw.subarray(0,20):Buffer.from('not an envelope'));
  const replay=await req('admin/orders/'+co+'/correct-articles',correction(d)),downloads=await exactDownloads(originals),[saved]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[op.id]);
  check('PAIR-'+(slot==='articles'?'Articles':'Statement')+'-'+damage,replay.status===200&&downloads.every(r=>r.equal)&&mail.length===before&&JSON.stringify(ids)===JSON.stringify((await current(co)).map((r:any)=>r.id).sort())&&saved.phase==='done',{replay:replay.status,downloads,noticeDelta:mail.length-before,phase:saved.phase});
 });
 for(const variant of ['none','partial','different'])await test('pair-'+variant,async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length;
  const removed:any={};
  if(variant==='none'||variant==='partial')removed.statement=await removeAll(originals.statement);
  if(variant==='partial')rmSync(temp+'/files/'+originals.articles.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));
  const r=await req('admin/orders/'+co+'/correct-articles',correction(d,variant==='different'?pdfBytes:correctedBytes));
  const a=await readObject(originals.articles.key),s=await readObject(originals.statement.key);
  check(variant==='none'?'PAIR-NO-COPY':variant==='partial'?'RECOVERY-PARTIAL-PAIR':'PAIR-DIFFERENT',r.status===409&&r.body.error.code===(variant==='different'?'OFFICE_CONFLICT':'UPLOAD_REQUIRED')&&!!a&&a.equals(originals.articles.raw)&&(variant==='different'?!!s&&s.equals(originals.statement.raw):s===null)&&mail.length===before,{response:r.body,status:r.status,articlesExact:a?.equals(originals.articles.raw),statementPresent:!!s,noticeDelta:mail.length-before});
  for(const slot of Object.keys(removed))await restoreAll(originals[slot],removed[slot]);
 });
 await test('PAIR-SELF-SIGNED',async()=>{const co=await seedPair(false),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length;rmSync(temp+'/files/'+originals.articles.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));const replay=await req('admin/orders/'+co+'/correct-articles',correction(d));check('PAIR-SELF-SIGNED',replay.status===200&&(await exactDownloads(originals)).every(r=>r.equal)&&!(await current(co)).some((r:any)=>r.kind==='statement')&&mail.length===before,{status:replay.status,slots:Object.keys(op.files),noticeDelta:mail.length-before});});
}

if(mode==='notices'){
 for(const state of ['sent','failed'])for(const slot of ['articles','statement'])await test('notice-'+state+'-'+slot,async()=>{
  const co=await seedPair(),d=await detail(co);if(state==='failed')mailMode='fail';requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));mailMode='ok';
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length,requests=mailRequests.length;
  const removed=await removeAll(originals[slot]),r=await req('admin/documents/'+op.result.documentId+'/resend-notice',{}),[doc]=await rawQuery('SELECT notice_status,notice_sent_at FROM documents WHERE id=$1',[op.result.documentId]);
  check(state==='sent'?'NOTICE-SENT-DAMAGE-'+slot:'NOTICE-PENDING-DAMAGE-'+slot,r.status===409&&r.body.error.code==='UPLOAD_REQUIRED'&&mail.length===before&&mailRequests.length===requests&&doc.notice_status===state,{status:r.status,response:r.body,state:doc.notice_status,providerCalls:mailRequests.length-requests});
  await restoreAll(originals[slot],removed);const recovered=await req('admin/documents/'+op.result.documentId+'/resend-notice',{});
  check('NOTICE-RECOVER-'+state+'-'+slot,recovered.status===200&&(await exactDownloads(originals)).every(f=>f.equal)&&mail.length-before===(state==='sent'?0:1),{response:recovered.body,noticeDelta:mail.length-before});
 });
 await test('notice-provider-lost-response',async()=>{
  const co=await seedPair(),d=await detail(co),before=mail.length,requests=mailRequests.length;mailMode='lost';requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));mailMode='ok';
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),r=await req('admin/documents/'+op.result.documentId+'/resend-notice',{}),sent=mailRequests.slice(requests);
  check('NOTICE-LOST-ACK',r.status===200&&mail.length-before===1&&sent.length===2&&sent[0].key===sent[1].key&&sent[0].body===sent[1].body,{status:r.status,noticeDelta:mail.length-before,keys:sent.map(r=>r.key)});
 });
}

if(mode==='final-boundaries'){
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts');
 for(const fault of ['conflict','deletion'])await test('MIRROR-'+fault.toUpperCase(),async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const op=await opFor(id),original=await freeze(op),f=original.upload,path=f.mirrorPath;
  await mirrorFile({storageKey:f.key,path});const initial=await dropbox.readMirrorVersion(path),bad=Buffer.from('bad mirror r'),competing=Buffer.from('different bad mirror r2');if(!initial||!await dropbox.compareWriteMirror(path,bad,initial.rev))throw Error('Ordinary mirror damage setup failed');const {seal}=await import(R+'/server/encryption.ts');const c2=seal(competing);
  const cas=dropbox.compareWriteMirror;let calls=0,deleted:any;const before=mail.length;
  const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(p:string,bytes:Buffer,rev:string|null)=>{if(p!==path)return cas(p,bytes,rev);calls++;if(fault==='deletion'){deleted=await req('portal/documents/'+f.id,undefined,'client','DELETE');return cas(p,bytes,rev);}const now=await dropbox.readMirrorVersion(path);if(now)await cas(path,c2,now.rev);return false;});
  let b:any,error:any;try{b=await runDbBackup({dispatchAttention:false});}catch(e){error=String(e);}finally{spy.mockRestore();}
  if(fault==='conflict'){
   const job=JSON.parse((await readObject('backup-jobs/current.json'))?.toString()||'null'),winner=await dropbox.readMirror(path);
   check('MIRROR-CONFLICT',calls>0&&!b?.complete&&b?.pending===1&&job?.errors[f.key]?.startsWith('RECOVERY_UNAVAILABLE')&&winner?.equals(c2)&&job.dump.files.find((x:any)=>x.storageKey===f.key).sha===f.sha&&mail.length===before,{calls,b,error,jobError:job?.errors[f.key],winnerExact:winner?.equals(c2),noticeDelta:mail.length-before});
   const now=await dropbox.readMirrorVersion(path);if(now)await cas(path,f.raw,now.rev);await runDbBackup({resumeOnly:true,dispatchAttention:false});
  }else{
   await retryDocumentDeletions();const finish=b?.complete?b:await runDbBackup({resumeOnly:true,dispatchAttention:false}),dump=finish.complete?JSON.parse(gunzipSync((await readObject('backups/'+finish.key))!).toString()):null,download=await req('portal/documents/'+f.id+'/download',undefined,'client');
   check('MIRROR-DELETION',calls>0&&deleted?.status===200&&finish.complete&&!dump.files.some((x:any)=>x.storageKey===f.key)&&download.status===404&&!await dropbox.readMirror(path)&&!await readObject(f.key)&&(await readRecoveryJournal()).records.some(d=>d.storageKey===f.key)&&mail.length===before,{calls,deleted:deleted?.status,finish,download:download.status,noticeDelta:mail.length-before});
  }
 });
 await test('ALERT-PERSIST-DOWN',async()=>{
  const co=await seedPair(),[old]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),files=await freeze(old);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const removed=await removeAll(files.statement),cas=dropbox.compareWriteMirror;let blocked=0;env.ADMIN_NOTIFY_EMAIL='office@example.test';const before=mail.length,requests=mailRequests.length;
  const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path.startsWith('/recovery/backup-attention/')){blocked++;throw Error('Problem store unavailable')}return cas(path,...args);});let pending:any,progress:any;
  try{pending=await runDbBackup({dispatchAttention:false});progress=requireOk(await req('admin/backups/progress'));const {deliverBackupAttention}=await import(R+'/server/backup-attention.ts');await deliverBackupAttention();}finally{spy.mockRestore();}
  const untracked=mailRequests.length-requests,again=await runDbBackup({resumeOnly:true,dispatchAttention:false}),{deliverBackupAttention}=await import(R+'/server/backup-attention.ts');await deliverBackupAttention();await deliverBackupAttention();
  check('ALERT-PERSIST-DOWN',blocked>0&&!pending.complete&&progress.errors.some((e:string)=>e.includes('alert persistence failed'))&&untracked===0&&!again.complete&&again.pending===1&&mail.length===before+1&&mail.at(-1).to[0]==='office@example.test',{blocked,pending,errors:progress.errors,untracked,again,officeMail:mail.length-before});await restoreAll(files.statement,removed);
 });
}

if(mode==='restored-boundaries')for(const phase of ['open','committed'])await test('RESTORED-'+phase,async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let hit=0;
 db.query=async(q:string,p:any[])=>{if(!hit&&(phase==='open'?q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents'):q.includes('UPDATE office_operations SET notice_started_at=now()'))){hit++;throw Error('Restored '+phase+' boundary')}return rawQuery(q,p)};
 const first=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:true}));db.query=rawQuery;const op=await opFor(id),original=await freeze(op);if(first.status!==500||hit!==1||op.phase!==phase||mail.length)throw Error('Required restored service boundary absent');
 const b=await runDbBackup({dispatchAttention:false});if(!b.complete)throw Error('Boundary backup did not complete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),stem=E+'/restored-'+phase,spec={id:'RESTORED-'+phase,dump,target:temp+'/restored-'+phase,mirror:temp+'/mirror',output:stem+'-result.json',client,originals:originalRecords(original),downloads:originalRecords(original),serviceBoundary:{phase,serviceId:id,operationId:op.id,documentId:original.upload.id,key:original.upload.key,sha:original.upload.sha,ein:'881234560',original:original.upload.plain.toString('base64'),wrong:Buffer.from(correctedBytes).toString('base64')}};writeFileSync(stem+'-input.json',JSON.stringify(spec));const child=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',child.stdout+child.stderr);
 check('RESTORED-'+phase,child.status===0,{exit:child.status,evidence:stem+'-result.json',error:child.stderr});
});

if(mode==='snapshot-boundaries'){
 const co=await seedPair(),[initial]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(initial),b0=await runDbBackup({dispatchAttention:false}),saved0=(await readObject('backups/'+b0.key))!,dump0=JSON.parse(gunzipSync(saved0).toString());
 requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(op),before=mail.length;
 const published=restoreFixture('PUBLISHED-OLD-SNAPSHOT',dump0,originalRecords(old),originalRecords(old));check('PUBLISHED-OLD-SNAPSHOT',published.ok&&(await readObject('backups/'+b0.key))?.equals(saved0)&&mail.length===before,{published,noticeDelta:mail.length-before});
 await removeAll(old.statement);const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===initial.id&&r.slot==='statement');requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
 const b1=await runDbBackup({dispatchAttention:false}),saved1=(await readObject('backups/'+b1.key))!,dump1=JSON.parse(gunzipSync(saved1).toString()),r1=await runDbBackup({resumeOnly:true,dispatchAttention:false}),r2=await runDbBackup({resumeOnly:true,dispatchAttention:false}),progress=requireOk(await req('admin/backups/progress'));
 check('BACKUP-GAP-TERMINAL',b1.status==='complete_with_history_gaps'&&r1.status===b1.status&&r2.status===b1.status&&r1.pending===0&&r2.pending===0&&!await readObject('backup-jobs/current.json')&&progress.key===b1.key&&progress.historyComplete===false&&(await readObject('backups/'+b1.key))?.equals(saved1)&&mail.length===before,{b1,r1,r2,progress,noticeDelta:mail.length-before});
 const refused=restoreFixture('HG-OLD-CURRENT',dump0,[],[],true);check('HG-OLD-CURRENT',refused.ok&&(await readObject('backups/'+b0.key))?.equals(saved0)&&mail.length===before,{refused,noticeDelta:mail.length-before});
 const {spyOn}=await import('bun:test'),storage=await import(R+'/server/storage.ts'),put=storage.replaceStoredFile;let hit=0;
 const spy=spyOn(storage,'replaceStoredFile').mockImplementation(async(key:string,bytes:Buffer)=>{const r=await put(key,bytes);if(key===old.statement.key&&!hit++){throw new DOMException('Late original response after timeout','TimeoutError')}return r;});let interrupted:any;
 try{interrupted=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.statement.plain));}finally{spy.mockRestore();}
 const held=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[initial.id]))[0].payload.historyRecovery?.statement;
 const b2=await runDbBackup({dispatchAttention:false}),dump2=b2.complete?JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString()):null,[updated]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[initial.id]),restored=dump2?restoreFixture('BACKUP-GAP-RECOVERED',dump2,[...originalRecords(old),...originalRecords(live)],originalRecords(live)):null;
 check('ALIAS-LATE-WRITE',hit===1&&interrupted.status===503&&held?.state==='unrecoverable'&&b2.complete&&updated.payload.historyRecovery?.statement?.state==='recovered'&&restored?.ok&&!dump2.historyGaps?.length&&mail.length===before,{hit,interrupted:interrupted.body,held,b2,state:updated.payload.historyRecovery?.statement?.state,restored,noticeDelta:mail.length-before});
 check('BACKUP-GAP-RECOVERED',b2.complete&&b2.key!==b1.key&&restored?.ok&&(await readObject('backups/'+b1.key))?.equals(saved1)&&dump1.historyGaps.length===1&&dump2.files.some((f:any)=>f.storageKey===old.statement.key&&f.sha===old.statement.sha)&&mail.length===before,{b2,restored,priorUnchanged:(await readObject('backups/'+b1.key))?.equals(saved1),noticeDelta:mail.length-before});
}

if(mode==='gap-integrity'){
 const {historyId}=await import(R+'/server/office-history-recovery.ts');
 for(const family of ['pair','service'])await test('gap-integrity-'+family,async()=>{
  const co=family==='pair'?await seedPair():await company({status:'formed'}),id=family==='service'?await service('ein',co):co;
  if(family==='service')requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));
  const original=family==='service'?await opFor(id):(await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]))[0],old=await freeze(original);
  if(family==='service')requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:original.id},['file'],correctedBytes)));else requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const currentOp=family==='service'?await opFor(id):(await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]))[0],live=await freeze(currentOp),slot=family==='service'?'upload':'statement',removed=await removeAll(old[slot]);
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===original.id&&r.slot===slot);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
  const backup=await runDbBackup({dispatchAttention:false});if(backup.status!=='complete_with_history_gaps'||backup.pending!==0)throw Error('Gap snapshot incomplete: '+JSON.stringify(backup));const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()),before=mail.length;
  const newReader=restoreFixture('HG-GAP-VALID-'+family,dump,[...originalRecords(live),...originalRecords(old).filter(f=>f.slot!==slot)],originalRecords(live));
  const stem=E+'/old-reader-'+family,spec={id:family==='service'?'HG-OLD-READER-SERVICE':'BACKUP-OLD-READER-GAP',dump,target:temp+'/old-reader-'+family,mirror:temp+'/mirror',output:stem+'-result.json'};writeFileSync(stem+'-input.json',JSON.stringify(spec));
  const run=spawnSync(process.execPath,[R+'/server/chunk3-r8-old-reader.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:4*1024*1024});writeFileSync(stem+'.log',run.stdout+run.stderr);
  check(spec.id,run.status===0&&newReader.ok&&dump.version===2&&dump.fileManifestVersion===2&&mail.length===before,{oldReader:run.status,oldReaderOutput:run.stdout,newReader,version:dump.version,noticeDelta:mail.length-before});
  if(family==='pair'){
   const variants:any[]=[];
   for(const variant of ['current','owner','digest','unpublished']){
    const bad=structuredClone(dump),gap=bad.historyGaps.find((g:any)=>g.operationId===original.id&&g.slot===slot);
    if(variant==='current'){const i=officeFileIdentities(bad.tables).get(live.statement.key)!;Object.assign(gap,{historyId:historyId(i),operationId:i.operationId,slot:i.slot,clientId:i.clientId,storageKey:i.file.key,documentId:i.file.id,expectedSha:i.file.sha,expectedSize:i.file.size});bad.files=bad.files.filter((f:any)=>f.storageKey!==i.file.key);}
    if(variant==='owner')gap.clientId=client2;
    if(variant==='digest')gap.expectedSha='0'.repeat(64);
    if(variant==='unpublished'){const op=bad.tables.office_operations.find((o:any)=>o.id===original.id);op.payload.previousPhase='open';op.kind='articles-history:'+op.id;op.phase='superseded';}
    const r=restoreFixture('HG-FORGED-GAP-'+variant,bad,[],[],true);variants.push({variant,...r});
   }
   check('HG-FORGED-GAP',variants.every(v=>v.ok),{variants,noticeDelta:mail.length-before});
  }
  await restoreAll(old[slot],removed);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[])));
 });
}
if(mode==='history-pair'){
 for(const slot of ['articles','statement'])await test('history-pair-'+slot,async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
  const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(c1);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
  const [c2]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(c2),[archive]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[c1.id]),before=mail.length;
  const listing=requireOk(await req('admin/backups/history-recovery')),row=listing.rows.find((r:any)=>r.operationId===c1.id&&r.slot===slot);if(!row){check('ARCHIVE-PAIR-ONLY-SOURCE-'+slot,false,{archiveKind:archive.kind,missingFromHistory:true});return;}
  const paths=await pathsFor(old[slot].key),operationPath=`/OfficeOperations/${c1.id}/${slot}`;
  rmSync(temp+'/files/'+old[slot].key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));for(const p of paths)if(p!==operationPath)rmSync(temp+'/mirror'+p,{force:true});
  const refused=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}),recovered=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[]));
  const restored=await readObject(old[slot].key);
  check('ARCHIVE-PAIR-ONLY-SOURCE-'+slot,archive.kind==='articles-correction-history:'+c1.id&&archive.payload.previousPhase==='done'&&refused.status===409&&refused.body.error.code==='RECOVERY_COPY_AVAILABLE'&&recovered.status===200&&!!restored&&restored.equals(old[slot].raw)&&mail.length===before,{archiveKind:archive.kind,refused:refused.body,recovered:recovered.body,exact:restored?.equals(old[slot].raw),noticeDelta:mail.length-before});
  const removed=await removeAll(old[slot]);const gap=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});
  const backup=await runDbBackup(),downloads=await exactDownloads(live);
  check('HG-LATE-'+(slot==='articles'?'Articles':'Statement'),gap.status===200&&backup.status==='complete_with_history_gaps'&&backup.pending===0&&downloads.every(r=>r.equal)&&mail.length===before,{gap:gap.body,backup,downloads,noticeDelta:mail.length-before});
  await restoreAll(old[slot],removed);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[])));
 });
}
if(mode==='sources'){
 await test('source-collision',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),saved=readFileSync(temp+'/mirror'+JOURNAL_PATH);
  const j=JSON.parse(saved.toString()),copy=j.copies.find((c:any)=>c.storageKey===originals.articles.key),otherCopy=j.copies.find((c:any)=>c.storageKey!==originals.articles.key);
  const alias='/collision/original.pdf';copy.extraMirrorPaths.push(alias);(otherCopy.extraMirrorPaths??=[]).push(alias);
  const {sha:_sha,...payload}=j;writeBytes(temp+'/mirror'+JOURNAL_PATH,JSON.stringify({...payload,sha:hashBytes(Buffer.from(JSON.stringify(payload)))}));
  rmSync(temp+'/files/'+originals.articles.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));const before=mail.length;
  const r=await req('admin/orders/'+co+'/correct-articles',correction(d));
  check('ALIAS-PATH-COLLISION',r.status===409&&r.body.error?.code==='RECOVERY_IDENTITY_CONFLICT'&&mail.length===before,{status:r.status,body:r.body,noticeDelta:mail.length-before});
  writeBytes(temp+'/mirror'+JOURNAL_PATH,saved);await replaceStoredFile(originals.articles.key,originals.articles.raw);
 });
 await test('registration-conflict',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),f=op.files.upload;
  const before=readFileSync(temp+'/mirror'+JOURNAL_PATH);let error:any;
  try{await recordDocumentCopy({documentId:crypto.randomUUID(),storageKey:'dev:alien.pdf',mirrorPath:f.mirrorPath});}catch(e){error=e;}
  check('ALIAS-OTHER-OWNER',error?.code==='RECOVERY_IDENTITY_CONFLICT'&&before.equals(readFileSync(temp+'/mirror'+JOURNAL_PATH)),{error:String(error),code:error?.code});
  writeBytes(temp+'/mirror'+JOURNAL_PATH,before);
 });
 await test('deletion-recovery',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),f=op.files.upload;
  const deleted=await req('portal/documents/'+f.id,undefined,'client','DELETE');await retryDocumentDeletions({limit:100});
  const recovered=await req('admin/orders/'+co+'/office-recovery/'+op.id+'/upload',form({},[]));
  check('RECOVERY-DELETED',deleted.status===200&&recovered.status===409&&recovered.body.error?.code==='DOCUMENT_DELETED'&&!await readObject(f.key),{deleted:deleted.status,recovery:recovered.body});
 });
}
if(mode==='alerts'){
 const {observeBackupProblem,deliverBackupAttention,resolveBackupProblem,backupAttention}=await import(R+'/server/backup-attention.ts');
 env.ADMIN_NOTIFY_EMAIL='office@example.test';
 await test('ALERT-FIRST',async()=>{
  const before=mail.length,reference=crypto.randomUUID(),id=await observeBackupProblem(reference,'needs_staff_decision');
  await deliverBackupAttention({problemId:id});await observeBackupProblem(reference,'needs_staff_decision');const again=await deliverBackupAttention({problemId:id}),rows=await backupAttention(),e=rows.find(r=>r.problemId===id)!;
  check('ALERT-FIRST',mail.length-before===1&&mail.at(-1).to[0]==='office@example.test'&&e.mailState==='accepted'&&again?.state==='already_sent'&&e.generation===1,{noticeDelta:mail.length-before,episode:e,again});
  await resolveBackupProblem(reference);const resolved=await deliverBackupAttention({problemId:id});
  check('ALERT-RESOLVED',resolved?.state==='resolved'&&mail.length-before===1,{resolved,totalAccepted:mail.length-before});
  await observeBackupProblem(reference,'needs_staff_decision');await deliverBackupAttention({problemId:id});const newer=(await backupAttention()).find(r=>r.problemId===id)!;
  check('ALERT-RECUR',newer?.generation===2&&newer.episodeId!==e?.episodeId&&mail.length-before===2,{generation:newer?.generation,totalAccepted:mail.length-before});
 });
 await test('ALERT-CONCURRENT',async()=>{
  const before=mail.length,ref=crypto.randomUUID(),ids=await Promise.all([observeBackupProblem(ref,'needs_staff_decision'),observeBackupProblem(ref,'needs_staff_decision')]);
  const results=await Promise.allSettled(ids.map(problemId=>deliverBackupAttention({problemId})));const e=(await backupAttention()).find(e=>e.problemId===ids[0]);
  check('ALERT-CONCURRENT',ids[0]===ids[1]&&e?.generation===1&&e.mailState==='accepted'&&mail.length-before===1,{ids,results,totalAccepted:mail.length-before});
 });
 await test('ALERT-RESOLVE-FIRST',async()=>{const ref=crypto.randomUUID(),id=await observeBackupProblem(ref,'needs_staff_decision'),before=mail.length;await resolveBackupProblem(ref);const result=await deliverBackupAttention({problemId:id});check('ALERT-RESOLVE-FIRST',result?.state==='resolved'&&mail.length===before,{result,accepted:mail.length-before});});
 await test('ALERT-UNCONFIRMED',async()=>{
  const id=await observeBackupProblem(crypto.randomUUID(),'needs_staff_decision'),start=mailRequests.length,before=mail.length;mailMode='lost';const first=await deliverBackupAttention({problemId:id});mailMode='ok';const second=await deliverBackupAttention({problemId:id}),requests=mailRequests.slice(start);
  check('ALERT-UNCONFIRMED',first?.state==='failed'&&second?.state==='accepted'&&mail.length-before===1&&requests.length===2&&requests[0].body===requests[1].body&&requests[0].key===requests[1].key,{first,second,requests,accepted:mail.length-before});
 });
 await test('ALERT-EXPIRED-STOP',async()=>{
  const id=await observeBackupProblem(crypto.randomUUID(),'needs_staff_decision');mailMode='lost';await deliverBackupAttention({problemId:id});mailMode='ok';
  const path=temp+'/mirror/recovery/backup-attention/'+id+'.json',saved=JSON.parse(readFileSync(path,'utf8')),e=JSON.parse(saved.body);e.firstAttemptAt=new Date(Date.now()-24*3600000).toISOString();const body=JSON.stringify(e);writeBytes(path,JSON.stringify({body,sha:hashBytes(Buffer.from(body))}));
  const before=mailRequests.length,r=await req('admin/backups/attention/'+id+'/retry',{confirmPossibleDuplicate:true}),after=(await backupAttention()).find(x=>x.problemId===id);
  check('ALERT-EXPIRED-STOP',r.status===409&&r.body.error.code==='NOTIFICATION_UNCONFIRMED'&&mailRequests.length===before&&after?.mailState==='unconfirmed',{response:r.body,mailState:after?.mailState,providerCalls:mailRequests.length-before});
 });
 await test('ALERT-CONFIG',async()=>{
  env.ADMIN_NOTIFY_EMAIL='';const id=await observeBackupProblem(crypto.randomUUID(),'needs_staff_decision'),before=mailRequests.length;const missing=await deliverBackupAttention({problemId:id}),e=(await backupAttention()).find(x=>x.problemId===id)!;
  env.ADMIN_NOTIFY_EMAIL='office@example.test';const repaired=await deliverBackupAttention({problemId:id});
  check('ALERT-CONFIG',missing?.state==='configuration_error'&&!e.firstAttemptAt&&repaired?.state==='accepted'&&mailRequests.length-before===1,{missing,repaired,firstAttempt:e.firstAttemptAt,providerCalls:mailRequests.length-before});
 });
 await test('ALERT-REFUSED',async()=>{
  const id=await observeBackupProblem(crypto.randomUUID(),'needs_staff_decision'),before=mail.length;mailMode='fail';const failed=await deliverBackupAttention({problemId:id});mailMode='ok';await Bun.sleep(1100);const retry=await deliverBackupAttention({problemId:id});
  check('ALERT-REFUSED',failed?.state==='failed'&&retry?.state==='accepted'&&mail.length-before===1,{failed,retry,accepted:mail.length-before});
 });
 await test('ALERT-AUTH',async()=>{
  const id=await observeBackupProblem(crypto.randomUUID(),'needs_staff_decision'),before=mailRequests.length;
  const responses:Awaited<ReturnType<typeof req>>[]=[];for(const actor of ['none','client'] as const){responses.push(await req('admin/backups/attention',undefined,actor));responses.push(await req('admin/backups/attention/'+id+'/retry',{},actor));}
  const invalid=await req('admin/backups/attention/not-a-hash/retry',{});
  check('ALERT-AUTH',responses.every(r=>r.status===401)&&invalid.status===404&&mailRequests.length===before,{statuses:responses.map(r=>r.status),invalid:invalid.status,providerCalls:mailRequests.length-before});
 });
}
if(mode==='alert-restore'){
 const {observeBackupProblem,deliverBackupAttention,backupAttention}=await import(R+'/server/backup-attention.ts');env.ADMIN_NOTIFY_EMAIL='office@example.test';
 await test('ALERT-RESTORE-and-store-loss',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),backup=await runDbBackup({dispatchAttention:false});if(!backup.complete)throw Error('Snapshot did not complete');
  const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()),reference=crypto.randomUUID(),reason='needs_staff_decision',id=await observeBackupProblem(reference,reason);await deliverBackupAttention({problemId:id});const episode=(await backupAttention()).find(e=>e.problemId===id)!;
  if(episode.mailState!=='accepted')throw Error('Initial episode not accepted');
  const restored=restoreFixture('ALERT-RESTORE',dump,originalRecords(originals),originalRecords(originals),false,undefined,{reference,reason,id,episodeId:episode.episodeId,expectedMail:0});
  check('ALERT-RESTORE',restored.ok,{restored,episodeId:episode.episodeId});
  // Remove only the non-mandatory outbox object. All manifest paths and the
  // authoritative deletion journal remain. The former provider key is expired.
  const episodePath=temp+'/mirror/recovery/backup-attention/'+id+'.json',encoded=JSON.parse(readFileSync(episodePath,'utf8')),aged=JSON.parse(encoded.body);aged.firstAttemptAt=new Date(Date.now()-25*3600000).toISOString();const body=JSON.stringify(aged);writeBytes(episodePath,JSON.stringify({body,sha:hashBytes(Buffer.from(body))}));rmSync(episodePath);
  const lost=restoreFixture('ALERT-STORE-LOST',dump,originalRecords(originals),originalRecords(originals),false,undefined,{reference,reason,id,episodeId:episode.episodeId,expectedMail:1});
  check('ALERT-STORE-LOST',lost.ok,{lost,priorProviderKeyExpired:true});
  const journal=readFileSync(temp+'/mirror'+JOURNAL_PATH);rmSync(temp+'/mirror'+JOURNAL_PATH);rmSync(temp+'/mirror/recovery/backup-attention',{recursive:true,force:true});
  const refused=restoreFixture('ALERT-JOURNAL-LOST',dump,[],[],true);writeBytes(temp+'/mirror'+JOURNAL_PATH,journal);
  check('ALERT-JOURNAL-LOST',refused.ok,{refused});
 });
}
if(mode==='filing-history')await test('FORMATION-PUBLISHED-HISTORY',async()=>{
 const name='Formation History LLC',series=name+', PS A',co=await company({name,status:'filed',series:[{name:series}],payload:{certifications:{articlesSignedBy:'SERVICE'}}});requireOk(await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles'])));
 const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op),before=mail.length;
 const replacement=await req('admin/orders/'+co+'/formation-documents',form({documentNumber:'L26000000002',psdSeries:JSON.stringify([series])},['articles','psd'],correctedBytes));
 const id=await service('certificate-of-status',co),certificate=await req('admin/services/'+id+'/fulfill',form({notify:false})),rows=await docs(co),oldRows=rows.filter((d:any)=>Object.values(old).some((f:any)=>f.id===d.id));
 let backup:any,error='';try{backup=await runDbBackup({dispatchAttention:false});}catch(e){error=String(e);}
 const dump=backup?.complete?JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()):null,restore=dump?restoreFixture('FORMATION-PUBLISHED-HISTORY',dump,originalRecords(old),[]):null;
 check('FORMATION-PUBLISHED-HISTORY',replacement.status===200&&certificate.status===200&&oldRows.length===2&&oldRows.every((d:any)=>d.deleted_at&&d.meta.officeHistory===true)&&rows.filter((d:any)=>!d.deleted_at&&d.kind==='articles').length===1&&rows.filter((d:any)=>!d.deleted_at&&d.kind==='statement').length===1&&backup?.complete&&restore?.ok&&mail.length-before===1,{replacement:replacement.status,certificate:{status:certificate.status,body:certificate.body},oldRows,backup,error,restore,noticeDelta:mail.length-before});
});
if(mode==='manifest-origin')await test('MANIFEST-ORIGINAL',async()=>{
 const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),bad=Buffer.alloc(originals.statement.raw.length,88),expected=hashBytes(originals.statement.plain),before=mail.length;
 await replaceStoredFile(originals.statement.key,bad);const result=await runDbBackup({dispatchAttention:false});
 const dump=result.complete?JSON.parse(gunzipSync((await readObject('backups/'+result.key))!).toString()):null,entry=dump?.files.find((f:any)=>f.storageKey===originals.statement.key),restored=dump?restoreFixture('MANIFEST-ORIGINAL',dump,originalRecords(originals),originalRecords(originals)):null;
 check('MANIFEST-ORIGINAL',result.complete&&entry?.sha===expected&&entry.sha!==hashBytes(bad)&&restored?.ok&&(await exactDownloads(originals)).every(x=>x.equal)&&mail.length===before,{result,entry,expected,corruptSha:hashBytes(bad),restored,downloads:await exactDownloads(originals),noticeDelta:mail.length-before});
});
if(mode==='backup'){
 await test('checkpoint-known-original',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),baseline=await runDbBackup({dispatchAttention:false});
  const dump=JSON.parse(gunzipSync((await readObject('backups/'+baseline.key))!).toString()),bad=Buffer.alloc(originals.statement.plain.length,81),badSha=hashBytes(bad),identities=officeFileIdentities(await officeRecoveryTables(db)),i=identities.get(originals.statement.key)!;
  const entry=dump.files.find((f:any)=>f.storageKey===i.file.key);entry.sha=badSha;
  const {compareWriteMirror,readMirrorVersion}=await import(R+'/server/dropbox.ts');const saved=await readMirrorVersion(i.recoveryPath);await compareWriteMirror(i.recoveryPath,bad,saved!.rev);
  const key='db-2030-01-01-000001.json.gz',job={key,dump,format:2,phase:'verify',cursor:0,errors:{},done:Object.fromEntries(dump.files.map((f:any)=>[f.storageKey,f.sha])),verified:{}};
  const {putObject}=await import(R+'/server/storage.ts');await putObject('backup-jobs/current.json',Buffer.from(JSON.stringify(job)),true);
  const runs:any[]=[];for(let n=0;n<3;n++){const r=await runDbBackup({resumeOnly:true,dispatchAttention:false});runs.push(r);if(r.complete)break;}
  const final=runs.at(-1),result=final.complete?JSON.parse(gunzipSync((await readObject('backups/'+key))!).toString()):null;
  const restored=result?restoreFixture('CHECKPOINT-BAD',result,originalRecords(originals),originalRecords(originals)):null;
  check('CHECKPOINT-BAD',final.complete&&result.files.find((f:any)=>f.storageKey===i.file.key).sha===hashBytes(originals.statement.plain)&&restored?.ok,{runs,manifest:result?.files,restored});
 });
 await test('immutable-old-snapshot',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),first=await runDbBackup({dispatchAttention:false}),raw=await readObject('backups/'+first.key),dump=JSON.parse(gunzipSync(raw!).toString());
  const before=mail.length;requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  await replaceStoredFile(originals.statement.key,Buffer.alloc(originals.statement.plain.length,88));
  await mirrorFile({storageKey:originals.statement.key,path:originals.statement.mirrorPath});
  const restored=restoreFixture('BACKUP-IMMUTABLE',dump,originalRecords(originals),originalRecords(originals));
  check('BACKUP-IMMUTABLE',restored.ok&&(await readObject('backups/'+first.key))?.equals(raw!)&&mail.length===before+1,{restored,noticeDelta:mail.length-before,unchanged:(await readObject('backups/'+first.key))?.equals(raw!)});
  await replaceStoredFile(originals.statement.key,originals.statement.raw);
 });
 await test('shared-copy-cas-loss',async()=>{
  const co=await company({status:'formed'}),id=await service('certificate-of-status',co);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));const op=await opFor(id),originals=await freeze(op),i=officeFileIdentities(await officeRecoveryTables(db)).get(originals.upload.key)!;
  const helpers=await import(R+'/server/office-file-recovery.ts'),dropbox=await import(R+'/server/dropbox.ts'),{spyOn}=await import('bun:test');await helpers.ensureOfficeRecoveryCopy(i);
  const version=await dropbox.readMirrorVersion(i.recoveryPath),r1=Buffer.from('corrupt-r1'),r2=Buffer.from('corrupt-r2');await dropbox.compareWriteMirror(i.recoveryPath,r1,version!.rev);
  const originalCAS=dropbox.compareWriteMirror;let conflict=false;const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path,bytes,rev)=>{if(path===i.recoveryPath&&!conflict){conflict=true;await originalCAS(path,r2,rev);}return originalCAS(path,bytes,rev);});
  let response:any;try{response=await runDbBackup({dispatchAttention:false});}finally{spy.mockRestore();}
  const after=await dropbox.readMirror(i.recoveryPath),checkpoint=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());
  check('COPY-REPAIR-CAS-LOSS',conflict&&!response.complete&&response.pending===1&&after?.equals(r2)&&!checkpoint.done[i.file.key]&&checkpoint.errors[i.file.key].startsWith('RECOVERY_UNAVAILABLE'),{conflict,response,shared:after?.toString(),error:checkpoint.errors[i.file.key]});
  const repaired=await runDbBackup({resumeOnly:true,dispatchAttention:false});check('COPY-REPAIR-EXACT',repaired.complete&&hashBytes((await dropbox.readMirror(i.recoveryPath))!)===hashBytes(originals.upload.raw),{repaired});
 });
}

if(mode==='reset')await test('reset-rehearsal',async()=>{
 const {verifyCleanLaunch,launchDigest}=await import(R+'/server/clean-launch-verification.ts');
 const {putObject}=await import(R+'/server/storage.ts'),{ensureDeletionMirror}=await import(R+'/server/backup-deletions.ts');
 const {readdirSync,statSync,existsSync}=await import('node:fs');
 const resources={databaseHost:'private-loopback',databaseName:'r8-test-only',blobStoreId:'fixture',dropboxAccountId:'fixture-account',dropboxAppKey:'fixture-app',dropboxRoot:'fixture-app-folder'};
 const co=await seedPair();await runDbBackup({dispatchAttention:false});
 await (await import(R+'/server/backup-attention.ts')).observeBackupProblem('test-problem','needs_staff_decision');
 const authored=temp+'/authored-input.pdf';writeFileSync(authored,pdfBytes);const sentinel=temp+'/unrelated-project.txt';writeFileSync(sentinel,'untouched');
 const allTables=(await rawQuery("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).map((r:any)=>r.tablename);
 const files=(root:string):string[]=>existsSync(root)?readdirSync(root,{recursive:true}).map(String).filter(p=>statSync(root+'/'+p).isFile()).sort():[];
 let deletions=0;
 const reset=async(identity:any,refuse?:string)=>{
  if(JSON.stringify(identity)!==JSON.stringify(resources))throw Error('RESET_RESOURCE_MISMATCH');
  for(const table of allTables.filter((t:string)=>!['schema_migrations','launch_policy'].includes(t)))await rawQuery('TRUNCATE TABLE "'+table.replaceAll('"','""')+'" CASCADE');
  for(const root of [temp+'/files',temp+'/mirror'])for(const path of files(root)){if(path===refuse)continue;rmSync(root+'/'+path);deletions++;}
 };
 const originalObjects=files(temp+'/files').length+files(temp+'/mirror').length;
 let wrong='';try{await reset({...resources,dropboxRoot:'another-project'});}catch(e){wrong=String(e);}
 check('RESET-WRONG-RESOURCE',wrong.includes('RESET_RESOURCE_MISMATCH')&&deletions===0&&(await rawQuery('SELECT id FROM orders WHERE id=$1',[co])).length===1&&readFileSync(sentinel,'utf8')==='untouched',{wrong,deletions,originalObjects});
 const refused=files(temp+'/files').find(p=>p.startsWith('backups/'))!;if(!refused)throw Error('No old backup seeded');
 await reset(resources,refused);
 const seed=async()=>{
  const key=await putObject('library/authored.pdf',Buffer.from(pdfBytes),true);await rawQuery("INSERT INTO library_documents(key,title,storage_key,size_bytes) VALUES('authored','Authored library',$1,$2) ON CONFLICT(key) DO UPDATE SET storage_key=EXCLUDED.storage_key,size_bytes=EXCLUDED.size_bytes",[key,pdfBytes.length]);
  await ensureDeletionMirror([]);return key;
 };
 let seedKey=await seed();
 const read=async()=>{
  const tables:any={};for(const t of allTables){const [count]=await rawQuery('SELECT count(*)::int n FROM "'+t+'"');const rows=['library_documents','schema_migrations','launch_policy','backup_progress'].includes(t)?await rawQuery('SELECT * FROM "'+t+'" ORDER BY to_jsonb("'+t+'")::text'):[];tables[t]={count:count.n,sha256:launchDigest(rows)};}
  const policies=await rawQuery("SELECT first_notice_cutoff FROM launch_policy WHERE id='initial-launch'");
  const objectRows=(root:string)=>files(root).map(path=>{const bytes=readFileSync(root+'/'+path);return {path:root.endsWith('/mirror')?'/'+path:path,sha256:hashBytes(bytes),size:bytes.length};});
  return {resources,tables,migrations:(await rawQuery('SELECT id,checksum FROM schema_migrations ORDER BY id')).map((r:any)=>({id:r.id,checksum:r.checksum})),noticeCutoff:new Date(policies[0].first_notice_cutoff).toISOString(),objects:{blob:objectRows(temp+'/files'),mirror:objectRows(temp+'/mirror')}};
 };
 const observed=await read();
 const inventory:any={version:1,approvedBuild:'fixture-r8',resourceApproval:'explicit private fixture stores',writerDrainEvidence:'single-process fixture no background writers',resources,noticeCutoff:observed.noticeCutoff,migrations:observed.migrations,seedTables:Object.fromEntries(['library_documents','schema_migrations','launch_policy','backup_progress'].map(t=>[t,observed.tables[t]])),seedObjects:{blob:observed.objects.blob.filter(r=>r.path!==refused),mirror:observed.objects.mirror}};
 let firstError='';try{await verifyCleanLaunch(inventory,{read});}catch(e){firstError=String(e);}
 check('RESET-PARTIAL-refusal',firstError.includes('Residual')&&files(temp+'/files').includes(refused)&&!existsSync(E+'/clean-receipt.json')&&readFileSync(sentinel,'utf8')==='untouched',{firstError,residual:refused,receipt:false});
 await reset(resources);seedKey=await seed();
 const clean=await read();inventory.seedTables=Object.fromEntries(['library_documents','schema_migrations','launch_policy','backup_progress'].map(t=>[t,clean.tables[t]]));inventory.seedObjects=clean.objects;
 const before=JSON.stringify(await read()),receipt=await verifyCleanLaunch(inventory,{read}),after=JSON.stringify(await read());
 const backup=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString());
 const stem=E+'/clean-restore',spec={id:'RESET-CLEAN',dump,target:temp+'/clean-restore',mirror:temp+'/mirror',output:stem+'-result.json',client,seedOnly:true,originals:[{slot:'library',key:seedKey,sha:hashBytes(Buffer.from(pdfBytes)),size:pdfBytes.length}],downloads:[{slot:'library',path:'portal/library/authored/download',watermarked:true,sha:hashBytes(Buffer.from(pdfBytes))}]};writeFileSync(stem+'-input.json',JSON.stringify(spec));
 const restore=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8'});writeFileSync(stem+'.log',restore.stdout+restore.stderr);
 if(backup.complete&&restore.status===0)writeFileSync(E+'/clean-receipt.json',JSON.stringify({...receipt,baselineBackup:backup.key,restoreEvidence:stem+'-result.json'},null,2));
 check('RESET-CLEAN',receipt.clean&&before===after&&backup.complete&&restore.status===0&&clean.tables.clients.count===0&&clean.tables.orders.count===0&&readFileSync(authored).equals(Buffer.from(pdfBytes))&&readFileSync(sentinel,'utf8')==='untouched'&&mail.length===0,{receipt,backup,restoreStatus:restore.status,readonly:before===after,mail:mail.length});
 check('RESET-PARTIAL-retry',!clean.objects.blob.some(r=>r.path===refused)&&clean.tables.clients.count===0&&receipt.clean,{residual:false,clean:true});
});

if(mode==='capacity-blocked')await test('CAP-BLOCKED',async()=>{
 const {putObject}=await import(R+'/server/storage.ts');process.env.BACKUP_FILE_CONCURRENCY='4';
 const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await freeze(await opFor(id)),baseline=await runDbBackup({dispatchAttention:false}),baselineBytes=await readObject('backups/'+baseline.key),before=mail.length;
 const removed=await removeAll(original.upload),pending=await runDbBackup({dispatchAttention:false}),job=JSON.parse((await readObject('backup-jobs/current.json'))!.toString()),start=new Date(Date.now()-24*3600000-1000).toISOString();job.dump.dumpedAt=start;await putObject('backup-jobs/current.json',Buffer.from(JSON.stringify(job)),true);await rawQuery("UPDATE backup_progress SET started_at=$1,completed_at=NULL WHERE id='database'",[start]);
 const r=await runDbBackup({resumeOnly:true,dispatchAttention:false}),status=await req('admin/backups/progress'),[dbstatus]=await rawQuery("SELECT started_at,completed_at FROM backup_progress WHERE id='database'");
 check('CAP-BLOCKED',!pending.complete&&r.status==='capacity_blocked'&&status.status===200&&status.body.data.status==='capacity_blocked'&&status.body.data.complete===false&&status.body.data.pending===1&&status.body.data.jobKey===job.key&&new Date(dbstatus.started_at).toISOString()===start&&dbstatus.completed_at===null&&(await readObject('backups/'+baseline.key))?.equals(baselineBytes!)&&mail.length===before,{r,status:status.body,dbstatus,expectedStart:start,noticeDelta:mail.length-before});await restoreAll(original.upload,removed);delete process.env.BACKUP_FILE_CONCURRENCY;
});

if(mode==='alias-boundaries'){
 const dropbox=await import(R+'/server/dropbox.ts');
 await test('ALIAS-CLIENT-DELETE',async()=>{
  const co=await company({status:'formed'}),id=await service('certificate-of-status',co);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));const u=await opFor(id),old=await freeze(u),alias='/SavedAliases/'+u.id+'/original';await recordDocumentCopy({documentId:old.upload.id,storageKey:old.upload.key,serviceId:id,mirrorPath:old.upload.mirrorPath,extraMirrorPaths:[alias]});await mirrorFile({storageKey:old.upload.key,path:alias});requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false,correctionOf:u.id},['file'],correctedBytes)));const live=await freeze(await opFor(id));await runDbBackup({dispatchAttention:false});const paths=[...await pathsFor(old.upload.key),...await pathsFor(live.upload.key)],before=mail.length,r=await req('admin/documents/'+live.upload.id,undefined,'admin','DELETE');await retryDocumentDeletions();const journal=await readRecoveryJournal(),remaining=await Promise.all(paths.map(p=>dropbox.readMirror(p))),download=await req('portal/documents/'+live.upload.id+'/download',undefined,'client');
  check('ALIAS-CLIENT-DELETE',r.status===200&&download.status===404&&remaining.every(r=>r===null)&&!await readObject(old.upload.key)&&!await readObject(live.upload.key)&&[old.upload.key,live.upload.key].every(k=>journal.records.some(r=>r.storageKey===k))&&mail.length===before,{delete:r.status,download:download.status,remaining:remaining.map(x=>!!x),paths,noticeDelta:mail.length-before});
 });
 await test('ALIAS-RESTORE-UNION',async()=>{
  const co=await company({status:'formed'}),id=await service('certificate-of-status',co);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));const u=await opFor(id),original=await freeze(u),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),alias='/SavedAliases/'+u.id+'/after-snapshot';
  await recordDocumentCopy({documentId:original.upload.id,storageKey:original.upload.key,serviceId:id,mirrorPath:original.upload.mirrorPath,extraMirrorPaths:[alias]});await mirrorFile({storageKey:original.upload.key,path:alias});const paths=await pathsFor(original.upload.key),before=mail.length,stem=E+'/alias-union',spec={id:'ALIAS-RESTORE-UNION',dump,target:temp+'/alias-restore',mirror:temp+'/mirror',output:stem+'-result.json',client,originals:originalRecords(original),downloads:[],deleteAfterRestore:{id:original.upload.id,key:original.upload.key,paths,alias}};writeFileSync(stem+'-input.json',JSON.stringify(spec));const r=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',r.stdout+r.stderr);await retryDocumentDeletions();
  check('ALIAS-RESTORE-UNION',!JSON.stringify(dump).includes(alias)&&paths.includes(alias)&&r.status===0&&!await dropbox.readMirror(alias)&&mail.length===before,{aliasNotInSnapshot:!JSON.stringify(dump).includes(alias),paths,restoreExit:r.status,log:stem+'.log',noticeDelta:mail.length-before});
 });
 await test('COPY-NEW-REVISION',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const u=await opFor(id),old=await freeze(u),b1=await runDbBackup({dispatchAttention:false}),bytes1=(await readObject('backups/'+b1.key))!,dump1=JSON.parse(gunzipSync(bytes1).toString()),j1=await readRecoveryJournal();requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:u.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),{spyOn}=await import('bun:test'),cas=dropbox.compareWriteMirror;let creates=0;const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{const r=await cas(path,...args);if(path.startsWith('/OfficeRecovery/')&&args[1]===null&&r)creates++;return r;});const before=mail.length;let b2:any;try{b2=await runDbBackup({dispatchAttention:false});}finally{spy.mockRestore();}const dump2=JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString()),j2=await readRecoveryJournal(),ra=restoreFixture('COPY-NEW-REVISION-B1',dump1,originalRecords(old),originalRecords(old)),rb=restoreFixture('COPY-NEW-REVISION-B2',dump2,[...originalRecords(old),...originalRecords(live)],originalRecords(live)),paths=(j:any)=>(j.copies??[]).flatMap((c:any)=>c.extraMirrorPaths??[]).filter((p:string)=>p.startsWith('/OfficeRecovery/'));
  check('COPY-NEW-REVISION',b2.complete&&creates===1&&paths(j2).length-paths(j1).length===1&&(await readObject('backups/'+b1.key))?.equals(bytes1)&&!j2.records.some(r=>r.storageKey===old.upload.key)&&old.upload.id===live.upload.id&&old.upload.key!==live.upload.key&&ra.ok&&rb.ok&&mail.length===before,{creates,newPaths:paths(j2).length-paths(j1).length,ra,rb,noticeDelta:mail.length-before});
 });
}
if(mode==='multiclient-history')await test('POLICY-A-MULTICLIENT',async()=>{
 const co=await seedPair(),[u]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(u),otherCo=await company({client:client2,status:'formed'}),id=await service('ein',otherCo);await rawQuery('UPDATE service_orders SET client_id=$2 WHERE id=$1',[id,client2]);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234569',notify:false})));const q=await freeze(await opFor(id));await removeAll(old.statement);const before=mail.length,r=await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(op),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),first=restoreFixture('MULTICLIENT-C1',dump,[...originalRecords(live),...originalRecords(q)],originalRecords(live)),stem=E+'/multiclient-c2',spec={id:'MULTICLIENT-C2',dump,target:temp+'/multiclient-c2',mirror:temp+'/mirror',output:stem+'-result.json',client:client2,originals:[...originalRecords(live),...originalRecords(q)],downloads:originalRecords(q)};writeFileSync(stem+'-input.json',JSON.stringify(spec));const second=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',second.stdout+second.stderr);const download=await req('portal/documents/'+q.upload.id+'/download',undefined,'other');
 check('POLICY-A-MULTICLIENT',r.status===200&&b.status==='complete_with_history_gaps'&&b.restorable&&b.historyComplete===false&&!b.complete&&b.pending===0&&dump.historyGaps.length===1&&dump.historyGaps[0].storageKey===old.statement.key&&first.ok&&second.status===0&&(await exactDownloads(live)).every(r=>r.equal)&&download.status===200&&Buffer.from(download.bytes).equals(q.upload.plain)&&mail.length===before+1,{correction:r.status,b,gaps:dump.historyGaps,first,second:second.status,otherDownload:download.status,noticeDelta:mail.length-before});
});

if(mode.startsWith('ordinary-'))await test('ORDINARY-OPEN-'+mode.slice(9),async()=>{
 const kind=mode.slice(9),co=await company({status:'formed'}),otherCo=await company({client:client2,status:'formed'}),q=requireOk(await req('admin/documents',form({submissionId:crypto.randomUUID(),clientId:client2,orderId:otherCo,title:'Other client original',notify:false}))),[otherFile]=await rawQuery('SELECT * FROM documents WHERE id=$1',[q.id]);let key:string;
 if(kind==='library'){requireOk(await req('admin/library/ordinary',form({title:'Ordinary library'})));key=(await rawQuery("SELECT storage_key FROM library_documents WHERE key='ordinary'"))[0].storage_key;}
 else if(kind==='order-summary'){const {putObject}=await import(R+'/server/storage.ts');key=await putObject('summaries/'+co+'.pdf',Buffer.from(pdfBytes),true);await rawQuery('UPDATE orders SET summary_storage_key=$2 WHERE id=$1',[co,key]);}
 else{const d=requireOk(await req('admin/documents',form({submissionId:crypto.randomUUID(),clientId:client,orderId:co,title:kind,kind:kind==='legal-mail'?'legal_mail':'package',receivedOn:'2026-09-27',notify:false})));key=(await rawQuery('SELECT storage_key FROM documents WHERE id=$1',[d.id]))[0].storage_key;}
 const original=(await readObject(key))!;if(!original.equals(Buffer.from(pdfBytes)))throw Error('Ordinary pre-fault bytes differ');rmSync(temp+'/files/'+key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));env.ADMIN_NOTIFY_EMAIL='office@example.test';const before=mail.length,b=await runDbBackup({dispatchAttention:false}),job=JSON.parse((await readObject('backup-jobs/current.json'))!.toString()),{deliverBackupAttention,backupAttention}=await import(R+'/server/backup-attention.ts');await deliverBackupAttention();await deliverBackupAttention();const waiver=await req('admin/backups/history-recovery/'+hashBytes(Buffer.from(key))+'/unrecoverable',{acknowledge:true,expectedRevision:hashBytes(original)}),episodes=await backupAttention(),download=await req('portal/documents/'+q.id+'/download',undefined,'other');
 check('ORDINARY-OPEN-'+kind,!b.complete&&b.pending===1&&!!job.errors[key]&&job.done[otherFile.storage_key]===hashBytes(Buffer.from(pdfBytes))&&!await readObject('backups/'+b.key)&&waiver.status===404&&!requireOk(await req('admin/backups/history-recovery')).rows.length&&mail.length===before+1&&mail.at(-1).to[0]==='office@example.test'&&episodes.filter(e=>e.active).length===1&&download.status===200&&Buffer.from(download.bytes).equals(Buffer.from(pdfBytes)),{b,waiver:waiver.status,error:job.errors[key],otherCheckpoint:job.done[otherFile.storage_key],download:download.status,noticeDelta:mail.length-before,episodes:episodes.length});
 await replaceStoredFile(key,original);const recovered=await runDbBackup({resumeOnly:true,dispatchAttention:false});check('ORDINARY-RECOVER-'+kind,recovered.complete,{recovered});
});
if(mode==='representation-boundaries'){
 await test('LEGACY-UNRELATED',async()=>{
  requireOk(await req('admin/library/legacy-original',form({title:'Library original'})));const [row]=await rawQuery("SELECT * FROM library_documents WHERE key='legacy-original'"),key=row.storage_key,sha=hashBytes(Buffer.from(pdfBytes)),before=mail.length,b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),file=dump.files.find((f:any)=>f.storageKey===key),r=restoreFixture('LEGACY-UNRELATED',dump,[{slot:'library',key,sha,size:pdfBytes.length}],[{slot:'library',path:'portal/library/legacy-original/download',watermarked:true,sha}]);
  check('LEGACY-UNRELATED',b.complete&&file.sha===sha&&!file.officeRecoveryIdentity&&dump.tables.office_operations.length===0&&r.ok&&mail.length===before,{b,file,restore:r,noticeDelta:mail.length-before});
 });
 await test('LEGACY-OPEN',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const u=await opFor(id),old=await freeze(u);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:u.id},['file'],correctedBytes)));const paths=await removeAll(old.upload),before=mail.length;await rawQuery("UPDATE office_operations SET files=files#-'{upload,sha}',payload=payload-'fileIntents' WHERE id=$1",[u.id]);
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id),r=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{acknowledge:true,expectedRevision:row.expectedRevision}),b=await runDbBackup({dispatchAttention:false}),[saved]=await rawQuery('SELECT payload,files FROM office_operations WHERE id=$1',[u.id]);
  check('LEGACY-OPEN',r.status===409&&r.body.error.code==='RECOVERY_IDENTITY_UNAVAILABLE'&&!b.complete&&!saved.payload.historyRecovery?.upload&&!saved.files.upload.sha&&mail.length===before,{response:r.body,b,noticeDelta:mail.length-before});
  await rawQuery("UPDATE office_operations SET files=$2,payload=payload||jsonb_build_object('fileIntents',$3::jsonb) WHERE id=$1",[u.id,JSON.stringify(u.files),JSON.stringify(u.payload.fileIntents??{})]);await restoreAll(old.upload,paths);await runDbBackup({resumeOnly:true,dispatchAttention:false});
 });
 await test('RENAME-FORMATION-PATH',async()=>{
  const co=await company({status:'filed',name:'Original Folder LLC',series:[{name:'PS 1'}],payload:{certifications:{articlesSignedBy:'SELF'}}});requireOk(await req('admin/orders/'+co+'/formation-documents',form({psdSeries:JSON.stringify(['PS 1'])},['articles','psd'])));const [d]=await rawQuery("SELECT * FROM documents WHERE order_id=$1 AND kind='psd' AND deleted_at IS NULL",[co]);if(d.mirror_path||d.storage_key.includes('office-work/'))throw Error('Wrong designation representation');const before=mail.length,dropbox=await import(R+'/server/dropbox.ts'),{spyOn}=await import('bun:test'),copy=dropbox.mirrorFile;let paused=false,path='',registered=false,savedBefore=false;
  const spy=spyOn(dropbox,'mirrorFile').mockImplementation(async(f:any)=>{if(f.storageKey===d.storage_key&&!paused){paused=true;path=f.path;const [saved]=await rawQuery('SELECT mirror_path FROM documents WHERE id=$1',[d.id]);savedBefore=saved.mirror_path===path;registered=!!(await readRecoveryJournal()).copies?.some(c=>c.storageKey===d.storage_key&&c.mirrorPath===path);await rawQuery("UPDATE orders SET llc_name='Renamed Folder LLC' WHERE id=$1",[co]);}return copy(f);});let mirrored:any;try{mirrored=await dropbox.runFileMirror();}finally{spy.mockRestore();}const again=await dropbox.runFileMirror(),[saved]=await rawQuery('SELECT mirror_path FROM documents WHERE id=$1',[d.id]),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),restored=restoreFixture('RENAME-FORMATION-PATH',dump,[{slot:'designation',key:d.storage_key,sha:hashBytes(Buffer.from(pdfBytes)),size:pdfBytes.length}],[{slot:'designation',id:d.id,sha:hashBytes(Buffer.from(pdfBytes))}]),copies=(await readRecoveryJournal()).copies?.filter(c=>c.storageKey===d.storage_key)??[],ids=officeFileIdentities(await officeRecoveryTables(db));
  check('RENAME-FORMATION-PATH',paused&&savedBefore&&registered&&mirrored.complete&&again.complete&&saved.mirror_path===path&&path.startsWith('/Original Folder LLC/')&&(await dropbox.readMirror(path))?.equals(Buffer.from(pdfBytes))&&copies.length===1&&!copies[0].extraMirrorPaths?.some(p=>p.startsWith('/Renamed Folder LLC/'))&&!ids.has(d.storage_key)&&b.complete&&restored.ok&&mail.length===before,{paused,savedBefore,registered,mirrored,again,path,saved:saved.mirror_path,copies,restored,noticeDelta:mail.length-before});
 });
}

if(mode==='history-races'){
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts');
 for(const boundary of ['before','after'])await test('HG-RECOVER-DELETE-METADATA-'+boundary,async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const u=await opFor(id),old=await freeze(u);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:u.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id);await removeAll(old.upload);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));const before=mail.length;let fired=false,deleted:any;
  db.query=async(q:string,p:any[])=>{if(!fired&&q.includes("ARRAY['historyRecovery',$3]")){fired=true;const saved=boundary==='after'?await rawQuery(q,p):undefined;deleted=await req('portal/documents/'+live.upload.id,undefined,'client','DELETE');if(saved)return saved;}return rawQuery(q,p)};
  let response:any;try{response=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.upload.plain));}finally{db.query=rawQuery;}
  await retryDocumentDeletions();const [op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[u.id]),download=await req('portal/documents/'+live.upload.id+'/download',undefined,'client');
  check('HG-RECOVER-DELETE-METADATA-'+boundary,fired&&deleted.status===200&&response.status===409&&response.body.error.code==='DOCUMENT_DELETED'&&!op.payload.historyRecovery?.upload&&!await readObject(old.upload.key)&&!await readObject(live.upload.key)&&download.status===404&&mail.length===before,{fired,deleted:deleted?.status,response:response.body,status:response.status,gap:op.payload.historyRecovery?.upload,download:download.status,noticeDelta:mail.length-before});
 });
 await test('HG-ACK-THEN-DELETE',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const u=await opFor(id),old=await freeze(u);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:u.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id);await removeAll(old.upload);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));const [prior]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[u.id]),before=mail.length;
  const deleted=await req('portal/documents/'+live.upload.id,undefined,'client','DELETE'),[after]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[u.id]);
  check('HG-ACK-THEN-DELETE',prior.payload.historyRecovery.upload.state==='unrecoverable'&&deleted.status===200&&!after.payload.historyRecovery?.upload&&mail.length===before,{deleted:deleted.status,priorGap:prior.payload.historyRecovery.upload.state,afterGap:after.payload.historyRecovery?.upload,noticeDelta:mail.length-before});
 });
 await test('COPY-POSTWRITE-JOURNAL-UNAVAILABLE',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await freeze(await opFor(id)),i=officeFileIdentities(await officeRecoveryTables(db)).get(original.upload.key)!,cas=dropbox.compareWriteMirror,read=dropbox.readMirrorVersion,remove=dropbox.deleteMirror;let fired=false,deletes=0;const before=mail.length;
  const cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{const r=await cas(path,...args);if(path===i.recoveryPath&&r)fired=true;return r;}),rs=spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string,...args:any[])=>{if(fired&&path===JOURNAL_PATH)throw Error('Temporary journal outage');return read(path,...args);}),ds=spyOn(dropbox,'deleteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath)deletes++;return remove(path,...args);});let error:any;
  try{await(await import(R+'/server/office-file-recovery.ts')).ensureOfficeRecoveryCopy(i);}catch(e){error=e;}finally{cs.mockRestore();rs.mockRestore();ds.mockRestore();}
  const saved=await dropbox.readMirror(i.recoveryPath),b=await runDbBackup({dispatchAttention:false});
  check('COPY-POSTWRITE-JOURNAL-UNAVAILABLE',fired&&error?.code==='RECOVERY_UNAVAILABLE'&&deletes===0&&saved?.equals(original.upload.raw)&&b.complete&&(await exactDownloads(original)).every(r=>r.equal)&&mail.length===before,{fired,code:error?.code,deletes,sharedExact:saved?.equals(original.upload.raw),b,noticeDelta:mail.length-before});
 });

 for(const boundary of ['inspection','commit','postcommit'])await test('HG-DELETE-RACE-'+boundary,async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const u=await opFor(id),old=await freeze(u);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:u.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id),sources=await removeAll(old.upload),before=mail.length;
  let fired=false,deleted:any;const read=dropbox.readMirror,reader=spyOn(dropbox,'readMirror').mockImplementation(async(path:string,...args:any[])=>{const r=await read(path,...args);if(boundary==='inspection'&&path===sources.at(-1)&&!fired){fired=true;deleted=await req('portal/documents/'+live.upload.id,undefined,'client','DELETE');}return r;});
  db.query=async(q:string,p:any[])=>{if(boundary!=='inspection'&&!fired&&q.includes("jsonb_build_object($3::text,$4::jsonb)")){fired=true;const saved=boundary==='postcommit'?await rawQuery(q,p):undefined;deleted=await req('portal/documents/'+live.upload.id,undefined,'client','DELETE');if(saved)return saved;}return rawQuery(q,p)};
  let response:any;try{response=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});}finally{reader.mockRestore();db.query=rawQuery;}
  await retryDocumentDeletions();const [op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[u.id]),download=await req('portal/documents/'+live.upload.id+'/download',undefined,'client'),remaining=await Promise.all([...sources,...await pathsFor(live.upload.key)].map(p=>dropbox.readMirror(p)));
  check('HG-DELETE-RACE-'+boundary,fired&&deleted.status===200&&response.status===409&&response.body.error.code==='DOCUMENT_DELETED'&&!op.payload.historyRecovery?.upload&&!await readObject(old.upload.key)&&!await readObject(live.upload.key)&&remaining.every(x=>x===null)&&download.status===404&&mail.length===before,{fired,deleted:deleted?.status,response:response.body,status:response.status,gap:op.payload.historyRecovery?.upload,remaining:remaining.map(x=>!!x),download:download.status,noticeDelta:mail.length-before});
 });
 await test('HG-RECOVER-DELETE',async()=>{
  const co=await seedPair(),[u]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(u);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id&&r.slot==='statement'),i=officeFileIdentities(await officeRecoveryTables(db)).get(old.statement.key)!;await removeAll(old.statement);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
  const {appendDeletionMirror}=await import(R+'/server/backup-deletions.ts'),cas=dropbox.compareWriteMirror,remove=dropbox.deleteMirror;let fired=false,obstacles=0;const before=mail.length;
  const write=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{const r=await cas(path,...args);if(path===i.recoveryPath&&r&&!fired){fired=true;await appendDeletionMirror({storageKey:old.statement.key,documentId:old.statement.id,mirrorPath:old.statement.mirrorPath,requestedAt:new Date().toISOString(),reason:'client'});}return r;});
  const ds=spyOn(dropbox,'deleteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath&&await dropbox.readMirror(path)){obstacles++;throw Error('Temporary mirror removal obstacle');}return remove(path,...args);});let response:any,pending=false;
  try{response=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.statement.plain));await retryDocumentDeletions();pending=!!await dropbox.readMirror(i.recoveryPath);}finally{write.mockRestore();ds.mockRestore();}
  await retryDocumentDeletions();const [op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[u.id]),remaining=await Promise.all((await pathsFor(old.statement.key)).map(p=>dropbox.readMirror(p)));
  check('HG-RECOVER-DELETE',fired&&obstacles>0&&pending&&response.status===409&&response.body.error.code==='DOCUMENT_DELETED'&&op.payload.historyRecovery?.statement?.state!=='recovered'&&!await readObject(old.statement.key)&&remaining.every(x=>x===null)&&mail.length===before,{fired,obstacles,pending,status:response.status,response:response.body,gapState:op.payload.historyRecovery?.statement?.state,remaining:remaining.map(x=>!!x),noticeDelta:mail.length-before});
 });
}

if(mode==='notice-boundaries'){
 const storage=await import(R+'/server/storage.ts'),{spyOn}=await import('bun:test');
 for(const scenario of ['lease','error','phase'])await test('notice-boundary-'+scenario,async()=>{
  const co=await seedPair(),d=await detail(co);mailMode='fail';requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));mailMode='ok';const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),original=await freeze(op);
  await rawQuery("UPDATE documents SET notice_status='pending',notice_error=NULL,notice_lock_until=NULL WHERE id=$1",[op.result.documentId]);const before=mail.length,requests=mailRequests.length,read=storage.readObject;let reached=false,loser:any;const phases:any[]=[];let removed:string[]=[];
  if(scenario==='error')removed=await removeAll(original.statement);
  const reader=spyOn(storage,'readObject').mockImplementation(async(key:string,...args:any[])=>{if(key===original.articles.key){const [current]=await rawQuery('SELECT phase,lease,lease_until FROM office_operations WHERE id=$1',[op.id]);phases.push(current);if(scenario==='lease'&&!reached){reached=true;loser=await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003'));}}return read(key,...args);});
  let response:any;try{response=await req('admin/documents/'+op.result.documentId+'/resend-notice',{});}finally{reader.mockRestore();}
  const [saved]=await rawQuery('SELECT phase,lease,lease_until FROM office_operations WHERE id=$1',[op.id]),[notice]=await rawQuery('SELECT notice_status,notice_lock_until,notice_sent_at FROM documents WHERE id=$1',[op.result.documentId]);
  const id=scenario==='lease'?'NOTICE-VALIDATION-LEASE':scenario==='error'?'NOTICE-ERROR-PROPAGATION':'VERIFY-DONE-PHASE';
  check(id,scenario==='error'?response.status===409&&response.body.error.code==='UPLOAD_REQUIRED'&&notice.notice_status==='pending'&&notice.notice_lock_until===null&&notice.notice_sent_at===null&&mail.length===before&&mailRequests.length===requests:response.status===200&&saved.phase==='done'&&saved.lease===null&&phases.length>0&&phases.every(p=>p.phase==='done'&&!!p.lease)&&notice.notice_status==='sent'&&mail.length===before+1&&(scenario!=='lease'||reached&&loser.status===409&&loser.body.error.code==='OFFICE_BUSY'),{response:response.body,status:response.status,loser,phases,saved,notice,noticeDelta:mail.length-before,providerCalls:mailRequests.length-requests});
  if(removed.length)await restoreAll(original.statement,removed);
 });
 await test('COPY-REPAIR-EXACT-two-snapshots',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await freeze(await opFor(id)),i=officeFileIdentities(await officeRecoveryTables(db)).get(original.upload.key)!,a=await runDbBackup({dispatchAttention:false}),b=await runDbBackup({dispatchAttention:false}),ar=(await readObject('backups/'+a.key))!,br=(await readObject('backups/'+b.key))!,j=JSON.stringify(await readRecoveryJournal()),dropbox=await import(R+'/server/dropbox.ts'),cas=dropbox.compareWriteMirror;
  const version=await dropbox.readMirrorVersion(i.recoveryPath);if(!version)throw Error('Initial shared copy missing');await cas(i.recoveryPath,Buffer.alloc(original.upload.raw.length,88),version.rev);let writes=0,creates=0;const before=mail.length,cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath){writes++;if(args[1]===null)creates++;}return cas(path,...args);});let c:any;try{c=await runDbBackup({dispatchAttention:false});}finally{cs.mockRestore();}
  const da=JSON.parse(gunzipSync(ar).toString()),dbb=JSON.parse(gunzipSync(br).toString()),ra=restoreFixture('COPY-REPAIR-EXACT-B1',da,originalRecords(original),originalRecords(original)),rb=restoreFixture('COPY-REPAIR-EXACT-B2',dbb,originalRecords(original),originalRecords(original));
  check('COPY-REPAIR-EXACT-B1-B2',a.key!==b.key&&c.complete&&writes===1&&creates===0&&JSON.stringify(await readRecoveryJournal())===j&&(await readObject('backups/'+a.key))?.equals(ar)&&(await readObject('backups/'+b.key))?.equals(br)&&ra.ok&&rb.ok&&mail.length===before,{keys:[a.key,b.key,c.key],writes,creates,c,ra,rb,noticeDelta:mail.length-before});
 });
}

if(mode==='copy-races'){
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts'),journalModule=await import(R+'/server/backup-deletions.ts'),helpers=await import(R+'/server/office-file-recovery.ts');
 for(const boundary of ['reuse','noop'])await test('COPY-DELETE-'+boundary,async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),old=await freeze(op),i=officeFileIdentities(await officeRecoveryTables(db)).get(old.upload.key)!,first=await runDbBackup({dispatchAttention:false}),dump1=JSON.parse(gunzipSync((await readObject('backups/'+first.key))!).toString()),before=mail.length,cas=dropbox.compareWriteMirror,read=dropbox.readMirrorVersion,record=journalModule.recordDocumentCopy;let reached=false,deleted:any,newCopies=0,noopCAS=0,inNoop=false;
  const cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(inNoop&&path===JOURNAL_PATH)noopCAS++;if(path.startsWith('/OfficeRecovery/')&&args[1]===null)newCopies++;return cas(path,...args);});
  const point=boundary==='reuse'?spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string,...args:any[])=>{const r=await read(path,...args);if(path===i.recoveryPath&&r&&!reached){reached=true;deleted=await req('portal/documents/'+i.file.id,undefined,'client','DELETE');}return r;}):spyOn(journalModule,'recordDocumentCopy').mockImplementation(async(copy:any)=>{inNoop=copy.storageKey===i.file.key;const r=await record(copy);inNoop=false;if(copy.storageKey===i.file.key&&!reached){reached=true;deleted=await req('portal/documents/'+i.file.id,undefined,'client','DELETE');}return r;});
  let b:any;try{b=await runDbBackup({dispatchAttention:false});}finally{point.mockRestore();cs.mockRestore();}await retryDocumentDeletions();for(let n=0;n<3&&!b.complete;n++)b=await runDbBackup({resumeOnly:true,dispatchAttention:false});const dump2=b.complete?JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()):null,restored=restoreFixture('COPY-DELETE-'+boundary,dump1,[],[]),download=await req('portal/documents/'+i.file.id+'/download',undefined,'client');
  check(boundary==='reuse'?'COPY-DELETE-REUSE':'COPY-NOOP-DELETION',reached&&deleted.status===200&&newCopies===0&&(boundary!=='noop'||noopCAS===0)&&b.complete&&!dump2.files.some((f:any)=>f.storageKey===i.file.key)&&download.status===404&&!await dropbox.readMirror(i.recoveryPath)&&restored.ok&&mail.length===before,{reached,deleted:deleted?.status,newCopies,noopCAS,b,download:download.status,restored,noticeDelta:mail.length-before});
 });
 await test('COPY-DELETE-CLEANUP-FAIL',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),old=await freeze(op),i=officeFileIdentities(await officeRecoveryTables(db)).get(old.upload.key)!,before=mail.length,cas=dropbox.compareWriteMirror,remove=dropbox.deleteMirror;let reached=false,failures=0,deleted:any;
  const cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath&&!reached){reached=true;deleted=await req('portal/documents/'+i.file.id,undefined,'client','DELETE');}return cas(path,...args);});
  const ds=spyOn(dropbox,'deleteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath&&await dropbox.readMirror(path)){failures++;throw Error('Temporary shared-copy removal obstacle');}return remove(path,...args);});let b:any,pending:boolean,decision:any;
  try{b=await runDbBackup({dispatchAttention:false});await retryDocumentDeletions();pending=!!await dropbox.readMirror(i.recoveryPath);decision=(await readRecoveryJournal()).records.find(r=>r.storageKey===i.file.key);}finally{cs.mockRestore();ds.mockRestore();}
  const denied=await req('portal/documents/'+i.file.id+'/download',undefined,'client');await retryDocumentDeletions();for(let n=0;n<3&&!b.complete;n++)b=await runDbBackup({resumeOnly:true,dispatchAttention:false});const dump=b.complete?JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()):null,restored=dump?restoreFixture('COPY-DELETE-CLEANUP-FAIL',dump,[],[]):null;
  check('COPY-DELETE-CLEANUP-FAIL',reached&&deleted.status===200&&failures>0&&pending&&decision?.extraMirrorPaths.includes(i.recoveryPath)&&denied.status===404&&!await dropbox.readMirror(i.recoveryPath)&&!await readObject(i.file.key)&&b.complete&&restored?.ok&&mail.length===before,{reached,deleted:deleted?.status,failures,pending,decision,denied:denied.status,b,restored,noticeDelta:mail.length-before});
 });
 await test('COPY-RETIRE-REGISTER-AFTER',async()=>{
  const ops=await import(R+'/server/office-operation.ts'),co=await company({status:'formed'}),id=await service('ein',co);let fault=0;db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Unpublished original');}return rawQuery(q,p)};await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;const u=await opFor(id),old=await freeze(u),i=officeFileIdentities(await officeRecoveryTables(db)).get(old.upload.key)!;if(fault!==1)throw Error('Unpublished original not reached');
  const record=journalModule.recordDocumentCopy,cas=dropbox.compareWriteMirror;let pause!:()=>void,release!:()=>void;const hit=new Promise<void>(r=>pause=r),gate=new Promise<void>(r=>release=r);let reached=false,uploads=0;
  const rs=spyOn(journalModule,'recordDocumentCopy').mockImplementation(async(copy:any)=>{if(copy.extraMirrorPaths?.includes(i.recoveryPath)&&!reached){reached=true;pause();await gate;}return record(copy);}),cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===i.recoveryPath)uploads++;return cas(path,...args);});
  const before=mail.length,pending=helpers.ensureOfficeRecoveryCopy(i).then(()=>({ok:true}),e=>({ok:false,code:e.code}));let result:any,v:any;
  try{await Promise.race([hit,Bun.sleep(4000).then(()=>{throw Error('Registration boundary not reached')})]);const payload={assignedEin:'881234561',notify:false,titleOverride:'',title:u.payload.title,summary:u.payload.summary,attachmentRequired:true},hash=ops.officeHash({pdf:Buffer.from(correctedBytes).toString('base64'),assignedEin:'881234561',titleOverride:'',notify:false}),held=await ops.claimRetirement(db,u,hash,payload);await ops.persistRetirementSet(db,held);v=await ops.completeRetirement(db,held);release();result=await pending;}finally{release();await pending;rs.mockRestore();cs.mockRestore();}
  requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false},['file'],correctedBytes)));const live=await freeze(await opFor(id)),decision=(await readRecoveryJournal()).records.find(r=>r.storageKey===i.file.key);await retryDocumentDeletions();
  check('COPY-RETIRE-REGISTER-AFTER',reached&&!result.ok&&result.code==='DOCUMENT_DELETED'&&uploads===0&&decision?.extraMirrorPaths.includes(i.recoveryPath)&&!await dropbox.readMirror(i.recoveryPath)&&v.id===(await opFor(id)).id&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{result,uploads,decision,noticeDelta:mail.length-before});
 });
}

if(mode==='copy-boundaries'){
 const dropbox=await import(R+'/server/dropbox.ts'),{spyOn}=await import('bun:test');
 await test('COPY-HISTORY-IDENTITY',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [u]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(u),b1=await runDbBackup({dispatchAttention:false}),dump1=JSON.parse(gunzipSync((await readObject('backups/'+b1.key))!).toString());
  const cas=dropbox.compareWriteMirror;let created=0;const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,rev:string|null)=>{const r=await cas(path,data,rev);if(r&&rev===null&&path.startsWith('/OfficeRecovery/'))created++;return r;});
  let b2:any,b3:any,dump2:any,dump3:any,afterCorrection=0,before=0;try{
   requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));before=mail.length;b2=await runDbBackup({dispatchAttention:false});afterCorrection=created;dump2=JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString());
   await rawQuery("UPDATE clients SET email='renamed@example.test' WHERE id=$1",[client]);await rawQuery("UPDATE documents SET title='Reworded title' WHERE order_id=$1",[co]);b3=await runDbBackup({dispatchAttention:false});dump3=JSON.parse(gunzipSync((await readObject('backups/'+b3.key))!).toString());
  }finally{spy.mockRestore();}
  const paths=Object.values(old).map((f:any)=>[dump1,dump2,dump3].map(d=>d.files.find((x:any)=>x.storageKey===f.key)?.path));
  check('COPY-HISTORY-IDENTITY',b2.complete&&b3.complete&&afterCorrection===2&&created===2&&paths.every(p=>p[0]&&p[0]===p[1]&&p[1]===p[2])&&mail.length===before,{afterCorrection,afterRename:created,paths,noticeDelta:mail.length-before});
 });
 await test('COPY-WRONG-INPUT',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),f=await freeze(op);await runDbBackup({dispatchAttention:false});const i=officeFileIdentities(await officeRecoveryTables(db)).get(f.upload.key)!,paths=await removeAll(f.upload);await dropbox.compareWriteMirror(i.recoveryPath,f.upload.raw,null);const before=mail.length,copy=(await dropbox.readMirrorVersion(i.recoveryPath))!,r=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false},['file'],correctedBytes));
  check('COPY-WRONG-INPUT',r.status===409&&r.body.error.code==='OFFICE_CONFLICT'&&!await readObject(f.upload.key)&&(await dropbox.readMirrorVersion(i.recoveryPath))?.rev===copy.rev&&mail.length===before,{response:r.body,noticeDelta:mail.length-before});await restoreAll(f.upload,paths);
 });
 await test('COPY-CURRENT-NO-ORIGINAL',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),f=await freeze(op),b1=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b1.key))!).toString()),paths=await removeAll(f.upload),before=mail.length,journal=JSON.stringify(await readRecoveryJournal());
  const b2=await runDbBackup({dispatchAttention:false}),r=restoreFixture('COPY-CURRENT-NO-ORIGINAL',dump,[],[],true),[saved]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[op.id]);
  check('COPY-CURRENT-NO-ORIGINAL',!b2.complete&&b2.pending===1&&r.ok&&!saved.payload.historyRecovery?.upload&&journal===JSON.stringify(await readRecoveryJournal())&&!await readObject(f.upload.key)&&mail.length===before,{b2,restore:r,noticeDelta:mail.length-before});await restoreAll(f.upload,paths);await runDbBackup({resumeOnly:true,dispatchAttention:false});
 });
 await test('COPY-OTHER-OWNER',async()=>{
  const ca=await company({status:'formed'}),sa=await service('certificate-of-status',ca),cb=await company({status:'formed',client:client2}),sb=await service('certificate-of-status',cb);await rawQuery('UPDATE service_orders SET client_id=$2 WHERE id=$1',[sb,client2]);for(const id of[sa,sb])requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));const fa=await freeze(await opFor(sa)),fb=await freeze(await opFor(sb)),identities=officeFileIdentities(await officeRecoveryTables(db)),ia=identities.get(fa.upload.key)!,ib=identities.get(fb.upload.key)!;
  const b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),before=mail.length,deleted=await req('admin/documents/'+fa.upload.id,undefined,'admin','DELETE');await retryDocumentDeletions();
  const other=await req('portal/documents/'+fb.upload.id+'/download',undefined,'other'),own=await req('portal/documents/'+fa.upload.id+'/download',undefined,'client'),stem=E+'/restore-other-owner',spec={id:'COPY-OTHER-OWNER-RESTORE',dump,target:temp+'/restore-other-owner',mirror:temp+'/mirror',output:stem+'-result.json',client:client2,originals:originalRecords(fb),downloads:originalRecords(fb),absent:[{key:fa.upload.key,id:fa.upload.id}]};writeFileSync(stem+'-input.json',JSON.stringify(spec));const restored=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',restored.stdout+restored.stderr);
  check('COPY-OTHER-OWNER',fa.upload.plain.equals(fb.upload.plain)&&ia.recoveryPath!==ib.recoveryPath&&deleted.status===200&&own.status===404&&other.status===200&&Buffer.from(other.bytes).equals(fb.upload.plain)&&!await dropbox.readMirror(ia.recoveryPath)&&!!await dropbox.readMirror(ib.recoveryPath)&&restored.status===0&&!(await readRecoveryJournal()).records.some(d=>d.storageKey===fb.upload.key)&&mail.length===before,{deleted:deleted.status,own:own.status,other:other.status,paths:[ia.recoveryPath,ib.recoveryPath],restoreExit:restored.status,evidence:stem+'.log',noticeDelta:mail.length-before});
 });
 await test('LEGACY-OFFICE-NO-SHA',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),frozen=await freeze(op),files=structuredClone(op.files);for(const f of Object.values(files)as any[])delete f.sha;await rawQuery("UPDATE office_operations SET files=$2::jsonb,payload=payload-'fileIntents' WHERE id=$1",[op.id,JSON.stringify(files)]);const before=mail.length;
  const b=await runDbBackup({dispatchAttention:false}),recovery=await req('admin/orders/'+co+'/office-recovery/'+op.id+'/articles',form({},['file'],frozen.articles.plain)),replay=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles'])),[saved]=await rawQuery('SELECT files FROM office_operations WHERE id=$1',[op.id]);
  check('LEGACY-OFFICE-NO-SHA',b.complete&&recovery.status===409&&recovery.body.error.code==='RECOVERY_IDENTITY_UNAVAILABLE'&&replay.status===200&&Object.values(saved.files).every((f:any)=>!f.sha)&&(await exactDownloads(frozen)).every(r=>r.equal)&&mail.length===before,{b,recovery:recovery.body,replay:replay.status,noticeDelta:mail.length-before});
 });
}

if(mode==='integrity')await test('manifest-integrity',async()=>{
 const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),b=await runDbBackup({dispatchAttention:false}),saved=(await readObject('backups/'+b.key))!,good=JSON.parse(gunzipSync(saved).toString()),before=mail.length;
 for(const variant of ['digest','path','owner']){
  const dump=structuredClone(good),f=dump.files.find((f:any)=>f.storageKey===originals.statement.key),badPath='/OfficeRecovery/v1/other-client.backup';
  const {readMirrorVersion,compareWriteMirror}=await import(R+'/server/dropbox.ts'),savedMirror=variant==='digest'?await readMirrorVersion(f.path):null;
  if(variant==='digest'){const bad=Buffer.alloc(originals.statement.plain.length,88);f.sha=hashBytes(bad);if(!await compareWriteMirror(f.path,bad,savedMirror!.rev))throw Error('Fixture damage lost CAS');}
  if(variant==='path')f.path=badPath;if(variant==='owner')f.officeRecoveryIdentity[1]=client2;
  const id=variant==='digest'?'RESTORE-BAD-COMPLETE':'COPY-MANIFEST-FORGERY-'+variant,stem=E+'/'+id,spec={id,dump,target:temp+'/restore-'+variant,mirror:temp+'/mirror',output:stem+'-result.json',client,originals:[],downloads:[],expectRefusal:true,expectCode:'RECOVERY_IDENTITY_CONFLICT',forbidMirror:badPath};writeFileSync(stem+'-input.json',JSON.stringify(spec));
  const child=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',child.stdout+child.stderr);
  check(id,child.status===0&&(await readObject('backups/'+b.key))?.equals(saved)&&mail.length===before,{exit:child.status,child:child.stdout,errors:child.stderr,originalUnchanged:(await readObject('backups/'+b.key))?.equals(saved),noticeDelta:mail.length-before});
  if(savedMirror){const now=await readMirrorVersion(f.path);if(!await compareWriteMirror(f.path,savedMirror.data,now!.rev))throw Error('Fixture reset lost CAS');}
 }
});
if(mode==='snapshots'){
 const {spyOn}=await import('bun:test'),storage=await import(R+'/server/storage.ts');
 await test('COPY-BUSY-SITE',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),v1=await freeze(c1),before=mail.length;
  const put=storage.putObject;let pause=false;
  const spy=spyOn(storage,'putObject').mockImplementation(async(...args:any[])=>{const result=await put(...args);if(!pause&&args[0]==='backup-jobs/current.json'&&JSON.parse(args[1].toString()).phase==='verify'&&JSON.parse(args[1].toString()).cursor>0){pause=true;throw Error('fixture pause after first verification');}return result;});
  let stopped='';try{await runDbBackup({dispatchAttention:false});}catch(e){stopped=String(e);}spy.mockRestore();
  const first=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
  const middle=await runDbBackup({resumeOnly:true,budgetMs:0,dispatchAttention:false}).catch(()=>null);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),correctedBytes,'L26000000004')));
  const [c3]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),v3=await freeze(c3),b1=await runDbBackup({resumeOnly:true,dispatchAttention:false});
  const dump1=b1.complete?JSON.parse(gunzipSync((await readObject('backups/'+b1.key))!).toString()):null,r1=dump1?restoreFixture('COPY-BUSY-SITE-B1',dump1,originalRecords(v1),originalRecords(v1)):null;
  const b2=await runDbBackup({dispatchAttention:false}),dump2=b2.complete?JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString()):null,r2=dump2?restoreFixture('COPY-BUSY-SITE-B2',dump2,originalRecords(v3),originalRecords(v3)):null;
  check('COPY-BUSY-SITE',pause&&b1.complete&&b2.complete&&b1.key===first.key&&dump1.dumpedAt===first.dump.dumpedAt&&r1?.ok&&r2?.ok&&mail.length===before+2,{stopped,middle,b1,b2,firstKey:first.key,firstTime:first.dump.dumpedAt,finalTime:dump1?.dumpedAt,r1,r2,noticeDelta:mail.length-before});
 });
 await test('BACKUP-PUBLISH-LOST-ACK',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await freeze(await opFor(id)),before=mail.length,put=storage.putObject;let fired=false,key='';
  const spy=spyOn(storage,'putObject').mockImplementation(async(...args:any[])=>{const result=await put(...args);if(!fired&&String(args[0]).startsWith('backups/')){fired=true;key=args[0];throw Error('fixture completed backup acknowledgment lost');}return result;});
  let stopped='';try{await runDbBackup({dispatchAttention:false});}catch(e){stopped=String(e);}spy.mockRestore();const saved=await readObject(key);
  // A later deletion must still defeat the saved snapshot, without rewriting it.
  requireOk(await req('portal/documents/'+original.upload.id,undefined,'client','DELETE'));
  let retry:any,error='';try{retry=await runDbBackup({resumeOnly:true,dispatchAttention:false});}catch(e){error=String(e);}
  const bytes=await readObject(key);
  check('BACKUP-PUBLISH-LOST-ACK',fired&&retry?.complete===true&&saved?.equals(bytes!)&&mail.length===before,{fired,stopped,error,retry,unchanged:saved?.equals(bytes!),noticeDelta:mail.length-before});
 });
}

if(mode==='filing-neighbors'){
 await test('FILING-STALE-ARTICLES-CLAIM',async()=>{
  const co=await company({status:'filed',series:[{name:'PS 1'}],payload:{certifications:{articlesSignedBy:'SERVICE'}}});
  let release!:()=>void,reached!:()=>void;const blocked=new Promise<void>(r=>release=r),hit=new Promise<void>(r=>reached=r);let fired=0;
  db.query=async(q:string,p:any[])=>{if(q.includes('WITH owner AS (UPDATE orders SET office_upload_id=$5')&&fired++===0){reached();await blocked;}return rawQuery(q,p)};
  const initial=req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));
  await Promise.race([hit,new Promise((_,reject)=>setTimeout(()=>reject(Error('Initial claim barrier not reached')),5000))]);
  let formed:any;
  try{formed=await req('admin/orders/'+co+'/formation-documents',form({documentNumber:'L26000000002',psdSeries:JSON.stringify(['PS 1'])},['articles','psd'],correctedBytes));}finally{release();}
  const delayed=await initial;db.query=rawQuery;const files=await current(co),articles=files.filter((d:any)=>d.kind==='articles'),statements=files.filter((d:any)=>d.kind==='statement'),operations=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]);
  const download=articles.length===1?await req('portal/documents/'+articles[0].id+'/download',undefined,'client'):null;
  check('FILING-STALE-ARTICLES-CLAIM',formed.status===200&&delayed.status===409&&articles.length===1&&statements.length===1&&operations.length===0&&download?.status===200&&Buffer.from(download.bytes).equals(Buffer.from(correctedBytes)),{formed:formed.status,delayed:delayed.status,code:delayed.body?.error?.code,articles:articles.length,statements:statements.length,operations:operations.length,download:download?.status});
 });
 await test('CONVERSION-STALE-SIGNER-NO-STATEMENT',async()=>{
  const co=await company({package:'CONVERT',series:[{name:'PS 1'}],payload:{certifications:{articlesSignedBy:'SERVICE'}}}),before=mail.length;
  const formed=await req('admin/orders/'+co+'/formation-documents',form({psdSeries:JSON.stringify(['PS 1'])},['psd']));
  const {readOrderBoard}=await import(R+'/server/admin-board.ts'),board:any=await readOrderBoard(db,'','completed',1),row=board.orders.find((o:any)=>o.id===co),files=await current(co);
  const r=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));
  check('CONVERSION-STALE-SIGNER-NO-STATEMENT',formed.status===200&&row?.work_stage==='completed'&&!row.statement_missing&&files.length===1&&files[0].kind==='psd'&&r.status===400&&mail.length===before+1,{formed:formed.status,stage:row?.work_stage,statementMissing:row?.statement_missing,kinds:files.map((f:any)=>f.kind),articlesRefusal:r.status,noticeDelta:mail.length-before});
 });
 await test('FILING-REPLACE-PRESERVES-IDENTITY',async()=>{
  const co=await seedPair(false),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),old=originals.articles,before=mail.length;
  const replacement=await req('admin/documents/'+old.id+'/replace',form({},['file'],correctedBytes));requireOk(replacement);
  const t=await officeRecoveryTables(db),identity=officeFileIdentities(t).get(old.key)!;
  const id=await service('certificate-of-status',co),completed=await req('admin/services/'+id+'/fulfill',form({notify:false}));requireOk(completed);
  const b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
  const live=(await docs(co)).find((d:any)=>d.id===old.id),download=await req('portal/documents/'+old.id+'/download',undefined,'client');
  const restored=restoreFixture('FILING-REPLACE-PRESERVES-IDENTITY',dump,originalRecords(originals),[{id:old.id,key:live.storage_key,sha:hashBytes(Buffer.from(correctedBytes)),size:correctedBytes.length}]);
  let conflict=false;const forged=structuredClone(t);for(const d of forged.documents)if(d.id===old.id)d.client_id=client2;
  try{officeFileIdentities(forged)}catch(e){conflict=(e as any).code==='RECOVERY_IDENTITY_CONFLICT'}
  check('FILING-REPLACE-PRESERVES-IDENTITY',identity?.historical&&identity.file.sha===old.sha&&b.complete&&restored.ok&&Buffer.from(download.bytes).equals(Buffer.from(correctedBytes))&&conflict,{replacement:replacement.status,completed:completed.status,historical:identity?.historical,oldKey:old.key,currentKey:live.storage_key,b,restored,wrongOwnerRefused:conflict,noticeDelta:mail.length-before});
 });
 await test('CERTIFICATE-DELETE-OVERLAP',async()=>{
  const co=await company(),id=await service('certificate-of-status',co),r=requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false}))),key=(await docs(co)).find((d:any)=>d.id===r.documentId).storage_key,before=mail.length;
  const calls=await Promise.all([req('admin/documents/'+r.documentId,undefined,'admin','DELETE'),req('admin/documents/'+r.documentId,undefined,'admin','DELETE')]);
  const journal=await readRecoveryJournal(),download=await req('portal/documents/'+r.documentId+'/download',undefined,'client');
  check('CERTIFICATE-DELETE-OVERLAP',calls.every(x=>x.status===200)&&journal.records.filter((x:any)=>x.storageKey===key).length===1&&download.status===404&&!await readObject(key)&&mail.length===before,{calls:calls.map(x=>({status:x.status,body:x.body})),decisions:journal.records.filter((x:any)=>x.storageKey===key).length,download:download.status,noticeDelta:mail.length-before});
 });
}
if(mode==='contract-boundaries'){
 const {spyOn}=await import('bun:test');
 await test('NOTICE-DAMAGE-MIRROR',async()=>{
  const co=await seedPair(),d=await detail(co);mailMode='fail';requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));mailMode='ok';const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length,requests=mailRequests.length;
  const paths=await removeAll(originals.statement);const {compareWriteMirror}=await import(R+'/server/dropbox.ts');await compareWriteMirror('/OfficeOperations/'+op.id+'/statement',originals.statement.raw,null);
  const first=await req('admin/documents/'+op.result.documentId+'/resend-notice',{}),second=await req('admin/documents/'+op.result.documentId+'/resend-notice',{}),sent=mailRequests.slice(requests);
  check('NOTICE-DAMAGE-MIRROR',first.status===200&&first.body.data.notified===true&&second.status===200&&(await exactDownloads(originals)).every(r=>r.equal)&&mail.length===before+1&&sent.length===1&&String(sent[0].key).includes(op.id),{first:first.body,second:second.body,noticeDelta:mail.length-before,keys:sent.map(r=>r.key)});await restoreAll(originals.statement,paths);
 });
 await test('RECOVERY-JOURNAL-DOWN',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),frozen=await freeze(op),before=mail.length,dropbox=await import(R+'/server/dropbox.ts'),read=dropbox.readMirrorVersion;let reached=0;
  const spy=spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string,options:any)=>{if(path===JOURNAL_PATH){reached++;throw Error('Fixture journal outage')}return read(path,options);});let r:any;try{r=await req('admin/orders/'+co+'/correct-articles',correction(d));}finally{spy.mockRestore();}
  check('RECOVERY-JOURNAL-DOWN',reached>0&&r.status===503&&r.body.error.code==='RECOVERY_UNAVAILABLE'&&(await exactDownloads(frozen)).every(r=>r.equal)&&mail.length===before,{reached,status:r.status,response:r.body,noticeDelta:mail.length-before});
 });
 await test('HISTORY-A-STORAGE-DOWN',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),frozen=await freeze(op),old=frozen.statement,paths=await pathsFor(old.key),dropbox=await import(R+'/server/dropbox.ts'),read=dropbox.readMirror,readV=dropbox.readMirrorVersion,before=mail.length;
  rmSync(temp+'/files/'+old.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));let reached=0;
  const spy=spyOn(dropbox,'readMirror').mockImplementation(async(path:string,...args:any[])=>{if(paths.includes(path)){reached++;throw Error('Fixture source timeout')}return read(path,...args);}),spyV=spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string,...args:any[])=>{if(paths.includes(path)){reached++;throw Error('Fixture source timeout')}return readV(path,...args);});let r:any;
  try{r=await req('admin/orders/'+co+'/correct-articles',correction(await detail(co)));}finally{spy.mockRestore();spyV.mockRestore();}
  const operations=await rawQuery('SELECT payload,phase FROM office_operations WHERE target_id=$1',[co]),a=await req('portal/documents/'+frozen.articles.id+'/download',undefined,'client');
  check('HISTORY-A-STORAGE-DOWN',reached>0&&r.status===503&&r.body.error.code==='RECOVERY_UNAVAILABLE'&&operations.every((o:any)=>!Object.values(o.payload.historyRecovery??{}).some((g:any)=>g.state==='unrecoverable'))&&a.status===200&&Buffer.from(a.bytes).equals(frozen.articles.plain)&&mail.length===before,{reached,response:r.body,phases:operations.map((o:any)=>o.phase),noticeDelta:mail.length-before});await restoreAll(old,paths);
 });
 await test('HISTORY-A-CURRENT-MISSING',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),frozen=await freeze(op),paths=await removeAll(frozen.statement),before=mail.length;
  const r=await req('admin/orders/'+co+'/correct-articles',correction(d)),b=await runDbBackup({dispatchAttention:false}),checkpoint=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());
  check('HISTORY-A-CURRENT-MISSING',r.status===409&&r.body.error.code==='UPLOAD_REQUIRED'&&!b.complete&&b.pending===1&&!await readObject('backups/'+b.key)&&!checkpoint.done[frozen.statement.key]&&checkpoint.errors[frozen.statement.key]&&mail.length===before,{response:r.body,b,error:checkpoint.errors[frozen.statement.key],noticeDelta:mail.length-before});
  check('BACKUP-NO-COPY',!b.complete&&b.pending===1&&!checkpoint.done[frozen.statement.key]&&!await readObject(frozen.statement.key),{b,error:checkpoint.errors[frozen.statement.key]});await restoreAll(frozen.statement,paths);await runDbBackup({resumeOnly:true,dispatchAttention:false});
 });
 await test('INTENTIONAL-NO-FILE',async()=>{
  const co=await company({status:'formed'}),id=await service('series',co,{details:{seriesName:'PS None'}});requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false},[])));const before=mail.length,first=await opFor(id),r=await req('admin/services/'+id+'/fulfill',{resume:true}),op=await opFor(id),[s]=await rawQuery('SELECT status FROM service_orders WHERE id=$1',[id]);
  check('INTENTIONAL-NO-FILE',r.status===200&&op.id===first.id&&s.status==='fulfilled'&&op.result.documentId===null&&Object.keys(op.files).length===0&&!(await docs(co)).length&&mail.length===before,{response:r.body,result:op.result,slots:Object.keys(op.files),noticeDelta:mail.length-before});
 });
 await test('CONVERSION-NO-RECOVERY',async()=>{
  const co=await company({package:'CONVERT',status:'paid',series:[{name:'PS 1'}]});requireOk(await req('admin/orders/'+co+'/formation-documents',form({documentNumber:'L26000000009',psdSeries:JSON.stringify(['PS 1'])},['psd'])));const documents=await docs(co),before=mail.length;
  const listing=await req('admin/orders/'+co+'/office-recovery'),r=await req('admin/orders/'+co+'/office-recovery/'+crypto.randomUUID()+'/articles',form()),download=await req('portal/documents/'+documents.find((d:any)=>d.kind==='psd').id+'/download',undefined,'client');
  check('CONVERSION-NO-RECOVERY',listing.status===200&&listing.body.data.length===0&&r.status===404&&!documents.some((d:any)=>['articles','statement'].includes(d.kind))&&download.status===200&&Buffer.from(download.bytes).equals(Buffer.from(pdfBytes))&&mail.length===before,{listing:listing.body,recovery:r.status,download:download.status,noticeDelta:mail.length-before});
 });
 await test('IDENTITY-CONFLICT',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const op=await opFor(id),frozen=await freeze(op),duplicate=crypto.randomUUID(),before=mail.length;
  await rawQuery(`INSERT INTO office_operations(id,kind,target_id,input_hash,phase,payload,files,result) SELECT $2::uuid,'service-history:'||($2::uuid)::text,target_id,input_hash,'superseded',payload,jsonb_set(files,'{upload,sha}',to_jsonb($3::text)),result FROM office_operations WHERE id=$1`,[op.id,duplicate,'0'.repeat(64)]);let error:any;try{await runDbBackup({dispatchAttention:false});}catch(e){error=e;}
  check('IDENTITY-CONFLICT',error?.code==='RECOVERY_IDENTITY_CONFLICT'&&(await exactDownloads(frozen)).every(r=>r.equal)&&mail.length===before,{error:String(error),code:error?.code,noticeDelta:mail.length-before});await rawQuery('DELETE FROM office_operations WHERE id=$1',[duplicate]);
 });
 await test('ALIAS-OTHER-OWNER-ABSENCE',async()=>{
  const ca=await company({status:'formed'}),a=await service('certificate-of-status',ca);requireOk(await req('admin/services/'+a+'/fulfill',form({notify:false})));const old=await freeze(await opFor(a)),op=await opFor(a);requireOk(await req('admin/services/'+a+'/fulfill',form({notify:false,correctionOf:op.id},['file'],correctedBytes)));const live=await freeze(await opFor(a));
  const cb=await company({status:'formed',client:client2}),b=await service('certificate-of-status',cb);await rawQuery('UPDATE service_orders SET client_id=$2 WHERE id=$1',[b,client2]);requireOk(await req('admin/services/'+b+'/fulfill',form({notify:false})));const otherFiles=await freeze(await opFor(b));if(!old.upload.plain.equals(otherFiles.upload.plain))throw Error('Owners must have identical original bytes');
  const paths=await removeAll(old.upload),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===op.id&&r.slot==='upload'),before=mail.length,r=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}),otherDownload=await req('portal/documents/'+otherFiles.upload.id+'/download',undefined,'other');
  check('ALIAS-OTHER-OWNER',r.status===200&&r.body.data.state==='unrecoverable'&&!await readObject(old.upload.key)&&otherDownload.status===200&&Buffer.from(otherDownload.bytes).equals(otherFiles.upload.plain)&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{response:r.body,other:otherDownload.status,noticeDelta:mail.length-before});await restoreAll(old.upload,paths);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[])));
 });
}

if(mode==='contract'){
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts');
 await test('COPY-UNCHANGED',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await freeze(await opFor(id)),before=mail.length;
  const write=dropbox.compareWriteMirror,counts={shared:0,journal:0};const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(...args:any[])=>{if(args[0].startsWith('/OfficeRecovery/'))counts.shared++;if(args[0]===JOURNAL_PATH)counts.journal++;return write(...args);});
  const b1=await runDbBackup({dispatchAttention:false}),c1={...counts},d1=JSON.parse(gunzipSync((await readObject('backups/'+b1.key))!).toString());
  const b2=await runDbBackup({dispatchAttention:false}),c2={...counts},d2=JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString());spy.mockRestore();
  const r1=restoreFixture('COPY-UNCHANGED-B1',d1,originalRecords(original),originalRecords(original)),r2=restoreFixture('COPY-UNCHANGED-B2',d2,originalRecords(original),originalRecords(original));
  check('COPY-UNCHANGED',b1.complete&&b2.complete&&c1.shared===1&&c2.shared===c1.shared&&c2.journal===c1.journal&&d1.files[0].path===d2.files[0].path&&r1.ok&&r2.ok&&mail.length===before,{b1,b2,c1,c2,r1,r2,noticeDelta:mail.length-before});
 });
 await test('COPY-ONLY-SURVIVOR',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(op),before=mail.length;
  await runDbBackup({dispatchAttention:false});const i=officeFileIdentities(await officeRecoveryTables(db)).get(old.statement.key)!;
  const paths=await pathsFor(old.statement.key);rmSync(temp+'/files/'+old.statement.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));for(const p of paths)if(p!==i.recoveryPath)rmSync(temp+'/mirror'+p,{force:true});
  const r=await req('admin/orders/'+co+'/correct-articles',correction(d));
  check('COPY-ONLY-SURVIVOR',r.status===200&&(await exactDownloads(old)).every(d=>d.equal)&&mail.length===before,{status:r.status,response:r.body,noticeDelta:mail.length-before,remaining:i.recoveryPath});
  await restoreAll(old.statement,paths);
 });
 await test('ARCHIVE-INITIAL-DONE',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const [now]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(now),before=mail.length,list=await req('admin/backups/history-recovery');let success=list.status===200;const observations:any[]=[];
  for(const slot of ['articles','statement']){
   const row=list.body.data?.rows?.find((r:any)=>r.operationId===op.id&&r.slot===slot);if(!row){success=false;observations.push({slot,missing:true});continue;}
   const f=old[slot],keep=`/OfficeOperations/${op.id}/${slot}`,paths=await pathsFor(f.key);rmSync(temp+'/files/'+f.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));for(const p of paths)if(p!==keep)rmSync(temp+'/mirror'+p,{force:true});
   const refused=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}),recover=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[]));
   success&&=refused.status===409&&refused.body.error?.code==='RECOVERY_COPY_AVAILABLE'&&recover.status===200&&(await readObject(f.key))?.equals(f.raw);observations.push({slot,refused:refused.status,recovered:recover.status});
  }
  const b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),restored=restoreFixture('ARCHIVE-INITIAL-DONE',dump,[...originalRecords(old),...originalRecords(live)],originalRecords(live));
  check('ARCHIVE-INITIAL-DONE',success&&b.complete&&restored.ok&&op.kind==='articles'&&op.phase==='done'&&!dump.historyGaps?.length&&mail.length===before,{observations,b,restored,noticeDelta:mail.length-before});
 });
 await test('HG-TIMEOUT',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const [now]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(now),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===op.id&&r.slot==='statement'),paths=await removeAll(old.statement),before=mail.length;
  const read=dropbox.readMirror;let timeouts=0;const spy=spyOn(dropbox,'readMirror').mockImplementation(async(path:string)=>{if(path===`/OfficeOperations/${op.id}/statement`){timeouts++;throw new DOMException('fixture timeout','TimeoutError');}return read(path);});
  const r=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}),b=await runDbBackup({dispatchAttention:false});spy.mockRestore();
  const saved=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[op.id]))[0].payload;
  check('HG-TIMEOUT',timeouts>0&&r.status===503&&r.body.error?.code==='RECOVERY_UNAVAILABLE'&&!saved.historyRecovery?.statement&&!b.complete&&(await exactDownloads(live)).every(d=>d.equal)&&mail.length===before,{status:r.status,response:r.body,timeouts,b,gap:saved.historyRecovery?.statement,noticeDelta:mail.length-before});await restoreAll(old.statement,paths);
 });
 await test('HG-STALE-LEASE',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const [now]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(now),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===op.id&&r.slot==='statement'),paths=await removeAll(old.statement),before=mail.length,winning=crypto.randomUUID();let stolen=false;
  db.query=async(sql:string,args:any[])=>{if(!stolen&&sql.includes("jsonb_build_object($3::text,$4::jsonb)")){stolen=true;await rawQuery("UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes' WHERE id=$1",[op.id,winning]);await rawQuery('UPDATE orders SET office_upload_id=$2 WHERE id=$1',[co,winning]);}return rawQuery(sql,args);};
  const r=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});db.query=rawQuery;const [held]=await rawQuery('SELECT lease,payload FROM office_operations WHERE id=$1',[op.id]),[order]=await rawQuery('SELECT office_upload_id FROM orders WHERE id=$1',[co]);
  check('HG-STALE-LEASE',stolen&&r.status===409&&r.body.error?.code==='OFFICE_BUSY'&&held.lease===winning&&order.office_upload_id===winning&&!held.payload.historyRecovery?.statement&&(await exactDownloads(live)).every(d=>d.equal)&&mail.length===before,{stolen,response:r.body,status:r.status,lease:held.lease,target:order.office_upload_id,gap:held.payload.historyRecovery?.statement,noticeDelta:mail.length-before});
  await rawQuery('UPDATE office_operations SET lease=NULL,lease_until=NULL WHERE id=$1',[op.id]);await rawQuery('UPDATE orders SET office_upload_id=NULL WHERE id=$1',[co]);await restoreAll(old.statement,paths);
 });
}

if(mode==='edges'){
 for(const acknowledged of [false,true])await test('history-target-expiry-'+acknowledged,async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const first=await opFor(id),old=await freeze(first);
  requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false,correctionOf:first.id},['file'],correctedBytes)));const live=await opFor(id),liveOriginal=await freeze(live);
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===first.id);
  if(acknowledged){await removeAll(old.upload);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));}
  const before=mail.length;let expired=false;
  db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(!expired&&sql.includes('UPDATE office_operations SET lease=')&&args[0]===first.id){await rawQuery("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[live.id]);expired=true;}return result;};
  const response=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.upload.plain));db.query=rawQuery;
  const saved=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[first.id]))[0].payload;
  check('HG-RECOVER-TARGET-EXPIRED-'+acknowledged,expired&&response.status===409&&response.body.error.code==='OFFICE_BUSY'&&(!acknowledged||saved.historyRecovery.upload.state==='unrecoverable')&&(await exactDownloads(liveOriginal)).every(r=>r.equal)&&mail.length===before,{expired,status:response.status,response:response.body,gapState:saved.historyRecovery?.upload?.state,noticeDelta:mail.length-before});
  if(acknowledged)requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.upload.plain)));
 });
 await test('manual-recovery-expired-lease',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),before=mail.length;let expired=false;
  db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(!expired&&sql.includes('UPDATE office_operations SET lease=')&&args[0]===op.id){await rawQuery("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[op.id]);expired=true;}return result;};
  const r=await req(`admin/orders/${co}/office-recovery/${op.id}/articles`,form({},[]));db.query=rawQuery;
  check('RECOVERY-LEASE-EXPIRED',expired&&r.status===409&&r.body.error.code==='OFFICE_BUSY'&&mail.length===before,{expired,status:r.status,response:r.body,noticeDelta:mail.length-before});
 });
 await test('history-recovery-crash',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(op);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===op.id&&r.slot==='statement');
  const removed=await removeAll(old.statement);const gap=requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
  const before=mail.length;let fault=false;
  db.query=async(sql:string,args:any[])=>{if(!fault&&sql.includes("ARRAY['historyRecovery',$3]")){fault=true;throw Error('R8 recovered metadata commit interrupted');}return rawQuery(sql,args);};
  const failed=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],old.statement.plain));db.query=rawQuery;
  const afterFailure=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[op.id]))[0].payload.historyRecovery.statement;
  const checked=await req('admin/backups/history-recovery/'+row.historyId+'/check',{});
  const afterCheck=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[op.id]))[0].payload.historyRecovery.statement;
  check('HG-RECOVER-CRASH',fault&&failed.status===500&&afterFailure.state==='unrecoverable'&&checked.status===200&&afterCheck.state==='recovered'&&afterCheck.decisionId===gap.decisionId&&mail.length===before,{fault,failed:failed.status,checked:checked.body,afterFailure,afterCheck,noticeDelta:mail.length-before});
  await restoreAll(old.statement,removed);
  await removeAll(old.statement);const gapAgain=requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
  const oldBackup=await runDbBackup({dispatchAttention:false});
  await mirrorFile({storageKey:old.statement.key,path:`/OfficeOperations/${op.id}/statement`}).catch(()=>{});
  // A previously unavailable original reappears in the recorded provider folder,
  // without an office action or metadata update.
  const {compareWriteMirror}=await import(R+'/server/dropbox.ts');await compareWriteMirror(`/OfficeOperations/${op.id}/statement`,old.statement.raw,null);
  const newBackup=await runDbBackup({dispatchAttention:false});const gapState=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[op.id]))[0].payload.historyRecovery.statement;
  check('HG-STALE-GAP',oldBackup.status==='complete_with_history_gaps'&&newBackup.complete===true&&gapState.state==='recovered'&&gapState.decisionId===gapAgain.decisionId&&mail.length===before,{oldBackup,newBackup,gapState,noticeDelta:mail.length-before});
 });
}
if(mode==='api'){
 await test('verify-initial-expiry',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),before=mail.length;let checks=0,expired=false;
  db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(sql.startsWith('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()')&&args[0]===op.id&&++checks===2){await rawQuery("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[op.id]);expired=true;}return result;};
  const replay=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;
  check('VERIFY-LEASE-EXPIRED-initial',expired&&replay.status===409&&replay.body.error.code==='OFFICE_BUSY'&&mail.length===before,{expired,checks,response:replay.body,status:replay.status,noticeDelta:mail.length-before});
 });
 await test('verify-expiry',async()=>{
  const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),before=mail.length;let checks=0,expired=false;
  db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(sql.startsWith('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()')&&args[0]===op.id&&++checks===2){await rawQuery("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[op.id]);expired=true;}return result;};
  const replay=await req('admin/orders/'+co+'/correct-articles',correction(d));db.query=rawQuery;
  check('VERIFY-LEASE-EXPIRED',expired&&replay.status===409&&replay.body.error.code==='OFFICE_BUSY'&&mail.length===before,{expired,checks,response:replay.body,status:replay.status,noticeDelta:mail.length-before});
 });
 await test('recovery-access',async()=>{
  const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),frozen=await freeze(op),before=mail.length;
  for(const [label,actor]of [['anonymous','none'],['client','client']] as const){const r=await req(`admin/orders/${co}/office-recovery/${op.id}/articles`,form({},[]),actor);check('RECOVERY-AUTH-'+label,r.status===401,{status:r.status});}
  const wrongCo=await company({client:client2});
  for(const [label,path,status]of [['wrong-order',`admin/orders/${wrongCo}/office-recovery/${op.id}/articles`,404],['invalid-id',`admin/orders/no-id/office-recovery/${op.id}/articles`,404],['invalid-slot',`admin/orders/${co}/office-recovery/${op.id}/alien`,400]] as const){const r=await req(path,form({},[]));check('RECOVERY-AUTH-'+label,r.status===status,{status:r.status,body:r.body});}
  for(const slot of ['articles','statement']){const f=frozen[slot],removed=await removeAll(f),r=await req(`admin/orders/${co}/office-recovery/${op.id}/${slot}`,form({},['file'],f.plain));const dl=await exactDownloads({[slot]:f});check('RECOVERY-UPLOAD-'+slot,r.status===200&&dl.every(d=>d.equal)&&mail.length===before,{response:r.body,downloads:dl,noticeDelta:mail.length-before});await restoreAll(f,removed);}
  const wrong=await req(`admin/orders/${co}/office-recovery/${op.id}/articles`,form({},['file'],correctedBytes));check('RECOVERY-WRONG',wrong.status===409&&wrong.body.error.code==='OFFICE_CONFLICT'&&(await exactDownloads(frozen)).every(d=>d.equal)&&mail.length===before,{response:wrong.body});
  await rawQuery("UPDATE office_operations SET files=jsonb_set(files,'{articles}',(files->'articles')-'sha') WHERE id=$1",[op.id]);
  const legacy=await req(`admin/orders/${co}/office-recovery/${op.id}/articles`,form({},[]));
  check('RECOVERY-UNKNOWN-IDENTITY',legacy.status===409&&legacy.body.error.code==='RECOVERY_IDENTITY_UNAVAILABLE'&&mail.length===before,{status:legacy.status,response:legacy.body});
  await rawQuery("UPDATE office_operations SET files=jsonb_set(files,'{articles}', $2::jsonb) WHERE id=$1",[op.id,JSON.stringify(op.files.articles)]);
 });
 await test('history-legacy-current',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false})));const original=await opFor(id);
  requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false,correctionOf:original.id},['file'],correctedBytes)));
  const currentOp=await opFor(id),{historyId}=await import(R+'/server/office-history-recovery.ts'),{officeHash}=await import(R+'/server/office-operation.ts'),{recoveryTuple}=await import(R+'/server/office-recovery-sources.ts');
  const i=officeFileIdentities(await officeRecoveryTables(db)).get(currentOp.files.upload.key)!;
  const oldFrozen=await freeze(original),currentFrozen=await freeze(currentOp),oldPaths=await removeAll(oldFrozen.upload),currentPaths=await removeAll(currentFrozen.upload),before=mail.length;
  const refused=await req('admin/backups/history-recovery/'+historyId(i)+'/unrecoverable',{expectedRevision:officeHash(recoveryTuple(i)),acknowledge:true}),backup=await runDbBackup({dispatchAttention:false}),[saved]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[currentOp.id]);
  check('HG-CURRENT',refused.status===409&&refused.body.error.code==='HISTORY_NOT_ELIGIBLE'&&!backup.complete&&backup.pending>0&&!saved.payload.historyRecovery?.upload&&mail.length===before,{response:refused.body,backup,gap:saved.payload.historyRecovery,noticeDelta:mail.length-before});
  await restoreAll(oldFrozen.upload,oldPaths);await restoreAll(currentFrozen.upload,currentPaths);
  await rawQuery("UPDATE office_operations SET files=jsonb_set(files,'{upload}',(files->'upload')-'sha') WHERE id=$1",[original.id]);
  const list=requireOk(await req('admin/backups/history-recovery')),legacy=list.rows.find((r:any)=>r.operationId===original.id),r=await req('admin/backups/history-recovery/'+legacy?.historyId+'/unrecoverable',{expectedRevision:legacy?.expectedRevision,acknowledge:true});
  check('HG-LEGACY',legacy?.status==='identity_unavailable'&&r.status===409&&r.body.error.code==='RECOVERY_IDENTITY_UNAVAILABLE',{legacy,response:r.body});
 });
}
if(mode==='completed-initial')await test('DONE-initial-Articles-office-signed',async()=>{
 const co=await seedPair(),[op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length,priorRows=await docs(co);
 for(const f of Object.values(originals)as any[])rmSync(temp+'/files/'+f.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));
 const replay=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles'])),downloads=await exactDownloads(originals),other=await Promise.all(Object.values(originals).map((f:any)=>req('portal/documents/'+f.id+'/download',undefined,'other'))),[order]=await rawQuery('SELECT status FROM orders WHERE id=$1',[co]),after=await docs(co);
 check('DONE-initial-Articles-office-signed',replay.status===200&&downloads.every(d=>d.equal)&&other.every(r=>r.status===404)&&order.status==='filed'&&after.length===2&&after.every((d:any)=>priorRows.some((p:any)=>p.id===d.id&&p.storage_key===d.storage_key)&&d.meta.documentNumber==='L26000000001')&&mail.length===before,{replay:replay.status,downloads,other:other.map(r=>r.status),status:order.status,documentCount:after.length,noticeDelta:mail.length-before});
});
if(mode==='history-correction-matrix')for(const slot of ['articles','statement'])for(const damage of ['missing','corrupt'])await test('HISTORY-'+damage+'-'+slot,async()=>{
 const co=await seedPair();requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
 const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(c1),f=old[slot],before=mail.length,operationPath='/OfficeOperations/'+c1.id+'/'+slot,{readMirror,compareWriteMirror}=await import(R+'/server/dropbox.ts');
 const exactOperation=await readMirror(operationPath);if(!exactOperation?.equals(f.raw))throw Error('Original operation mirror is not exact');
 if(damage==='corrupt'){await mirrorFile({storageKey:f.key,path:f.mirrorPath});if(!(await readMirror(f.mirrorPath))?.equals(f.raw))throw Error('Pre-fault regular mirror is not exact');}
 const disk=temp+'/files/'+f.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,'');
 if(damage==='missing')rmSync(disk);else{const bad=Buffer.from(f.raw);bad[bad.length-1]^=1;writeFileSync(disk,bad);const {readMirrorVersion}=await import(R+'/server/dropbox.ts'),regular=await readMirrorVersion(f.mirrorPath);if(!regular)throw Error('Regular mirror missing');if(!await compareWriteMirror(f.mirrorPath,bad,regular.rev))throw Error('Fixture corruption CAS lost');}
 const correctionResult=await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')),[c2]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(c2),b1=await runDbBackup({dispatchAttention:false}),b2=await runDbBackup({dispatchAttention:false});
 const dump=b2.complete?JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString()):null,restored=dump?restoreFixture('HISTORY-'+damage+'-'+slot,dump,[...originalRecords(old),...originalRecords(live)],originalRecords(live)):null;
 const originals=originalRecords(old),manifest=originals.every(f=>dump?.files.some((row:any)=>row.storageKey===f.key&&row.sha===f.sha)),operationUnchanged=(await readMirror(operationPath))?.equals(exactOperation);
 check('HISTORY-'+(damage==='missing'?'RECOVER':'CORRUPT')+'-'+(slot==='articles'?'Articles':'Statement'),correctionResult.status===200&&b1.complete&&b2.complete&&manifest&&restored?.ok&&operationUnchanged&&mail.length-before===1,{correction:correctionResult.status,firstComplete:b1.complete,secondComplete:b2.complete,manifestOriginals:manifest,operationUnchanged,restored,noticeDelta:mail.length-before});
});
if(mode==='history-boundaries'){
 async function historySeed(family:'pair'|'service'='pair',signed=true){
  const co=family==='pair'?await seedPair(signed):await company({status:'formed'}),id=family==='service'?await service('ein',co):co;
  if(family==='service')requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));
  else requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const oldOp=family==='service'?await opFor(id):(await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]))[0],old=await freeze(oldOp);
  if(family==='service')requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:oldOp.id},['file'],correctedBytes)));
  else requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
  const liveOp=family==='service'?await opFor(id):(await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]))[0],live=await freeze(liveOp),slot=family==='service'?'upload':signed?'statement':'articles',f=old[slot];
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===oldOp.id&&r.slot===slot);
  if(!row)throw Error('Real archived original not listed');return {co,id,oldOp,old,liveOp,live,slot,f,row};
 }
 const ack=(row:any)=>req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});
 await test('HG-NO-JOB',async()=>{
  const x=await historySeed(),before=mail.length,paths=await removeAll(x.f);if(await readObject('backup-jobs/current.json'))throw Error('Unexpected existing backup job');
  const r=await ack(x.row),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
  check('HG-NO-JOB',r.status===200&&b.status==='complete_with_history_gaps'&&dump.historyGaps.length===1&&dump.historyGaps[0].storageKey===x.f.key&&dump.historyGaps[0].expectedSha===x.f.sha&&(await exactDownloads(x.live)).every(r=>r.equal)&&mail.length===before,{status:r.status,b,gaps:dump.historyGaps,noticeDelta:mail.length-before});
  await restoreAll(x.f,paths);requireOk(await req('admin/backups/history-recovery/'+x.row.historyId+'/original',form({},[])));
 });
 await test('HG-AUTH',async()=>{
  const x=await historySeed(),before=mail.length,ops=JSON.stringify(await rawQuery('SELECT id,payload,files FROM office_operations ORDER BY id'));
  const path='admin/backups/history-recovery/'+x.row.historyId+'/unrecoverable',body={expectedRevision:x.row.expectedRevision,acknowledge:true};
  const calls=await Promise.all([req(path,body,'none'),req(path,body,'client'),req('admin/backups/history-recovery/not-an-id/unrecoverable',body),req(path,{expectedRevision:x.row.expectedRevision})]);
  check('HG-AUTH',calls.map(r=>r.status).join(',')==='401,401,404,400'&&calls[3].body.error.code==='ACKNOWLEDGMENT_REQUIRED'&&JSON.stringify(await rawQuery('SELECT id,payload,files FROM office_operations ORDER BY id'))===ops&&mail.length===before,{responses:calls.map(r=>({status:r.status,body:r.body})),noticeDelta:mail.length-before});
 });
 await test('HG-ACK-LOST',async()=>{
  const x=await historySeed(),paths=await removeAll(x.f),before=mail.length;let lost=false;
  db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(!lost&&sql.includes("SET payload=jsonb_set(payload,'{historyRecovery}'")){lost=true;throw Error('Gap acknowledgment commit reply lost');}return result;};
  const first=await ack(x.row);db.query=rawQuery;const [afterFirst]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[x.oldOp.id]),decision=afterFirst.payload.historyRecovery[x.slot];
  const second=await ack(x.row),[afterSecond]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[x.oldOp.id]),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
  check('HG-ACK-LOST',lost&&first.status===500&&second.status===200&&afterSecond.payload.historyRecovery[x.slot].decisionId===decision.decisionId&&afterSecond.payload.historyRecovery[x.slot].checkedAt===decision.checkedAt&&dump.historyGaps.filter((g:any)=>g.storageKey===x.f.key).length===1&&(await exactDownloads(x.live)).every(r=>r.equal)&&mail.length===before,{lost,first:first.status,retry:second.status,decisionId:decision.decisionId,saved:afterSecond.payload.historyRecovery[x.slot],gaps:dump.historyGaps,noticeDelta:mail.length-before});
  for(const [variant,change]of [['empty',(d:any)=>{d.historyGaps=[];}],['complete',(d:any)=>{d.historyComplete=true;}],['unknown',(d:any)=>{d.version=3;}]]as const){const bad=structuredClone(dump);change(bad);const r=restoreFixture('HG-ENVELOPE-MALFORMED-'+variant,bad,[],[],true);check('HG-ENVELOPE-MALFORMED-'+variant,r.ok,{restored:r});}
  await restoreAll(x.f,paths);requireOk(await req('admin/backups/history-recovery/'+x.row.historyId+'/original',form({},[])));
 });
 await test('HG-ALL-CORRUPT',async()=>{
  const x=await historySeed(),paths=await removeAll(x.f),bad=Buffer.from(pdfBytes),before=mail.length,{compareWriteMirror,readMirror}=await import(R+'/server/dropbox.ts');
  await replaceStoredFile(x.f.key,bad);for(const path of paths)if(!await compareWriteMirror(path,bad,null))throw Error('Bad-byte fixture write lost');
  const inspected=await req('admin/backups/history-recovery/'+x.row.historyId+'/check',{}),r=await ack(x.row),b=await runDbBackup({dispatchAttention:false});
  const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),gap=dump.historyGaps.find((g:any)=>g.storageKey===x.f.key),unchanged=(await readObject(x.f.key))?.equals(bad)&&(await Promise.all(paths.map(async p=>(await readMirror(p))?.equals(bad)))).every(Boolean);
  check('HG-ALL-CORRUPT',inspected.status===200&&inspected.body.data.state==='needs_staff_decision'&&r.status===200&&b.status==='complete_with_history_gaps'&&gap.expectedSha===x.f.sha&&gap.expectedSha!==hashBytes(bad)&&unchanged&&(await exactDownloads(x.live)).every(r=>r.equal)&&mail.length===before,{inspected:inspected.body,status:r.status,b,gap,unchanged,noticeDelta:mail.length-before});
  await replaceStoredFile(x.f.key,x.f.raw);for(const path of paths){const {readMirrorVersion}=await import(R+'/server/dropbox.ts'),v=await readMirrorVersion(path);await compareWriteMirror(path,x.f.raw,v!.rev);}requireOk(await req('admin/backups/history-recovery/'+x.row.historyId+'/original',form({},[])));
 });
 await test('HG-DELETED',async()=>{
  const x=await historySeed('service'),before=mail.length;requireOk(await req('portal/documents/'+x.live.upload.id,undefined,'client','DELETE'));const j=JSON.stringify(await readRecoveryJournal());
  const gap=await ack(x.row),original=await req('admin/backups/history-recovery/'+x.row.historyId+'/original',form({},['file'],x.f.plain)),dl=await req('portal/documents/'+x.live.upload.id+'/download',undefined,'client'),[op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[x.oldOp.id]);
  check('HG-DELETED',gap.status===409&&gap.body.error.code==='DOCUMENT_DELETED'&&original.status===409&&original.body.error.code==='DOCUMENT_DELETED'&&!await readObject(x.f.key)&&!await readObject(x.live.upload.key)&&dl.status===404&&!op.payload.historyRecovery?.upload&&JSON.stringify(await readRecoveryJournal())===j&&mail.length===before,{gap:gap.body,original:original.body,download:dl.status,noticeDelta:mail.length-before});
 });
 await test('HG-KEY-UNAVAILABLE',async()=>{
  const priorKeys=process.env.DOCUMENT_ENCRYPTION_KEYS,priorActive=process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY,a=Buffer.alloc(32,17).toString('base64');
  const x=await historySeed('service'),paths=await removeAll(x.f),keep='/OfficeOperations/'+x.oldOp.id+'/upload',{compareWriteMirror,readMirror,readMirrorVersion}=await import(R+'/server/dropbox.ts'),{seal}=await import(R+'/server/encryption.ts');
  process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({lost:a});process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='lost';const inaccessible=seal(x.f.plain);
  if(priorKeys===undefined)delete process.env.DOCUMENT_ENCRYPTION_KEYS;else process.env.DOCUMENT_ENCRYPTION_KEYS=priorKeys;if(priorActive===undefined)delete process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY;else process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY=priorActive;
  await compareWriteMirror(keep,inaccessible,null);const before=mail.length,r=await ack(x.row),[op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[x.oldOp.id]);
  check('HG-KEY-UNAVAILABLE',r.status===503&&r.body.error.code==='RECOVERY_UNAVAILABLE'&&!op.payload.historyRecovery?.upload&&(await readMirror(keep))?.equals(inaccessible)&&(await exactDownloads(x.live)).every(r=>r.equal)&&mail.length===before,{status:r.status,body:r.body,noticeDelta:mail.length-before});
  const version=await readMirrorVersion(keep);await compareWriteMirror(keep,x.f.raw,version!.rev);await restoreAll(x.f,paths);
 });
 await test('HG-CORRECTION-SERVICE',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const oldOp=await opFor(id),old=await freeze(oldOp),paths=await removeAll(old.upload),before=mail.length;
  const r=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:true,correctionOf:oldOp.id},['file'],correctedBytes)),live=await freeze(await opFor(id)),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),[so]=await rawQuery('SELECT details FROM service_orders WHERE id=$1',[id]);
  check('HG-CORRECTION-SERVICE',r.status===200&&b.status==='complete_with_history_gaps'&&dump.historyGaps.filter((g:any)=>g.storageKey===old.upload.key&&g.expectedSha===old.upload.sha).length===1&&so.details.assignedEin==='881234561'&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length-before===1,{status:r.status,b,gaps:dump.historyGaps,ein:so.details.assignedEin,noticeDelta:mail.length-before});
  await restoreAll(old.upload,paths);
 });
 for(const family of ['service','pair']as const)await test(family==='service'?'ARCHIVE-KIND-INVALID':'ARCHIVE-PAIR-INVALID',async()=>{
  const x=await historySeed(family),[original]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[x.oldOp.id]),before=mail.length;
  await rawQuery('UPDATE office_operations SET kind=$2 WHERE id=$1',[original.id,(family==='service'?'service':'articles-correction')+'-history:'+crypto.randomUUID()]);
  let backupError:any;try{await runDbBackup({dispatchAttention:false});}catch(e){backupError=e;}
  const listing=await req('admin/backups/history-recovery'),gap=await ack(x.row),[op]=await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[original.id]);
  check(family==='service'?'ARCHIVE-KIND-INVALID':'ARCHIVE-PAIR-INVALID',backupError?.code==='RECOVERY_IDENTITY_CONFLICT'&&listing.status===409&&listing.body.error.code==='RECOVERY_IDENTITY_CONFLICT'&&gap.status===409&&gap.body.error.code==='RECOVERY_IDENTITY_CONFLICT'&&!op.payload.historyRecovery?.[x.slot]&&(await exactDownloads(x.live)).every(r=>r.equal)&&mail.length===before,{backupError:String(backupError),code:backupError?.code,listing:listing.body,gap:gap.body,noticeDelta:mail.length-before});
  await rawQuery('UPDATE office_operations SET kind=$2 WHERE id=$1',[original.id,original.kind]);
 });
 await test('ARCHIVE-PAIR-SELF',async()=>{
  const x=await historySeed('pair',false),paths=await removeAll(x.f),keep='/OfficeOperations/'+x.oldOp.id+'/articles',{compareWriteMirror}=await import(R+'/server/dropbox.ts');await compareWriteMirror(keep,x.f.raw,null);const before=mail.length;
  const r=await ack(x.row),recovered=await req('admin/backups/history-recovery/'+x.row.historyId+'/original',form({},[])),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),restored=restoreFixture('ARCHIVE-PAIR-SELF',dump,[...originalRecords(x.old),...originalRecords(x.live)],originalRecords(x.live)),documents=await docs(x.co);
  check('ARCHIVE-PAIR-SELF',r.status===409&&r.body.error.code==='RECOVERY_COPY_AVAILABLE'&&recovered.status===200&&b.complete&&restored.ok&&!documents.some((d:any)=>d.kind==='statement')&&Object.keys(x.old).join()==='articles'&&Object.keys(x.live).join()==='articles'&&mail.length===before,{gap:r.body,recovered:recovered.status,b,restored,noticeDelta:mail.length-before});await restoreAll(x.f,paths);
 });
 await test('HG-IDENTITY',async()=>{
  const x=await historySeed('service'),duplicate=crypto.randomUUID(),before=mail.length;
  await rawQuery(`INSERT INTO office_operations(id,kind,target_id,input_hash,phase,payload,files,result) SELECT $2::uuid,'service-history:'||($2::uuid)::text,target_id,input_hash,'superseded',payload,jsonb_set(files,'{upload,sha}',to_jsonb($3::text)),result FROM office_operations WHERE id=$1`,[x.oldOp.id,duplicate,'0'.repeat(64)]);
  const state=JSON.stringify(await rawQuery('SELECT id,kind,payload,files,result FROM office_operations ORDER BY id')),journal=JSON.stringify(await readRecoveryJournal());
  const r=await req('admin/backups/history-recovery/'+x.row.historyId+'/unrecoverable',{expectedRevision:x.row.expectedRevision,acknowledge:true,clientId:client2}),stranger=await req('admin/backups/history-recovery/'+'a'.repeat(64)+'/unrecoverable',{acknowledge:true},'client');
  check('HG-IDENTITY',r.status===409&&r.body.error.code==='RECOVERY_IDENTITY_CONFLICT'&&stranger.status===401&&state===JSON.stringify(await rawQuery('SELECT id,kind,payload,files,result FROM office_operations ORDER BY id'))&&journal===JSON.stringify(await readRecoveryJournal())&&mail.length===before,{response:r.body,status:r.status,client:stranger.status,noticeDelta:mail.length-before});
  await rawQuery('DELETE FROM office_operations WHERE id=$1',[duplicate]);
 });
 await test('HG-NO-UPLOAD',async()=>{
  const co=await company({status:'formed'}),id=await service('series',co,{details:{seriesName:'PS Empty'}}),conversion=await company({package:'CONVERT',status:'formed'}),before=mail.length;
  const r=await req('admin/services/'+id+'/fulfill',form({notify:false},[])),listing=requireOk(await req('admin/backups/history-recovery')),op=await opFor(id),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
  check('HG-NO-UPLOAD',r.status===200&&Object.keys(op.files).length===0&&!(await docs(co)).length&&!(await docs(conversion)).length&&!listing.rows.some((r:any)=>r.orderId===co||r.orderId===conversion)&&b.complete&&!dump.historyGaps?.length&&mail.length===before,{response:r.body,slots:Object.keys(op.files),b,noticeDelta:mail.length-before});
 });
 await test('ARCHIVE-COMMITTED',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);let fired=false;db.query=async(sql:string,args:any[])=>{if(!fired&&sql.includes("UPDATE office_operations SET phase='done',result=$4::jsonb")){fired=true;throw Error('Published service before final done');}return rawQuery(sql,args);};
  const interrupted=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;const oldOp=await opFor(id),old=await freeze(oldOp);if(!fired||interrupted.status!==500||oldOp.phase!=='committed')throw Error('Committed boundary not reached');
  requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:oldOp.id},['file'],correctedBytes)));const live=await freeze(await opFor(id)),[archived]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[oldOp.id]),before=mail.length,b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),restored=restoreFixture('ARCHIVE-COMMITTED',dump,[...originalRecords(old),...originalRecords(live)],originalRecords(live));
  check('ARCHIVE-COMMITTED',archived.kind==='service-history:'+oldOp.id&&archived.payload.previousPhase==='committed'&&b.complete&&restored.ok&&mail.length===before,{kind:archived.kind,previousPhase:archived.payload.previousPhase,b,restored,noticeDelta:mail.length-before});
 });
}

if(mode==='history-reopen-seed')await test('HG-UPGRADE-seed',async()=>{
 const co=await seedPair();requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
 const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),oldPair=await freeze(c1);
 requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
 const [c2]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),livePair=await freeze(c2),id=await service('ein',co);
 requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const v1=await opFor(id),oldService=await freeze(v1);
 requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:v1.id},['file'],correctedBytes)));const liveService=await freeze(await opFor(id)),b=await runDbBackup({dispatchAttention:false});
 if(!b.complete)throw Error('Post-launch baseline backup incomplete');
 const [archivedPair]=await rawQuery('SELECT kind,phase FROM office_operations WHERE id=$1',[c1.id]),[archivedService]=await rawQuery('SELECT kind,phase FROM office_operations WHERE id=$1',[v1.id]);
 writeFileSync(E+'/reopen-input.json',JSON.stringify({temp,client,output:E+'/reopen-result.json',old:[{...originalRecords(oldPair).find(f=>f.slot==='statement'),operationId:c1.id,expectedKind:'articles-correction-history:'+c1.id},{...originalRecords(oldService)[0],operationId:v1.id,expectedKind:'service-history:'+v1.id}],current:[...originalRecords(livePair),...originalRecords(liveService)]}));
 check('HG-UPGRADE-seed',archivedPair.kind==='articles-correction-history:'+c1.id&&archivedService.kind==='service-history:'+v1.id,{archivedPair,archivedService});
});
if(mode==='history-reopen')await test('HG-UPGRADE',async()=>{
 const dir=E+'/seed';mkdirSync(dir,{recursive:true});
 const seed=spawnSync(process.execPath,[R+'/server/chunk3-r8-check.ts','history-reopen-seed'],{encoding:'utf8',env:{...process.env,CHECK_OUTPUT_DIR:dir},maxBuffer:8*1024*1024});writeFileSync(E+'/seed.log',seed.stdout+seed.stderr);
 if(seed.status!==0)throw Error('Separate-process history seed failed');
 const reopened=spawnSync(process.execPath,[R+'/server/chunk3-r8-reopen-check.ts',dir+'/reopen-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:8*1024*1024});writeFileSync(E+'/reopen.log',reopened.stdout+reopened.stderr);
 check('HG-UPGRADE',reopened.status===0,{seedExit:seed.status,reopenExit:reopened.status,evidence:dir+'/reopen-result.json',output:reopened.stdout,error:reopened.stderr});
});
if(mode==='stale-review')for(const family of ['ein','articles'])await test('RESTORED-OLD-REVIEW-'+family,async()=>{
 const co=await company({status:family==='ein'?'formed':'filed',payload:{certifications:{articlesSignedBy:'SERVICE'}}}),id=family==='ein'?await service('ein',co):co,route=family==='ein'?'admin/services/'+id+'/fulfill':'admin/orders/'+id+'/articles';let stopped=false;
 db.query=async(sql:string,args:any[])=>{if(!stopped&&sql.includes('WITH operation AS (SELECT')&&sql.includes('INSERT INTO documents')){stopped=true;throw Error('Stale review prepublication fixture');}return rawQuery(sql,args);};
 const first=await req(route,family==='ein'?form({ein:'881234560',notify:false}):form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;const [old]=await rawQuery('SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2',[family==='ein'?'service':'articles',id]);if(!stopped||first.status!==500||old.phase!=='open')throw Error('Open operation missing');
 const original=await freeze(old),f=original[family==='ein'?'upload':'articles'],b=await runDbBackup({dispatchAttention:false});if(!b.complete)throw Error('Snapshot incomplete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
 const restored=restoreFixture('RESTORED-OLD-REVIEW-'+family,dump,[],[],false,undefined,undefined,undefined,{family,targetId:id,route,oldId:old.id,oldBytes:f.plain.toString('base64'),oldKey:f.key,newBytes:Buffer.from(correctedBytes).toString('base64'),newSha:hashBytes(Buffer.from(correctedBytes))});
 check('RESTORED-OLD-REVIEW-'+family,restored.ok,{restored});
});
if(mode==='claim-restore')await test('CLAIM-RESTORE',async()=>{
 const co=await company({status:'filed',payload:{certifications:{articlesSignedBy:'SERVICE'}}});
 let stopped=false;db.query=async(sql:string,args:any[])=>{if(!stopped&&sql.includes('WITH operation AS (SELECT')&&sql.includes('INSERT INTO documents')){stopped=true;throw Error('Claim restore prepublication fixture');}return rawQuery(sql,args);};
 const first=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;
 const [old]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]);if(!stopped||first.status!==500||old.phase!=='open')throw Error('Initial open boundary not reached');
 const original=await freeze(old);let interrupted=false;
 db.query=async(sql:string,args:any[])=>{if(!interrupted&&sql.includes("SET kind=$6||'-history:'")){interrupted=true;throw Error('Claim restore journal durable before database replacement');}return rawQuery(sql,args);};
 const change=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000002',correctionOf:old.id},['articles'],correctedBytes));db.query=rawQuery;
 const [retiring]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[old.id]),journal=await readRecoveryJournal(),keys=Object.values(original).map((f:any)=>f.key);
 if(!interrupted||change.status!==500||retiring.phase!=='retiring'||!keys.every(key=>journal.records.some(r=>r.storageKey===key)))throw Error('Durable retirement boundary not reached');
 const b=await runDbBackup({dispatchAttention:false});if(!b.complete)throw Error('Retiring snapshot incomplete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
 const restored=restoreFixture('CLAIM-RESTORE',dump,[],[],false,undefined,undefined,{orderId:co,oldId:old.id,successorId:retiring.payload.retirement.successorId,oldKeys:keys,bytes:Buffer.from(correctedBytes).toString('base64'),sha:hashBytes(Buffer.from(correctedBytes)),number:'L26000000002',oldNumber:'L26000000001'});
 check('CLAIM-RESTORE',restored.ok&&mail.length===0,{interrupted,phase:retiring.phase,successorId:retiring.payload.retirement.successorId,restored,noticeDelta:mail.length});
});
if(mode==='retirement-boundaries'){
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts');
 async function openService(){const co=await company({status:'formed'}),id=await service('ein',co);let fired=false;db.query=async(q:string,p:any[])=>{if(!fired&&q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fired=true;throw Error('Open service before publication')}return rawQuery(q,p)};const r=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:true}));db.query=rawQuery;const op=await opFor(id),old=await freeze(op);if(!fired||r.status!==500||op.phase!=='open')throw Error('Open service fixture not reached');return{co,id,op,old,change:()=>form({ein:'881234561',notify:true,correctionOf:op.id},['file'],correctedBytes)};}
 for(const boundary of ['claim-only','db-fail','db-lost'])await test('RETIRE-'+boundary,async()=>{
  const x=await openService(),before=mail.length;let fired=0,spy:any;
  if(boundary==='claim-only'){const cas=dropbox.compareWriteMirror;spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===JOURNAL_PATH){fired++;throw Error('Retirement store down')}return cas(path,...args);});}
  else db.query=async(q:string,p:any[])=>{if(!fired&&q.includes("SET kind=$6||'-history:'")){fired++;if(boundary==='db-lost')await rawQuery(q,p);throw Error('Retirement database '+boundary);}return rawQuery(q,p)};
  let first:any;try{first=await req('admin/services/'+x.id+'/fulfill',x.change());}finally{db.query=rawQuery;spy?.mockRestore();}
  const [saved]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[x.op.id]),expected=saved.payload.retirement.successorId,journal=await readRecoveryJournal();
  const oldResume=boundary==='db-fail'?await req('admin/services/'+x.id+'/fulfill',{resume:true}):null,retry=await req('admin/services/'+x.id+'/fulfill',x.change()),v=await opFor(x.id),live=await freeze(v),twice=await req('admin/services/'+x.id+'/fulfill',x.change());
  check(boundary==='claim-only'?'RETIRE-CLAIM-ONLY':boundary==='db-fail'?'RETIRE-DB-FAIL':'CLAIM-LOST-DB',fired>0&&first.status===(boundary==='claim-only'?503:500)&&(boundary!=='claim-only'||first.body.error.code==='RECOVERY_UNAVAILABLE')&&saved.phase===(boundary==='db-lost'?'superseded':'retiring')&&journal.records.some((r:any)=>r.storageKey===x.old.upload.key)===(boundary!=='claim-only')&&(boundary!=='db-fail'||oldResume?.status===409&&oldResume.body.error.code==='DOCUMENT_DELETED')&&retry.status===200&&twice.status===200&&v.id===expected&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before+1,{fired,first:first.status,phase:saved.phase,oldResume:oldResume?.body,retry:retry.status,twice:twice.status,expected,actual:v.id,noticeDelta:mail.length-before});
 });
 await test('RETIRE-ACTIVE-WORKER',async()=>{
  const x=await openService(),token=crypto.randomUUID(),before=mail.length,journal=JSON.stringify(await readRecoveryJournal());await rawQuery("UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes' WHERE id=$1",[x.op.id,token]);const r=await req('admin/services/'+x.id+'/fulfill',x.change()),op=await opFor(x.id);
  check('RETIRE-ACTIVE-WORKER',r.status===409&&r.body.error.code==='OFFICE_BUSY'&&op.id===x.op.id&&op.phase==='open'&&!op.payload.retirement&&journal===JSON.stringify(await readRecoveryJournal())&&(await readObject(x.old.upload.key))?.equals(x.old.upload.raw)&&mail.length===before,{response:r.body,noticeDelta:mail.length-before});await rawQuery('UPDATE office_operations SET lease=NULL,lease_until=NULL WHERE id=$1',[x.op.id]);
 });
 await test('CLAIM-LOSE',async()=>{
  const x=await openService(),before=mail.length;let arrived!:()=>void,release!:()=>void;const hit=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r);let held=false;
  db.query=async(q:string,p:any[])=>{const result=await rawQuery(q,p);if(!held&&q.includes("UPDATE office_operations SET phase='retiring'")){held=true;arrived();await gate;}return result;};
  const pending=req('admin/services/'+x.id+'/fulfill',x.change());let loser:any;try{await Promise.race([hit,Bun.sleep(4000).then(()=>{throw Error('Claim barrier not reached')})]);loser=await req('admin/services/'+x.id+'/fulfill',form({ein:'881234562',notify:true,correctionOf:x.op.id},['file'],pdfBytes));}finally{release();}const winner=await pending;db.query=rawQuery;const v=await opFor(x.id),live=await freeze(v),journal=await readRecoveryJournal(),[s]=await rawQuery('SELECT details FROM service_orders WHERE id=$1',[x.id]);
  check('CLAIM-LOSE',held&&loser.status===409&&loser.body.error.code==='OFFICE_CONFLICT'&&winner.status===200&&s.details.assignedEin==='881234561'&&journal.records.some((r:any)=>r.storageKey===x.old.upload.key)&&!journal.records.some((r:any)=>r.storageKey===live.upload.key)&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before+1,{loser:loser.body,winner:winner.status,noticeDelta:mail.length-before});
 });
 await test('JOURNAL-CAS-conflict',async()=>{
  const x=await openService(),before=mail.length,original=(await dropbox.readMirrorVersion(JOURNAL_PATH))!.data,cas=dropbox.compareWriteMirror;let attempts=0;
  const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,...args:any[])=>{if(path===JOURNAL_PATH){attempts++;return false;}return cas(path,...args);});let r:any;try{r=await req('admin/services/'+x.id+'/fulfill',x.change());}finally{spy.mockRestore();}const op=await opFor(x.id),after=(await dropbox.readMirrorVersion(JOURNAL_PATH))!.data;
  check('JOURNAL-CAS-conflict',attempts===12&&r.status===503&&r.body.error.code==='RECOVERY_UNAVAILABLE'&&op.id===x.op.id&&op.phase==='retiring'&&after.equals(original)&&mail.length===before,{attempts,response:r.body,phase:op.phase,noticeDelta:mail.length-before});requireOk(await req('admin/services/'+x.id+'/fulfill',x.change()));
 });
 for(const variant of ['checksum-corruption','truncation'])await test('JOURNAL-'+variant,async()=>{
  const x=await openService(),b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()),original=(await dropbox.readMirrorVersion(JOURNAL_PATH))!.data,before=mail.length;
  const j=JSON.parse(original.toString());j.sha='0'.repeat(64);const bad=variant==='truncation'?original.subarray(0,40):Buffer.from(JSON.stringify(j));writeBytes(temp+'/mirror'+JOURNAL_PATH,bad);let r:any,restored:any;
  try{r=await req('admin/services/'+x.id+'/fulfill',x.change());restored=restoreFixture('JOURNAL-'+variant,dump,[],[],true);check('JOURNAL-'+variant,r.status===503&&r.body.error.code==='RECOVERY_UNAVAILABLE'&&restored.ok&&readFileSync(temp+'/mirror'+JOURNAL_PATH).equals(bad)&&mail.length===before,{response:r.body,restored,noticeDelta:mail.length-before});}finally{writeBytes(temp+'/mirror'+JOURNAL_PATH,original);}requireOk(await req('admin/services/'+x.id+'/fulfill',x.change()));
 });
 for(const version of [1,2,3,4])await test('JOURNAL-READ-'+version,async()=>{
  const original=(await dropbox.readMirrorVersion(JOURNAL_PATH))!.data,stamp='2026-01-01T00:00:00.000Z',record={documentId:crypto.randomUUID(),storageKey:'dev:compat/old-'+version,mirrorPath:'/compat/old-'+version,requestedAt:stamp,reason:'client'},packageId=crypto.randomUUID();
  const packageRecord={id:packageId,serviceId:crypto.randomUUID(),clientId:client,companyId:null,company:'Compatibility fixture',priorDocumentId:null,storagePath:'compat/package-'+version,storageKey:'dev:compat/package-'+version,mirrorPath:'/compat/package-'+version,title:'S-election package',sha:hashBytes(Buffer.from(pdfBytes)),size:pdfBytes.length,createdAt:stamp,fulfilledAt:stamp,details:{},state:'committed'},oldCopy={documentId:crypto.randomUUID(),storageKey:'dev:compat/copy-'+version,mirrorPath:'/compat/copy-'+version};
  const payload:any=version===1?{version,records:[record]}:{version,records:[record],packages:[packageRecord],...(version>=3?{firstNoticeCutoff:stamp}:{}),...(version===4?{copies:[oldCopy]}:{})},encoded=Buffer.from(JSON.stringify({...payload,sha:hashBytes(Buffer.from(JSON.stringify(version===1?payload.records:payload)))}));
  writeBytes(temp+'/mirror'+JOURNAL_PATH,encoded);const before=mail.length;try{
   const read=await readRecoveryJournal(),journal=await import(R+'/server/backup-deletions.ts'),newCopy={documentId:crypto.randomUUID(),storageKey:'dev:compat/new-'+version,mirrorPath:'/compat/new-'+version};await journal.appendDeletionMirror({...record,documentId:crypto.randomUUID(),storageKey:'dev:compat/retired-'+version,mirrorPath:'/compat/retired-'+version,reason:'superseded'});await recordDocumentCopy(newCopy);const after=await readRecoveryJournal();
   check('JOURNAL-READ-'+version,read.version===version&&after.version===4&&after.records.some((r:any)=>JSON.stringify(r)===JSON.stringify(record))&&(version===1?after.packages.length===0:JSON.stringify(after.packages)===JSON.stringify([packageRecord]))&&(version<3||after.firstNoticeCutoff===stamp)&&after.copies?.some((c:any)=>c.storageKey===newCopy.storageKey)&&(version!==4||after.copies?.some((c:any)=>JSON.stringify(c)===JSON.stringify(oldCopy)))&&mail.length===before,{startVersion:read.version,endVersion:after.version,records:after.records.length,packages:after.packages.length,copies:after.copies?.length,cutoff:after.firstNoticeCutoff,noticeDelta:mail.length-before});
  }finally{writeBytes(temp+'/mirror'+JOURNAL_PATH,original);}
 });
}

if(mode==='retire')for(const boundary of ['durable-journal-before-db','db-before-cleanup'])for(const family of ['company-EIN','series-EIN','certificate-of-status','certified-copy','initial-Articles-pair','pending-published-correction-pair'])await test('RETIRE-'+family+'-'+boundary,async()=>{
 const pair=family.endsWith('-pair'),pending=family==='pending-published-correction-pair';
 const co=pair?(pending?await seedPair():await company({status:'filed',payload:{certifications:{articlesSignedBy:'SERVICE'}}})):await company({status:'formed'});
 if(family==='series-EIN'){const parent=await service('ein',co);requireOk(await req('admin/services/'+parent+'/fulfill',form({ein:'881234569',notify:false})));}
 const id=pair?co:await service(family.endsWith('EIN')?'ein':family,co,{details:family==='series-EIN'?{target:'series',seriesName:'PS 9'}:{}}),fields={ein:'881234561',notify:false};
 const priorDetail=pending?await detail(co):null,kind=pair?(pending?'articles-correction':'articles'):'service';
 const route=pair?'admin/orders/'+co+(pending?'/correct-articles':'/articles'):'admin/services/'+id+'/fulfill';
 const initialInput=()=>pair?(pending?correction(priorDetail):form({documentNumber:'L26000000001'},['articles'])):form(fields);
 let stopped=false;db.query=async(sql:string,args:any[])=>{if(!stopped&&sql.includes('WITH operation AS (SELECT')&&sql.includes('INSERT INTO documents')){stopped=true;throw Error('R8 prepublication interruption');}return rawQuery(sql,args);};
 const first=await req(route,initialInput());db.query=rawQuery;
 const [initial]=await rawQuery('SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2',[kind,id]);if(!stopped||first.status!==500||initial.phase!=='open')throw Error('Unpublished boundary not reached');
 const original=await freeze(initial),snapshot=await runDbBackup({dispatchAttention:false});if(!snapshot.complete)throw Error('Seed snapshot did not complete');
 const dump=JSON.parse(gunzipSync((await readObject('backups/'+snapshot.key))!).toString());
 let fault=false;db.query=async(sql:string,args:any[])=>{if(!fault&&sql.includes("SET kind=$6||'-history:'")){fault=true;if(boundary==='db-before-cleanup')await rawQuery(sql,args);throw Error('R8 retirement boundary '+boundary);}return rawQuery(sql,args);};
 const change=()=>{if(!pair)return form({...fields,ein:'881234562',correctionOf:initial.id},['file'],correctedBytes);if(!pending)return form({documentNumber:'L26000000002',correctionOf:initial.id},['articles'],correctedBytes);const f=correction(priorDetail,pdfBytes,'L26000000003');f.set('replaceAttempt',initial.id);return f;};
 const interrupted=await req(route,change());db.query=rawQuery;
 const [prior]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[initial.id]),successors=await rawQuery("SELECT * FROM office_operations WHERE payload->>'corrects'=$1",[initial.id]),journal=await readRecoveryJournal();
 const resume:any={path:route,body:{},status:409,code:'DOCUMENT_DELETED'};
 if(pending)resume.multipart={fields:{documentNumber:'L26000000002',documentId:priorDetail.articlesCorrection.documentId,revision:priorDetail.articlesCorrection.revision},slot:'articles',bytes:Buffer.from(correctedBytes).toString('base64')};
 const restored=restoreFixture('RETIRE-'+family+'-'+boundary,dump,[],[],false,resume);
 const retry=await req(route,change()),[latest]=await rawQuery('SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2',[kind,id]),live=await freeze(latest);
 const retiredKeys=Object.values(original).map((f:any)=>f.key),allRetired=retiredKeys.every(key=>journal.records.some((r:any)=>r.storageKey===key));
 check('RETIRE-'+family+'-'+boundary,fault&&interrupted.status===500&&prior.phase===(boundary==='db-before-cleanup'?'superseded':'retiring')&&successors.length===(boundary==='db-before-cleanup'?1:0)&&allRetired&&restored.ok&&retry.status===200&&(await exactDownloads(live)).every(r=>r.equal),{fault,interrupted:interrupted.status,phase:prior.phase,successors:successors.length,retiredKeys,allRetired,restored,retry:retry.status,download:await exactDownloads(live)});
});
if(mode==='published-before-discard')await test('PUBLISHED-BEFORE-DISCARDED-SUCCESSOR',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const a=await opFor(id),old=await freeze(a),first=await runDbBackup({dispatchAttention:false}),b1=(await readObject('backups/'+first.key))!,dump1=JSON.parse(gunzipSync(b1).toString());let fault=0;
 db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Unpublished replacement B');}return rawQuery(q,p)};const failed=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:a.id},['file'],correctedBytes));db.query=rawQuery;const u=await opFor(id),discarded=await freeze(u);if(fault!==1||failed.status!==500||u.phase!=='open')throw Error('Unpublished successor not reached');const before=mail.length;
 const corrected=await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false,correctionOf:u.id},['file'],pdfBytes)),v=await opFor(id),live=await freeze(v),journal=await readRecoveryJournal(),b2=await runDbBackup({dispatchAttention:false}),dump2=b2.complete?JSON.parse(gunzipSync((await readObject('backups/'+b2.key))!).toString()):null;
 const r1=restoreFixture('PUBLISHED-BEFORE-DISCARD-B1',dump1,originalRecords(old),originalRecords(old)),r2=dump2?restoreFixture('PUBLISHED-BEFORE-DISCARD-B2',dump2,[...originalRecords(old),...originalRecords(live)],originalRecords(live)):null;
 check('PUBLISHED-BEFORE-DISCARDED-SUCCESSOR',corrected.status===200&&journal.records.some(d=>d.storageKey===discarded.upload.key)&&!journal.records.some(d=>d.storageKey===old.upload.key)&&!journal.records.some(d=>d.storageKey===live.upload.key)&&b2.complete&&r1.ok&&r2?.ok&&(await readObject('backups/'+first.key))?.equals(b1)&&mail.length===before,{corrected:corrected.status,keys:{published:old.upload.key,discarded:discarded.upload.key,current:live.upload.key},retired:journal.records.filter(d=>[old.upload.key,discarded.upload.key,live.upload.key].includes(d.storageKey)),b2,r1,r2,noticeDelta:mail.length-before});
});

if(mode==='lineage'){
 const {spyOn}=await import('bun:test'),storage=await import(R+'/server/storage.ts'),dropbox=await import(R+'/server/dropbox.ts');
 await test('ALIAS-REGISTER-ARTICLES',async()=>{
  const observed:any[]=[],put=storage.putObject,mirror=dropbox.mirrorFile;
  const ps=spyOn(storage,'putObject').mockImplementation(async(...args:any[])=>{if(String(args[0]).startsWith('office-work/')){const j=await readRecoveryJournal(),c=j.copies?.find(c=>c.storageKey.endsWith('/'+args[0])||c.storageKey==='dev:'+args[0]);observed.push({kind:'primary',path:args[0],registered:!!c,serviceId:c?.serviceId});}return put(...args);});
  const ms=spyOn(dropbox,'mirrorFile').mockImplementation(async(...args:any[])=>{if(args[0].storageKey.includes('office-work/')){const j=await readRecoveryJournal(),c=j.copies?.find(c=>c.storageKey===args[0].storageKey);observed.push({kind:'mirror',path:args[0].path,registered:!!c&&[c.mirrorPath,...c.extraMirrorPaths??[]].includes(args[0].path),serviceId:c?.serviceId});}return mirror(...args);});
  const before=mail.length;let co:string,initial:any,live:any,beforePaths:string[]=[],afterPaths:string[]=[];
  try{co=await seedPair();const [u]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]);initial=await freeze(u);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const [v]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]);live=await freeze(v);await dropbox.runFileMirror();beforePaths=(await docs(co)).map((d:any)=>d.mirror_path).sort();await rawQuery("UPDATE orders SET llc_name='Renamed Office LLC' WHERE id=$1",[co]);await dropbox.runFileMirror();afterPaths=(await docs(co)).map((d:any)=>d.mirror_path).sort();}finally{ps.mockRestore();ms.mockRestore();}
  check('ALIAS-REGISTER-ARTICLES',observed.filter(r=>r.kind==='primary').length===4&&observed.every(r=>r.registered&&!r.serviceId)&&JSON.stringify(beforePaths)===JSON.stringify(afterPaths)&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length-before===1,{observed,beforePaths,afterPaths,originals:originalRecords(initial),downloads:await exactDownloads(live),noticeDelta:mail.length-before});
 });
 await test('PSD-SERVICE-STABLE',async()=>{
  const co=await company({status:'formed'}),id=await service('series',co,{details:{seriesName:'PS 9'}});requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));const u=await opFor(id),old=await freeze(u);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false,correctionOf:u.id},['file'],correctedBytes)));const v=await opFor(id),live=await freeze(v);await dropbox.runFileMirror();const [beforeDoc]=await rawQuery('SELECT * FROM documents WHERE id=$1',[v.files.upload.id]);
  const before=mail.length;await rawQuery("UPDATE orders SET llc_name='Renamed Service LLC' WHERE id=$1",[co]);await dropbox.runFileMirror();const [afterDoc]=await rawQuery('SELECT * FROM documents WHERE id=$1',[v.files.upload.id]);await removeAll(old.upload);await mirrorFile({storageKey:old.upload.key,path:old.upload.mirrorPath}).catch(()=>{});await dropbox.compareWriteMirror(old.upload.mirrorPath,old.upload.raw,null);
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===u.id),denied=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}),recovered=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[]));
  const [archive]=await rawQuery('SELECT kind FROM office_operations WHERE id=$1',[u.id]);const restored=await readObject(old.upload.key);
  check('PSD-SERVICE-STABLE',beforeDoc.mirror_path===afterDoc.mirror_path&&denied.status===409&&denied.body.error.code==='RECOVERY_COPY_AVAILABLE'&&recovered.status===200&&restored?.equals(old.upload.raw)&&archive.kind==='service-history:'+u.id&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{oldPath:old.upload.mirrorPath,beforePath:beforeDoc.mirror_path,afterPath:afterDoc.mirror_path,denied:denied.body,recovered:recovered.status,archive,noticeDelta:mail.length-before});
 });
 await test('CLAIM-AMBIGUOUS',async()=>{
  const co=await company({status:'filed',payload:{certifications:{articlesSignedBy:'SERVICE'}}});let fault=0;db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Open pair interruption');}return rawQuery(q,p)};await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;const [u]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(u);if(fault!==1||Object.keys(old).length!==2)throw Error('No open original pair');
  const cas=dropbox.compareWriteMirror,states:number[]=[];let lost=false;const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,rev:string|null)=>{const result=await cas(path,data,rev);if(path===JOURNAL_PATH){const j=JSON.parse(data.toString()),n=Object.values(old).filter((f:any)=>j.records.some((d:any)=>d.storageKey===f.key)).length;states.push(n);if(n>0&&!lost){lost=true;throw Error('Retirement accepted, reply lost');}}return result;});
  const before=mail.length,change=()=>form({documentNumber:'L26000000002',correctionOf:u.id},['articles'],correctedBytes);let first:any;try{first=await req('admin/orders/'+co+'/articles',change());}finally{spy.mockRestore();}
  const [reserved]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[u.id]),expected=reserved.payload.retirement.successorId,retry=await req('admin/orders/'+co+'/articles',change()),[v]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),j=await readRecoveryJournal(),live=await freeze(v);
  check('CLAIM-AMBIGUOUS',lost&&!states.includes(1)&&retry.status===200&&v.id===expected&&Object.values(old).every((f:any)=>j.records.some(d=>d.storageKey===f.key))&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{first:first.status,retry:retry.status,states,expected,actual:v.id,noticeDelta:mail.length-before});
 });
 await test('BACKUP-COPY-LINEAGE',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234567',notify:false})));const op=await opFor(id),original=await freeze(op),i=officeFileIdentities(await officeRecoveryTables(db)).get(op.files.upload.key)!,before=mail.length,cas=dropbox.compareWriteMirror;let reached=false,registered=false,deleted:any;
  const spy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,rev:string|null)=>{if(path===i.recoveryPath&&!reached){reached=true;const j=await readRecoveryJournal();registered=!!j.copies?.find(c=>c.storageKey===i.file.key&&c.extraMirrorPaths?.includes(path));deleted=await req('portal/documents/'+i.file.id,{},'client','DELETE');}return cas(path,data,rev);});
  let first:any;try{first=await runDbBackup({dispatchAttention:false});}finally{spy.mockRestore();}await retryDocumentDeletions();let b=first;for(let n=0;n<4&&!b.complete;n++)b=await runDbBackup({resumeOnly:true,dispatchAttention:false});const dump=b.complete?JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()):null,download=await req('portal/documents/'+i.file.id+'/download',undefined,'client'),paths=collectOfficeRecoverySources(i,await readRecoveryJournal()),remaining:string[]=[];
  for(const p of paths)if(await dropbox.readMirror(p))remaining.push(p);const restored=dump?restoreFixture('BACKUP-COPY-LINEAGE',dump,[],[]):null;
  check('BACKUP-COPY-LINEAGE',reached&&registered&&deleted.status===200&&download.status===404&&!await readObject(i.file.key)&&remaining.length===0&&b.complete&&!dump.files.some((f:any)=>f.storageKey===i.file.key)&&restored?.ok&&mail.length===before,{reached,registered,deleted:deleted?.status,download:download.status,remaining,first,b,restored,original:originalRecords(original),noticeDelta:mail.length-before});
 });
 await test('RETIRE-SHARED-ID',async()=>{
  const co=await company({status:'formed'}),id=await service('ein',co);requireOk(await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false})));const first=await opFor(id);let fault=0;
  db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Shared-id pending correction');}return rawQuery(q,p)};const interrupted=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:first.id},['file'],correctedBytes));db.query=rawQuery;const u=await opFor(id);await freeze(u);
  if(fault!==1||interrupted.status!==500||u.phase!=='open'||u.files.upload.id!==first.files.upload.id)throw Error('Shared-id starting state not reached');const before=mail.length;
  const corrected=await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false,correctionOf:u.id},['file'],pdfBytes)),v=await opFor(id),live=await freeze(v),journal=await readRecoveryJournal(),b=await runDbBackup({dispatchAttention:false});const dump=b.complete?JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()):null,restored=dump?restoreFixture('RETIRE-SHARED-ID',dump,originalRecords(live),originalRecords(live)):null;
  check('RETIRE-SHARED-ID',corrected.status===200&&u.files.upload.id===v.files.upload.id&&u.files.upload.key!==v.files.upload.key&&journal.records.some(r=>r.storageKey===u.files.upload.key&&r.reason==='superseded')&&!journal.records.some(r=>r.storageKey===v.files.upload.key)&&b.complete&&restored?.ok&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{corrected:corrected.status,sharedId:v.files.upload.id,oldKey:u.files.upload.key,newKey:v.files.upload.key,b,restored,downloads:await exactDownloads(live),noticeDelta:mail.length-before});
 });
 await test('COPY-RETIRE-REGISTER-BEFORE',async()=>{
  const helpers=await import(R+'/server/office-file-recovery.ts'),ops=await import(R+'/server/office-operation.ts');const co=await company({status:'formed'}),id=await service('ein',co);let stopped=false;
  db.query=async(q:string,p:any[])=>{if(!stopped&&q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){stopped=true;throw Error('Open EIN fixture');}return rawQuery(q,p)};await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false}));db.query=rawQuery;const u=await opFor(id),old=await freeze(u),identity=officeFileIdentities(await officeRecoveryTables(db)).get(old.upload.key)!;
  let freezeReached!:()=>void,registerGo!:()=>void,writeReached!:()=>void,writeGo!:()=>void;const frozen=new Promise<void>(r=>freezeReached=r),registration=new Promise<void>(r=>registerGo=r),writing=new Promise<void>(r=>writeReached=r),upload=new Promise<void>(r=>writeGo=r);let paused=false,written=false,registered=false;
  const ensure=helpers.ensureOfficeMirrorCopy,cas=dropbox.compareWriteMirror;
  const es=spyOn(helpers,'ensureOfficeMirrorCopy').mockImplementation(async(i:any)=>{if(i.file.key===identity.file.key&&!paused){paused=true;freezeReached();await registration;}return ensure(i);});
  const cs=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,bytes:Buffer,rev:string|null)=>{if(path===identity.recoveryPath&&!written){written=true;registered=!!(await readRecoveryJournal()).copies?.find(c=>c.storageKey===identity.file.key&&c.extraMirrorPaths?.includes(path));writeReached();await upload;}return cas(path,bytes,rev);});
  const before=mail.length,backup=runDbBackup({dispatchAttention:false});let b:any,journalAtDecision:any,registeredAtClaim=false,next:any,delivered:any;
  try{
   await Promise.race([frozen,Bun.sleep(5000).then(()=>{throw Error('Frozen snapshot not reached')})]);registeredAtClaim=!!(await readRecoveryJournal()).copies?.find(c=>c.storageKey===identity.file.key&&c.extraMirrorPaths?.includes(identity.recoveryPath));
   const payload={assignedEin:'881234562',notify:false,titleOverride:'',title:u.payload.title,summary:u.payload.summary,attachmentRequired:true},hash=ops.officeHash({pdf:Buffer.from(correctedBytes).toString('base64'),assignedEin:'881234562',titleOverride:'',notify:false}),claim=await ops.claimRetirement(db,u,hash,payload);
   registerGo();await Promise.race([writing,Bun.sleep(5000).then(()=>{throw Error('Registered upload not reached')})]);await ops.persistRetirementSet(db,claim);journalAtDecision=await readRecoveryJournal();next=await ops.completeRetirement(db,claim);
   delivered=await req('admin/services/'+id+'/fulfill',form({ein:'881234562',notify:false},['file'],correctedBytes));writeGo();b=await backup;
  }finally{registerGo();writeGo();await backup;es.mockRestore();cs.mockRestore();}
  await retryDocumentDeletions();for(let n=0;n<3&&!b.complete;n++)b=await runDbBackup({resumeOnly:true,dispatchAttention:false});
  const dump=b.complete?JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString()):null,restored=dump?restoreFixture('COPY-RETIRE-REGISTER-BEFORE',dump,[],[],false,{path:'admin/services/'+id+'/fulfill',body:{},status:409,code:'DOCUMENT_DELETED'}):null,live=await freeze(await opFor(id));
  check('COPY-RETIRE-REGISTER-BEFORE',stopped&&!registeredAtClaim&&registered&&journalAtDecision.records.some((r:any)=>r.storageKey===identity.file.key&&r.extraMirrorPaths?.includes(identity.recoveryPath))&&next.phase==='open'&&delivered.status===200&&!await dropbox.readMirror(identity.recoveryPath)&&b.complete&&restored?.ok&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{registeredAtClaim,registered,decision:journalAtDecision.records.find((r:any)=>r.storageKey===identity.file.key),delivered:delivered.status,deliveryBody:delivered.body,b,restored,downloads:await exactDownloads(live),noticeDelta:mail.length-before});
 });
}
if(mode==='claim-predecision')await test('CLAIM-PREDECISION',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let fault=0;
 db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Before publication');}return rawQuery(q,p)};
 const first=await req('admin/services/'+id+'/fulfill',form({ein:'881234561'}));db.query=rawQuery;const op=await opFor(id);if(fault!==1||first.status!==500||op.phase!=='open')throw Error('Open starting operation missing');
 const b=await runDbBackup({dispatchAttention:false});if(!b.complete)throw Error('Snapshot incomplete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());
 // Reserve replacement U->V but stop before any external retirement decision.
 fault=0;db.query=async(q:string,p:any[])=>{if(q.startsWith('SELECT id FROM office_operations WHERE id=$1 AND lease=$2')&&q.includes("phase='retiring'")){fault++;throw Error('Before retirement journal');}return rawQuery(q,p)};
 const correction=await req('admin/services/'+id+'/fulfill',form({ein:'881234562',correctionOf:op.id},['file'],correctedBytes));db.query=rawQuery;
 const journal=await readRecoveryJournal(),retired=journal.records.filter((r:any)=>r.storageKey===op.files.upload.key),restored=restoreFixture('CLAIM-PREDECISION',dump,[],[],false,{path:'admin/services/'+id+'/fulfill',body:{},status:409,code:'RECOVERY_REVIEW_REQUIRED'});
 check('CLAIM-PREDECISION',fault===1&&correction.status===500&&retired.length===0&&restored.ok,{fault,status:correction.status,retired:retired.length,restored});
});
if(mode==='packages')await test('package-gap-boundaries',async()=>{
 const co=await company({status:'formed'}),id=await service('s-election',co);
 requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false})));
 const first=await opFor(id),p1=(await readRecoveryJournal()).packages.find((p:any)=>p.id===first.result.documentId)!;
 requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false,ein:'881234561',correctionOf:first.id},['file'],correctedBytes)));
 const second=await opFor(id),journal=await readRecoveryJournal(),p2=journal.packages.find((p:any)=>p.id===second.result.documentId)!,before=mail.length;
 const {storageIdentity}=await import(R+'/server/office-recovery-sources.ts');
 const identifier=(p:any)=>{const si=storageIdentity(p.storageKey);return hashBytes(Buffer.from(JSON.stringify(['office-recovery-v1',p.clientId,p.id,si.namespace,si.canonicalKey,p.sha,p.size,true])));};
 const retired=await req('admin/backups/history-recovery/'+identifier(p1)+'/unrecoverable',{acknowledge:true,expectedRevision:'unused'});
 check('HG-PACKAGE-RETIRED-refusal',retired.status===409&&retired.body.error.code==='DOCUMENT_DELETED'&&journal.records.some((d:any)=>d.documentId===p1.id)&&mail.length===before,{response:retired.body,status:retired.status});
 rmSync(temp+'/files/'+p2.storageKey.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});rmSync(temp+'/mirror'+p2.mirrorPath,{force:true});
 const live=await req('admin/backups/history-recovery/'+identifier(p2)+'/unrecoverable',{acknowledge:true,expectedRevision:'unused'});
 const backup=await runDbBackup({dispatchAttention:false});
 check('HG-PACKAGE-CURRENT-refusal',live.status===409&&live.body.error.code==='HISTORY_NOT_ELIGIBLE'&&!backup.complete&&mail.length===before,{response:live.body,status:live.status,backup});
});
if(mode==='restore')await test('gap-restore',async()=>{
 const co=await seedPair(),d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));
 const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(c1);
 requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));
 const [c2]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(c2);
 const removed=await removeAll(old.statement),pending=await runDbBackup({dispatchAttention:false});
 const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===c1.id&&r.slot==='statement');
 const attentionBefore=requireOk(await req('admin/backups/attention')).filter((e:any)=>e.reference===row.historyId);
 requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true}));
 const attentionAfter=requireOk(await req('admin/backups/attention')).filter((e:any)=>e.reference===row.historyId);
 check('ALERT-RESOLVED-on-ack',attentionBefore.some((e:any)=>e.active)&&attentionAfter.every((e:any)=>!e.active),{before:attentionBefore.map((e:any)=>({active:e.active,generation:e.generation})),after:attentionAfter.map((e:any)=>({active:e.active,generation:e.generation}))});
 const backup=await runDbBackup({resumeOnly:true,dispatchAttention:false});
 if(backup.status!=='complete_with_history_gaps')throw Error('No terminal gap snapshot '+JSON.stringify(backup));
 const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()),originals=Object.entries(live).map(([slot,f]:[string,any])=>({slot,key:f.key,sha:hashBytes(f.plain),size:f.plain.length,id:f.id}));
 const spec={id:'HG-RESTORE-GAP',dump,target:temp+'/restore-target',mirror:temp+'/mirror',output:E+'/restore-gap-result.json',client,originals,downloads:originals};writeFileSync(E+'/restore-gap-input.json',JSON.stringify(spec));
 const result=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',E+'/restore-gap-input.json'],{encoding:'utf8'});writeFileSync(E+'/restore-gap-child.log',result.stdout+result.stderr);
 check('HG-RESTORE-GAP',!pending.complete&&pending.pending>0&&result.status===0,{pending,backup,childStatus:result.status,childOutput:result.stdout,childError:result.stderr});
 await restoreAll(old.statement,removed);
});
if(mode.startsWith('service-')){
 const family=mode.slice(8),type=family==='company-EIN'||family==='series-EIN'?'ein':family==='series-designation'?'series':family;
 await test('service-lifecycle-'+family,async()=>{
  const co=await company({status:'formed',certs:family.includes('certificate')||family==='certified-copy'}),id=await service(type,co,{details:family==='series-EIN'?{target:'series',seriesName:'PS 9'}:family==='series-designation'?{seriesName:'PS 9'}:{}});
  let parentId:string|undefined;
  if(family==='series-EIN'){parentId=await service('ein',co);requireOk(await req('admin/services/'+parentId+'/fulfill',form({ein:'881234563',notify:false})));}
  const fields={ein:family==='series-EIN'?'881234562':'881234561',notify:true};
  requireOk(await req('admin/services/'+id+'/fulfill',form(fields)));const first=await opFor(id),originals=await freeze(first),before=mail.length;
  rmSync(temp+'/files/'+originals.upload.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));
  const replay=await req('admin/services/'+id+'/fulfill',form(fields)),download=await exactDownloads(originals),otherDownload=await req('portal/documents/'+originals.upload.id+'/download',undefined,'other'),[parent]=parentId?await rawQuery('SELECT details FROM service_orders WHERE id=$1',[parentId]):[null],[paid]=await rawQuery('SELECT * FROM service_orders WHERE id=$1',[id]);
  check('DONE-'+family,replay.status===200&&otherDownload.status===404&&download.every(r=>r.equal)&&mail.length===before&&paid.status==='fulfilled'&&paid.ein_secret===null&&(family!=='series-EIN'||parent.details.assignedEin==='881234563')&&(await docs(co)).length===(parentId?2:1),{response:replay.status,download,otherClient:otherDownload.status,noticeDelta:mail.length-before,parentEin:parent?.details.assignedEin,serviceStatus:paid.status});
  requireOk(await req('admin/services/'+id+'/fulfill',form({...fields,ein:'881234564',correctionOf:first.id},['file'],correctedBytes)));
  const second=await opFor(id),[archive]=await rawQuery('SELECT * FROM office_operations WHERE id=$1',[first.id]);
  const originals2=await freeze(second),mailAfter=mail.length;
  const backup=await runDbBackup(),dump=backup.key?JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()):null;
  const restoredArchive=restoreFixture('ARCHIVE-'+family,dump,[...originalRecords(originals),...originalRecords(originals2)],originalRecords(originals2));
  check('ARCHIVE-'+family,archive.kind==='service-history:'+first.id&&archive.phase==='superseded'&&archive.payload.previousPhase==='done'&&restoredArchive.ok&&backup.complete===true&&dump?.files.some((f:any)=>f.storageKey===originals.upload.key&&f.sha===hashBytes(originals.upload.plain))&&mail.length===mailAfter,{archiveKind:archive.kind,phase:archive.phase,previous:archive.payload.previousPhase,backup,restoredArchive,noticeDelta:mail.length-mailAfter});
  const listing=requireOk(await req('admin/backups/history-recovery')),row=listing.rows.find((r:any)=>r.operationId===first.id);if(!row)throw Error('Archived service not listed');
  const removed=await removeAll(originals.upload),noCopy=await req('admin/backups/history-recovery/'+row.historyId+'/check',{}),gap=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});
  const gapBackup=await runDbBackup(),live=await exactDownloads(originals2);
  const gapDump=JSON.parse(gunzipSync((await readObject('backups/'+gapBackup.key))!).toString()),restoredGap=restoreFixture('HG-LATE-'+family,gapDump,originalRecords(originals2),originalRecords(originals2));
  check('HG-LATE-'+family,noCopy.status===200&&noCopy.body.data.state==='needs_staff_decision'&&gap.status===200&&gap.body.data.state==='unrecoverable'&&gapBackup.status==='complete_with_history_gaps'&&gapBackup.pending===0&&restoredGap.ok&&live.every(r=>r.equal)&&mail.length===mailAfter,{noCopy:noCopy.body,gap:gap.body,backup:gapBackup,restoredGap,live,removed,noticeDelta:mail.length-mailAfter});
  const recovered=await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},['file'],originals.upload.plain));
  const full=await runDbBackup();
  check('HG-LATER-ORIGINAL-'+family,recovered.status===200&&full.complete===true&&full.historyComplete===true&&(await exactDownloads(originals2)).every(r=>r.equal)&&mail.length===mailAfter,{recovered:recovered.body,backup:full,noticeDelta:mail.length-mailAfter});
 });
}
if(mode==='deadlines')await test('continuation-whole-route',async()=>{
 const {spyOn}=await import('bun:test'),deletions=await import(R+'/server/document-retention.ts'),operations=await import(R+'/server/office-operation.ts'),staged=await import(R+'/server/s-election-package-storage.ts'),notices=await import(R+'/server/s-election-recovery.ts'),backup=await import(R+'/server/backup.ts'),dropbox=await import(R+'/server/dropbox.ts'),attention=await import(R+'/server/backup-attention.ts'),deadline=await import(R+'/server/operation-deadline.ts');
 const realNow=Date.now;let clock=realNow(),origin=clock;Date.now=()=>clock;
 const trace:any[]=[],realNested=operations.cleanupSupersededOfficeFiles,realDeletion=deletions.retryDocumentDeletions,realMirror=dropbox.runFileMirror;
 const consume=async(name:string,until:number)=>{const start=clock;deadline.checkDeadline();trace.push({name,start:start-origin,deadline:deadline.activeDeadline()-origin,until:until-origin});clock=until;throw new DOMException('Fixture provider reached the inherited absolute deadline','TimeoutError');};
 const spies:any[]=[];
 spies.push(spyOn(operations,'cleanupSupersededOfficeFiles').mockImplementation(async(_db:any,options:any)=>{void realNested;return consume('nested-deletion',options?.deadline??deadline.activeDeadline());}));
 spies.push(spyOn(deletions,'retryDocumentDeletions').mockImplementation(async(options:any)=>{trace.push({name:'deletion-entry',start:clock-origin,until:options?.deadline-origin});return realDeletion(options);}));
 spies.push(spyOn(staged,'cleanupStagedDocuments').mockImplementation(async(options:any)=>consume('staged',options.deadline)));
 spies.push(spyOn(notices,'retryRecoveryNotices').mockImplementation(async(_db:any,options:any)=>consume('notices',options.deadline)));
 spies.push(spyOn(backup,'runDbBackup').mockImplementation(async(options:any)=>consume('backup',options.deadline)));
 spies.push(spyOn(dropbox,'runFileMirror').mockImplementation(async(options:any)=>{trace.push({name:'mirror-entry',start:clock-origin,cleanupDeadline:options.cleanupDeadline-origin});await realMirror(options);return consume('mirror',options.deadline);}));
 spies.push(spyOn(attention,'deliverBackupAttention').mockImplementation(async(options:any)=>consume('attention',options.deadline)));
 const runs:any[]=[];
 try{
  for(const concurrency of ['1','4'])for(let turn=0;turn<3;turn++){
   process.env.BACKUP_FILE_CONCURRENCY=concurrency;origin=clock;trace.length=0;
   await rawQuery("DELETE FROM backup_progress WHERE id='mirror'");
   const response=await req('cron/backup-continue'),elapsed=clock-origin,[cursor]=await rawQuery("SELECT cursor FROM backup_progress WHERE id='backup-ancillary'");
   runs.push({concurrency,turn,status:response.status,body:response.body,elapsed,cursor:cursor?.cursor,trace:[...trace]});
   clock+=1000;
  }
 }finally{for(const s of spies.reverse())s.mockRestore();Date.now=realNow;delete process.env.BACKUP_FILE_CONCURRENCY;}
 check('CAP-ROUTE-DEADLINE',runs.every(r=>r.status===200&&r.elapsed<=270000&&r.body.data.progress.complete===false),{runs});
 check('CAP-ANCILLARY-SHARED',runs.every(r=>r.trace.filter((t:any)=>['nested-deletion','staged','notices'].includes(t.name)).length===1&&r.trace.filter((t:any)=>['nested-deletion','staged','notices'].includes(t.name)).every((t:any)=>t.until<=30000)&&r.trace.filter((t:any)=>t.name==='mirror-entry').every((t:any)=>t.cleanupDeadline===30000&&t.start>=30000))&&new Set(runs.map(r=>r.cursor)).size===3,{runs});
});

if(mode==='rotation')await test('rotation-known-lineage',async()=>{
 const keys={a:Buffer.alloc(32,17).toString('base64'),b:Buffer.alloc(32,29).toString('base64'),c:Buffer.alloc(32,31).toString('base64')};process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify(keys);process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='a';
 const {rotateEncryption}=await import(R+'/scripts/rotate-encryption.ts'),{encryptedKeyId,seal}=await import(R+'/server/encryption.ts'),dropbox=await import(R+'/server/dropbox.ts'),storage=await import(R+'/server/storage.ts'),{spyOn}=await import('bun:test');
 const co=await company({status:'formed'}),services:any[]=[],old:any[]=[],live:any[]=[];
 for(const family of ['company','series']){
  const id=await service('ein',co,{details:family==='series'?{target:'series',seriesName:'PS 9'}:{}});requireOk(await req('admin/services/'+id+'/fulfill',form({ein:family==='company'?'881234561':'881234562',notify:false})));const op=await opFor(id),f=await freeze(op);services.push({id,op,f});old.push(...originalRecords(f));
 }
 const first=await runDbBackup({dispatchAttention:false}),b1=(await readObject('backups/'+first.key))!,dump1=JSON.parse(gunzipSync(b1).toString());
 for(const s of services){requireOk(await req('admin/services/'+s.id+'/fulfill',form({ein:'881234563',notify:false,correctionOf:s.op.id},['file'],correctedBytes)));live.push(...originalRecords(await freeze(await opFor(s.id))));}
 const second=await runDbBackup({dispatchAttention:false}),b2=(await readObject('backups/'+second.key))!,dump2=JSON.parse(gunzipSync(b2).toString()),before=mail.length;
 process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='b';const rotated=await rotateEncryption(db);process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({b:keys.b});
 const inventory=async()=>{
  const tables=await officeRecoveryTables(db),all=officeFileIdentities(tables),j=await readRecoveryJournal(),out:any[]=[];
  for(const i of all.values()){
   if(j.records.some(r=>r.storageKey===i.file.key))continue;
   const primary=await storage.readObject(i.file.key);if(primary)out.push({key:i.file.key,keyId:encryptedKeyId(primary),sha:hashBytes(unseal(primary)),expected:i.file.sha});
   for(const path of collectOfficeRecoverySources(i,j,tables.documents)){const raw=await dropbox.readMirror(path);if(raw)out.push({key:path,keyId:encryptedKeyId(raw),sha:hashBytes(unseal(raw)),expected:i.file.sha});}
  }return out;
 };
 let found:any[]=[];let inventoryError='';try{found=await inventory();}catch(e){inventoryError=String(e);}
 const restoreOld=restoreFixture('ROT-01-old',dump1,old,old),restoreNew=restoreFixture('ROT-02-new',dump2,[...old,...live],live);
 check('ROT-01',restoreOld.ok&&(await readObject('backups/'+first.key))?.equals(b1)&&mail.length===before,{rotated,restoreOld,noticeDelta:mail.length-before});
 check('ROT-02',restoreNew.ok&&(await readObject('backups/'+second.key))?.equals(b2)&&found.length>=12&&found.every(f=>f.keyId==='b'&&f.sha===f.expected),{restoreNew,inventory:found,inventoryError});
 // A missing old key is refusal, never a successful rotation or an inferred gap.
 const survivor=services[0].f.upload,paths=await pathsFor(survivor.key),victimPath=paths.find((p:string)=>p.startsWith('/OfficeRecovery/'))!;
 const prior=await dropbox.readMirrorVersion(victimPath);await dropbox.compareWriteMirror(victimPath,survivor.raw,prior!.rev);
 let missing='';try{await rotateEncryption(db);}catch(e){missing=String(e);}check('ROT-08-missing-key',missing.includes('unavailable'),{error:missing});
 process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({a:keys.a,b:keys.b,c:keys.c});await rotateEncryption(db);
 // The observed CAS revision cannot overwrite a concurrent winner.
 process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='c';const originalCAS=dropbox.compareWriteMirror;let raced=false,winner:Buffer|undefined;
 const cas=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,bytes:Buffer,rev:string|null)=>{
  if(path===victimPath&&!raced){raced=true;winner=seal(survivor.plain);await originalCAS(path,winner,rev);}return originalCAS(path,bytes,rev);
 });let conflict='';try{await rotateEncryption(db);}catch(e){conflict=String(e);}finally{cas.mockRestore();}
 check('ROT-05',raced&&conflict.includes('concurrently')&&(await dropbox.readMirror(victimPath))?.equals(winner!),{raced,error:conflict});
 await rotateEncryption(db);process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({c:keys.c});
 let envelopeWrites=0;const originalPut=storage.putObject;
 const put=spyOn(storage,'putObject').mockImplementation(async(...args:Parameters<typeof storage.putObject>)=>{if(isEncrypted(args[1]))envelopeWrites++;return originalPut(...args);});
 const cas2=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,bytes:Buffer,rev:string|null)=>{if(isEncrypted(bytes))envelopeWrites++;return originalCAS(path,bytes,rev);});
 try{await rotateEncryption(db);}finally{put.mockRestore();cas2.mockRestore();}
 check('ROT-07',envelopeWrites===0&&(await inventory()).every(f=>f.keyId==='c'&&f.sha===f.expected),{envelopeWrites});
 // A corrupt encrypted copy is not silently replaced by bytes whose hash was
 // learned from that corruption. Restore it only in fixture teardown.
 const intact=await dropbox.readMirrorVersion(victimPath);await originalCAS(victimPath,Buffer.from('FPSLLC-ENC-1{broken'),intact!.rev);
 let corrupt='';try{await rotateEncryption(db);}catch(e){corrupt=String(e);}const bad=await dropbox.readMirrorVersion(victimPath);await originalCAS(victimPath,intact!.data,bad!.rev);
 check('ROT-08-corrupt',!!corrupt&&mail.length===before,{error:corrupt,noticeDelta:mail.length-before});
 // Exact-key supersession does not delete the current shared-ID successor;
 // client deletion does remove every registered revision and rotation cannot
 // recreate them, including when deletion wins after a CAS write.
 process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({b:keys.b,c:keys.c});process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='b';
 const currentFile=(await opFor(services[0].id)).files.upload,currentIdentity=officeFileIdentities(await officeRecoveryTables(db)).get(currentFile.key)!;let deleted=false;
 const late=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,bytes:Buffer,rev:string|null)=>{
  const result=await originalCAS(path,bytes,rev);if(result&&path===currentIdentity.recoveryPath&&!deleted){deleted=true;const r=await req('portal/documents/'+currentFile.id,undefined,'client','DELETE');if(r.status!==200)throw Error('Deletion fixture failed');}return result;
 });try{await rotateEncryption(db);}finally{late.mockRestore();}
 const journal=await readRecoveryJournal(),retired=journal.records.filter(r=>r.serviceId===services[0].id);let absent=retired.length>=2;
 for(const r of retired){absent&&=(await storage.readObject(r.storageKey))===null;for(const path of [r.mirrorPath,...r.extraMirrorPaths??[]])absent&&=(await dropbox.readMirror(path))===null;}
 check('ROT-06',deleted&&absent&&mail.length===before,{deleted,retiredKeys:retired.map(r=>r.storageKey),absent});
});

if(['capacity','worker','throttle','checkpoint','copy-budget'].includes(mode))await test('bounded-backup-'+mode,async()=>{
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts'),storage=await import(R+'/server/storage.ts');
 const co=await company({status:'formed'}),count=mode==='copy-budget'?10:mode==='capacity'||mode==='throttle'?12:mode==='worker'?4:3,originals:any[]=[],identities:any[]=[];
 for(let n=0;n<count;n++){
  const base=Buffer.from(pdfBytes),end=base.lastIndexOf('%%EOF'),suffix=Buffer.from('\n%%EOF\n'),label=Buffer.from('\n% Capacity original '+n+' '),size=2*1024*1024;
  const bytes=Buffer.concat([base.subarray(0,end),label,Buffer.alloc(size-end-label.length-suffix.length,32),suffix]);
  const id=await service('certificate-of-status',co);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false},['file'],bytes)));const op=await opFor(id),file=op.files.upload;
  originals.push({slot:'certificate-'+n,key:file.key,sha:hashBytes(bytes),size:bytes.length,id:file.id});
 }
 for(const f of originals)identities.push(officeFileIdentities(await officeRecoveryTables(db)).get(f.key)!);
 const realNow=Date.now,realRead=dropbox.readMirrorVersion,realPlainRead=dropbox.readMirror,realCAS=dropbox.compareWriteMirror,realPut=storage.putObject;
 let clock=realNow(),active=0,maxActive=0,copyWrites=0,checkpointWrites=0,checkpointActive=0,maxCheckpoints=0,failReadback=mode==='worker',throttle=mode==='throttle',throttledAt=0;
 const targets=new Set(identities.map(i=>i.recoveryPath)),victim=identities[mode==='throttle'?2:1],calls:any[]=[],cursors:any[]=[],writes:Record<string,number>={};
 process.env.BACKUP_FILE_CONCURRENCY=['checkpoint','copy-budget'].includes(mode)?'1':'4';if(mode!=='capacity')Date.now=()=>clock;
 const rd=spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string)=>{
  if(!targets.has(path))return realRead(path);
  if(mode==='copy-budget'){const {checkDeadline}=await import(R+'/server/operation-deadline.ts');checkDeadline();}
  calls.push({path,time:clock});if(mode==='copy-budget')clock+=2;active++;maxActive=Math.max(maxActive,active);
  try{
   if(mode==='capacity')await new Promise(r=>setTimeout(r,100));
   if(throttle&&path===victim.recoveryPath){throttle=false;throttledAt=clock;throw dropboxFailure();}
   const r=await realRead(path);if(failReadback&&path===victim.recoveryPath&&r)return null;return r;
  }finally{active--;}
 });
 function dropboxFailure(){return Object.assign(new Error('Fixture provider 429 Retry-After 60'),{retryAfterMs:60000});}
 const plain=spyOn(dropbox,'readMirror').mockImplementation(async(path:string)=>{if(failReadback&&path===victim.recoveryPath)return null;return realPlainRead(path);});
 const cas=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,bytes:Buffer,rev:string|null)=>{
  const result=await realCAS(path,bytes,rev);if(result&&targets.has(path)){copyWrites++;writes[path]=(writes[path]??0)+1;}return result;
 });
 let armed=false;
 const put=spyOn(storage,'putObject').mockImplementation(async(...args:Parameters<typeof storage.putObject>)=>{
  if(args[0]!=='backup-jobs/current.json')return realPut(...args);
  checkpointActive++;maxCheckpoints=Math.max(maxCheckpoints,checkpointActive);
  try{const result=await realPut(...args),job=JSON.parse((args[1] as Buffer).toString());checkpointWrites++;cursors.push({phase:job.phase,cursor:job.cursor,done:Object.keys(job.done),verified:Object.keys(job.verified??{})});
   if(mode==='checkpoint'&&armed&&job.cursor>0){clock+=20;armed=false;}return result;
  }finally{checkpointActive--;}
 });
 const before=mail.length,runs:any[]=[];let early=0,blockedCheckpoint:any,firstWrites:any;
 try{
  if(mode==='copy-budget'){
   for(let n=0;n<60;n++){clock+=100;const origin=clock,result=await runDbBackup({resumeOnly:n>0,budgetMs:20,dispatchAttention:false});runs.push({...result,origin,duration:clock-origin});if(result.complete)break;}
  }else if(mode==='checkpoint'){
   // Materialize an unfinished three-file snapshot first, then poison two
   // observed-digest checkpoints. Original identities stay untouched.
   armed=true;const seed=await runDbBackup({budgetMs:20,dispatchAttention:false});runs.push(seed);
   const job=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());
   for(const f of job.dump.files.slice(0,2)){job.done[f.storageKey]='bad-observed-hash';f.sha='bad-observed-hash';}
   await realPut('backup-jobs/current.json',Buffer.from(JSON.stringify(job)),true);
   for(let n=0;n<20;n++){clock+=100;armed=true;const result=await runDbBackup({resumeOnly:true,budgetMs:20,dispatchAttention:false});runs.push(result);if(result.complete)break;}
  }else{
   runs.push(await runDbBackup({dispatchAttention:false}));
   if(mode==='worker'){
    blockedCheckpoint=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());firstWrites={...writes};failReadback=false;
    runs.push(await runDbBackup({resumeOnly:true,dispatchAttention:false}));
   }
   if(mode==='throttle'){
    blockedCheckpoint=JSON.parse((await readObject('backup-jobs/current.json'))!.toString());
    const beforeEarly=calls.filter(c=>c.path===victim.recoveryPath).length;clock=throttledAt+30000;
    runs.push(await runDbBackup({resumeOnly:true,dispatchAttention:false}));early=calls.filter(c=>c.path===victim.recoveryPath).length-beforeEarly;
    clock=throttledAt+60000;if(!runs.at(-1).complete)runs.push(await runDbBackup({resumeOnly:true,dispatchAttention:false}));
   }
  }
 }finally{rd.mockRestore();plain.mockRestore();cas.mockRestore();put.mockRestore();Date.now=realNow;delete process.env.BACKUP_FILE_CONCURRENCY;}
 const last=runs.at(-1),dump=last.complete?JSON.parse(gunzipSync((await readObject('backups/'+last.key))!).toString()):null;
 const restored=dump?restoreFixture('CAP-'+mode,dump,originals,originals):null;
 const exact=dump?.files.length===count&&originals.every(f=>dump.files.some((x:any)=>x.storageKey===f.key&&x.sha===f.sha));
 const common=last.complete&&exact&&restored?.ok&&mail.length===before&&maxCheckpoints===1;
 if(mode==='copy-budget')check('COPY-BUDGET',common&&copyWrites===10&&runs.length>1&&runs.every(r=>r.key===runs[0].key&&r.duration<=25)&&calls.every(c=>runs.some(r=>c.time>=r.origin&&c.time<r.origin+20)),{runs,calls,cursors,copyWrites,restored});
 if(mode==='capacity')check('CAP-FOUR',common&&maxActive===4&&copyWrites===12,{runs,maxActive,copyWrites,maxCheckpoints,checkpointWrites,restored});
 if(mode==='worker')check('CAP-WORKER-FAIL',common&&!runs[0].complete&&runs[0].pending===1&&Object.keys(blockedCheckpoint.verified).length===3&&!blockedCheckpoint.verified[victim.file.key]&&identities.every(i=>i===victim||writes[i.recoveryPath]===firstWrites[i.recoveryPath]),{runs,firstVerified:Object.keys(blockedCheckpoint.verified),victim:victim.file.key,writes,firstWrites,restored});
 if(mode==='throttle')check('CAP-THROTTLE',common&&!runs[0].complete&&!runs[1].complete&&early===0&&runs.every(r=>r.key===runs[0].key)&&blockedCheckpoint.nextEligibleAt[victim.file.key]===throttledAt+60000&&!dump.historyGaps?.length,{runs,early,throttledAt,nextEligible:blockedCheckpoint.nextEligibleAt,restored});
 if(mode==='checkpoint')check('CHECKPOINT-BUDGET',common&&runs.length>2&&runs.every(r=>r.key===runs[0].key),{runs,cursors,restored});
});

if(mode==='capacity-fallback')await test('CAP-FALLBACK',async()=>{
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts'),storage=await import(R+'/server/storage.ts');
 const co=await company({status:'formed'}),files:any[]=[],services:string[]=[];
 for(let n=0;n<12;n++){const p=await PDFDocument.create();p.addPage([300+n,300]);const bytes=await p.save(),id=await service('certificate-of-status',co);services.push(id);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false},['file'],bytes)));const f=(await opFor(id)).files.upload;files.push({slot:'certificate-'+n,key:f.key,id:f.id,sha:hashBytes(bytes),size:bytes.length});}
 const realNow=Date.now,realPut=storage.putObject,realCAS=dropbox.compareWriteMirror;let clock=realNow(),armed=false,completedBatches=0,copies=0;const batches:any[]=[],measurements:any[]=[];
 // Explicit logical workload: 12 files, two passes, a fixed startup cost of
 // 3h20m and 1h06m40s scheduling cost per settled batch. Costs are imposed
 // between invocations, never described as measured hosted provider latency.
 const startup=12000000,batchCost=4000000;
 const cas=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,rev:string|null)=>{const ok=await realCAS(path,data,rev);if(ok&&path.startsWith('/OfficeRecovery/v1/'))copies++;return ok;});
 const put=spyOn(storage,'putObject').mockImplementation(async(...args:Parameters<typeof storage.putObject>)=>{const result=await realPut(...args);if(armed&&args[0]==='backup-jobs/current.json'){const j=JSON.parse((args[1]as Buffer).toString());if(j.cursor>0&&j.phase!=='publish'){armed=false;completedBatches++;batches.push({phase:j.phase,cursor:j.cursor});clock+=20;}}return result;});
 async function measured(concurrency:1|4){
  process.env.BACKUP_FILE_CONCURRENCY=String(concurrency);clock=realNow();Date.now=()=>clock;const start=clock,copyStart=copies,batchStart=completedBatches;let first=true,last:any;const calls:any[]=[];
  for(let n=0;n<100;n++){const beforeBatches=completedBatches,callStart=clock;armed=true;last=await runDbBackup({resumeOnly:n>0,budgetMs:20,dispatchAttention:false});armed=false;calls.push({result:last,elapsedLogicalMs:clock-callStart});if(last.complete)break;if(completedBatches===beforeBatches)throw Error('No capacity fixture progress');clock=start+startup+(completedBatches-batchStart)*batchCost;first=false;}
  Date.now=realNow;if(!last?.complete||first)throw Error('Capacity fixture did not finish');const dump=JSON.parse(gunzipSync((await readObject('backups/'+last.key))!).toString()),duration=startup+(completedBatches-batchStart)*batchCost;
  const measurement={concurrency,durationLogicalMs:duration,batches:completedBatches-batchStart,newCopies:copies-copyStart,calls,manifest:dump.files.map((f:any)=>({key:f.storageKey,sha:f.sha}))};measurements.push(measurement);return {measurement,dump};
 }
 const before=mail.length;let one:any,four:any,repeat:any,revised:any;
 try{
  one=await measured(1);const selected=one.measurement.durationLogicalMs>24*3600000?4:1;if(selected!==4)throw Error('Fixture must select four-file fallback');
  four=await measured(4);repeat=await measured(4);
  const prior=await opFor(services[0]);requireOk(await req('admin/services/'+services[0]+'/fulfill',form({notify:false,correctionOf:prior.id},['file'],correctedBytes)));const f=(await opFor(services[0])).files.upload;files.push({slot:'corrected',key:f.key,id:f.id,sha:hashBytes(correctedBytes),size:correctedBytes.length});
  revised=await measured(4);
 }finally{put.mockRestore();cas.mockRestore();Date.now=realNow;delete process.env.BACKUP_FILE_CONCURRENCY;}
 const currentFiles=files.filter(f=>f.key!==files[0].key),restored=restoreFixture('CAP-FALLBACK',revised.dump,files,currentFiles);
 check('CAP-FALLBACK',one.measurement.newCopies===12&&one.measurement.durationLogicalMs===30*3600000&&four.measurement.durationLogicalMs===10*3600000&&repeat.measurement.durationLogicalMs===10*3600000&&[four,repeat,revised].every(x=>x.measurement.durationLogicalMs<24*3600000&&x.measurement.calls.every((c:any)=>c.elapsedLogicalMs<=25))&&four.measurement.newCopies===0&&repeat.measurement.newCopies===0&&revised.measurement.newCopies===1&&files.every(f=>revised.dump.files.some((x:any)=>x.storageKey===f.key&&x.sha===f.sha))&&restored.ok&&mail.length===before,{selectedMode:4,logicalFixture:{startup,batchCost,notHostedTiming:true},measurements,restored,noticeDelta:mail.length-before});
});

if(mode==='scale'||mode==='year')await test(mode==='scale'?'COPY-SCALE-LOCAL':'COPY-YEAR',async()=>{
 const {spyOn}=await import('bun:test'),dropbox=await import(R+'/server/dropbox.ts');
 const co=await company({status:'formed'}),originals:any[]=[],services:any[]=[];
 const bytesPerFile=mode==='scale'?2*1024*1024:4096;
 for(let n=0;n<500;n++){
  const base=Buffer.from(pdfBytes),end=base.lastIndexOf('%%EOF');if(end<0)throw Error('fixture PDF has no EOF');
  const suffix=Buffer.from('\n%%EOF\n'),label=Buffer.from('\n% R8 distinct original '+n+' '),bytes=Buffer.concat([base.subarray(0,end),label,Buffer.alloc(bytesPerFile-end-label.length-suffix.length,32),suffix]);
  const id=await service('certificate-of-status',co);requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false},['file'],bytes)));
  const op=await opFor(id),file=op.files.upload;if(file.sha!==hashBytes(bytes)||file.size!==bytesPerFile)throw Error('fixture original mismatch');
  const saved=E+'/scale-originals';mkdirSync(saved,{recursive:true});writeFileSync(saved+'/'+file.id+'.pdf',bytes);
  originals.push({slot:'certificate-'+n,key:file.key,sha:hashBytes(bytes),size:bytes.length,id:file.id});services.push({id,op,file});
  if(n%100===99)console.log('PROGRESS seeded '+(n+1)+' distinct originals');
 }
 const counts={reads:0,readBytes:0,sharedCAS:0,sharedCreates:0,journalCAS:0};
 const originalRead=dropbox.readMirror,originalCAS=dropbox.compareWriteMirror;
 const readSpy=spyOn(dropbox,'readMirror').mockImplementation(async(path:string)=>{readSpy.mockClear();const r=await originalRead(path);counts.reads++;counts.readBytes+=r?.length??0;return r;});
 const casSpy=spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,rev:string|null)=>{casSpy.mockClear();if(path===JOURNAL_PATH)counts.journalCAS++;if(path.startsWith('/OfficeRecovery/'))counts.sharedCAS++;const ok=await originalCAS(path,data,rev);if(ok&&!rev&&path.startsWith('/OfficeRecovery/'))counts.sharedCreates++;return ok;});
 const checkpoints:any[]=[],start=performance.now(),cycles=mode==='year'?365:2,beforeMail=mail.length;
 const completeBackup=async()=>{const calls:any[]=[];let result:any;for(let invocation=0;invocation<100;invocation++){const t=performance.now();result=await runDbBackup({resumeOnly:invocation>0,dispatchAttention:false});calls.push({elapsedMs:performance.now()-t,result});if(result.complete)break;if(!result.pending&&invocation>0)throw Error('Backup stalled '+JSON.stringify(result));}if(!result?.complete)throw Error('Backup did not complete in bounded invocations');return {result,calls};};
 try{
  for(let cycle=1;cycle<=cycles;cycle++){
   const previous={...counts},r=await completeBackup(),diff=Object.fromEntries(Object.keys(counts).map(k=>[k,counts[k as keyof typeof counts]-previous[k as keyof typeof counts]]));
   const journal=await readRecoveryJournal(),paths=journal.copies?.flatMap(c=>[c.mirrorPath,...c.extraMirrorPaths??[]]).filter(p=>p.startsWith('/OfficeRecovery/'))??[];
   const {readdirSync}=await import('node:fs');const objects=readdirSync(temp+'/mirror/OfficeRecovery/v1');
   if(objects.length!==500||new Set(paths).size!==500||r.result.complete!==true||diff.reads<=0||(cycle===1?diff.sharedCreates!==500:diff.sharedCAS!==0||diff.journalCAS!==0))throw Error('Shared-copy counter or lineage failure '+JSON.stringify({cycle,diff,objects:objects.length,paths:new Set(paths).size,result:r.result}));
   const dump=JSON.parse(gunzipSync((await readObject('backups/'+r.result.key))!).toString());
   for(const f of originals)if(!dump.files.some((entry:any)=>entry.storageKey===f.key&&entry.sha===f.sha))throw Error('manifest original changed');
   checkpoints.push({cycle,key:r.result.key,diff,objects:objects.length,paths:new Set(paths).size,calls:r.calls,peakRSS:process.resourceUsage().maxRSS});
   writeFileSync(E+'/scale-progress.json',JSON.stringify({mode,counts,checkpoints},null,2));
   if(cycle%10===0||cycle===1||cycle===cycles)console.log('PROGRESS '+mode+' cycle '+cycle+'/'+cycles+' elapsed '+Math.round((performance.now()-start)/1000)+'s');
  }
  if(mode==='year'){
   const s=services[0];requireOk(await req('admin/services/'+s.id+'/fulfill',form({notify:false,correctionOf:s.op.id},['file'],correctedBytes)));
   const before={...counts},last=await completeBackup(),dump=JSON.parse(gunzipSync((await readObject('backups/'+last.result.key))!).toString());
   const {listBackups:manifests}=await import(R+'/server/backup.ts');
   const total=(await manifests()).length;
   check('COPY-YEAR',counts.sharedCreates-before.sharedCreates===1&&total===366&&dump.files.length===501&&mail.length===beforeMail,{cycles:365,manifestCount:total,newCopies:counts.sharedCreates-before.sharedCreates,files:dump.files.length,counts,elapsedMs:performance.now()-start,peakRSS:process.resourceUsage().maxRSS});
  }else{
   const last=checkpoints.at(-1),dump=JSON.parse(gunzipSync((await readObject('backups/'+last.key))!).toString()),spec={id:'COPY-SCALE-LOCAL',dump,target:temp+'/restore-scale',mirror:temp+'/mirror',output:E+'/scale-restore-result.json',client,originals,downloads:originals};
   writeFileSync(E+'/scale-restore-input.json',JSON.stringify(spec));const restored=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',E+'/scale-restore-input.json'],{encoding:'utf8',maxBuffer:8*1024*1024});writeFileSync(E+'/scale-restore.log',restored.stdout+restored.stderr);
   check('COPY-SCALE-LOCAL',restored.status===0&&mail.length===beforeMail,{checkpoints,counts,restoreExit:restored.status,elapsedMs:performance.now()-start,peakRSS:process.resourceUsage().maxRSS,bytesPerFile});
  }
 }finally{readSpy.mockRestore();casSpy.mockRestore();}
});

if(mode==='browser-pagination'){
 const build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('Browser build missing');const {chromium}=await import(R+'/node_modules/playwright/index.js');
 const co=await company({status:'formed',name:'Pagination LLC'}),id=await service('certificate-of-status',co),versions:any[]=[];
 for(let n=1;n<=102;n++){
  const p=await PDFDocument.create();p.addPage([300+n,400]);const bytes=await p.save(),previous=n>1?await opFor(id):null;
  requireOk(await req('admin/services/'+id+'/fulfill',form({notify:false,...previous?{correctionOf:previous.id}:{}},['file'],bytes)));versions.push(await freeze(await opFor(id)));
 }
 const table=await officeRecoveryTables(db),identities=officeFileIdentities(table),victim=versions[100],live=versions[101],{historyId}=await import(R+'/server/office-history-recovery.ts'),targetId=historyId(identities.get(victim.upload.key)!);
 env.ADMIN_NOTIFY_EMAIL='office@example.test';
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return app.fetch(request);const f=Bun.file(build+u.pathname);return new Response(await f.exists()?f:Bun.file(build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port,browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])await test('HG-PAGINATION-'+width,async()=>{
  const before=mail.length,removed=await removeAll(victim.upload),pending=await runDbBackup();
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(10000);
  try{
   await page.goto(origin+'/admin');await page.getByRole('tab',{name:'Reference Library',exact:true}).click();await page.getByRole('button',{name:'Review historical files',exact:true}).last().click();
   const panel=page.getByRole('region',{name:'Historical document recovery',exact:true}).last(),seen=new Set<string>(),counts:number[]=[];
   for(let n=0;n<3;n++){
    const expected=n===2?1:50;await panel.locator('article').nth(expected-1).waitFor();
    const text=await panel.locator('article').allTextContents();counts.push(text.length);
    for(const t of text){const match=t.match(/Historical revision: ([a-f0-9]+)/);if(!match)throw Error('Missing rendered revision identity');seen.add(match[1]);}
    if(n<2){const response=page.waitForResponse(r=>r.url().includes('/history-recovery?')&&r.request().method()==='GET');await panel.getByRole('button',{name:'Next historical files',exact:true}).click();await response;await page.waitForLoadState('networkidle');}
   }
   const card=panel.locator('article').filter({hasText:targetId});await card.waitFor();await card.getByRole('checkbox').check();const result=page.waitForResponse(r=>r.url().endsWith('/'+targetId+'/unrecoverable')&&r.request().method()==='POST');await card.getByRole('button',{name:'Record original as unrecoverable',exact:true}).click();const ack=await result;await card.getByRole('status').waitFor();
   const backup=await runDbBackup({resumeOnly:true}),dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()),originals=versions.filter((_,n)=>n!==100).flatMap(v=>originalRecords(v)),restored=restoreFixture('HG-PAGINATION-'+width,dump,originals,originalRecords(live)),clientMails=mail.slice(before).filter(m=>![m.to].flat().includes('office@example.test')),officeMails=mail.slice(before).filter(m=>[m.to].flat().includes('office@example.test'));
   await page.screenshot({path:E+'/pagination-'+width+'.png',fullPage:true});
   check('HG-PAGINATION-'+width,!pending.complete&&seen.size===101&&counts.join(',')==='50,50,1'&&seen.has(targetId)&&ack.status()===200&&backup.status==='complete_with_history_gaps'&&dump.historyGaps.length===1&&dump.historyGaps[0].storageKey===victim.upload.key&&restored.ok&&(await exactDownloads(live)).every(r=>r.equal)&&clientMails.length===0&&officeMails.length===1,{counts,unique:seen.size,targetId,ack:ack.status(),backup,gaps:dump.historyGaps.map((g:any)=>g.storageKey),restored,clientMail:clientMails.length,officeMail:officeMails.length});
  }finally{await context.close();await restoreAll(victim.upload,removed);requireOk(await req('admin/backups/history-recovery/'+targetId+'/original',form({},[])));await runDbBackup({dispatchAttention:false});}
 });}finally{await browser.close();server.stop(true);}
}

if(mode==='browser-current'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js'),build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('Browser build missing');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return app.fetch(request);const f=Bun.file(build+u.pathname);return new Response(await f.exists()?f:Bun.file(build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port,browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])await test('current-recovery-screen-'+width,async()=>{
  const co=await seedPair(),name='Current Recovery '+width+' LLC';await rawQuery('UPDATE orders SET llc_name=$2 WHERE id=$1',[co,name]);mailMode='fail';requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));mailMode='ok';
  const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),originals=await freeze(op),before=mail.length;
  rmSync(temp+'/files/'+originals.statement.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''));
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(8000);
  try{
   await page.goto(origin+'/admin');await page.getByRole('button',{name:new RegExp('^'+name)}).click();await page.getByRole('button',{name:'Correct Articles and document number',exact:true}).click();
   const notice=page.waitForResponse(r=>r.url().includes('/resend-notice')&&r.request().method()==='POST');await page.getByRole('button',{name:'Retry correction notice',exact:true}).click();const sent=await notice;await page.waitForLoadState('networkidle');
   const correctionPanel=page.getByRole('region',{name:'Correct formation documents'});const success=correctionPanel.getByRole('status');await success.waitFor();
   let downloads=await exactDownloads(originals);check('RECOVERY-RENDERED-AUTOMATIC-'+width,sent.status()===200&&downloads.every(r=>r.equal)&&mail.length===before+1&&mailRequests.filter(r=>r.key==='formation-correction/'+op.id).length===2&&await success.isVisible(),{status:sent.status(),message:await success.innerText(),downloads,noticeDelta:mail.length-before,keys:mailRequests.filter(r=>r.key==='formation-correction/'+op.id).map(r=>r.key)});
   const afterNotice=mail.length;await page.getByRole('button',{name:'Recover saved original',exact:true}).click();const panel=page.getByRole('region',{name:'Document recovery',exact:true});
   for(const slot of ['articles','statement']){
    const removed=await removeAll(originals[slot]);await panel.getByRole('combobox').selectOption(op.id+'/'+slot);
    const refused=page.waitForResponse(r=>r.url().endsWith('/office-recovery/'+op.id+'/'+slot)&&r.request().method()==='POST');await panel.getByRole('button',{name:'Recover original',exact:true}).click();const rr=await refused,refusal=await rr.json();await panel.getByRole('alert').waitFor();
    check('RECOVERY-RENDERED-NO-ORIGINAL-'+slot+'-'+width,rr.status()===409&&refusal.error?.code==='UPLOAD_REQUIRED'&&mail.length===afterNotice,{status:rr.status(),body:refusal,message:await panel.getByRole('alert').innerText(),removed,noticeDelta:mail.length-afterNotice});
    await panel.getByLabel('Original PDF (if you have it)',{exact:true}).setInputFiles({name:slot+'-original.pdf',mimeType:'application/pdf',buffer:originals[slot].plain});
    const repaired=page.waitForResponse(r=>r.url().endsWith('/office-recovery/'+op.id+'/'+slot)&&r.request().method()==='POST');await panel.getByRole('button',{name:'Recover original',exact:true}).click();const repair=await repaired;await page.waitForLoadState('networkidle');await panel.getByRole('status').waitFor();
    downloads=await exactDownloads(originals);const [saved]=await rawQuery('SELECT phase FROM office_operations WHERE id=$1',[op.id]);
    check('RECOVERY-RENDERED-UPLOAD-'+slot+'-'+width,repair.status()===200&&downloads.every(r=>r.equal)&&mail.length===afterNotice&&saved.phase==='done',{status:repair.status(),message:await panel.getByRole('status').innerText(),downloads,phase:saved.phase,noticeDelta:mail.length-afterNotice});
    await panel.getByLabel('Original PDF (if you have it)',{exact:true}).setInputFiles([]);
   }
   await page.screenshot({path:E+'/current-recovery-'+width+'.png',fullPage:true});
  }finally{await context.close();}
 });}finally{await browser.close();server.stop(true);}
}

if(mode==='browser-two-tabs'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js'),build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('Browser build missing');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return app.fetch(request);const f=Bun.file(build+u.pathname);return new Response(await f.exists()?f:Bun.file(build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port;
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])await test('RECOVERY-TWO-TABS-'+width,async()=>{
  const co=await seedPair();await rawQuery('UPDATE orders SET llc_name=$2 WHERE id=$1',[co,'Two Tabs '+width+' LLC']);const [initial]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),old=await freeze(initial);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const paths=await removeAll(old.statement);await restoreAll(old.statement,paths);const history=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===initial.id&&r.slot==='statement');requireOk(await req('admin/backups/history-recovery/'+history.historyId+'/original',form({},[])));
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const x=await context.newPage(),y=await context.newPage();x.setDefaultTimeout(6000);y.setDefaultTimeout(6000);
  try{
   for(const page of [x,y]){await page.goto(origin+'/admin');await page.getByRole('button',{name:new RegExp('^Two Tabs '+width+' LLC')}).click();await page.getByRole('button',{name:'Correct Articles and document number',exact:true}).click();await page.getByLabel('Correct Florida document number',{exact:true}).fill(page===x?'L26000000004':'L26000000003');await page.getByLabel('Corrected Articles PDF',{exact:true}).setInputFiles({name:'new-articles.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdfBytes)});}
   const accept=y.waitForResponse(r=>r.url().endsWith('/orders/'+co+'/correct-articles')&&r.request().method()==='POST');await y.getByRole('button',{name:'Save corrected formation documents'}).click();const yr=await accept;await y.getByRole('status').filter({hasText:'Corrected documents saved.'}).waitFor();
   const [currentOp]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(currentOp),before=mail.length;
   const refreshed=x.waitForResponse(r=>r.url().endsWith('/admin/orders/'+co)&&r.request().method()==='GET');const reject=x.waitForResponse(r=>r.url().endsWith('/orders/'+co+'/correct-articles')&&r.request().method()==='POST');await x.getByRole('button',{name:'Save corrected formation documents'}).click();const xr=await reject,body=await xr.json();
   // Wait for the mutation's actual detail refresh, then inspect stable error UI.
   await refreshed;await x.waitForLoadState('networkidle');
   const region=x.getByRole('region',{name:'Correct formation documents'}),alert=region.getByRole('alert'),visible=await alert.count()===1&&await alert.isVisible();await x.screenshot({path:E+'/two-tabs-'+width+'.png',fullPage:true});
   const downloads=await exactDownloads(live);check('RECOVERY-TWO-TABS-'+width,yr.status()===200&&xr.status()===409&&body.error?.code==='OFFICE_CONFLICT'&&visible&&downloads.every(r=>r.equal)&&mail.length===before,{y:yr.status(),x:xr.status(),body,message:visible?await alert.innerText():null,downloads,noticeDelta:mail.length-before});
  }finally{await context.close();}
 });}finally{await browser.close();server.stop(true);}
}
if(mode==='browser-continue'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js'),build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('Browser build missing');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return app.fetch(request);const f=Bun.file(build+u.pathname);return new Response(await f.exists()?f:Bun.file(build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port,browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])await test('CONTINUE-LOST-REPLACEMENT-'+width,async()=>{
  const co=await company({status:'formed',name:'Continue '+width+' LLC'}),id=await service('ein',co);await rawQuery('UPDATE service_orders SET llc_name=$2 WHERE id=$1',[id,'Continue '+width+' LLC']);let fault=0;
  db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('U prepublication interruption');}return rawQuery(q,p)};
  const first=await req('admin/services/'+id+'/fulfill',form({ein:'881234561'}));db.query=rawQuery;const u=await opFor(id),original=await freeze(u);
  if(first.status!==500||fault!==1||u.phase!=='open')throw Error('U fixture did not stop open');fault=0;
  db.query=async(q:string,p:any[])=>{if(q.includes("SET kind=$6||'-history:'")){fault++;throw Error('Durable retirement decision before replacement');}return rawQuery(q,p)};
  const stopped=await req('admin/services/'+id+'/fulfill',form({ein:'881234562',correctionOf:u.id},['file'],correctedBytes));db.query=rawQuery;
  const retiring=await opFor(id);if(stopped.status!==500||fault!==1||retiring.phase!=='retiring')throw Error('U retiring boundary not reached');
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(6000);const before=mail.length;
  try{
   await page.goto(origin+'/admin');await page.getByRole('button',{name:new RegExp('^Continue '+width+' LLC')}).locator('..').getByRole('button',{name:'EIN — in progress',exact:true}).click();const dialog=page.getByRole('dialog');
   const journalBefore=JSON.stringify(await readRecoveryJournal());await rawQuery("UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes' WHERE id=$1",[u.id,crypto.randomUUID()]);
   const blocked=page.waitForResponse(r=>r.url().endsWith('/office-operations/'+u.id+'/continue')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Continue without the lost replacement PDF',exact:true}).click();const br=await blocked,bb=await br.json();await dialog.getByRole('alert').waitFor();const message=await dialog.getByRole('alert').innerText(),still=await opFor(id),successors=await rawQuery("SELECT id FROM office_operations WHERE payload->>'corrects'=$1",[u.id]);
   await page.screenshot({path:E+'/continue-active-'+width+'.png',fullPage:true});
   check('CONTINUE-ACTIVE-'+width,br.status()===409&&bb.error?.code==='OFFICE_BUSY'&&message.length>0&&still.id===u.id&&still.phase==='retiring'&&successors.length===0&&JSON.stringify(await readRecoveryJournal())===journalBefore&&mail.length===before,{status:br.status(),body:bb,message,successors:successors.length,noticeDelta:mail.length-before});await rawQuery("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[u.id]);
   const detailRefresh=page.waitForResponse(r=>r.url().endsWith('/admin/services/'+id)&&r.request().method()==='GET');const continued=page.waitForResponse(r=>r.url().endsWith('/office-operations/'+u.id+'/continue')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Continue without the lost replacement PDF',exact:true}).click();const cr=await continued;await detailRefresh;await page.waitForLoadState('networkidle');
   await dialog.getByRole('status').filter({hasText:'Replacement reserved.'}).waitFor();const v=await opFor(id);
   check('CONTINUE-LOST-REPLACEMENT-reserved-'+width,cr.status()===202&&v.id!==u.id&&v.phase==='open'&&Object.keys(v.files).length===0&&mail.length===before,{status:cr.status(),phase:v.phase,files:v.files,noticeDelta:mail.length-before});
   await dialog.getByRole('checkbox',{name:'Correct failed completion',exact:true}).check();await dialog.locator('#service-attachment-file').setInputFiles({name:'W.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdfBytes)});await dialog.getByLabel('EIN as issued',{exact:true}).fill('881234563');
   const completed=page.waitForResponse(r=>r.url().endsWith('/services/'+id+'/fulfill')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Save corrected completion',exact:true}).click();const wr=await completed,w=await opFor(id),live=await freeze(w),prior=await rawQuery('SELECT id,phase FROM office_operations WHERE id=ANY($1::uuid[])',[[u.id,v.id]]),journal=await readRecoveryJournal(),downloads=await exactDownloads(live),documents=await current(co);
   await page.screenshot({path:E+'/continue-'+width+'.png',fullPage:true});
   check('CONTINUE-LOST-REPLACEMENT-'+width,wr.status()===200&&w.payload.assignedEin==='881234563'&&w.id!==v.id&&prior.length===2&&prior.every((r:any)=>r.phase==='superseded')&&journal.records.some((r:any)=>r.storageKey===original.upload.key)&&documents.length===1&&downloads.every(r=>r.equal)&&mail.length-before===1,{status:wr.status(),ein:w.payload.assignedEin,prior,documents:documents.map((d:any)=>d.id),downloads,noticeDelta:mail.length-before});
  }catch(e){await page.screenshot({path:E+'/continue-'+width+'-failure.png',fullPage:true});writeFileSync(E+'/continue-'+width+'-page.txt',await page.locator('body').innerText());throw e;}finally{await context.close();}
 });}finally{await browser.close();server.stop(true);}
}
if(mode==='browser-service-review'){
 const co=await company(),id=await service('ein',co),ein='881234567';let fired=0;
 db.query=async(q:string,p?:unknown[])=>{if(q.includes('WITH operation AS (SELECT * FROM office_operations')&&q.includes('INSERT INTO documents')){fired++;throw Error('Browser fixture interruption before service publication');}return rawQuery(q,p)};
 const stopped=await req('admin/services/'+id+'/fulfill',form({ein}));db.query=rawQuery;const op=await opFor(id),originals=await freeze(op);
 if(fired!==1||stopped.status!==500||op.phase!=='open')throw Error('Browser review setup interruption did not fire');
 const backup=await runDbBackup({dispatchAttention:false});if(!backup.complete)throw Error('Open-operation backup failed');const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString());
 for(const width of [1280,390])await test('RESTORED-REVIEW-SCREEN-'+width,async()=>{
  const stem=E+'/review-'+width,spec={id:'RESTORED-REVIEW-SCREEN-'+width,dump,target:temp+'/restored-'+width,mirror:temp+'/mirror',output:stem+'-result.json',client,originals:originalRecords(originals),downloads:originalRecords(originals),browserService:{width,build:process.env.R8_BROWSER_BUILD,serviceId:id,ein,bytes:Buffer.from(pdfBytes).toString('base64')}};writeFileSync(stem+'-input.json',JSON.stringify(spec));
  const child=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:8*1024*1024});writeFileSync(stem+'.log',child.stdout+child.stderr);check(spec.id,child.status===0,{exit:child.status,log:stem+'.log'});
 });
}
if(mode==='browser-articles-review'){
 const co=await company({status:'filed',name:'Restored Articles LLC',payload:{certifications:{articlesSignedBy:'SERVICE'}}});let fault=0;
 db.query=async(q:string,p:any[])=>{if(q.includes('WITH operation AS (SELECT')&&q.includes('INSERT INTO documents')){fault++;throw Error('Initial pair before publication');}return rawQuery(q,p)};
 const stopped=await req('admin/orders/'+co+'/articles',form({documentNumber:'L26000000001'},['articles']));db.query=rawQuery;const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(op);
 if(fault!==1||stopped.status!==500||op.phase!=='open'||!originals.statement)throw Error('Open Articles pair interruption not reached');
 const backup=await runDbBackup({dispatchAttention:false});if(!backup.complete)throw Error('Open-pair backup failed');const dump=JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString());
 for(const width of [1280,390])await test('RESTORED-ARTICLES-REVIEW-'+width,async()=>{
  const stem=E+'/review-'+width,spec={id:'RESTORED-ARTICLES-REVIEW-'+width,dump,target:temp+'/restored-'+width,mirror:temp+'/mirror',output:stem+'-result.json',client,originals:originalRecords(originals),downloads:originalRecords(originals),browserArticles:{width,build:process.env.R8_BROWSER_BUILD,orderId:co,number:'L26000000001',bytes:Buffer.from(pdfBytes).toString('base64')}};writeFileSync(stem+'-input.json',JSON.stringify(spec));
  const child=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env},maxBuffer:8*1024*1024});writeFileSync(stem+'.log',child.stdout+child.stderr);check(spec.id,child.status===0,{exit:child.status,log:stem+'.log'});
 });
}
if(mode==='browser-attention'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js'),build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('R8_BROWSER_BUILD required');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return app.fetch(request);const file=Bun.file(build+url.pathname);return new Response(await file.exists()?file:Bun.file(build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port;env.PUBLIC_BASE_URL=origin;
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])await test('ALERT-LINK-browser-'+width,async()=>{
  const co=await seedPair(),[old]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]),originals=await freeze(old);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));
  const row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===old.id&&r.slot==='statement');await removeAll(originals.statement);await runDbBackup({dispatchAttention:false});
  const episodes=requireOk(await req('admin/backups/attention')),episode=episodes.find((e:any)=>e.reference===row.historyId);if(!episode)throw Error('No backup issue queued');
  const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(4000);
  try{
   await page.goto(origin+'/admin?backupProblem='+episode.problemId);await page.getByLabel('Password',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Sign in',exact:true}).click();
   const card=page.locator('article').filter({hasText:row.historyId});await card.waitFor();
   check('ALERT-LINK-AUTH-'+width,new URL(page.url()).searchParams.get('backupProblem')===episode.problemId&&await card.count()===1,{url:page.url(),historyId:row.historyId});
   await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Record original as unrecoverable'}).click();await card.getByRole('status').filter({hasText:'Historical original recorded as unavailable'}).waitFor();
   await page.reload();await page.getByRole('status').filter({hasText:'This backup issue was resolved'}).waitFor();await page.screenshot({path:E+'/alert-resolved-'+width+'.png',fullPage:true});
   check('ALERT-RESOLVED-LINK-'+width,!(requireOk(await req('admin/backups/attention')).find((e:any)=>e.problemId===episode.problemId).active),{text:await page.getByRole('status').filter({hasText:'This backup issue was resolved'}).innerText()});
  }finally{await context.close();await restoreAll(originals.statement,await pathsFor(originals.statement.key));requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[])));await runDbBackup({resumeOnly:true,dispatchAttention:false});}
 });}finally{await browser.close();server.stop(true);}
}
if(mode==='browser-history-boundaries'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js'),build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('R8_BROWSER_BUILD required');
 let loseId:string|null=null,lost=false;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
  const url=new URL(request.url);if(url.pathname.startsWith('/api/')){const response=await app.fetch(request);if(loseId&&url.pathname.endsWith('/'+loseId+'/unrecoverable')&&response.status===200&&!lost){lost=true;return Response.json({error:{code:'FIXTURE_LOST_RESPONSE',message:'The fixture lost the acknowledgment response after it was saved.'}},{status:502});}return response;}
  const file=Bun.file(build+url.pathname);return new Response(await file.exists()?file:Bun.file(build+'/index.html'));
 }}),origin='http://127.0.0.1:'+server.port;env.PUBLIC_BASE_URL=origin;const browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390])for(const boundary of ['no-job','lost-ack'])await test('BROWSER-HG-'+boundary+'-'+width,async()=>{
  const co=await seedPair();requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co))));const [first]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),old=await freeze(first);
  requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));const [second]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]),live=await freeze(second),row=requireOk(await req('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===first.id&&r.slot==='statement');
  const removed=await removeAll(old.statement),before=mail.length;loseId=boundary==='lost-ack'?row.historyId:null;lost=false;
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blockedBrowserRequests.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  try{
   // No backup is started between creating this history row and the staff action.
   await page.goto(origin+'/admin');await page.getByRole('tab',{name:'Reference Library',exact:true}).click();await page.getByRole('button',{name:'Review historical files',exact:true}).last().click();const card=page.locator('article').filter({hasText:row.historyId});await card.waitFor();await card.getByRole('checkbox').check();
   let response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/unrecoverable'));await card.getByRole('button',{name:'Record original as unrecoverable',exact:true}).click();const firstResponse=await response;let savedDecision:any;
   if(boundary==='lost-ack'){
    await card.getByRole('alert').waitFor();savedDecision=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[first.id]))[0].payload.historyRecovery.statement;await card.screenshot({path:E+'/lost-ack-'+width+'.png'});
    response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/unrecoverable'));await card.getByRole('button',{name:'Record original as unrecoverable',exact:true}).click();const retry=await response;if(retry.status()!==200)throw Error('Acknowledgment retry did not return200');
   }
   await card.getByRole('status').filter({hasText:'Historical original recorded as unavailable'}).waitFor();await page.waitForTimeout(200);const message=await card.getByRole('status').innerText(),decision=(await rawQuery('SELECT payload FROM office_operations WHERE id=$1',[first.id]))[0].payload.historyRecovery.statement;
   const b=await runDbBackup({dispatchAttention:false}),dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());await card.screenshot({path:E+'/history-'+boundary+'-'+width+'.png'});
   check((boundary==='no-job'?'HG-NO-JOB':'HG-ACK-LOST')+'-browser-'+width,(boundary==='no-job'?firstResponse.status()===200:firstResponse.status()===502&&lost&&savedDecision.decisionId===decision.decisionId&&savedDecision.checkedAt===decision.checkedAt)&&b.status==='complete_with_history_gaps'&&dump.historyGaps.filter((g:any)=>g.storageKey===old.statement.key&&g.expectedSha===old.statement.sha).length===1&&message.includes('Current documents are unchanged')&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{firstStatus:firstResponse.status(),lost,decision,savedDecision,b,message,noticeDelta:mail.length-before});
  }finally{loseId=null;await context.close();await restoreAll(old.statement,removed);requireOk(await req('admin/backups/history-recovery/'+row.historyId+'/original',form({},[])));await runDbBackup({dispatchAttention:false});}
 });}finally{await browser.close();server.stop(true);}
}

if(mode==='browser-history'){
 const {chromium}=await import(R+'/node_modules/playwright/index.js');
 const build=process.env.R8_BROWSER_BUILD;if(!build)throw Error('R8_BROWSER_BUILD required');
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
  const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return app.fetch(request);
  const file=Bun.file(build+url.pathname);return new Response(await file.exists()?file:Bun.file(build+'/index.html'));
 }}),origin='http://127.0.0.1:'+server.port;env.PUBLIC_BASE_URL=origin;
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin},{name:'fpsllc_session',value:user.token,url:origin}]);
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blockedBrowserRequests.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(8000);
  for(const family of ['Articles','Statement','company-EIN','series-EIN','certificate-of-status','certified-copy','series-designation'])await test('BROWSER-HG-'+family+'-'+width,async()=>{
   let old:any,live:any,co:string,operationId:string,slot:string;
   if(family==='Articles'||family==='Statement'){
    co=await seedPair();const d=await detail(co);requireOk(await req('admin/orders/'+co+'/correct-articles',correction(d)));const [c1]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]);old=await freeze(c1);operationId=c1.id;slot=family.toLowerCase();
    requireOk(await req('admin/orders/'+co+'/correct-articles',correction(await detail(co),pdfBytes,'L26000000003')));const [c2]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[co]);live=await freeze(c2);
   }else{
    co=await company({status:'formed'});const kind=family.endsWith('EIN')?'ein':family==='series-designation'?'series':family;
    if(family==='series-EIN'){const parent=await service('ein',co);requireOk(await req('admin/services/'+parent+'/fulfill',form({ein:'881234569',notify:false})));}
    const id=await service(kind,co,{details:family==='series-EIN'?{target:'series',seriesName:'PS 9'}:family==='series-designation'?{seriesName:'PS 9'}:{}}),fields={ein:'881234561',notify:false};
    requireOk(await req('admin/services/'+id+'/fulfill',form(fields)));const first=await opFor(id);old=await freeze(first);operationId=first.id;slot='upload';
    requireOk(await req('admin/services/'+id+'/fulfill',form({...fields,ein:'881234562',correctionOf:first.id},['file'],correctedBytes)));live=await freeze(await opFor(id));
   }
   const listing=requireOk(await req('admin/backups/history-recovery')),row=listing.rows.find((r:any)=>r.operationId===operationId&&r.slot===slot);if(!row)throw Error('Missing history row');
   const before=mail.length;
   await page.goto(origin+'/admin');await page.getByRole('tab',{name:'Reference Library',exact:true}).click();
   await page.getByRole('button',{name:'Review historical files',exact:true}).last().click();
   const card=page.locator('article').filter({hasText:row.historyId});await card.waitFor();
   await card.getByRole('checkbox').check();
   let response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/unrecoverable'));
   await card.getByRole('button',{name:'Record original as unrecoverable',exact:true}).click();const survivor=await response;
   await card.getByRole('alert').filter({hasText:'verified original is available'}).waitFor();
   check('HG-SURVIVOR-browser-'+family+'-'+width,survivor.status()===409,{status:survivor.status(),message:await card.getByRole('alert').innerText()});
   const removed=await removeAll(old[slot]);const pending=await runDbBackup({dispatchAttention:false});
   response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/unrecoverable'));
   await card.getByRole('button',{name:'Record original as unrecoverable',exact:true}).click();const acknowledged=await response;
   await card.getByRole('status').filter({hasText:'Historical original recorded as unavailable'}).waitFor();
   await page.waitForTimeout(250);const persistent=await card.getByRole('status').innerText();await card.screenshot({path:E+`/history-message-${family}-${width}.png`});
   const backup=await runDbBackup({resumeOnly:true,dispatchAttention:false});
   await page.getByRole('tab',{name:'Formations & Service Orders',exact:true}).click();await page.getByRole('tab',{name:'Reference Library',exact:true}).click();
   await page.getByTestId('backup-progress').filter({hasText:'Restorable backup with historical gaps'}).waitFor();
   await page.screenshot({path:E+`/history-${family}-${width}.png`,fullPage:true});
   check('HG-LATE-'+family+'-browser-'+width,acknowledged.status()===200&&!pending.complete&&backup.status==='complete_with_history_gaps'&&persistent.includes('Current documents are unchanged')&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{status:acknowledged.status(),persistent,backup,current:await exactDownloads(live),noticeDelta:mail.length-before,removed});
   // A wrong original must not change either the gap or current document.
   await page.getByRole('button',{name:'Review historical files',exact:true}).last().click();
   const card2=page.locator('article').filter({hasText:row.historyId});await card2.waitFor();
   const wrong=old[slot].plain.equals(Buffer.from(pdfBytes))?correctedBytes:pdfBytes;
   await card2.getByLabel('Exact historical original PDF').setInputFiles({name:'wrong.pdf',mimeType:'application/pdf',buffer:Buffer.from(wrong)});
   response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/original'));
   await card2.getByRole('button',{name:'Recover original',exact:true}).click();const rejected=await response;await card2.getByRole('alert').waitFor();
   check('HG-WRONG-ORIGINAL-browser-'+family+'-'+width,rejected.status()===409&&(await exactDownloads(live)).every(r=>r.equal),{status:rejected.status(),message:await card2.getByRole('alert').innerText()});
   await card2.getByLabel('Exact historical original PDF').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:old[slot].plain});
   response=page.waitForResponse((r:any)=>r.url().endsWith('/'+row.historyId+'/original'));await card2.getByRole('button',{name:'Recover original',exact:true}).click();const repaired=await response;
   await card2.getByRole('status').filter({hasText:'Historical original recovered'}).waitFor();await page.waitForTimeout(250);
   const final=await runDbBackup({dispatchAttention:false});
   check('HG-LATER-ORIGINAL-browser-'+family+'-'+width,repaired.status()===200&&final.complete===true&&(await exactDownloads(live)).every(r=>r.equal)&&mail.length===before,{status:repaired.status(),message:await card2.getByRole('status').innerText(),backup:final,noticeDelta:mail.length-before});
  });
  await context.close();
 }}finally{await browser.close();server.stop(true);}
}

check('network-isolated',outside.length===0,{outside,blockedBrowserRequests,artifacts:E,providerCalls:providers?.calls.length??0});process.exit(rows.some(r=>r.result==='fail')?1:0);
