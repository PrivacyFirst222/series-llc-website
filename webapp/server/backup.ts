import {withDeadline,activeDeadline,checkDeadline} from './operation-deadline';
import {observeBackupProblem,resolveBackupProblem,deliverBackupAttention} from './backup-attention';
import {officeFileIdentities,recoveryTuple,OfficeRecoveryError} from './office-recovery-sources';
import {ensureOfficeRecoveryCopy,ensureOfficeMirrorCopy,verifiedOfficeBytes} from './office-file-recovery';
import {historyId,historyGapFor,inspectHistoryOriginal,restoreHistoricalOriginal,validateHistoryGap,type HistoryGap} from './office-history-recovery';
import { ensureDeletionMirror, readDeletionMirror, readRecoveryJournal } from './backup-deletions';
import { deletionJournal } from './document-retention';
import { isEncrypted, unseal } from "./encryption";
import { gzipSync } from "node:zlib";
import { env } from "./env";
import { getDb } from "./db";
import { putObject, readObject, storageWasDeleted, readStoredFile } from "./storage";
import { mirrorFile, documentMirrorPath, hashBytes, readMirror, type BackupFile } from "./dropbox";

/**
 * Nightly logical backup of the tables that cannot be rebuilt from anywhere
 * else, stored as gzipped JSON in PRIVATE Vercel Blob storage (a different
 * company than the database, so a Neon-side disaster does not take the copy
 * with it). Deliberately excluded:
 *   - fl_entities        — 4.7M rows, fully reloadable from the state's files
 *   - sessions           — ephemeral sign-ins; a restore should not revive them
 *   - auth_tokens        — one-time secrets; same
 * Full taxpayer numbers in service_orders are excluded, even as ciphertext.
 * rate_limits and schema_migrations are recreated, not restored. Retained
 * tax PDFs are backed up as authenticated ciphertext; keys are kept separately.
 * Restore: scripts/db-restore.ts (see docs/db-restore.md).
 */
export const BACKUP_TABLES = [
  "clients",
  "orders",
  "service_orders",
  "documents",
  "oa_profiles",
  "oa_generations",
  "library_documents",
  "webhook_events",
  "fl_sync_state",
  "contact_messages",
  "email_log",
  "ra_renewals",
  "ra_payment_attempts",
  "document_deletions",
  "staged_documents",
  "renewal_card_attempts",
  "launch_policy",
  "payment_reconciliation_log",
  "recovery_holds",
  "checkout_payment_receipts",
  "payment_alerts",
  "office_operations",
] as const;
/** Introduced after the original sixteen-table backup format. */
export const OPTIONAL_BACKUP_TABLES = new Set<string>(['launch_policy','payment_reconciliation_log','recovery_holds','checkout_payment_receipts','payment_alerts','office_operations']);

const PREFIX = "backups/";

