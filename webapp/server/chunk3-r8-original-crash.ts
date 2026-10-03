/* eslint-disable @typescript-eslint/no-explicit-any -- Disposable real-process crash verification. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
const [phase,E,slot]=process.argv.slice(2),R=resolve(import.meta.dir,'..');mkdirSync(E,{recursive:true});
const statePath=E+'/state.json';let state:any=phase==='retry'?JSON.parse(readFileSync(statePath,'utf8')):null;
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_STORAGE_DIR:E+'/files',DEV_MIRROR_DIR:E+'/mirror',ADMIN_PASSWORD:'fixture'});
const {mock,spyOn}=await import('bun:test'),{Client}=await import(process.env.R8_PG_MODULE!);
const controller=new Client({connectionString:'postgres://adam@127.0.0.1:55483/postgres'});await controller.connect();const name=state?.database??'r8_'+crypto.randomUUID().replace(/-/g,'');if(!state)await controller.query('CREATE DATABASE '+name);
const pg=new Client({connectionString:'postgres://adam@127.0.0.1:55483/'+name});await pg.connect();mock.module(Bun.resolveSync('@neondatabase/serverless',R),()=>({neon:()=>({query:async(sql:string,args:any[]=[]) => (await pg.query(sql,args)).rows})}));
const {env}=await import('./env');env.DATABASE_URL='postgres://adam@127.0.0.1:55483/'+name;
const {app}=await import('./app'),{getDb}=await import('./db'),{newToken}=await import('./crypto');const db=await getDb();
const storage=await import('./storage'),{hashBytes}=await import('./dropbox'),{readRecoveryJournal}=await import('./backup-deletions'),{isEncrypted,unseal}=await import('./encryption');
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(E+'/files',E+'/mirror',env):null;
const mail:any[]=[],outside:string[]=[];env.RESEND_API_KEY='fixture';globalThis.fetch=(async(input:any,init:any)=>{const response=await providers?.fetch(String(input),init);if(response)return response;if(String(input)!=='https://api.resend.com/emails'){outside.push(String(input));throw Error('Network refused');}mail.push(init.body);return Response.json({id:'mail-'+mail.length});}) as typeof fetch;
const admin=newToken();await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
const dropbox=await import('./dropbox'),{officeRecoveryTables}=await import('./office-file-recovery'),{officeFileIdentities,collectOfficeRecoverySources}=await import('./office-recovery-sources'),{runDbBackup}=await import('./backup');
const rawQuery=db.query.bind(db);
async function request(path:string,body?:FormData|Record<string,unknown>){const r=await app.request('/api/'+path,{method:body?'POST':'GET',headers:{Cookie:'fpsllc_admin='+admin.token,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
function ok(r:any){if(r.status!==200)throw Error(JSON.stringify(r));return r.body.data;}
function upload(bytes:Buffer,fields:Record<string,string>,name='file'){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,v);f.set(name,new File([new Uint8Array(bytes)],'original.pdf',{type:'application/pdf'}));return f;}
async function freeze(op:any){const rows:any[]=[];for(const[slot,f]of Object.entries(op.files)as[string,any][]){const raw=(await storage.readObject(f.key))!,plain=isEncrypted(raw)?unseal(raw):raw;if(hashBytes(plain)!==f.sha)throw Error('Pre-fault original mismatch');rows.push({...f,slot,plain:plain.toString('base64'),raw:raw.toString('base64')});}return rows;}
if(!state){
 const {PDFDocument}=await import('@cantoo/pdf-lib'),pdf=await PDFDocument.create();pdf.addPage([300,300]);const bytes=Buffer.from(await pdf.save()),client=crypto.randomUUID(),order=crypto.randomUUID();
 await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Crash fixture','crash@example.test')",[client]);
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Crash fixture','crash@example.test','NEW','Crash Recovery LLC',$3,49900,12500,62400,'filed',now())",[order,client,JSON.stringify({filingPath:'NEW',certifications:{articlesSignedBy:'SERVICE'},registeredAgent:{choice:'SELF'},series:[]})]);
 let op:any,originals:any[],target:any,history:any;
 if(slot==='copy'){
  const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,paid_at) VALUES($1,$2,$3,'ein','in_progress','Crash Recovery LLC',5000,'{}',now())",[id,client,order]);
  ok(await request('admin/services/'+id+'/fulfill',upload(bytes,{ein:'881234561',notify:'false'})));[op]=await db.query<any>("SELECT * FROM office_operations WHERE kind='service' AND target_id=$1",[id]);originals=await freeze(op);target=originals[0];
 }else{
  ok(await request('admin/orders/'+order+'/articles',upload(bytes,{documentNumber:'L26000000001'},'articles')));[op]=await db.query<any>("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[order]);originals=await freeze(op);target=originals.find(r=>r.slot==='statement');
  const detail=ok(await request('admin/orders/'+order));ok(await request('admin/orders/'+order+'/correct-articles',upload(bytes,{documentNumber:'L26000000002',documentId:detail.articlesCorrection.documentId,revision:detail.articlesCorrection.revision},'articles')));
  const [live]=await db.query<any>("SELECT * FROM office_operations WHERE kind='articles-correction' AND target_id=$1",[order]);originals.push(...await freeze(live));history=ok(await request('admin/backups/history-recovery')).rows.find((r:any)=>r.operationId===op.id&&r.slot==='statement');
  const {rmSync}=await import('node:fs'),tables=await officeRecoveryTables(db),i=officeFileIdentities(tables).get(target.key)!;rmSync(E+'/files/'+target.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const p of collectOfficeRecoverySources(i,await readRecoveryJournal(),tables.documents))rmSync(E+'/mirror'+p,{force:true});
  ok(await request('admin/backups/history-recovery/'+history.historyId+'/unrecoverable',{expectedRevision:history.expectedRevision,acknowledge:true}));
 }
 const i=officeFileIdentities(await officeRecoveryTables(db)).get(target.key)!;state={database:name,client,order,operationId:op.id,target,originals,history,shared:i.recoveryPath};
 const kill=async()=>{const raw=(await storage.readObject(target.key))!,plain=isEncrypted(raw)?unseal(raw):raw;if(!plain.equals(Buffer.from(target.plain,'base64')))throw Error('Wrong bytes at crash');state.mailBefore=mail.length;writeFileSync(statePath,JSON.stringify(state,null,2));console.log('KILL:'+slot);process.kill(process.pid,'SIGKILL');await new Promise(()=>{});};
 if(slot==='copy'){
  const cas=dropbox.compareWriteMirror;spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,revision:string|null)=>{const result=await cas(path,data,revision);if(path===state.shared&&result){const job=JSON.parse((await storage.readObject('backup-jobs/current.json'))!.toString());if(job.done[target.key])throw Error('Checkpoint preceded provider reply');state.jobKey=job.key;state.checkpointAbsent=true;await kill();}return result;});await runDbBackup({dispatchAttention:false});
 }else{
  db.query=async<T>(q:string,args?:unknown[])=>{if(q.includes("ARRAY['historyRecovery',$3]")){const [prior]=await rawQuery<any>('SELECT payload FROM office_operations WHERE id=$1',[op.id]);if(prior.payload.historyRecovery.statement.state!=='unrecoverable'||!await dropbox.readMirror(state.shared))throw Error('Wrong metadata crash boundary');await kill();}return rawQuery<T>(q,args);};
  await request('admin/backups/history-recovery/'+history.historyId+'/original',upload(Buffer.from(target.plain,'base64'),{}));
 }
 throw Error('Crash boundary not reached');
}
await db.query("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE lease IS NOT NULL");await db.query("UPDATE backup_progress SET lease_until=now()-interval '1 second' WHERE lease_until IS NOT NULL");
let creates=0;const cas=dropbox.compareWriteMirror;spyOn(dropbox,'compareWriteMirror').mockImplementation(async(path:string,data:Buffer,revision:string|null)=>{const result=await cas(path,data,revision);if(path===state.shared&&revision===null&&result)creates++;return result;});
let checked:any;if(slot==='history')checked=await request('admin/backups/history-recovery/'+state.history.historyId+'/check',{});
const backup=await runDbBackup({resumeOnly:slot==='copy',dispatchAttention:false}),shared=await dropbox.readMirror(state.shared),plain=shared?(isEncrypted(shared)?unseal(shared):shared):null,journal=await readRecoveryJournal(),copy=journal.copies?.find(c=>c.storageKey===state.target.key),[saved]=await db.query<any>('SELECT payload FROM office_operations WHERE id=$1',[state.operationId]);
const dump=backup.complete?JSON.parse(gunzipSync((await storage.readObject('backups/'+backup.key))!).toString()):null;let restored:number|null=null;
if(dump){const originals=state.originals.map((f:any)=>({slot:f.slot,id:f.id,key:f.key,sha:hashBytes(Buffer.from(f.plain,'base64')),size:f.size})),live=slot==='copy'?originals:originals.slice(2),spec={id:'CRASH-'+slot,dump,target:E+'/restore',mirror:E+'/mirror',output:E+'/restore-result.json',client:state.client,originals,downloads:live};writeFileSync(E+'/restore-input.json',JSON.stringify(spec));const r=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',E+'/restore-input.json'],{env:{...process.env},encoding:'utf8'});writeFileSync(E+'/restore.log',r.stdout+r.stderr);restored=r.status;}
const good=backup.complete&&restored===0&&plain?.equals(Buffer.from(state.target.plain,'base64'))&&creates===0&&copy?.extraMirrorPaths?.filter(p=>p===state.shared).length===1&&mail.length===0&&outside.length===0&&(slot==='copy'?state.checkpointAbsent&&backup.key===state.jobKey:checked.status===200&&saved.payload.historyRecovery.statement.state==='recovered');
const result={id:slot==='copy'?'COPY-LOST-ACK-PROCESS':'HG-RECOVER-CRASH-PROCESS',result:good?'pass':'fail',observed:{backup,restored,creates,sharedExact:plain?.equals(Buffer.from(state.target.plain,'base64')),checked,gap:saved.payload.historyRecovery?.statement,mail:mail.length,outside}};
writeFileSync(E+'/result.json',JSON.stringify(result,null,2));console.log('CASE:'+JSON.stringify(result));await pg.end();await controller.end();process.exit(good?0:1);
