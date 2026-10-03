import type { Db } from './db';
import { decryptSecret } from './crypto';
import {recoverPackages} from './package-recovery';
import { BACKUP_TABLES, OPTIONAL_BACKUP_TABLES, type BackupDump } from './backup';
import { readRecoveryJournal } from './backup-deletions';
import { readMirror, hashBytes } from './dropbox';
import { replaceStoredFile, putObject, deletionPath } from './storage';
import { isEncrypted, unseal } from './encryption';
import { recoveryDetails, type RecoverableElection } from './s-election-recovery';
import {officeFileIdentities,recoveryTuple,OfficeRecoveryError} from './office-recovery-sources';
import {validateHistoryGap} from './office-history-recovery';
import {verifiedOfficeBytes} from './office-file-recovery';
/** Actual recovery path, also exercised with an empty disposable database.
 * Delete decisions are read from outside the snapshot, before restoring any
 * document. A failed read aborts restoration rather than guessing no deletions. */
export async function restoreBackup(db:Db, dump:BackupDump, options:{holdUnresolved?:boolean;firstNoticeCutoff?:string}={}):Promise<{tables:number;files:number;excludedDeleted:number;heldPackages:number;activationBlocked:boolean;recoveryNotifications:{sent:number;failed:number}}>{
 if(![1,2].includes(dump.version)||dump.fileManifestVersion!==dump.version||!Array.isArray(dump.files))throw new Error('This restore requires a verified backup with a complete file manifest');
 if(dump.version===2&&(!dump.historyGaps?.length||dump.status!=='complete_with_history_gaps'||dump.restorable!==true||dump.historyComplete!==false))throw Error('The historical-gap envelope is incomplete');
 if(dump.version===1&&dump.historyGaps?.length)throw Error('A version 1 snapshot cannot waive history');
 for(const t of BACKUP_TABLES)if(!Array.isArray(dump.tables[t])&&!(OPTIONAL_BACKUP_TABLES.has(t)&&dump.tables[t]===undefined))throw new Error(`Backup is missing table ${t}`);
 for(const table of BACKUP_TABLES){if(table==='launch_policy')continue;const [existing]=await db.query<{n:string}>(`SELECT count(*) AS n FROM ${table}`);if(Number(existing.n))throw new Error(`Restore target is not empty: ${table}`);}
 const journal=await readRecoveryJournal();
 const launchCutoff=journal.firstNoticeCutoff??dump.tables.launch_policy?.find(r=>r.id==='initial-launch')?.first_notice_cutoff??options.firstNoticeCutoff;
 if(typeof launchCutoff!=='string'||!Number.isFinite(Date.parse(launchCutoff)))throw Error('Original initial-launch notice cutoff is unavailable. Supply its recorded deployment value with --first-notice-cutoff; never use the restore date.');
 const tombstones=journal.records;const deleted=new Set(tombstones.map(d=>d.storageKey));
 const identities=officeFileIdentities(dump.tables),gaps=new Set<string>();
 for(const gap of dump.historyGaps??[]){
  if(deleted.has(gap.storageKey))continue;
  const identity=identities.get(gap.storageKey);if(!identity||gaps.has(gap.storageKey))throw Error('Invalid or duplicate history gap');
  validateHistoryGap(identity,gap);gaps.add(gap.storageKey);
 }
 for(const f of dump.files){
  const i=identities.get(f.storageKey);
  if(i&&f.sha!==i.file.sha)throw new OfficeRecoveryError('Backup manifest disagrees with the original file fingerprint','RECOVERY_IDENTITY_CONFLICT');
  if(f.officeRecoveryIdentity&&(!i||JSON.stringify(f.officeRecoveryIdentity)!==JSON.stringify(recoveryTuple(i))||f.path!==i.recoveryPath))throw new OfficeRecoveryError('Backup recovery identity is inconsistent','RECOVERY_IDENTITY_CONFLICT');
 }
 for(const key of [...(dump.deletionCheckpoint||[]),...dump.tables.document_deletions.map(d=>String(d.storage_key))])if(!deleted.has(key))throw new Error('Independent deletion journal is missing a recorded decision');
 const tables=structuredClone(dump.tables);
 for(const t of OPTIONAL_BACKUP_TABLES)tables[t]??=[];
 // A gap can be acknowledged after the snapshot froze its business rows.
 // Its validated manifest observation must survive the restore without
 // substituting newer filing/service state into that older snapshot.
 for(const op of tables.office_operations){
  const payload=(op.payload??{}) as Record<string,unknown>,history={...(payload.historyRecovery as Record<string,unknown>??{})};
  for(const [slot,file] of Object.entries((op.files??{}) as Record<string,{key:string}>))if(deleted.has(file.key))delete history[slot];
  for(const gap of dump.historyGaps??[])if(gap.operationId===op.id&&!deleted.has(gap.storageKey))history[gap.slot]=gap;
  op.payload={...payload,...(Object.keys(history).length?{historyRecovery:history}:{})};
  if(!Object.keys(history).length)delete (op.payload as Record<string,unknown>).historyRecovery;
 }
 for(const d of tables.documents){
  const meta={...(d.meta as Record<string,unknown>??{})};
  if(deleted.has(String(d.storage_key)))delete meta.historyRecovery;
  const gap=dump.historyGaps?.find(g=>g.storageKey===d.storage_key&&!deleted.has(g.storageKey));
  if(gap&&meta.officeHistory)meta.historyRecovery=gap;
  d.meta=meta;
 }
 for(const row of [...tables.orders,...tables.service_orders]){row.payment_check_lease=null;row.payment_check_until=null;row.payment_check_after=null;}
 for(const row of tables.payment_alerts)row.lease_until=null;
 const restoreId=crypto.randomUUID();
 for(const row of tables.office_operations){row.lease=null;row.lease_until=null;if(row.phase==='open')row.payload={...(row.payload as Record<string,unknown>),restoreReview:{restoreId,inputHash:row.input_hash,required:true}};}
 for(const row of tables.orders)row.office_upload_id=tables.office_operations.find(op=>['articles','articles-correction'].includes(String(op.kind))&&op.target_id===row.id&&['open','retiring'].includes(String(op.phase)))?.id??null;
 const packageRecovery=await recoverPackages(tables,dump.packageCheckpoint,options);
 // Restored reservations have no intact local writer history. A missing
 // attempt must not be reinterpreted as evidence of no provider dispatch.
 for(const o of tables.orders){o.ra_payment_protocol=0;}
 const restoreFiles=[...new Map([...dump.files,...packageRecovery.files].map(f=>[f.storageKey,f])).values()];
 const removedIds=new Set([...tombstones.filter(d=>d.reason!=='superseded').map(d=>d.documentId),...tables.documents.filter(d=>deleted.has(String(d.storage_key))||(d.deleted_at&&!(d.meta as Record<string,unknown>)?.officeHistory)).map(d=>d.id)]);
 tables.documents=tables.documents.filter(d=>!removedIds.has(d.id));
 tables.oa_generations=tables.oa_generations.map(d=>removedIds.has(d.document_id)?{...d,document_id:null}:d);
 for(const hold of tables.recovery_holds)if(tombstones.some(d=>d.documentId===hold.id&&d.reason!=='superseded'))hold.status='deleted';
 const recovery: RecoverableElection[] = [];
 for(const row of tables.service_orders){
  row.recovery_notice_lock_until=null;row.ein_secret=null;const details=(row.details||{}) as Record<string,unknown>;
  if(removedIds.has(details.documentId)){details.documentDeletedAt=new Date().toISOString();}
  else if(row.type==='ein'&&row.status==='in_progress')row.status='awaiting_info';
  const needed = recoveryDetails(row as unknown as RecoverableElection, true);
  if(needed){row.status='awaiting_info';row.details=needed;recovery.push(row as unknown as RecoverableElection);}
 }
 // A vanished correspondence worker may not retain a lease after recovery.
 // Unresolved payment reservations/provider identities are deliberately kept.
 for(const row of tables.ra_renewals)if('correspondence_lock_until' in row)row.correspondence_lock_until=null;
 // Pending card requests are durable, encrypted provider retry identities. A
 // vanished worker's lease must not block the recovered client's retry. Verify
 // the required key and identity before writing any restored file or row.
 for(const row of tables.renewal_card_attempts){
  if(row.status!=='pending')continue;
  try{
   const input=JSON.parse(decryptSecret(String(row.source_token)));
   if(input.attemptId!==row.id||input.referenceId!==row.order_id||typeof input.source!=='string'||!input.source)throw new Error('identity');
  }catch{throw new Error('Pending card update cannot be recovered: request key or identity unavailable');}
  row.lock_until=null;
 }
 // Verify every required file and encryption key before writing database rows.
 const bytes=new Map<string,Buffer>();
 for(const f of restoreFiles){if(deleted.has(f.storageKey))continue;
  const data=await readMirror(f.path);
  if(!data||!f.sha||hashBytes(isEncrypted(data)?unseal(data):data)!==f.sha)throw new Error(`Backup file missing or changed: ${f.path}`);
  const identity=identities.get(f.storageKey);if(identity&&!verifiedOfficeBytes(identity,data))throw Error('Saved original size, hash or envelope does not match');
  if(isEncrypted(data))unseal(data);bytes.set(f.storageKey,data);
 }
 for(const d of tables.documents){const raw=bytes.get(String(d.storage_key));if(!raw&&!gaps.has(String(d.storage_key)))throw new Error('Document missing from backup manifest');if(raw&&(d.meta as {sensitive?:boolean}|null)?.sensitive&&!isEncrypted(raw))throw new Error('Sensitive backup document is not encrypted');}
 for(const i of identities.values())if(!deleted.has(i.file.key)&&!gaps.has(i.file.key)&&!bytes.has(i.file.key))throw Error('Office original missing from backup manifest');
 for(const d of tables.library_documents){if(!bytes.has(String(d.storage_key)))throw new Error('Library document missing from backup manifest');}
 for(const d of tables.orders){if(d.summary_storage_key&&!bytes.has(String(d.summary_storage_key)))throw new Error('Order summary missing from backup manifest');}
 // Fence the target before the first restored file or business row is written.
 // A failed/interrupted restore must remain inactive too.
 await db.query("INSERT INTO recovery_activation(id,restore_id) VALUES('restore',$1) ON CONFLICT(id) DO UPDATE SET restore_id=EXCLUDED.restore_id,restored_at=now(),activated_at=NULL,production_origin=NULL,operator=NULL",[restoreId]);
 for(const d of tombstones)await putObject(deletionPath(d.storageKey),Buffer.from(JSON.stringify(d)),true);
 for(const [key,data] of bytes)await replaceStoredFile(key,data);
 for(const t of BACKUP_TABLES){
  if(t==='launch_policy'){
   await db.query("UPDATE launch_policy SET first_notice_cutoff=$1::timestamptz WHERE id='initial-launch'",[launchCutoff]);
   continue;
  }
  for(const row of tables[t]){const cols=Object.keys(row);if(cols.some(k=>!/^\w+$/.test(k)))throw new Error('Invalid backup column');
   await db.query(`INSERT INTO ${t} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')})`,cols.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));
  }
 }
 for(const h of packageRecovery.holds)await db.query(`INSERT INTO recovery_holds(id,service_id,client_id,record,reason) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(id) DO UPDATE SET record=EXCLUDED.record,reason=EXCLUDED.reason,status='held',acknowledged_at=NULL,acknowledged_by=NULL,evidence=NULL`,[h.record.id,h.record.serviceId,h.record.clientId,JSON.stringify(h.record),h.reason]);
 // A previous target's acknowledgment does not authorize this activation.
 await db.query("UPDATE recovery_holds SET acknowledged_at=NULL,acknowledged_by=NULL WHERE status='held'");
 for(const d of tombstones)await db.query('INSERT INTO document_deletions(storage_key,document_id,mirror_path,requested_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[d.storageKey,d.documentId,d.mirrorPath,d.requestedAt]);
 // A restore is a rehearsal until the operator explicitly activates this
 // target. No mail is dispatched and no sent marker is consumed here.
 const recoveryNotifications={sent:0,failed:0,pending:recovery.length};
 const [held]=await db.query<{n:number}>("SELECT count(*)::int n FROM recovery_holds WHERE status='held'");
 return {tables:BACKUP_TABLES.length,files:bytes.size,excludedDeleted:removedIds.size,heldPackages:held.n,activationBlocked:true,recoveryNotifications};
}
