/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures intentionally inspect untyped SQL rows and intercepted requests. */
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const E=process.env.CHECK_OUTPUT_DIR||mkdtempSync(tmpdir()+'/chunk3-delivery-check-'),R=process.env.AUDIT_ROOT||resolve(import.meta.dir,'..'),run='delivery',temp=E+'/fixtures/office-'+run+'-'+Date.now();mkdirSync(temp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/files',DEV_MIRROR_DIR:temp+'/mirror',ADMIN_PASSWORD:'fixture'});
const {app}=await import(R+'/server/app.ts'),{env}=await import(R+'/server/env.ts'),{getDb}=await import(R+'/server/db.ts'),{newToken}=await import(R+'/server/crypto.ts');
const db:any=await getDb(),rawQuery=db.query.bind(db),proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof.offline||Object.values(proof.externals).some(Boolean))throw Error('Offline isolation failed');
const rows:any[]=[],mail:any[]=[],outside:string[]=[];let mailMode='ok';
globalThis.fetch=(async(input:any,init:any={})=>{const url=String(input);if(url!=='https://api.resend.com/emails'){outside.push(url);throw Error('NETWORK REFUSED '+url)}const m=JSON.parse(init.body);if(mailMode==='fail')return new Response('Fixture outage',{status:503});mail.push(m);if(mailMode==='lost')throw Error('Fixture accepted but response lost');return Response.json({id:'mail-'+mail.length})}) as typeof fetch;env.RESEND_API_KEY='fixture';
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
const {readObject,putObject}=await import(R+'/server/storage.ts');
const {runFileMirror,readMirror,mirrorFile,documentMirrorPath,hashBytes}=await import(R+'/server/dropbox.ts');
const {retryDocumentDeletions}=await import(R+'/server/document-retention.ts');
const {readRecoveryJournal,recordDocumentCopy,JOURNAL_PATH}=await import(R+'/server/backup-deletions.ts');
for(const phase of ['committed','done'])for(const damage of ['missing','corrupt'])await test('election-'+phase+'-'+damage,async()=>{
 const co=await company({status:'formed'}),id=await service('s-election',co);
 const first=await req('admin/services/'+id+'/fulfill',form({notify:true}));const op=await opFor(id);const [d]=await docs(co);const beforeMail=mail.length;
 await rawQuery('UPDATE office_operations SET phase=$2 WHERE id=$1',[op.id,phase]);
 const path=temp+'/files/'+d.storage_key.replace(/^dev:/,'');if(damage==='missing')rmSync(path);else writeBytes(path,'broken encrypted bytes');
 const resume=await req('admin/services/'+id+'/fulfill',{}),pending=await opFor(id),dl0=await req('portal/documents/'+d.id+'/download',undefined,'client');
 const retry=await req('admin/services/'+id+'/fulfill',form({notify:true}));const dl=await req('portal/documents/'+d.id+'/download',undefined,'client');
 const repeated=await req('admin/services/'+id+'/fulfill',form({notify:true}));
 check('election-'+phase+'-'+damage,first.status===200&&resume.status===409&&pending.phase==='committed'&&dl0.status!==200&&retry.status===200&&repeated.status===200&&dl.status===200&&Buffer.from(dl.bytes).equals(Buffer.from(pdfBytes))&&mail.length===beforeMail&&(await docs(co)).length===1,{first:first.status,resume:resume.status,pending:pending.phase,missingDownload:dl0.status,retry:retry.status,repeated:repeated.status,download:dl.status,newMail:mail.length-beforeMail});
});
await test('legacy-intents',async()=>{
 const co=await company({status:'formed'}),id=await service('series',co,{details:{seriesName:'Legacy, PS 1'}});let fired=false;
 db.query=async(sql:string,args:any[])=>{if(!fired&&sql.includes('INSERT INTO office_operations(kind,target_id,input_hash,payload)')){fired=true;await rawQuery(sql,args);throw Error('Legacy pre-file interruption')}return rawQuery(sql,args)};
 await req('admin/services/'+id+'/fulfill',form({notify:false}));db.query=rawQuery;
 await rawQuery("UPDATE office_operations SET payload=payload-'attachmentRequired' WHERE target_id=$1",[id]);
 const refused=await req('admin/services/'+id+'/fulfill',{});
 await rawQuery("UPDATE office_operations SET phase='done',result='{}' WHERE target_id=$1",[id]);await rawQuery("UPDATE service_orders SET status='fulfilled' WHERE id=$1",[id]);
 const repaired=await req('admin/services/'+id+'/fulfill',form({notify:false}));
 const id2=await service('series',co,{details:{seriesName:'Legacy, PS 2'}});const intentional=await req('admin/services/'+id2+'/fulfill',{notify:false});const repeated=await req('admin/services/'+id2+'/fulfill',{});
 check('legacy-required-versus-intentionally-no-file',fired&&refused.status===409&&repaired.status===200&&(await docs(co)).length===1&&intentional.status===200&&repeated.status===200,{refused:refused.status,repaired:repaired.status,intentional:intentional.status,repeated:repeated.status});
});
for(const kind of ['ein','certificate-of-status','certified-copy'])await test('all-copies-'+kind,async()=>{
 const co=await company({status:'formed'}),id=await service(kind,co);let result=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));if(result.status!==200)throw Error(JSON.stringify(result.body));
 const files:any[]=[];let beforeBackup:any;
 for(let n=0;n<3;n++){
  const op=await opFor(id),[d]=await docs(co);files.push({...d,operation:op.id});
  await mirrorFile({storageKey:d.storage_key,path:`/OfficeOperations/${op.id}/upload`});
  const m=await runFileMirror();if(!m.complete)throw Error('Mirror failed '+JSON.stringify(m));
  if(n===0){const {runDbBackup}=await import(R+'/server/backup.ts');const b=await runDbBackup();if(!b.complete)throw Error('Backup incomplete');const {gunzipSync}=await import('node:zlib');beforeBackup=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());}
  if(n<2){const pdfN=await PDFDocument.create();pdfN.addPage([360+n,480+n]);const b=await pdfN.save();result=await req('admin/services/'+id+'/fulfill',form({ein:'88123456'+(n+1),notify:false,correctionOf:op.id},['file'],b));if(result.status!==200)throw Error('Correction '+JSON.stringify(result.body));}
 }
 const [current]=await docs(co);const mirrors=await Promise.all(files.map(async f=>({key:f.storage_key,path:f.mirror_path||documentMirrorPath({...f,llc_name:'Office Audit LLC'}),exists:!!await readMirror(f.mirror_path||documentMirrorPath({...f,llc_name:'Office Audit LLC'}))})));
 const brokenMirror=kind==='certificate-of-status'?temp+'/mirror'+mirrors[0].path:null;
 if(brokenMirror){rmSync(brokenMirror);mkdirSync(brokenMirror);}
 const deletion=await req((kind==='ein'?'portal':'admin')+'/documents/'+current.id,undefined,kind==='ein'?'client':'admin','DELETE');
 if(brokenMirror){const hidden=await req('portal/documents/'+current.id+'/download',undefined,'client');check('older-revision-cleanup-failure-stays-pending',deletion.body.data.pending===true&&hidden.status===404,{deletion:deletion.body,download:hidden.status});rmSync(brokenMirror,{recursive:true});}
 for(let n=0;n<3;n++)await retryDocumentDeletions({limit:100});const journal=await readRecoveryJournal();
 const physical=await Promise.all(mirrors.map(async f=>({storage:!!await readObject(f.key),mirror:!!await readMirror(f.path),temporary:!!await readMirror(`/OfficeOperations/${files.find(x=>x.storage_key===f.key).operation}/upload`),journal:journal.records.some(x=>x.storageKey===f.key)})));
 check('three-revisions-storage-mirror-'+kind,deletion.status===200&&new Set(mirrors.map(f=>f.path)).size===3&&mirrors.every(f=>f.exists)&&physical.every(f=>!f.storage&&!f.mirror&&!f.temporary&&f.journal),{delete:deletion.status,mirrors,physical});
 // Preserve the pre-correction snapshot for a separate restore process.
 writeFileSync(E+'/restore-'+kind+'.json',JSON.stringify({dump:beforeBackup,id:current.id,client,co,keys:files.map(f=>f.storage_key),temp}));
});
await test('journal-upgrade-and-late-copy',async()=>{
 const journalPath=temp+'/mirror'+JOURNAL_PATH,original=readFileSync(journalPath);const j=await readRecoveryJournal();
 for(const version of [1,2,3]){const payload:any=version===1?{version,records:j.records}:{version,records:j.records,packages:j.packages,...(version===3?{firstNoticeCutoff:new Date().toISOString()}:{})};const sha=hashBytes(Buffer.from(JSON.stringify(version===1?payload.records:payload)));writeBytes(journalPath,JSON.stringify({...payload,sha}));const decoded=await readRecoveryJournal();check('read-legacy-journal-'+version,decoded.version===version);}
 writeBytes(journalPath,original);
 const gone=j.records.find(r=>r.reason!=='superseded')!;const key='dev:late/test.pdf';const live=await recordDocumentCopy({documentId:gone.documentId,storageKey:key,mirrorPath:'/late/test.pdf'});await putObject('late/test.pdf',Buffer.from('late upload'),true);await retryDocumentDeletions({limit:100});
 check('late-copy-joins-deletion',!live&&!(await readObject(key))&&(await readRecoveryJournal()).records.some(r=>r.storageKey===key));
});

