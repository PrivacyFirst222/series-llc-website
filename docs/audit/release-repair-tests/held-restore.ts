import {mkdtempSync,readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]||resolve(import.meta.dir,'../../..')),mode=process.argv[3]||'source',base=process.argv[4]||mkdtempSync(join(tmpdir(),'held-restore-'));
const dir=join(base,mode);mkdirSync(dir,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'files'),DEV_MIRROR_DIR:join(dir,'mirror'),DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({test:Buffer.alloc(32,19).toString('base64')}),DOCUMENT_ENCRYPTION_ACTIVE_KEY:'test'});
(globalThis as any).fetch=async()=>{throw Error('Network forbidden');};
const {env}=await import(root+'/webapp/server/env');if(!env.OFFLINE||env.DATABASE_URL||env.DROPBOX_REFRESH_TOKEN||env.SQUARE_ACCESS_TOKEN)throw Error('Isolation missing');console.log('ISOLATION:'+JSON.stringify({dir,offline:true}));
const {getDb}=await import(root+'/webapp/server/db'),{BACKUP_TABLES,runDbBackup}=await import(root+'/webapp/server/backup'),{ensureDeletionMirror,updateRecoveryJournal,readRecoveryJournal}=await import(root+'/webapp/server/backup-deletions');const db=await getDb();
const results:any[]=[];const check=(id:string,ok:boolean,observed:any={})=>{results.push({id,result:ok?'pass':'fail',...(!ok?{failure_code:id}:{}),observed});};
if(mode==='source'){
 await ensureDeletionMirror([]);await db.query("INSERT INTO clients(email,name) VALUES('unrelated@example.test','Unrelated client')");
 const tables:any={};for(const t of BACKUP_TABLES){const [snapshot]=await db.query<any>("SELECT COALESCE(json_agg(x),'[]'::json) AS rows FROM "+t+' x');tables[t]=snapshot.rows;}
 writeFileSync(join(base,'dump.json'),JSON.stringify({version:1,dumpedAt:new Date().toISOString(),fileManifestVersion:1,files:[],tables,packageCheckpoint:[],deletionCheckpoint:[]}));
 const cid=crypto.randomUUID(),oid=crypto.randomUUID(),sid=crypto.randomUUID();
 await db.query("INSERT INTO clients(id,email,name) VALUES($1,'new@example.test','New owner')",[cid]);
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status) VALUES($1,$2,'New owner','new@example.test','NEW','New LLC','{}',0,0,0,'formed')",[oid,cid]);
 await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,llc_name,type,status,amount_cents,details) VALUES($1,$2,$3,'New LLC','s-election','in_progress',9500,'{}')",[sid,cid,oid]);
 const {storeElectionPackage}=await import(root+'/webapp/server/s-election-package-storage');
 const id=await storeElectionPackage(db,{serviceId:sid,clientId:cid,companyId:oid,title:'New package',pdf:Buffer.from('%PDF-1.4\nRetained package\n%%EOF'),details:{ein:'12-3456789',einPending:false,shareholders:[{name:'New owner',ssnLast4:'6789'}]},ssns:['123456789']});
 const record=(await readRecoveryJournal()).packages.find((p:any)=>p.id===id);
 writeFileSync(join(base,'owner.json'),JSON.stringify({client:(await db.query('SELECT * FROM clients WHERE id=$1',[cid]))[0],company:(await db.query('SELECT * FROM orders WHERE id=$1',[oid]))[0],service:(await db.query('SELECT * FROM service_orders WHERE id=$1',[sid]))[0],operator:'Fixture operator',reference:'Original transaction export fixture'}));
 writeFileSync(join(base,'record.json'),JSON.stringify(record));
 for(const child of ['committed','intent','aborted','corrupt']){
  const p=Bun.spawn([process.execPath,import.meta.filename,root,child,base],{stdout:'pipe',stderr:'pipe'});
  const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);writeFileSync(join(base,child+'.log'),out+err);
  const line=out.split('\n').find(l=>l.startsWith('REVIEW_ASSERTIONS:'));if(line)results.push(...JSON.parse(line.slice(18)).assertions);check('P04-'+child+'-process',code===0,{code,log:join(base,child+'.log'),error:err});
 }
}else{
 cpSync(join(base,'source','mirror'),process.env.DEV_MIRROR_DIR!,{recursive:true});
 const record=JSON.parse(readFileSync(join(base,'record.json'),'utf8')),dump=JSON.parse(readFileSync(join(base,'dump.json'),'utf8'));
 if(mode==='intent'||mode==='aborted')await updateRecoveryJournal((j:any)=>{j.packages.find((p:any)=>p.id===record.id).state='intent';});
 if(mode==='corrupt')writeFileSync(join(process.env.DEV_MIRROR_DIR!,record.mirrorPath),'corrupt');
 const {restoreBackup}=await import(root+'/webapp/server/restore');
 if(mode==='corrupt'){
  let rejected=false;try{await restoreBackup(db,dump,{holdUnresolved:true});}catch(e){rejected=String(e).includes('could not verify');}
  check('P04-corrupt-held-copy-refused',rejected&&(await db.query('SELECT id FROM clients')).length===0);
 }else{
  const restored=await restoreBackup(db,dump,{holdUnresolved:true});
  const {recoveryDetails}=await import(root+'/webapp/server/s-election-recovery');check('P04-'+mode+'-held-not-asked-for-SSNs',recoveryDetails({id:'fixture',client_id:'fixture',llc_name:'Fixture',type:'s-election',status:'in_progress',details:{recoveryHold:true,shareholders:[{ssnLast4:'1234'}]}})===null);
  const [cutoff]=await db.query<any>("SELECT first_notice_cutoff=$1::timestamptz AS preserved FROM launch_policy WHERE id='initial-launch'",[dump.tables.launch_policy[0].first_notice_cutoff]);check('P07-'+mode+'-original-cutoff-restored',cutoff.preserved);
  check('P04-'+mode+'-unrelated-restored',restored.heldPackages===1&&restored.activationBlocked&&(await db.query("SELECT id FROM clients WHERE email='unrelated@example.test'")).length===1,restored);
  const {app}=await import(root+'/webapp/server/app');check('P04-'+mode+'-activation-blocked',(await app.request('/api/portal/companies')).status===503);
  const {heldPackageManifest,acknowledgeHeldPackages,restoreHeldOwnerRecords,reconcileHeldPackage}=await import(root+'/webapp/server/recovery-holds');
  let refused=false;try{await acknowledgeHeldPackages(db,'wrong','Fixture operator');}catch{refused=true;}check('P04-'+mode+'-wrong-manifest-refused',refused);
  const manifest=await heldPackageManifest(db);await acknowledgeHeldPackages(db,manifest.sha256,'Fixture operator');check('P04-'+mode+'-explicit-acknowledgment',(await app.request('/api/portal/companies')).status===401);
  const evidence={documentId:record.id,serviceId:record.serviceId,clientId:record.clientId,companyId:record.companyId,sha:record.sha,decision:mode==='aborted'?'aborted-before-commit':'committed',authority:'database-transaction',reference:'Independent transaction export fixture',operator:'Fixture operator'};
  if(mode==='aborted'){
   await reconcileHeldPackage(db,record.id,evidence);const {cleanupAbortedPackages}=await import(root+'/webapp/server/package-recovery');await cleanupAbortedPackages();
   const {readMirror}=await import(root+'/webapp/server/dropbox');check('P04-aborted-copy-cleaned',!(await readMirror(record.mirrorPath))&&(await heldPackageManifest(db)).packages.length===0);
  }else{
   const owner=JSON.parse(readFileSync(join(base,'owner.json'),'utf8'));refused=false;try{await restoreHeldOwnerRecords(db,record.id,{...owner,client:{...owner.client,id:crypto.randomUUID()}});}catch{refused=true;}
   check('P04-'+mode+'-wrong-owner-refused',refused&&(await db.query('SELECT id FROM clients')).length===1);
   await restoreHeldOwnerRecords(db,record.id,owner);await reconcileHeldPackage(db,record.id,evidence);
   const [service]=await db.query<any>('SELECT details,ein_secret FROM service_orders WHERE id=$1',[record.serviceId]);const {readFileStream,readObject}=await import(root+'/webapp/server/storage');
   check('P04-'+mode+'-ownership-reconciled',service.details.documentId===record.id&&(await readFileStream(record.storageKey)).toString().includes('Retained package')&&(await heldPackageManifest(db)).packages.length===0);
   check('P05-'+mode+'-metadata-retained',service.details.ein==='12-3456789'&&service.details.shareholders[0].ssnLast4==='6789'&&service.ein_secret===null,service.details);
   const {requestDocumentDeletion}=await import(root+'/webapp/server/document-retention');await requestDocumentDeletion(record.id,record.clientId);const {readMirror}=await import(root+'/webapp/server/dropbox');
   check('P04-'+mode+'-client-deletion-preserved',!(await readObject(record.storageKey))&&!(await readMirror(record.mirrorPath)));
  }
  check('P06-'+mode+'-backup-completes',(await runDbBackup()).complete);
 }
}
console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions:results}));process.exitCode=results.every(r=>r.result==='pass')?0:1;
