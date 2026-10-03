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
if(!state){
 const {PDFDocument}=await import('@cantoo/pdf-lib'),pdf=await PDFDocument.create();pdf.addPage([300,300]);const bytes=Buffer.from(await pdf.save()),client=crypto.randomUUID(),order=crypto.randomUUID();
 await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Crash fixture','crash@example.test')",[client]);
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Crash fixture','crash@example.test','NEW','Crash Articles LLC',$3,49900,12500,62400,'filed',now())",[order,client,JSON.stringify({filingPath:'NEW',certifications:{articlesSignedBy:'SERVICE'},registeredAgent:{choice:'SELF'},series:[]})]);
 state={database:name,client,order,bytes:bytes.toString('base64'),number:'L26000000001',slot};
 const put=storage.putObject;spyOn(storage,'putObject').mockImplementation(async(path:string,bytes:Buffer,overwrite?:boolean)=>{
  const key=await put(path,bytes,overwrite);
  if(path.startsWith('office-work/')&&path.endsWith('/'+slot+'.pdf')){
   const [op]=await db.query<any>("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[order]),intent=op.payload.fileIntents?.[slot];
   const plain=isEncrypted(bytes)?unseal(bytes):bytes;
   if(!intent||op.files[slot]||intent.key!==key||intent.sha!==hashBytes(plain))throw Error('Wrong kill boundary');
   writeFileSync(E+'/original-'+slot+'.pdf',plain);state={...state,operation:op,intent,key,originalSha:hashBytes(plain)};writeFileSync(statePath,JSON.stringify(state,null,2));
   console.log('KILL:after-'+slot+'-bytes-before-metadata');process.kill(process.pid,'SIGKILL');await new Promise(()=>{});
  }
  return key;
 });
}else await db.query("UPDATE office_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[state.operation.id]);
const f=new FormData();f.set('documentNumber',state.number);f.set('articles',new File([Buffer.from(state.bytes,'base64')],'original.pdf',{type:'application/pdf'}));
const response=await app.request('/api/admin/orders/'+state.order+'/articles',{method:'POST',headers:{Cookie:'fpsllc_admin='+admin.token},body:f}),body=await response.json();
if(phase!=='retry')throw Error('Crash boundary was not reached: '+JSON.stringify(body));
const [op]=await db.query<any>("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[state.order]),docs=await db.query<any>('SELECT * FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[state.order]);
const journal=await readRecoveryJournal(),target=op.files[slot],token=newToken();await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[token.tokenHash,state.client]);
const originals:any[]=[],downloadResults:any[]=[];
for(const [name,file]of Object.entries(op.files) as [string,any][]){const raw=await storage.readObject(file.key),plain=raw?(isEncrypted(raw)?unseal(raw):raw):null;const download=await app.request('/api/portal/documents/'+file.id+'/download',{headers:{Cookie:'fpsllc_session='+token.token}}),bytes=Buffer.from(await download.arrayBuffer());const expected=name===slot?state.originalSha:name==='articles'?hashBytes(Buffer.from(state.bytes,'base64')):file.sha;
 originals.push({slot:name,key:file.key,id:file.id,sha:expected,size:file.size});downloadResults.push({slot:name,status:download.status,exact:!!plain&&hashBytes(plain)===expected&&hashBytes(bytes)===expected});
 if(name==='statement'){writeFileSync(E+'/statement.pdf',bytes);const text=spawnSync('/opt/homebrew/bin/pdftotext',[E+'/statement.pdf','-'],{encoding:'utf8'});downloadResults.at(-1).numberCorrect=text.status===0&&text.stdout.includes(state.number);}
}
const {runDbBackup}=await import('./backup');const backup=await runDbBackup({dispatchAttention:false}),dump=backup.complete?JSON.parse(gunzipSync((await storage.readObject('backups/'+backup.key))!).toString()):null;let restoreExit:number|null=null;
if(dump){const spec={id:'INTENT-'+slot,dump,target:E+'/restore',mirror:E+'/mirror',output:E+'/restore-result.json',client:state.client,originals,downloads:originals};writeFileSync(E+'/restore-input.json',JSON.stringify(spec));const r=spawnSync(process.execPath,[R+'/server/chunk3-r8-restore-check.ts',E+'/restore-input.json'],{env:{...process.env},encoding:'utf8'});writeFileSync(E+'/restore.log',r.stdout+r.stderr);restoreExit=r.status;}
const good=response.status===200&&target?.id===state.intent.id&&target?.key===state.key&&target?.sha===state.originalSha&&docs.length===2&&op.phase==='done'&&downloadResults.every(r=>r.exact&&(r.slot!=='statement'||r.numberCorrect))&&journal.copies?.filter(c=>c.storageKey===state.key).length===1&&backup.complete&&restoreExit===0&&mail.length===0&&outside.length===0;
const result={id:'INTENT-ARTICLES-LOST-ACK-'+slot,result:good?'pass':'fail',observed:{response:response.status,body,expectedIntent:state.intent,actual:target,phase:op.phase,docs:docs.map(d=>d.id),downloadResults,backup,restoreExit,mail:mail.length,outside}};
writeFileSync(E+'/result.json',JSON.stringify(result,null,2));console.log('CASE:'+JSON.stringify(result));await pg.end();await controller.end();process.exit(good?0:1);