for(const kind of ['ein','ein-series','certificate-of-status','certified-copy'])await test('unpublished-retirement-'+kind,async()=>{
 const co=await company({status:'formed'}),id=await service(kind==='ein-series'?'ein':kind,co,{details:kind==='ein-series'?{target:'series',seriesName:'Test, PS 1'}:{}});let fired=false;
 db.query=async(sql:string,args:any[])=>{if(!fired&&sql.includes("SET phase='committed',result=jsonb_build_object('documentId',$3")){fired=true;throw Error('Before publication')}return rawQuery(sql,args)};
 const failed=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;const old=await opFor(id),saved=old.files.upload;
 await mirrorFile({storageKey:saved.key,path:`/OfficeOperations/${old.id}/upload`});
 const nextPdf=await PDFDocument.create();nextPdf.addPage([320,321]);const next=await nextPdf.save();
 const corrected=await req('admin/services/'+id+'/fulfill',form({ein:'881234561',notify:false,correctionOf:old.id},['file'],next));
 const [delivered]=await docs(co);const deleted=await req((kind.startsWith('ein')?'portal':'admin')+'/documents/'+delivered.id,undefined,kind.startsWith('ein')?'client':'admin','DELETE');
 const late='dev:late-'+id+'.pdf';const allowed=await recordDocumentCopy({documentId:crypto.randomUUID(),serviceId:id,storageKey:late,mirrorPath:'/late-'+id});await putObject(late.replace('dev:',''),Buffer.from('late'),true);for(let sweep=0;sweep<3;sweep++)await retryDocumentDeletions({limit:100});
 const journal=await readRecoveryJournal();check('unpublished-retirement-'+kind,fired&&failed.status===500&&corrected.status===200&&deleted.status===200&&!allowed&&!(await readObject(late))&&!(await readObject(saved.key))&&!(await readMirror(`/OfficeOperations/${old.id}/upload`))&&journal.records.some(r=>r.storageKey===saved.key),{failed:failed.status,corrected:corrected.status,deleted:deleted.status,allowed});
});
await test('retirement-interrupted-after-db-transfer',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let stopped=false;
 db.query=async(sql:string,args:any[])=>{if(!stopped&&sql.includes("SET phase='committed',result=jsonb_build_object('documentId',$3")){stopped=true;throw Error('First attempt failed')}return rawQuery(sql,args)};await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;
 const old=await opFor(id);await mirrorFile({storageKey:old.files.upload.key,path:`/OfficeOperations/${old.id}/upload`});let transferred=false;
 db.query=async(sql:string,args:any[])=>{if(!transferred&&sql.includes("SET kind=$6||'-history:'")){await rawQuery(sql,args);transferred=true;throw Error('Lost correction intent reply')}return rawQuery(sql,args)};
 const correction=()=>form({ein:'881234561',notify:false,correctionOf:old.id});const failed=await req('admin/services/'+id+'/fulfill',correction());db.query=rawQuery;const retry=await req('admin/services/'+id+'/fulfill',correction());
 check('retirement-interrupted-after-db-transfer',transferred&&failed.status===500&&retry.status===200&&(await docs(co)).length===1&&!(await readMirror(`/OfficeOperations/${old.id}/upload`)),{transferred,failed:failed.status,retry:retry.status});
});
await test('retirement-journal-failure-retry',async()=>{
 const co=await company({status:'formed'}),id=await service('ein',co);let initial=false;
 db.query=async(sql:string,args:any[])=>{if(!initial&&sql.includes("SET phase='committed',result=jsonb_build_object('documentId',$3")){initial=true;throw Error('Before publication')}return rawQuery(sql,args)};await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false}));db.query=rawQuery;
 const old=await opFor(id),journalPath=temp+'/mirror'+JOURNAL_PATH,original=readFileSync(journalPath);let interrupted=false;
 await mirrorFile({storageKey:old.files.upload.key,path:`/OfficeOperations/${old.id}/upload`});
 db.query=async(sql:string,args:any[])=>{const result=await rawQuery(sql,args);if(!interrupted&&sql.includes("SET phase='retiring'")){interrupted=true;writeBytes(journalPath,'corrupt journal fixture');}return result;};
 const f=()=>form({ein:'881234561',notify:false,correctionOf:old.id});const fail=await req('admin/services/'+id+'/fulfill',f());db.query=rawQuery;const before=(await docs(co)).length;writeBytes(journalPath,original);const retried=await req('admin/services/'+id+'/fulfill',f());
 check('retirement-journal-failure-retry',interrupted&&fail.status===503&&before===0&&retried.status===200&&(await docs(co)).length===1&&!(await readMirror(`/OfficeOperations/${old.id}/upload`)),{interrupted,fail:fail.status,before,retried:retried.status});
});
check('network-isolated',outside.length===0,{outside});process.exit(rows.some(r=>r.result==='fail')?1:0);
