/** Every mode runs in a new disposable DB with all providers refused. */
import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
const dir=process.env.B41_DIR!,mode=process.argv[2];
const results:{group:string;name:string;ok:boolean;detail?:unknown}[]=[];
const check=(name:string,ok:boolean,detail?:unknown)=>results.push({group:name.startsWith('filing')?'B1':'B2',name,ok,detail});
globalThis.fetch=(async()=>{throw Error('External provider request forbidden')}) as unknown as typeof fetch;
const {app}=await import('./app'),{getDb}=await import('./db');
const proof=await(await app.request('/api/dev/env-summary')).json();
if(proof.data?.offline!==true||['database','square','blob','resend','dropbox','smarty','sunbiz'].some(k=>proof.data.externals?.[k]!==false))throw Error('Complete isolation proof required');
console.log('ISOLATION:'+JSON.stringify({proof,db:process.env.DEV_PG_DIR,storage:process.env.DEV_STORAGE_DIR,mirror:process.env.DEV_MIRROR_DIR}));
const db=await getDb(),q=db.query.bind(db);
const {putFile,readObject,readFileStream,putObject,removeStoredFile}=await import('./storage');
const {runDbBackup,BACKUP_TABLES}=await import('./backup');
const {restoreBackup}=await import('./restore');
const {runFileMirror,hashBytes,readMirror,mirrorFile}=await import('./dropbox');
const {storeElectionPackage,cleanupStagedDocuments}=await import('./s-election-package-storage');
const {requestDocumentDeletion,retryDocumentDeletions}=await import('./document-retention');
const journalModule=await import('./backup-deletions'),{JOURNAL_PATH}=journalModule;
// A before-fix tree has only deletion records. The new expectations below must
// fail for its absent package history; no current behavior is skipped.
const readRecoveryJournal=journalModule.readRecoveryJournal??(async()=>({version:1 as const,records:await journalModule.readDeletionMirror(),packages:[] as import('./package-recovery').PackageRecord[]}));
const {newToken}=await import('./crypto');
const pdf=(s:string)=>Buffer.from('%PDF-1.4\n% SYNTHETIC '+s+'\n%%EOF\n');
const ab=(b:Buffer)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
const snapshot=async(name:string)=>{const b=await runDbBackup();if(!b.complete)throw Error('Fixture backup incomplete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+b.key))!).toString());writeFileSync(join(dir,name+'.json'),JSON.stringify(dump));return dump;};
const point=(name:string)=>{mkdirSync(join(dir,name),{recursive:true});cpSync(process.env.DEV_MIRROR_DIR!,join(dir,name,'mirror'),{recursive:true});};
const jfile=()=>join(process.env.DEV_MIRROR_DIR!,JOURNAL_PATH);
if(mode==='source'){
 const cid=crypto.randomUUID();await q("INSERT INTO clients(id,email,name) VALUES($1,'recovery@example.test','Recovery Owner')",[cid]);
 const companies:Record<string,string>={},services:Record<string,string>={},prior:Record<string,string>={},latest:Record<string,string>={};
 for(const name of ['Plain','Live','Deleted']){
  const co=crypto.randomUUID(),sid=crypto.randomUUID();companies[name]=co;services[name]=sid;
  await q("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,formed_at,paid_at) VALUES($1,$2,'Recovery Owner','recovery@example.test','NEW',$3,$4,0,0,0,'formed',now(),now())",[co,cid,name+' LLC',JSON.stringify({filingPath:'NEW',llcName:{finalName:name+' LLC'},registeredAgent:{choice:'SELF'},management:{structure:'MEMBER_MANAGED'},members:{memberList:[{firstName:'Recovery',lastName:'Owner',address1:'Synthetic Street',city:'Orlando',state:'FL',zip:'32801'}]},series:[]})]);
  const b=pdf(name+' old'),f=await putFile(name+'.pdf',ab(b),'application/pdf',true),id=crypto.randomUUID();prior[name]=id;
  await q("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta) VALUES($1,$2,$3,'package',$4,$5,'application/pdf',$6,'{\"sensitive\":true}')",[id,cid,co,name+' old',f.storageKey,b.length]);
  await q("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,fulfilled_at) VALUES($1,$2,$3,'s-election','fulfilled',$4,9500,$5,now())",[sid,cid,co,name+' LLC',JSON.stringify({documentId:id,shareholders:[{name:'Owner',address:'Synthetic Street',percentage:100,ssnLast4:'1111'}]})]);
 }
 const filing:Record<string,{id:string;key:string;bytes:string;legacy:string}>={};
 for(const kind of ['articles','psd']){
  const b=pdf(kind+' v1'),f=await putFile(kind+'.pdf',ab(b),'application/pdf'),id=crypto.randomUUID();
  await q("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$4,$5,'application/pdf',$6)",[id,cid,companies.Plain,kind,f.storageKey,b.length]);
  const legacy='/Plain LLC/'+id.slice(0,8)+'-'+kind+'.pdf';await mirrorFile({storageKey:f.storageKey,path:legacy});filing[kind]={id,key:f.storageKey,bytes:b.toString(),legacy};
 }
 await runFileMirror();const b1=await snapshot('b1'),legacy=structuredClone(b1);
 for(const f of legacy.files){const old=Object.values(filing).find(x=>x.key===f.storageKey);if(old)f.path=old.legacy;}writeFileSync(join(dir,'legacy.json'),JSON.stringify(legacy));
 await putObject('backup-jobs/current.json',Buffer.from(JSON.stringify({key:'unfinished-old.json.gz',dump:legacy,done:{},errors:{}})),true);
 const admin=newToken();await q("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
 for(const kind of ['articles','psd']){const form=new FormData();form.set('file',new File([pdf(kind+' v2')],kind+'.pdf',{type:'application/pdf'}));const r=await app.request('/api/admin/documents/'+filing[kind].id+'/replace',{method:'POST',headers:{Cookie:'fpsllc_admin='+admin.token},body:form});check('filing '+kind+' replacement route succeeds',r.status===200,{status:r.status,body:await r.json()});check('filing '+kind+' prior legacy bytes preserved',(await readMirror(filing[kind].legacy))?.toString()===filing[kind].bytes);}
 const resumed=await runDbBackup({resumeOnly:true});check('filing obsolete unfinished snapshot starts fresh',resumed.complete&&resumed.key!=='unfinished-old.json.gz',resumed);
 // Keep later independent package scenarios runnable on the failing baseline.
 // This removes only this fixture's unfinished job after recording the failure.
 if(!resumed.complete)await removeStoredFile('dev:backup-jobs/current.json');
 const details={officerName:'Owner',phone:'4075550100',ein:'DO-NOT-JOURNAL-EIN',ein_secret:'DO-NOT-JOURNAL-SECRET',ssns:['DO-NOT-JOURNAL-SSN'],shareholders:[{name:'Owner',address:'Synthetic Street',percentage:100,ssn:'DO-NOT-JOURNAL-SSN',ssnLast4:'1111'}]};
 const args=(name:string,previous:string)=>({serviceId:services[name],clientId:cid,companyId:companies[name],title:name+' replacement',pdf:pdf(name+' latest'),details,ssns:['SYNTHETIC-TRANSIENT-NUMBER'],priorDocumentId:previous});
 await q("CREATE OR REPLACE FUNCTION b41_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected write failure'; END $$");await q('CREATE TRIGGER b41_stage BEFORE UPDATE ON staged_documents FOR EACH ROW EXECUTE FUNCTION b41_reject()');
 let failed=false;try{await storeElectionPackage(db,args('Live',prior.Live));}catch{failed=true;}
 await q('DROP TRIGGER b41_stage ON staged_documents');await q('DROP FUNCTION b41_reject()');point('pending-point');check('package interrupted commit has independent intent',failed&&(await readRecoveryJournal()).packages.some(p=>p.state==='intent'));
 await q("UPDATE staged_documents SET created_at=now()-interval '20 minutes' WHERE state='staged'");await cleanupStagedDocuments();
 for(const name of ['Plain','Live','Deleted'])latest[name]=await storeElectionPackage(db,args(name,prior[name]));
 latest.Plain=await storeElectionPackage(db,args('Plain',latest.Plain));
 check('package repeated replacement commits linked successors',(await readRecoveryJournal()).packages.filter(p=>p.serviceId===services.Plain&&p.state==='committed').length===2);
 const j=await readRecoveryJournal();check('package independent metadata excludes full questionnaire secrets',!JSON.stringify(j).includes('DO-NOT-JOURNAL')&&!JSON.stringify(j).includes('SYNTHETIC-TRANSIENT-NUMBER'));
 check('package supersession does not label client deletion',!(await q<{details:Record<string,unknown>}>('SELECT details FROM service_orders WHERE id=$1',[services.Plain]))[0].details.documentDeletedAt);
 const [stage]=await q<{storage_path:string}>("SELECT storage_path FROM staged_documents WHERE state='cleanup' LIMIT 1");if(stage){await putObject(stage.storage_path.replace(/^dev:/,''),pdf('late upload'),true);await cleanupStagedDocuments();check('package delayed abandoned upload removed again',!(await readObject(stage.storage_path)));}

 // A database response is lost after the transaction commits. The real catch
 // and cleanup path must finalize external recovery, not delete the new file.
 const realQuery=db.query.bind(db);let loseCommit=true;
 db.query=(async(text:string,params?:unknown[])=>{const rows=await realQuery(text,params);if(loseCommit&&(text.startsWith('WITH owner AS')||text.startsWith('WITH fence AS'))){loseCommit=false;throw Error('Injected lost committed response');}return rows;}) as typeof db.query;
 let responseLost=false;try{await storeElectionPackage(db,args('Live',latest.Live));}catch{responseLost=true;}finally{db.query=realQuery;}
 const [liveAfterLoss]=await q<{details:{documentId:string}}>('SELECT details FROM service_orders WHERE id=$1',[services.Live]);latest.Live=liveAfterLoss.details.documentId;
 check('package lost committed response remains recoverable',responseLost&&(await readRecoveryJournal()).packages.some(p=>p.id===latest.Live&&p.state==='committed'));
 await runFileMirror();await snapshot('b2');point('retained-point');
 const [deletedDoc]=await q<{storage_key:string;mirror_path:string}>('SELECT storage_key,mirror_path FROM documents WHERE id=$1',[latest.Deleted]);await requestDocumentDeletion(latest.Deleted,cid);point('deleted-point');check('package client deletion removes current primary and mirror',!(await readObject(deletedDoc.storage_key))&&!(await readMirror(deletedDoc.mirror_path)));
 await putObject(deletedDoc.storage_key.replace(/^dev:/,''),pdf('delayed deleted upload'),true);await retryDocumentDeletions();check('package deleted copy remains eligible for delayed-upload cleanup',!(await readObject(deletedDoc.storage_key)));
 const attempts=await Promise.allSettled([storeElectionPackage(db,args('Plain',latest.Plain)),storeElectionPackage(db,args('Plain',latest.Plain))]);check('package concurrent replacement has one winner',attempts.filter(x=>x.status==='fulfilled').length===1,{states:attempts.map(x=>x.status)});

 // Pause a replacement after its intent/upload, delete the old document, then
 // release the DB promotion. The atomic journal decision must beat promotion.
 const [currentPlain]=await q<{details:{documentId:string}}>('SELECT details FROM service_orders WHERE id=$1',[services.Plain]);
 let entered!:()=>void,release!:()=>void;const atCommit=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
 db.query=(async(text:string,params?:unknown[])=>{if((text.startsWith('WITH owner AS')||text.startsWith('WITH fence AS'))){entered();await gate;}return realQuery(text,params);}) as typeof db.query;
 const racing=storeElectionPackage(db,args('Plain',currentPlain.details.documentId)).then(()=>true,()=>false);await atCommit;
 await requestDocumentDeletion(currentPlain.details.documentId,cid);release();const won=await racing;db.query=realQuery;
 const active=await q('SELECT id FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[companies.Plain]);
 check('package client deletion beats concurrent prepared successor',!won&&active.length===2,{replacementSucceeded:won,active}); // two non-sensitive filing documents remain
 writeFileSync(join(dir,'ids.json'),JSON.stringify({cid,companies,services,prior,latest,filing}));
}else{
 const ids=JSON.parse(readFileSync(join(dir,'ids.json'),'utf8')),p=mode==='deleted'?'deleted-point':mode==='pending'?'pending-point':'retained-point';
 mkdirSync(process.env.DEV_MIRROR_DIR!,{recursive:true});cpSync(join(dir,p,'mirror'),process.env.DEV_MIRROR_DIR!,{recursive:true});
 const dump=JSON.parse(readFileSync(join(dir,mode==='second'?'b2.json':mode==='restore'?'legacy.json':'b1.json'),'utf8'));
 if(mode==='corrupt'){const j=await readRecoveryJournal(),r=j.packages.find(p=>p.id===ids.latest.Plain)!;writeFileSync(join(process.env.DEV_MIRROR_DIR!,r.mirrorPath),'invalid ciphertext');}
 else if(mode==='checkpoint'){dump.packageCheckpoint=[ids.latest.Plain];const j=JSON.parse(readFileSync(jfile(),'utf8'));j.packages=j.packages.filter((p:{id:string})=>p.id!==ids.latest.Plain);j.sha=hashBytes(Buffer.from(JSON.stringify({version:j.version,records:j.records,packages:j.packages,...(j.firstNoticeCutoff?{firstNoticeCutoff:j.firstNoticeCutoff}:{}),...(j.version===4?{copies:j.copies}:{})})));writeFileSync(jfile(),JSON.stringify(j));}
 let error='';try{await restoreBackup(db,dump);}catch(e){error=String(e);}
 if(['corrupt','pending','checkpoint'].includes(mode)){
  const counts=await Promise.all(BACKUP_TABLES.filter(t=>t!=='launch_policy').map(async t=>Number((await q<{n:string}>('SELECT count(*) AS n FROM '+t))[0].n)));
  check('package '+mode+' evidence refuses before rows',!!error&&counts.every(n=>n===0),{error,counts});check('package '+mode+' refusal precedes primary-storage writes',!existsSync(process.env.DEV_STORAGE_DIR!));check('package '+mode+' refusal is actionable',mode==='checkpoint'?error.includes('missing a recorded package'):mode==='pending'?error.includes('interrupted package operation'):error.includes('Recovery could not verify the current S-election package'),error);
 }else{
  check('package '+mode+' restore succeeds',!error,error);
  if(!error){await cleanupStagedDocuments();
   for(const name of ['Plain','Live','Deleted']){
    const [service]=await q<{details:Record<string,unknown>;ein_secret:string|null;status:string}>('SELECT details,ein_secret,status FROM service_orders WHERE id=$1',[ids.services[name]]),[doc]=await q<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1 AND deleted_at IS NULL',[ids.latest[name]]);
    if(name==='Deleted'&&mode==='deleted')check('package later deletion defeats old snapshot',!doc&&!!service.details.documentDeletedAt&&service.ein_secret===null);
    else check('package '+mode+' '+name+' latest retained package is usable',!!doc&&service.details.documentId===ids.latest[name]&&!service.details.documentDeletedAt&&service.ein_secret===null&&(await readFileStream(doc.storage_key)).toString()===pdf(name+' latest').toString(),{service,doc});
   }
   for(const kind of ['articles','psd']){const [doc]=await q<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1',[ids.filing[kind].id]);check('filing '+mode+' '+kind+' snapshot version restored',(await readFileStream(doc.storage_key)).toString()===pdf(kind+(mode==='second'?' v2':' v1')).toString());}
   const id=ids.latest.Plain;await requestDocumentDeletion(id,ids.cid);const [d]=await q<{storage_key:string;mirror_path:string}>('SELECT storage_key,mirror_path FROM documents WHERE id=$1',[id]);check('package client can delete recovered successor',!!d&&!(await readObject(d.storage_key))&&!(await readMirror(d.mirror_path)));
   const again=await runDbBackup();check('package recovered system makes complete new backup',again.complete);
  }
 }
}
console.log('B41RECOVERY:'+JSON.stringify({proof,results}));process.exit(results.every(r=>r.ok)?0:1);
