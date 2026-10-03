import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {gunzipSync} from 'node:zlib';
const root=resolve(process.argv[2]||resolve(import.meta.dir,'../../..')),dir=mkdtempSync(join(tmpdir(),'recovery-maintenance-'));
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'files'),DEV_MIRROR_DIR:join(dir,'mirror')});
const {env}=await import(root+'/webapp/server/env');if(!env.OFFLINE||env.DATABASE_URL||env.DROPBOX_REFRESH_TOKEN)throw Error('Offline isolation missing');console.log('ISOLATION:'+JSON.stringify({dir,offline:true}));
const {getDb}=await import(root+'/webapp/server/db'),{putObject,readObject,removeStoredFile}=await import(root+'/webapp/server/storage'),{runDbBackup}=await import(root+'/webapp/server/backup'),{updateRecoveryJournal}=await import(root+'/webapp/server/backup-deletions'),{cleanupAbortedPackages}=await import(root+'/webapp/server/package-recovery');
const db=await getDb(),assertions:any[]=[];const check=(id:string,ok:boolean,observed:any={})=>assertions.push({id,result:ok?'pass':'fail',...(!ok?{failure_code:id}:{}),observed});
const cid=crypto.randomUUID(),did=crypto.randomUUID();await db.query("INSERT INTO clients(id,email,name) VALUES($1,'maintenance@example.test','Maintenance')",[cid]);
await putObject('ordinary.pdf',Buffer.from('Ordinary original'));await putObject('library-original.pdf',Buffer.from('Library original'));
await db.query("INSERT INTO documents(id,client_id,kind,title,storage_key) VALUES($1,$2,'notes','Ordinary','dev:ordinary.pdf')",[did,cid]);
await db.query("INSERT INTO library_documents(key,title,storage_key) VALUES('fixture','Library','dev:library-original.pdf')");
const checkpoint=async(key:string)=>{const done=await runDbBackup();if(!done.complete)throw Error('Setup backup did not complete');const dump=JSON.parse(gunzipSync((await readObject('backups/'+done.key))!).toString());await putObject('backup-jobs/current.json',Buffer.from(JSON.stringify({key,dump,done:{},errors:{}})),true);};
await checkpoint('ordinary-unfinished.json.gz');await db.query('DELETE FROM documents WHERE id=$1',[did]);await removeStoredFile('dev:ordinary.pdf');const first=await runDbBackup({resumeOnly:true});check('P06-deleted-ordinary-file-restarts-backup',first.complete&&first.key!=='ordinary-unfinished.json.gz',first);
await checkpoint('library-unfinished.json.gz');await putObject('library-current.pdf',Buffer.from('Library current'));await db.query("UPDATE library_documents SET storage_key='dev:library-current.pdf' WHERE key='fixture'");await removeStoredFile('dev:library-original.pdf');const second=await runDbBackup({resumeOnly:true});check('P06-replaced-library-file-restarts-backup',second.complete&&second.key!=='library-unfinished.json.gz',second);
const packages=[];for(let n=0;n<65;n++){
 const id=crypto.randomUUID(),storageKey='dev:aborted/'+id;await putObject('aborted/'+id,Buffer.from('late upload'));
 packages.push({id,serviceId:crypto.randomUUID(),clientId:cid,companyId:null,company:'Maintenance',priorDocumentId:null,storagePath:storageKey,storageKey,mirrorPath:'/aborted/'+id,title:'Aborted fixture',sha:'fixture-sha',size:11,createdAt:'2020-01-01T00:00:00Z',fulfilledAt:'2020-01-01T00:00:00Z',details:{},metadataVersion:2,state:'aborted'});
}
await updateRecoveryJournal((j:any)=>j.packages.push(...packages));await cleanupAbortedPackages(undefined,7);let remaining=0;for(const p of packages)if(await readObject(p.storageKey))remaining++;
check('P06-cleanup-invocation-bounded',remaining===58,{remaining,total:65,limit:7});for(let n=0;n<10;n++)await cleanupAbortedPackages(undefined,7);
remaining=0;for(const p of packages)if(await readObject(p.storageKey))remaining++;check('P06-cleanup-cursor-eventually-visits-all',remaining===0,{remaining});
const old=packages.sort((a,b)=>a.id.localeCompare(b.id))[0];await putObject(old.storageKey.replace('dev:',''),Buffer.from('much later upload'));for(let n=0;n<10;n++)await cleanupAbortedPackages(undefined,7);
check('P06-no-age-cutoff-for-delayed-upload',!(await readObject(old.storageKey)));
console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions}));process.exitCode=assertions.every(r=>r.result==='pass')?0:1;