export interface BackupInfo {
  key: string;
  storageKey: string;
  sizeBytes: number;
  uploadedAt: string;
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { list } = await import("@vercel/blob");
    // Paginate to completion: backups are kept forever (Adam's ruling), and a
    // single page holds 1,000 — the old limit:100 with no cursor meant the
    // admin panel and its download route could see at most 100 backups ever,
    // silently orphaning the rest (Codex BAK-002).
    const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix: PREFIX, limit: 1000, cursor });
      blobs.push(...res.blobs);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return blobs
      .map((b) => ({
        key: b.pathname.slice(PREFIX.length),
        storageKey: b.url,
        sizeBytes: b.size,
        uploadedAt: new Date(b.uploadedAt).toISOString(),
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }
  const { readdir, stat } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = process.env.DEV_STORAGE_DIR ? `${process.env.DEV_STORAGE_DIR}/backups/` : fileURLToPath(new URL("../.dev-data/blob/backups/", import.meta.url));
  try {
    const names = await readdir(dir);
    const out: BackupInfo[] = [];
    for (const n of names) {
      const s = await stat(dir + n);
      out.push({
        key: n,
        storageKey: `dev:backups/${n}`,
        sizeBytes: s.size,
        uploadedAt: s.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => (a.key < b.key ? 1 : -1));
  } catch {
    return [];
  }
}


/** Backups are never pruned — Adam's ruling, 29 Aug 2026: at ~17 KB per
 *  nightly dump, years of them cost pennies, and a deleted backup is the one
 *  you needed. The admin panel shows the newest dump's date so a stall is
 *  visible. */

export interface BackupDump {version:1|2; status?:'complete_with_history_gaps'; restorable?:boolean; historyComplete?:boolean; historyGaps?:HistoryGap[]; dumpedAt:string; tables:Record<string,Record<string,unknown>[]>; files:BackupFile[]; fileManifestVersion:1|2; deletionCheckpoint?:string[]; packageCheckpoint?:string[]}
interface BackupJob {key:string; dump:BackupDump; done:Record<string,string>; errors:Record<string,string>; format?:2; phase?:'copy'|'verify'|'publish'; cursor?:number; verified?:Record<string,string>; nextEligibleAt?:Record<string,number>;publicationSha?:string;deadlineDeferred?:Record<string,'copy'|'verify'>}
const JOB='backup-jobs/current.json';
const backupKey=(iso:string)=>`db-${iso.slice(0,10)}-${iso.slice(11, 19).replace(/:/g, "")}.json.gz`;
const publishOptions = { allowOverwrite: false };
export function backupFiles(tables:BackupDump['tables']):BackupFile[]{
 const orders=new Map((tables.orders||[]).map(o=>[o.id,o]));const clients=new Map((tables.clients||[]).map(c=>[c.id,c]));
 const files:BackupFile[]=[];
 for(const d of tables.documents||[]){if(d.deleted_at&&!(d.meta as Record<string,unknown>)?.officeHistory)continue;const o=orders.get(d.order_id),c=clients.get(d.client_id);
   files.push({storageKey:String(d.storage_key),path:documentMirrorPath({id:String(d.id),title:String(d.title),kind:String(d.kind),storage_key:String(d.storage_key),mirror_path:typeof d.mirror_path==='string'?d.mirror_path:null,llc_name:o && o.client_id===d.client_id?String(o.llc_name):null,email:c?String(c.email):null})});}
 for(const d of tables.library_documents||[])files.push({storageKey:String(d.storage_key),path:`/reference/${encodeURIComponent(String(d.key))}-${encodeURIComponent(String(d.storage_key).split('/').pop()!)}.backup`});
 for(const o of tables.orders||[])if(o.summary_storage_key)files.push({storageKey:String(o.summary_storage_key),path:`/summaries/${o.id}-${encodeURIComponent(String(o.summary_storage_key).split('/').pop()!)}.backup`});
 for(const op of tables.office_operations??[])if(['open','retiring'].includes(String(op.phase)))for(const [slot,file] of Object.entries((op.files??{}) as Record<string,{key:string}>))files.push({storageKey:file.key,path:`/OfficeOperations/${op.id}/${slot}`});
 // Legacy retained operation files still belong in the snapshot. A missing
 // original digest prevents a history waiver; it does not waive the file.
 const identities=officeFileIdentities(tables,{includeUnknown:true});
 for(const i of identities.values())files.push(i.file.sha
  ?{storageKey:i.file.key,path:i.recoveryPath,sha:i.file.sha,officeRecoveryIdentity:recoveryTuple(i)}
  :{storageKey:i.file.key,path:`/OfficeOperations/${i.operationId}/${i.slot}`});
 return [...new Map(files.map(f=>[f.storageKey,f])).values()];
}
export async function backupProgress(){
 const db=await getDb();const [r]=await db.query<{started_at:unknown;completed_at:unknown;error:string|null}>("SELECT started_at,completed_at,error FROM backup_progress WHERE id='database'");
 const terminalRaw=await readObject('backup-jobs/last-result.json');const terminal=terminalRaw?JSON.parse(terminalRaw.toString()):null;
 const raw=await readObject(JOB);const j:BackupJob|null=raw?JSON.parse(raw.toString()):null;
 const frozen=j?officeFileIdentities(j.dump.tables):new Map();
 const capacityBlocked=!!j&&process.env.BACKUP_FILE_CONCURRENCY==='4'&&Date.now()-Date.parse(j.dump.dumpedAt)>=24*3600000;
 return {...(!j&&terminal?.status==='complete_with_history_gaps'?terminal:{}),...(capacityBlocked?{status:'capacity_blocked'}:{}),jobKey:j?.key??null,historyCurrentConflicts:j?j.dump.files.filter(f=>j.errors[f.storageKey]?.startsWith('SNAPSHOT_CURRENT_FILE_MISSING')).map(f=>({historyId:historyId(frozen.get(f.storageKey)!),title:frozen.get(f.storageKey)!.file.title})):[],complete:!j&&!!r?.completed_at&&!r.error&&terminal?.status!=='complete_with_history_gaps',startedAt:r?.started_at||null,completedAt:r?.completed_at||null,pending:j?j.dump.files.filter(f=>!j.verified?.[f.storageKey]).length:0,errors:j?Object.values(j.errors):[],error:r?.error||null};
}
export async function runDbBackup(options:{resumeOnly?:boolean;budgetMs?:number;deadline?:number;workDeadline?:number;dispatchAttention?:boolean}={}):Promise<{key:string;sizeBytes:number;rowCounts:Record<string,number>;provisionalRowCounts?:Record<string,number>;complete:boolean;pending:number;status?:string;restorable?:boolean;historyComplete?:boolean}>{
 const entered=Date.now(),workDeadline=Math.min(options.workDeadline??entered+(options.budgetMs??180000),activeDeadline());
 const checkpointDeadline=Math.min(options.deadline??workDeadline+Math.min(30000,Math.floor((options.budgetMs??180000)/4)),activeDeadline());
 return withDeadline(checkpointDeadline,()=>runBackupWithinDeadline(options,entered,workDeadline,checkpointDeadline));
}
async function runBackupWithinDeadline(options:{resumeOnly?:boolean;budgetMs?:number;deadline?:number;workDeadline?:number;dispatchAttention?:boolean},entered:number,workDeadline:number,checkpointDeadline:number):ReturnType<typeof runDbBackup>{
 const concurrency=process.env.BACKUP_FILE_CONCURRENCY??'1';if(!['1','4'].includes(concurrency))throw Error('BACKUP_FILE_CONCURRENCY must be 1 or 4');
 const db=await getDb();await db.query("INSERT INTO backup_progress(id) VALUES('database') ON CONFLICT DO NOTHING");
 const locked=await db.query<{lease:string}>(`UPDATE backup_progress SET lease_until=now()+interval '10 minutes' WHERE id='database' AND (lease_until IS NULL OR lease_until<now()) RETURNING lease_until::text AS lease`);
 if(!locked.length)return {key:'',sizeBytes:0,rowCounts:{},complete:false,pending:0};
 try{
  const prepared=await withDeadline(Math.min(workDeadline,entered+20000),async()=>{
  await ensureDeletionMirror(await deletionJournal());
  const saved=await readObject(JOB);let job:BackupJob|null=saved?JSON.parse(saved.toString()):null;
  let obsoleteJob=!!job&&BACKUP_TABLES.some(t=>!Array.isArray(job!.dump.tables[t]));
  if(job&&!obsoleteJob){
   // Old unfinished manifests must not write a reused legacy filename. An
   // unfinished snapshot whose filing revision was replaced starts afresh.
   const expected=backupFiles(job.dump.tables);
   obsoleteJob=job.dump.files.some(f=>expected.find(x=>x.storageKey===f.storageKey)?.path!==f.path);
   if(!obsoleteJob){
    const known=officeFileIdentities(job.dump.tables);
    const [current]=await db.query<{documents:{id:string;storage_key:string}[];library:{key:string;storage_key:string}[];orders:{id:string;summary_storage_key:string|null}[]}>(`SELECT (SELECT coalesce(json_agg(d),'[]') FROM (SELECT id,storage_key FROM documents WHERE deleted_at IS NULL) d) AS documents,(SELECT coalesce(json_agg(d),'[]') FROM library_documents d) AS library,(SELECT coalesce(json_agg(o),'[]') FROM (SELECT id,summary_storage_key FROM orders) o) AS orders`);
    obsoleteJob=job.dump.tables.documents.some(d=>!d.deleted_at&&!(job!.format===2&&known.has(String(d.storage_key)))&&!current.documents.some(c=>c.id===d.id&&c.storage_key===d.storage_key))
      ||job.dump.tables.library_documents.some(d=>!current.library.some(c=>c.key===d.key&&c.storage_key===d.storage_key))
      ||job.dump.tables.orders.some(o=>o.summary_storage_key&&!current.orders.some(c=>c.id===o.id&&c.summary_storage_key===o.summary_storage_key));
   }
  }
  // A pre-upgrade checkpoint cannot acquire missing tables from a later moment.
  // Replace only unfinished work with a new, internally consistent snapshot.
  if(obsoleteJob)job=null;
  if(!job&&!obsoleteJob&&options.resumeOnly)return null;
  if(!job){
   // One statement captures a consistent database snapshot. Never include
   // transient encrypted taxpayer numbers in a retained backup.
   const selects=BACKUP_TABLES.map(t=>`'${t}',(SELECT coalesce(json_agg(x),'[]'::json) FROM ${t} x)`).join(',');
   const [snap]=await db.query<{dump:BackupDump['tables']}>(`SELECT json_build_object(${selects}) AS dump`);
   for(const row of snap.dump.service_orders){row.ein_secret=null;}
   const dump:BackupDump={version:1,dumpedAt:new Date().toISOString(),tables:snap.dump,files:[],fileManifestVersion:1};dump.files=backupFiles(dump.tables);
   let key=backupKey(new Date().toISOString());
   // Preserve the established UTC filename format without overwriting a second
   // backup requested in the same second. The database lease serializes jobs.
   while(await readObject(PREFIX+key)){await new Promise(r=>setTimeout(r,100));key=backupKey(new Date().toISOString());}
   job={key,dump,done:{},errors:{},format:2,phase:'copy',cursor:0,verified:{}};
   await putObject(JOB,Buffer.from(JSON.stringify(job)),true);
   await db.query("UPDATE backup_progress SET started_at=now(),completed_at=NULL,error=NULL WHERE id='database'");
  }
  const identities=officeFileIdentities(job.dump.tables);
  const liveTables=(await db.query<{rows:Record<string,unknown>[]}>("SELECT coalesce(json_agg(o),'[]') rows FROM office_operations o"))[0].rows;
  return {job,identities,liveTables};
  });
  if(!prepared){const progress=await backupProgress();return {key:'',sizeBytes:0,rowCounts:{},complete:progress.complete,pending:0,...(progress.status?{status:progress.status,restorable:progress.restorable,historyComplete:progress.historyComplete}:{})};}
  const {job,identities,liveTables}=prepared;
  const gapTables={...job.dump.tables,office_operations:liveTables};
  const deadline=workDeadline;
  job.phase??='copy';job.cursor??=0;job.verified??={};
  // A checkpoint names an expected original, never the bytes observed after damage.
  if(job.format!==2){job.done={};job.verified={};job.cursor=0;job.phase='copy';job.format=2;job.deadlineDeferred={};}
  job.nextEligibleAt??={};job.deadlineDeferred??={};
  const processFile=async(f:BackupFile,phase:'copy'|'verify')=>{
   const i=identities.get(f.storageKey);
   if((job!.nextEligibleAt![f.storageKey]??0)>Date.now()){const error=new OfficeRecoveryError('Provider retry is not eligible yet.','RECOVERY_UNAVAILABLE',503);error.retryAfterMs=job!.nextEligibleAt![f.storageKey]-Date.now();return {f,error};}
   try{return await withDeadline(deadline,async()=>{
    const deleted=(await readRecoveryJournal()).records.some(r=>r.storageKey===f.storageKey);
    if(deleted||await storageWasDeleted(f.storageKey))return {f,value:'deleted'};
    if(i){
     const currentGap=(liveTables.find(o=>o.id===i.operationId)?.payload as {historyRecovery?:Record<string,HistoryGap>}|undefined)?.historyRecovery?.[i.slot];
     if(currentGap?.state==='unrecoverable'&&!i.historical)throw new OfficeRecoveryError('This older snapshot needs the lost file as a current document. Start a new snapshot after reviewing the historical gap.','SNAPSHOT_CURRENT_FILE_MISSING');
     const gap=historyGapFor(i,gapTables);
     if(gap){
      if((await inspectHistoryOriginal(i,job!.dump.tables)).state==='needs_staff_decision'){
       validateHistoryGap(i,gap);return {f,value:'history-gap',gap};
      }
      // A surviving original resolves the live acknowledgment under its normal
      // reservation. It does not rewrite an older published gap snapshot.
      if(phase==='copy')await restoreHistoricalOriginal(db,historyId(i));
     }
     if(phase==='copy'){await ensureOfficeMirrorCopy(i);await ensureOfficeRecoveryCopy(i);}
     const stored=await readMirror(i.recoveryPath);
     if(!verifiedOfficeBytes(i,stored))throw new OfficeRecoveryError('The recovery copy is missing or damaged.','UPLOAD_REQUIRED');
     return {f:{...f,sha:i.file.sha,path:i.recoveryPath,officeRecoveryIdentity:recoveryTuple(i)},value:i.file.sha!};
    }
    if(phase==='copy'){await mirrorFile(f);const raw=await readStoredFile(f.storageKey);f={...f,sha:hashBytes(isEncrypted(raw)?unseal(raw):raw)};}
    const raw=await readMirror(f.path);
    if(!raw||hashBytes(isEncrypted(raw)?unseal(raw):raw)!==f.sha)throw Error('Backup copy failed verification');
    return {f,value:f.sha!};
   });}catch(error){return {f,error,deferred:error instanceof DOMException&&error.name==='TimeoutError'&&['Operation deadline reached','The operation was aborted due to timeout'].includes(error.message)&&Date.now()>=deadline};}
  };
  while(Date.now()<deadline&&job.phase!=='publish'){
   const phase=job.phase;
   const batch=job.dump.files.slice(job.cursor,job.cursor+Number(concurrency));
   if(!batch.length){
    if(phase==='copy'){job.phase='verify';job.cursor=0;}
    else if(job.dump.files.some(f=>job!.errors[f.storageKey])){job.phase='copy';job.cursor=0;break;}
    else job.phase='publish';
    continue;
   }
   // Workers return settled file outcomes. Only this parent changes the job
   // checkpoint; no worker can overwrite another worker's saved progress.
   // A failed verification returns only that file to copy. Recopying every
   // successful predecessor can repeatedly exhaust the deadline before the
   // failed tail is reached. These skips never bypass the verify phase.
   let retryCursor:number|undefined;const outcomes=await Promise.all(batch.map(f=>(phase==='verify'&&job!.errors[f.storageKey]&&job!.deadlineDeferred?.[f.storageKey]!==phase)
    ||(phase==='copy'&&job!.done[f.storageKey]&&!job!.errors[f.storageKey])
    ?Promise.resolve({f,skipped:true as const}):processFile(f,phase)));
   for(const outcome of outcomes){
    const f=outcome.f,i=identities.get(f.storageKey);
    if('skipped' in outcome){job.cursor++;continue;}
    if('error' in outcome){
     if(outcome.deferred){job.deadlineDeferred[f.storageKey]=phase;retryCursor??=job.cursor;}else delete job.deadlineDeferred[f.storageKey];const e=outcome.error;job.errors[f.storageKey]=e instanceof OfficeRecoveryError?e.code+': '+e.message:String(e);delete job.done[f.storageKey];delete job.verified[f.storageKey];
     const retryAfter=(e as {retryAfterMs?:number})?.retryAfterMs;if(retryAfter)job.nextEligibleAt[f.storageKey]=Date.now()+retryAfter;
     if(Date.now()<deadline&&!(e instanceof OfficeRecoveryError&&e.status===503)&&!(e instanceof DOMException&&e.name==='TimeoutError')){
      try{await withDeadline(deadline,()=>observeBackupProblem(i?historyId(i):hashBytes(Buffer.from(f.storageKey)),i?.historical?'needs_staff_decision':'required_file_unavailable'));delete job.errors['notification:'+f.storageKey];}
      catch(alertError){job.errors['notification:'+f.storageKey]='Backup alert persistence failed: '+String(alertError);}
     }
    }else{
     delete job.deadlineDeferred[f.storageKey];job.done[f.storageKey]=outcome.value;
     if(phase==='verify'||['deleted','history-gap'].includes(outcome.value))job.verified[f.storageKey]=outcome.value;
     job.dump.files[job.cursor]=f;
     job.dump.historyGaps=(job.dump.historyGaps??[]).filter(g=>g.storageKey!==f.storageKey);
     if('gap' in outcome&&outcome.gap)job.dump.historyGaps.push(outcome.gap);
     delete job.errors[f.storageKey];delete job.errors['notification:'+f.storageKey];delete job.nextEligibleAt[f.storageKey];
     if(Date.now()<deadline)await withDeadline(deadline,()=>resolveBackupProblem(i?historyId(i):hashBytes(Buffer.from(f.storageKey))));
    }
    job.cursor++;
   }
   if(retryCursor!==undefined)job.cursor=retryCursor;
   await withDeadline(checkpointDeadline,()=>putObject(JOB,Buffer.from(JSON.stringify(job)),true));
  }
  const pending=job.dump.files.filter(f=>!job!.verified![f.storageKey]).length;
  let rowCounts=Object.fromEntries(BACKUP_TABLES.map(t=>[t,job!.dump.tables[t].length]));
  if(job.phase!=='publish'||pending){
   await withDeadline(checkpointDeadline,async()=>{
    if(Date.now()-Date.parse(job!.dump.dumpedAt)>=24*3600000)await observeBackupProblem('backup:'+job!.key,'backup_stalled_24_hours');
    await putObject(JOB,Buffer.from(JSON.stringify(job)),true);
    if(options.dispatchAttention!==false&&checkpointDeadline-Date.now()>11000)await deliverBackupAttention({deadline:checkpointDeadline-10000});
    await db.query("UPDATE backup_progress SET error=$1 WHERE id='database'",[`${pending} file(s) pending; automatic continuation scheduled${Object.entries(job!.errors).filter(([key])=>key.startsWith('notification:')).map(([,error])=>' · '+error).join('')}`]);
   });
   return {key:job.key,sizeBytes:0,rowCounts:{},provisionalRowCounts:rowCounts,complete:false,pending,...(Date.now()-Date.parse(job.dump.dumpedAt)>=24*3600000&&concurrency==='4'?{status:'capacity_blocked'}:{})};
  }
  checkDeadline(checkpointDeadline);
  // Freeze publication before upload. A lost upload acknowledgment must retry
  // those exact bytes, even if a later deletion changes the external journal.
  // Restore independently applies that later deletion to the frozen snapshot.
  if(!job.publicationSha){
  // Deletions may arrive after a file was verified. Omit them from the final
  // manifest and rows; a later deletion is additionally enforced on restore.
  const deleted=new Set((await readRecoveryJournal()).records.map(r=>r.storageKey));
  for(const f of job.dump.files)if(await storageWasDeleted(f.storageKey))deleted.add(f.storageKey);
  job.dump.files=job.dump.files.filter(f=>!deleted.has(f.storageKey)&&!job!.dump.historyGaps?.some(g=>g.storageKey===f.storageKey));
  job.dump.historyGaps=(job.dump.historyGaps??[]).filter(g=>!deleted.has(g.storageKey));
  if(job.dump.historyGaps.length){job.dump.version=2;job.dump.fileManifestVersion=2;job.dump.status='complete_with_history_gaps';job.dump.restorable=true;job.dump.historyComplete=false;}
  job.dump.tables.documents=job.dump.tables.documents.filter(d=>(!d.deleted_at||(d.meta as Record<string,unknown>)?.officeHistory)&&!deleted.has(String(d.storage_key)));
  job.dump.deletionCheckpoint=(await readDeletionMirror()).map(r=>r.storageKey);
  job.dump.packageCheckpoint=(await readRecoveryJournal()).packages.map(r=>r.id);
  job.publicationSha=hashBytes(Buffer.from(JSON.stringify(job.dump)));
  await putObject(JOB,Buffer.from(JSON.stringify(job)),true);
  }
  if(job.publicationSha!==hashBytes(Buffer.from(JSON.stringify(job.dump))))throw Error('Backup publication checkpoint is inconsistent');
  rowCounts=Object.fromEntries(BACKUP_TABLES.map(t=>[t,job!.dump.tables[t].length]));
  const data=gzipSync(Buffer.from(JSON.stringify(job.dump)));
  const existing=await readObject(PREFIX+job.key);
  if(existing&&!existing.equals(data))throw new Error('Refusing to overwrite a different completed backup');
  if(!existing)await putObject(PREFIX+job.key,data,publishOptions.allowOverwrite);
  await putObject('backup-jobs/last-result.json',Buffer.from(JSON.stringify({key:job.key,status:job.dump.status??'complete',restorable:true,historyComplete:!job.dump.historyGaps?.length,historyGaps:job.dump.historyGaps??[]})),true);
  await db.query("UPDATE backup_progress SET completed_at=now(),error=NULL WHERE id='database'");
  const {removeStoredFile}=await import('./storage');await removeStoredFile(env.BLOB_READ_WRITE_TOKEN?JOB:`dev:${JOB}`);
  await resolveBackupProblem('backup:'+job.key);
  return {key:job.key,sizeBytes:data.length,rowCounts,complete:!job.dump.historyGaps?.length,pending:0,status:job.dump.status??'complete',restorable:true,historyComplete:!job.dump.historyGaps?.length};
 }catch(e){await db.query("UPDATE backup_progress SET error=$1,completed_at=NULL WHERE id='database'",[String(e)]);throw e;}
 finally{await db.query("UPDATE backup_progress SET lease_until=NULL WHERE id='database' AND lease_until=$1::timestamptz",[locked[0].lease]);}
}

/** An explicit restart captures one new moment once. Retrying the same request
 * reuses that saved successor even after a lost response or process crash. */
export async function restartBackupAfterHistoryChange(expectedJobKey:string,id:string){
 if(!/^db-\d{4}-\d{2}-\d{2}-\d{6}\.json\.gz$/.test(expectedJobKey)||!/^[a-f0-9]{64}$/.test(id))throw new OfficeRecoveryError('The backup selection changed.','BACKUP_CHANGED');
 const db=await getDb();
 const [locked]=await db.query<{lease:string}>("UPDATE backup_progress SET lease_until=now()+interval '10 minutes' WHERE id='database' AND (lease_until IS NULL OR lease_until<now()) RETURNING lease_until::text AS lease");
 if(!locked)throw new OfficeRecoveryError('A backup is already running. Retry when it finishes.','BACKUP_CHANGED');
 const path='backup-jobs/restarts/'+expectedJobKey+'.json';
 try{
  const saved=await readObject(path);
  let intent:snapshotRestart|null=saved?JSON.parse(saved.toString()):null;
  const currentRaw=await readObject(JOB),current:BackupJob|null=currentRaw?JSON.parse(currentRaw.toString()):null;
  if(intent&&intent.historyId!==id)throw new OfficeRecoveryError('A different history decision already restarted this snapshot.','BACKUP_CHANGED');
  if(!intent){
   if(current?.key!==expectedJobKey)throw new OfficeRecoveryError('The backup selection changed.','BACKUP_CHANGED');
   const selects=BACKUP_TABLES.map(t=>`'${t}',(SELECT coalesce(json_agg(x),'[]'::json) FROM ${t} x)`).join(',');
   const [snap]=await db.query<{dump:BackupDump['tables']}>(`SELECT json_build_object(${selects}) AS dump`);
   for(const row of snap.dump.service_orders)row.ein_secret=null;
   const i=[...officeFileIdentities(snap.dump).values()].find(i=>historyId(i)===id);
   if(!i?.historical||!historyGapFor(i,snap.dump))throw new OfficeRecoveryError('The missing document is still current or its historical gap is not acknowledged.','CURRENT_FILE_MISSING');
   await inspectHistoryOriginal(i,snap.dump);
   let key=backupKey(new Date().toISOString());while(key===expectedJobKey||await readObject(PREFIX+key)){await new Promise(r=>setTimeout(r,100));key=backupKey(new Date().toISOString());}
   const dump:BackupDump={version:1,fileManifestVersion:1,dumpedAt:new Date().toISOString(),tables:snap.dump,files:backupFiles(snap.dump)};
   intent={version:1,oldKey:expectedJobKey,historyId:id,reason:'acknowledged_history_change',successor:{key,dump,done:{},errors:{},format:2,phase:'copy',cursor:0,verified:{}},oldJob:current};
   await putObject(path,Buffer.from(JSON.stringify(intent)));
  }
  const verified=await readObject(path);if(!verified||!verified.equals(Buffer.from(JSON.stringify(intent))))throw Error('Backup restart intent readback failed');
  if(current&&current.key!==expectedJobKey&&current.key!==intent.successor.key)throw new OfficeRecoveryError('A different backup is now active.','BACKUP_CHANGED');
  const abandoned='backup-jobs/abandoned/'+expectedJobKey+'.json',old=await readObject(abandoned),bytes=Buffer.from(JSON.stringify(intent.oldJob));
  if(old&&!old.equals(bytes))throw Error('Abandoned backup differs from the saved restart intent');if(!old)await putObject(abandoned,bytes);
  if(!await readObject(PREFIX+intent.successor.key)){
   if(current?.key!==intent.successor.key)await putObject(JOB,Buffer.from(JSON.stringify(intent.successor)),true);
   // Installation can commit before its progress update. Replay the same
   // frozen start time even when the successor file is already installed.
   await db.query("UPDATE backup_progress SET started_at=$1,completed_at=NULL,error=NULL WHERE id='database' AND lease_until=$2::timestamptz",[intent.successor.dump.dumpedAt,locked.lease]);
  }
  return {state:'restarted',key:intent.successor.key};
 }finally{await db.query("UPDATE backup_progress SET lease_until=NULL WHERE id='database' AND lease_until=$1::timestamptz",[locked.lease]);}
}
interface snapshotRestart {version:1;oldKey:string;historyId:string;reason:string;successor:BackupJob;oldJob:BackupJob}
