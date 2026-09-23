import type { Db } from './db';
import { decryptSecret } from './crypto';
import {recoverPackages} from './package-recovery';
import { BACKUP_TABLES, type BackupDump } from './backup';
import { readDeletionMirror } from './backup-deletions';
import { readMirror, hashBytes } from './dropbox';
import { replaceStoredFile, putObject, deletionPath } from './storage';
import { isEncrypted, unseal } from './encryption';
import { recoveryDetails, notifyTaxpayerNumbersRequired, type RecoverableElection } from './s-election-recovery';
/** Actual recovery path, also exercised with an empty disposable database.
 * Delete decisions are read from outside the snapshot, before restoring any
 * document. A failed read aborts restoration rather than guessing no deletions. */
export async function restoreBackup(db:Db, dump:BackupDump):Promise<{tables:number;files:number;excludedDeleted:number;recoveryNotifications:{sent:number;failed:number}}>{
 if(dump.version!==1||dump.fileManifestVersion!==1||!Array.isArray(dump.files))throw new Error('This restore requires a verified backup with a complete file manifest');
 for(const t of BACKUP_TABLES)if(!Array.isArray(dump.tables[t]))throw new Error(`Backup is missing table ${t}`);
 for(const table of BACKUP_TABLES){const [existing]=await db.query<{n:string}>(`SELECT count(*) AS n FROM ${table}`);if(Number(existing.n))throw new Error(`Restore target is not empty: ${table}`);}
 const tombstones=await readDeletionMirror();const deleted=new Set(tombstones.map(d=>d.storageKey));
 for(const key of [...(dump.deletionCheckpoint||[]),...dump.tables.document_deletions.map(d=>String(d.storage_key))])if(!deleted.has(key))throw new Error('Independent deletion journal is missing a recorded decision');
 const tables=structuredClone(dump.tables);
 const packageRecovery=await recoverPackages(tables,dump.packageCheckpoint);
 const restoreFiles=[...new Map([...dump.files,...packageRecovery.files].map(f=>[f.storageKey,f])).values()];
 const removedIds=new Set([...tombstones.map(d=>d.documentId),...tables.documents.filter(d=>deleted.has(String(d.storage_key))||d.deleted_at).map(d=>d.id)]);
 tables.documents=tables.documents.filter(d=>!removedIds.has(d.id));
 tables.oa_generations=tables.oa_generations.map(d=>removedIds.has(d.document_id)?{...d,document_id:null}:d);
 const recovery: RecoverableElection[] = [];
 for(const row of tables.service_orders){
  row.ein_secret=null;const details=(row.details||{}) as Record<string,unknown>;
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
  if(isEncrypted(data))unseal(data);bytes.set(f.storageKey,data);
 }
 for(const d of tables.documents){const raw=bytes.get(String(d.storage_key));if(!raw)throw new Error('Document missing from backup manifest');if((d.meta as {sensitive?:boolean}|null)?.sensitive&&!isEncrypted(raw))throw new Error('Sensitive backup document is not encrypted');}
 for(const d of tables.library_documents){if(!bytes.has(String(d.storage_key)))throw new Error('Library document missing from backup manifest');}
 for(const d of tables.orders){if(d.summary_storage_key&&!bytes.has(String(d.summary_storage_key)))throw new Error('Order summary missing from backup manifest');}
 for(const d of tombstones)await putObject(deletionPath(d.storageKey),Buffer.from(JSON.stringify(d)),true);
 for(const [key,data] of bytes)await replaceStoredFile(key,data);
 for(const t of BACKUP_TABLES){
  for(const row of tables[t]){const cols=Object.keys(row);if(cols.some(k=>!/^\w+$/.test(k)))throw new Error('Invalid backup column');
   await db.query(`INSERT INTO ${t} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')})`,cols.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));
  }
 }
 for(const d of tombstones)await db.query('INSERT INTO document_deletions(storage_key,document_id,mirror_path,requested_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[d.storageKey,d.documentId,d.mirrorPath,d.requestedAt]);
 const recoveryNotifications={sent:0,failed:0};
 for(const row of recovery){if(await notifyTaxpayerNumbersRequired(db,row))recoveryNotifications.sent++;else recoveryNotifications.failed++;}
 return {tables:BACKUP_TABLES.length,files:bytes.size,excludedDeleted:removedIds.size,recoveryNotifications};
}
