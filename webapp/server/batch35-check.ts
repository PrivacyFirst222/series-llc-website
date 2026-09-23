/** Real backup, empty-database restore and authenticated retry, isolated locally. */
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {tmpdir} from 'node:os';import {gunzipSync} from 'node:zlib';
type Report=(label:string,ok:boolean,detail?:unknown)=>void;
const client='11111111-1111-4111-8111-111111111111',order='22222222-2222-4222-8222-222222222222',attempt='33333333-3333-4333-8333-333333333333',service='44444444-4444-4444-8444-444444444444';
const input={attemptId:attempt,source:'synthetic-card-token',customerId:null,referenceId:order,email:'fixture@example.test',name:'Fixture Owner'};
async function child(mode:string,dir:string){
 const {app}=await import('./app'),{getDb}=await import('./db'),{env}=await import('./env');
 const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Isolation failed');
 globalThis.fetch=(async()=>{throw Error('External fetch forbidden')}) as unknown as typeof fetch;
 const db=await getDb(),{encryptSecret,decryptSecret,newToken}=await import('./crypto'),{putObject,readObject}=await import('./storage'),{runDbBackup}=await import('./backup'),{restoreBackup}=await import('./restore');
 const rows:{name:string;ok:boolean;detail?:unknown}[]=[];const test=(name:string,ok:boolean,detail?:unknown)=>rows.push({name,ok,detail});
 if(mode==='backup'){
  await db.query("INSERT INTO clients(id,email,name) VALUES($1,'fixture@example.test','Fixture Owner')",[client]);
  await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Fixture Owner','fixture@example.test','NEW','Fixture LLC',$3,0,0,0,'formed',now())",[order,client,JSON.stringify({registeredAgent:{choice:'SERVICE'}})]);
  await db.query("INSERT INTO service_orders(id,client_id,type,status,amount_cents,details,ein_secret) VALUES($1,$2,'ein','awaiting_info',0,'{}',$3)",[service,client,encryptSecret('synthetic-taxpayer-secret')]);
  for(const state of ['cleanup','staged']){const path='staged/'+state+'.pdf.encrypted';await putObject(path,Buffer.from('synthetic abandoned object'));await db.query("INSERT INTO staged_documents(id,service_order_id,storage_path,state,created_at) VALUES($1,$2,$3,$4,now()-interval '20 minutes')",[crypto.randomUUID(),service,'dev:'+path,state]);}
  await db.query("INSERT INTO renewal_card_attempts(id,order_id,source_token,consent,lock_until) VALUES($1,$2,$3,'synthetic-consent',now()+interval '3 minutes')",[attempt,order,encryptSecret(JSON.stringify(input))]);
  const {seal}=await import('./encryption');
  const prior=crypto.randomUUID(),current=crypto.randomUUID();writeFileSync(join(dir,'packages.json'),JSON.stringify({prior,current}));
  for(const id of [prior,current]){const key=await putObject('staged/'+id+'.pdf.encrypted',seal(Buffer.from('synthetic retained package')));await db.query("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta) VALUES($1,$2,$3,'package','Synthetic package',$4,'application/pdf',26,$5)",[id,client,order,key,JSON.stringify({sensitive:true})]);}
  await db.query("INSERT INTO staged_documents(id,service_order_id,storage_path,storage_key,state,prior_document_id) VALUES($1,$2,$3,$3,'committed',$4)",[current,service,'dev:staged/'+current+'.pdf.encrypted',prior]);
  const result=await runDbBackup();const dump=JSON.parse(gunzipSync((await readObject('backups/'+result.key))!).toString());writeFileSync(join(dir,'dump.json'),JSON.stringify(dump));
  test('complete snapshot includes both workflows',result.complete&&dump.tables.staged_documents?.length===3&&dump.tables.renewal_card_attempts?.length===1,{complete:result.complete,tables:Object.keys(dump.tables)});
  test('questionnaire secrets excluded and card request encrypted',dump.tables.service_orders[0].ein_secret===null&&!JSON.stringify(dump).includes(input.source));
  // A checkpoint made by the old deployment must not be resumed into a false complete backup.
  const old=structuredClone(dump);delete old.tables.staged_documents;delete old.tables.renewal_card_attempts;
  await putObject('backup-jobs/current.json',Buffer.from(JSON.stringify({key:'old-incomplete.json.gz',dump:old,done:{},errors:{}})),true);
  try{const resumed=await runDbBackup({resumeOnly:true});const recovered=JSON.parse(gunzipSync((await readObject('backups/'+resumed.key))!).toString());test('old incomplete job restarts from fresh consistent snapshot',resumed.complete&&resumed.key!=='old-incomplete.json.gz'&&recovered.tables.staged_documents?.length===3&&recovered.tables.renewal_card_attempts?.length===1);}catch(e){test('old incomplete job restarts from fresh consistent snapshot',false,String(e));}
 }else{
  const dump=JSON.parse(readFileSync(join(dir,'dump.json'),'utf8'));
  const older=structuredClone(dump);delete older.tables.staged_documents;delete older.tables.renewal_card_attempts;
  let refused=false;try{await restoreBackup(db,older);}catch(e){refused=/missing table/.test(String(e));}
  test('older incomplete dump refused before any rows',refused&&Number((await db.query('SELECT count(*) AS n FROM clients'))[0].n)===0);
  // On the old implementation its first successful restore already filled the target.
  if(!refused){console.log('B35:'+JSON.stringify({mode,proof,rows}));process.exit(0);}
  const corrupt=structuredClone(dump);corrupt.tables.renewal_card_attempts[0].source_token='invalid-ciphertext';let keyRefused=false;
  try{await restoreBackup(db,corrupt);}catch{keyRefused=true;}
  test('unreadable pending request refused before rows',keyRefused&&Number((await db.query('SELECT count(*) AS n FROM clients'))[0].n)===0);
  if(!keyRefused){console.log('B35:'+JSON.stringify({mode,proof,rows}));process.exit(0);}
  await restoreBackup(db,dump);
  const [saved]=await db.query<{id:string;source_token:string;lock_until:unknown}>('SELECT * FROM renewal_card_attempts WHERE id=$1',[attempt]);
  test('pending identity request and worker lease recovered',saved?.id===attempt&&decryptSecret(saved.source_token)===JSON.stringify(input)&&saved.lock_until===null);
  const{cleanupStagedDocuments}=await import('./s-election-package-storage');await cleanupStagedDocuments();
  test('restored cleanup and abandoned-stage intents remove objects',!(await readObject('staged/cleanup.pdf.encrypted'))&&!(await readObject('staged/staged.pdf.encrypted')));
  const packages=JSON.parse(readFileSync(join(dir,'packages.json'),'utf8'));
  test('restored committed replacement retires prior usable package only',!(await readObject('staged/'+packages.prior+'.pdf.encrypted'))&&!!(await readObject('staged/'+packages.current+'.pdf.encrypted'))&&(await db.query('SELECT state FROM staged_documents WHERE id=$1',[packages.current]))[0].state==='retired');
  const token=newToken();await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[token.tokenHash,client]);
  const request=(body?:unknown)=>app.request('/api/portal/companies/'+order+'/renewal-card',{method:body?'POST':'GET',headers:{Cookie:`fpsllc_session=${token.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const pending=await(await request()).json();test('portal returns restored pending attempt',pending.data?.pendingAttemptId===attempt);
  // Only the provider boundary is mocked; app route, stored request and key generation are real.
  env.SQUARE_ACCESS_TOKEN='synthetic-test-only';const calls:{path:string;body:Record<string,unknown>}[]=[];
  globalThis.fetch=(async(url:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(url));if(!['connect.squareup.com','connect.squareupsandbox.com'].includes(u.hostname)||!['/v2/customers','/v2/cards'].includes(u.pathname))throw Error('Unexpected network destination');const body=JSON.parse(String(init?.body));calls.push({path:u.pathname,body});if(u.pathname==='/v2/cards'&&calls.filter(c=>c.path==='/v2/cards').length===1)throw Error('Simulated lost provider response');return new Response(JSON.stringify(u.pathname==='/v2/customers'?{customer:{id:'customer-fixture'}}:{card:{id:'card-fixture',last_4:'1111',card_brand:'VISA',card_type:'CREDIT',prepaid_type:'NOT_PREPAID'}}),{status:200});}) as unknown as typeof fetch;
  const lost=await request({attemptId:attempt,consent:true});const stillPending=await(await request()).json();
  const competing=await request({attemptId:crypto.randomUUID(),source:'another-synthetic-token',consent:true});
  test('lost provider response retains identity and refuses competing attempt',lost.status===503&&stillPending.data?.pendingAttemptId===attempt&&competing.status===409);
  const response=await request({attemptId:attempt,consent:true});const data=await response.json();await request({attemptId:attempt,consent:true});
  const {createHash}=await import('node:crypto');const key=(kind:string)=>createHash('sha256').update(`${kind}:${attempt}`).digest('hex').slice(0,40);
  test('retries preserve provider identity and completion prevents further calls',response.status===200&&calls.length===4&&calls.every(c=>c.body.idempotency_key===key(c.path==='/v2/cards'?'card':'customer'))&&calls.filter(c=>c.path==='/v2/cards').every(c=>c.body.source_id===input.source),{status:response.status,data,paths:calls.map(c=>c.path),keys:calls.map(c=>c.body.idempotency_key)});
  test('restored taxpayer secrets remain absent',(await db.query('SELECT ein_secret FROM service_orders WHERE id=$1',[service]))[0].ein_secret===null);
 }
 console.log('B35:'+JSON.stringify({mode,proof,rows}));process.exit(0);
}
export async function batch35Checks(report:Report){
 const dir=mkdtempSync(join(tmpdir(),'batch35-'));try{
 const details:{code:number;result:{rows:{ok:boolean}[]}|null;error?:string}[]=[];for(const mode of ['backup','restore']){const p=Bun.spawn([process.execPath,import.meta.filename,mode,dir],{env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,mode),DEV_STORAGE_DIR:join(dir,'files'),DEV_MIRROR_DIR:join(dir,'mirror'),DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),DOCUMENT_ENCRYPTION_ACTIVE_KEY:'test'},stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);const line=out.split('\n').find(s=>s.startsWith('B35:'));details.push({code,result:line?JSON.parse(line.slice(4)):null,error:code?err:undefined});}
 report('batch35 RR-01',details.every(x=>x.code===0&&x.result?.rows.length&&x.result.rows.every((r:{ok:boolean})=>r.ok)),details);
 const controls=Bun.spawnSync([process.execPath,fileURLToPath(new URL('../../docs/audit/batch35-controls.ts',import.meta.url))],{stdout:'pipe',stderr:'pipe'});report('batch35 RR-02',controls.exitCode===0,{code:controls.exitCode,output:controls.stdout.toString(),error:controls.stderr.toString()});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(import.meta.main){if(['backup','restore'].includes(process.argv[2]))await child(process.argv[2],process.argv[3]);else{let bad=0;await batch35Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)bad++;});process.exitCode=bad?1:0;}}
