/* eslint-disable @typescript-eslint/no-explicit-any -- Disposable real-process crash verification. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
const [phase,E]=process.argv.slice(2),R=resolve(import.meta.dir,'..');mkdirSync(E,{recursive:true});
const statePath=E+'/state.json';let state:any=phase==='retry'?JSON.parse(readFileSync(statePath,'utf8')):null;
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_STORAGE_DIR:E+'/files',DEV_MIRROR_DIR:E+'/mirror',ADMIN_PASSWORD:'fixture'});
const {mock}=await import('bun:test'),{Client}=await import(process.env.R8_PG_MODULE!);
const controller=new Client({connectionString:'postgres://adam@127.0.0.1:55483/postgres'});await controller.connect();const name=state?.database??'r8_'+crypto.randomUUID().replace(/-/g,'');if(!state)await controller.query('CREATE DATABASE '+name);
const pg=new Client({connectionString:'postgres://adam@127.0.0.1:55483/'+name});await pg.connect();mock.module(Bun.resolveSync('@neondatabase/serverless',R),()=>({neon:()=>({query:async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows})}));
const {env}=await import('./env');env.DATABASE_URL='postgres://adam@127.0.0.1:55483/'+name;
const {app}=await import('./app'),{getDb}=await import('./db'),{newToken}=await import('./crypto');const db=await getDb();
const storage=await import('./storage'),{readRecoveryJournal}=await import('./backup-deletions');
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(E+'/files',E+'/mirror',env):null;
const mail:any[]=[],outside:string[]=[];env.RESEND_API_KEY='fixture';globalThis.fetch=(async(input:any,init:any)=>{const response=await providers?.fetch(String(input),init);if(response)return response;if(String(input)!=='https://api.resend.com/emails'){outside.push(String(input));throw Error('Network refused');}mail.push(init.body);return Response.json({id:'mail-'+mail.length});}) as typeof fetch;
const admin=newToken();await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
const dropbox=await import('./dropbox'),{runDbBackup}=await import('./backup');
const rawQuery=db.query.bind(db);
async function request(path:string,body?:FormData|Record<string,unknown>){const r=await app.request('/api/'+path,{method:body?'POST':'GET',headers:{Cookie:'fpsllc_admin='+admin.token,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
function upload(bytes:Buffer,fields:Record<string,string>,name='file'){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,v);f.set(name,new File([new Uint8Array(bytes)],'original.pdf',{type:'application/pdf'}));return f;}
if(!state){
 const {PDFDocument}=await import('@cantoo/pdf-lib'),pdf=await PDFDocument.create();pdf.addPage([300,300]);const bytes=Buffer.from(await pdf.save()),pdf2=await PDFDocument.create();pdf2.addPage([400,400]);const replacement=Buffer.from(await pdf2.save()),client=crypto.randomUUID(),order=crypto.randomUUID(),service=crypto.randomUUID();
 await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Crash fixture','crash@example.test')",[client]);
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Crash fixture','crash@example.test','NEW','Premetadata LLC',$3,49900,12500,62400,'formed',now())",[order,client,JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SELF'},series:[]})]);
 await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,paid_at) VALUES($1,$2,$3,'ein','in_progress','Premetadata LLC',5000,'{}',now())",[service,client,order]);
 let fired=0;db.query=async<T>(q:string,p?:unknown[])=>{if(!fired&&q.includes('SET files=files||jsonb_build_object')){fired++;throw Error('Premetadata boundary')}return rawQuery<T>(q,p)};
 const first=await request('admin/services/'+service+'/fulfill',upload(bytes,{ein:'881234560',notify:'false'}));db.query=rawQuery;
 const [op]=await db.query<any>("SELECT * FROM office_operations WHERE kind='service' AND target_id=$1",[service]),intent=op.payload.fileIntents.upload;
 if(first.status!==500||fired!==1||op.files.upload||!intent||!await storage.readObject(intent.key)||!await dropbox.readMirror(intent.operationMirrorPath))throw Error('Premetadata required state absent');
 const foreign='https://other.private.blob.vercel-storage.com/'+intent.path,{recordDocumentCopy}=await import('./backup-deletions');await recordDocumentCopy({documentId:crypto.randomUUID(),storageKey:foreign,mirrorPath:'/ForeignFixture/'+op.id});
 const b=await runDbBackup({dispatchAttention:false});if(!b.complete)throw Error('Premetadata snapshot failed');const dump=JSON.parse(gunzipSync((await storage.readObject('backups/'+b.key))!).toString());
 state={database:name,client,order,service,operationId:op.id,intent,foreign,dump,original:bytes.toString('base64')};
 db.query=async<T>(q:string,p?:unknown[])=>{if(q.includes("SET kind=$6||'-history:'")){const j=await readRecoveryJournal();if(!j.records.some(r=>r.storageKey===intent.key)||j.records.some(r=>r.storageKey===foreign))throw Error('Retirement scope wrong');state.journal=j;state.mailBefore=mail.length;writeFileSync(statePath,JSON.stringify(state,null,2));console.log('KILL:premetadata-retirement-before-db');process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}return rawQuery<T>(q,p)};
 await request('admin/services/'+service+'/fulfill',upload(replacement,{ein:'881234561',notify:'false',correctionOf:op.id}));throw Error('Kill not reached');
}
const j=await readRecoveryJournal(),decision=j.records.find(r=>r.storageKey===state.intent.key),beforePrimary=await storage.readObject(state.intent.key),beforeMirror=await dropbox.readMirror(state.intent.operationMirrorPath),stem=E+'/restore',spec={id:'PREMETADATA-RETIRE',dump:state.dump,target:E+'/restore',mirror:E+'/mirror',output:stem+'-result.json',client:state.client,originals:[],downloads:[],resume:{path:'admin/services/'+state.service+'/fulfill',body:{},status:409,code:'DOCUMENT_DELETED'}};writeFileSync(stem+'-input.json',JSON.stringify(spec));const child=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',stem+'-input.json'],{encoding:'utf8',env:{...process.env}});writeFileSync(stem+'.log',child.stdout+child.stderr);
const good=!!beforePrimary&&!!beforeMirror&&decision?.extraMirrorPaths?.includes(state.intent.operationMirrorPath)&&!j.records.some(r=>r.storageKey===state.foreign)&&child.status===0&&mail.length===0&&state.mailBefore===0&&outside.length===0;
const result={id:'PREMETADATA-RETIRE',result:good?'pass':'fail',observed:{primaryBeforeCleanup:!!beforePrimary,mirrorBeforeCleanup:!!beforeMirror,decision,foreignRetired:j.records.some(r=>r.storageKey===state.foreign),restoreExit:child.status,mail:mail.length,outside}};writeFileSync(E+'/result.json',JSON.stringify(result,null,2));console.log('CASE:'+JSON.stringify(result));await pg.end();await controller.end();process.exit(good?0:1);
