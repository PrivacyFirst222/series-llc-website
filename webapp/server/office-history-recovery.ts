import {createHash} from 'node:crypto';
import type {Db} from './db';
import {resolveBackupProblemAfterRecovery} from './backup-attention';
import {getDb} from './db';
import {readObject,replaceStoredFile} from './storage';
import {seal,isEncrypted,unseal} from './encryption';
import {hashBytes,readMirror} from './dropbox';
import {readRecoveryJournal,recordDocumentCopy} from './backup-deletions';
import {officeHash,releaseOfficeOperation,type OfficeOperation} from './office-operation';
import {officeRecoveryTables,claimOfficeVerification,verifiedOfficeBytes,recoverOfficeFile,assertOfficeFileLive,ensureOfficeRecoveryCopy} from './office-file-recovery';
import {OfficeRecoveryError,officeFileIdentities,storageIdentity,recoveryTuple,collectOfficeRecoverySources,type OfficeIdentity,type OfficeTables} from './office-recovery-sources';

export interface HistoryGap {historyId:string;operationId:string;slot:string;clientId:string;storageKey:string;documentId:string;expectedSha:string;expectedSize:number;state:'unrecoverable'|'recovered';decisionId:string;checkedAt:string;actor:string;reason:'no_verified_controlled_copy';sourceResults:{source:string;state:string}[];recoveredAt?:string;latestCheckedAt?:string}
export const historyId=(i:OfficeIdentity)=>createHash('sha256').update(JSON.stringify(recoveryTuple(i))).digest('hex');
function firstHistoryDecision(id:string,generation:string){const checkedAt=new Date().toISOString();return {checkedAt,decisionId:officeHash(['history-gap-v1',id,generation,checkedAt])};}
export function historyGapFor(i:OfficeIdentity,tables:OfficeTables):HistoryGap|undefined {
 const op=tables.office_operations.find(o=>o.id===i.operationId);
 const gap=(op?.payload as {historyRecovery?:Record<string,HistoryGap>}|undefined)?.historyRecovery?.[i.slot];
 if(!gap||gap.state!=='unrecoverable')return;
 validateHistoryGap(i,gap);
 return gap;
}
export function validateHistoryGap(i:OfficeIdentity,gap:HistoryGap):void {
 if(!i.historical||!i.published||gap.state!=='unrecoverable'||gap.historyId!==historyId(i)||gap.operationId!==i.operationId||gap.slot!==i.slot||gap.clientId!==i.clientId||gap.storageKey!==i.file.key||gap.documentId!==i.file.id||gap.expectedSha!==i.file.sha||gap.expectedSize!==i.file.size||!gap.decisionId||!Number.isFinite(Date.parse(gap.checkedAt)))throw new OfficeRecoveryError('The history-gap record does not match a historical original.','RECOVERY_IDENTITY_CONFLICT');
}
export async function enumerateOfficeHistory(db:Db){
 const tables=await officeRecoveryTables(db);
 return [...officeFileIdentities(tables,{includeUnknown:true}).values()].filter(i=>i.historical).map(i=>{
  const op=tables.office_operations.find(o=>o.id===i.operationId)!;
  const company=tables.orders.find(o=>o.id===i.orderId),client=tables.clients.find(c=>c.id===i.clientId);
  return {clientName:String(client?.name??''),companyName:String(company?.llc_name??''),identity:i,historyId:historyId(i),expectedRevision:officeHash(recoveryTuple(i)),createdAt:String(op.created_at),title:i.file.title,slot:i.slot,clientId:i.clientId,orderId:i.orderId,serviceId:i.serviceId,status:!i.file.sha?'identity_unavailable':historyGapFor(i,tables)?.state??'unchecked'};
 }).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.identity.operationId.localeCompare(b.identity.operationId)||a.slot.localeCompare(b.slot));
}
export async function inspectHistoryOriginal(i:OfficeIdentity,tables?:OfficeTables){
 if(!i.file.sha)throw new OfficeRecoveryError('The original document fingerprint is unavailable. No history gap can be recorded.','RECOVERY_IDENTITY_UNAVAILABLE');
 await assertOfficeFileLive(i);
 const journal=await readRecoveryJournal(),generation=officeHash(journal),sourceResults:{source:string;state:string}[]=[];
 let available=false,unavailable=false;
 for(const source of [i.file.key,...collectOfficeRecoverySources(i,journal,tables?.documents)]){
  try{const raw=source===i.file.key?await readObject(source):await readMirror(source);if(raw&&isEncrypted(raw))unseal(raw);const good=verifiedOfficeBytes(i,raw);sourceResults.push({source,state:good?'verified':raw?'digest_invalid':'missing'});available ||=!!good;}
  catch{unavailable=true;sourceResults.push({source,state:'unavailable'});}
 }
 if(available)return {state:'recoverable' as const,sourceResults,generation};
 if(unavailable)throw new OfficeRecoveryError('A source or encryption key is unavailable. No history gap was recorded.','RECOVERY_UNAVAILABLE',503);
 return {state:'needs_staff_decision' as const,sourceResults,generation};
}
async function resolve(db:Db,id:string){
 if(!/^[a-f0-9]{64}$/.test(id))return undefined;
 const tables=await officeRecoveryTables(db),identity=[...officeFileIdentities(tables,{includeUnknown:true}).values()].find(i=>historyId(i)===id);
 if(identity)return {identity,tables};
 // Packages have independent immutable journal identities, not office upload
 // slots. Recognize their exact identifiers only to enforce the exclusion.
 let journal;try{journal=await readRecoveryJournal();}catch{throw new OfficeRecoveryError('The recovery journal is unavailable.','RECOVERY_UNAVAILABLE',503);}
 const pkg=journal.packages.find(p=>{const key=storageIdentity(p.storageKey);return createHash('sha256').update(JSON.stringify(['office-recovery-v1',p.clientId,p.id,key.namespace,key.canonicalKey,p.sha,p.size,true])).digest('hex')===id;});
 if(pkg){
  if(pkg.state==='aborted'||journal.records.some(r=>r.storageKey===pkg.storageKey||r.documentId===pkg.id))throw new OfficeRecoveryError('This package was retired or deleted.','DOCUMENT_DELETED');
  throw new OfficeRecoveryError('S-election packages must use package recovery and cannot be recorded as a historical gap.','HISTORY_NOT_ELIGIBLE');
 }
 return undefined;
}
async function lockHistory(db:Db,i:OfficeIdentity,tables:OfficeTables){
 const original=tables.office_operations.find(o=>o.id===i.operationId) as unknown as OfficeOperation;
 const target=tables.office_operations.find(o=>o.target_id===(i.serviceId??i.orderId)&&o.kind===(i.serviceId?'service':'articles-correction')) as unknown as OfficeOperation|undefined;
 // Articles history and its order share one reservation. Claim the exact
 // original first so an expired worker's order marker can be reclaimed, and
 // fence release by that lease so the expired worker cannot clear its successor.
 if(!i.serviceId){
  const held=await claimOfficeVerification(db,original);
  try{
   if(i.orderId){
    const [locked]=await db.query(`UPDATE orders SET office_upload_id=$2
     WHERE id=$1 AND (office_upload_id IS NULL OR office_upload_id=$2) AND replacing_at IS NULL
     AND EXISTS(SELECT 1 FROM office_operations WHERE id=$2 AND lease=$3 AND lease_until>now()) RETURNING id`,[i.orderId,original.id,held.lease]);
    if(!locked)throw new OfficeRecoveryError('The filing is being changed. Retry.','OFFICE_BUSY');
   }
  }catch(e){await releaseOfficeOperation(db,held);throw e;}
  return {held,targetId:undefined,token:held.lease!,assertTarget:async()=>{
   const [locked]=await db.query(`SELECT o.id FROM office_operations o WHERE o.id=$1 AND o.lease=$2 AND o.lease_until>now()
    AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM orders WHERE id=$3 AND office_upload_id=$1))`,[original.id,held.lease,i.orderId]);
   if(!locked)throw new OfficeRecoveryError('The current document reservation expired. Retry.','OFFICE_BUSY');
  },release:async()=>{
   if(i.orderId)await db.query(`UPDATE orders SET office_upload_id=NULL WHERE id=$1 AND office_upload_id=$2
    AND EXISTS(SELECT 1 FROM office_operations WHERE id=$2 AND lease=$3)`,[i.orderId,original.id,held.lease]);
   await releaseOfficeOperation(db,held);
  }};
 }
 const token=crypto.randomUUID();let targetId:string|undefined;
 if(i.serviceId&&target&&target.id!==original.id){
  const [locked]=await db.query("UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes' WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[target.id,token]);
  if(!locked)throw new OfficeRecoveryError('The service is being changed. Retry.','OFFICE_BUSY');targetId=target.id;
 }else if(i.orderId){
  const [locked]=await db.query('UPDATE orders SET office_upload_id=$2 WHERE id=$1 AND office_upload_id IS NULL AND replacing_at IS NULL RETURNING id',[i.orderId,original.id]);
  if(!locked)throw new OfficeRecoveryError('The filing is being changed. Retry.','OFFICE_BUSY');
 }
 const releaseTarget=async()=>{if(targetId)await db.query('UPDATE office_operations SET lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2',[targetId,token]);else if(i.orderId)await db.query('UPDATE orders SET office_upload_id=NULL WHERE id=$1 AND office_upload_id=$2',[i.orderId,original.id]);};
 const assertTarget=async()=>{
  const [held]=targetId?await db.query('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()',[targetId,token]):i.orderId?await db.query('SELECT id FROM orders WHERE id=$1 AND office_upload_id=$2',[i.orderId,original.id]):[{id:original.id}];
  if(!held)throw new OfficeRecoveryError('The current document reservation expired. Retry.','OFFICE_BUSY');
 };
 try {const held=await claimOfficeVerification(db,original);return {held,targetId,token,assertTarget,release:async()=>{await releaseOfficeOperation(db,held);await releaseTarget();}};}
 catch(e){await releaseTarget();throw e;}
}
async function assertHistoryFileLive(i:OfficeIdentity){
 try{await assertOfficeFileLive(i);}
 catch(e){
  if(e instanceof OfficeRecoveryError&&e.code==='DOCUMENT_DELETED'){
   const {clearDeletedOfficeHistory}=await import('./document-retention');
   await clearDeletedOfficeHistory(i.file.key);
  }
  throw e;
 }
}
export async function acknowledgeHistoryGap(db:Db,id:string,expectedRevision:string,actor:string){
 const found=await resolve(db,id);if(!found)return null;
 const {identity:i,tables}=found;
 if(!i.file.sha)throw new OfficeRecoveryError('The original document fingerprint is unavailable.','RECOVERY_IDENTITY_UNAVAILABLE');
 if(expectedRevision!==officeHash(recoveryTuple(i)))throw new OfficeRecoveryError('This revision changed. Refresh the history list.','OFFICE_CONFLICT');
 if(!i.historical)throw new OfficeRecoveryError('A current document cannot be recorded as a history gap.','HISTORY_NOT_ELIGIBLE');
 const lock=await lockHistory(db,i,tables);
 try{
  const inspection=await inspectHistoryOriginal(i,tables);
  if(inspection.state==='recoverable')throw new OfficeRecoveryError('A verified original is available. Choose Recover original.','RECOVERY_COPY_AVAILABLE');
  const prior=historyGapFor(i,tables);
  const gap:HistoryGap=prior?{...prior,latestCheckedAt:new Date().toISOString()}:{historyId:id,operationId:i.operationId,slot:i.slot,clientId:i.clientId,storageKey:i.file.key,documentId:i.file.id,expectedSha:i.file.sha!,expectedSize:i.file.size,state:'unrecoverable',...firstHistoryDecision(historyId(i),inspection.generation),actor,reason:'no_verified_controlled_copy',sourceResults:inspection.sourceResults};
  await assertHistoryFileLive(i);
  if(officeHash(await readRecoveryJournal())!==inspection.generation)throw new OfficeRecoveryError('Recovery sources changed during the check. Retry.','OFFICE_BUSY');
  const [saved]=await db.query(`WITH operation AS (
   UPDATE office_operations SET payload=jsonb_set(payload,'{historyRecovery}',coalesce(payload->'historyRecovery','{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb))
   WHERE id=$1 AND lease=$2 AND lease_until>now() AND files->$3->>'key'=$5 AND files->$3->>'sha'=$6
   AND NOT EXISTS(SELECT 1 FROM documents WHERE storage_key=$5 AND deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM document_deletions WHERE storage_key=$5)
   AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM office_operations WHERE id=$7 AND lease=$8 AND lease_until>now()))
   AND ($9::uuid IS NULL OR $10::boolean OR EXISTS(SELECT 1 FROM orders WHERE id=$9 AND office_upload_id=$1)) RETURNING id
  ), history AS (UPDATE documents SET meta=meta||jsonb_build_object('historyRecovery',$4::jsonb) WHERE storage_key=$5 AND meta->>'officeHistory'='true' AND EXISTS(SELECT 1 FROM operation) RETURNING id)
  SELECT id FROM operation`,[i.operationId,lock.held.lease,i.slot,JSON.stringify(gap),i.file.key,i.file.sha,lock.targetId??null,lock.token,i.orderId,!!i.serviceId]);
  await assertHistoryFileLive(i);
  if(!saved)throw new OfficeRecoveryError('The document or reservation changed. No gap was recorded.','OFFICE_BUSY');
  await resolveBackupProblemAfterRecovery(db,id);
  return {state:'unrecoverable',historyId:id,decisionId:gap.decisionId};
 }finally{await lock.release();}
}
export async function restoreHistoricalOriginal(db:Db,id:string,supplied?:Buffer){
 const found=await resolve(db,id);if(!found)return null;
 const {identity:i,tables}=found;if(!i.historical)throw new OfficeRecoveryError('Use the current document recovery control.','HISTORY_NOT_ELIGIBLE');
 if(!i.file.sha)throw new OfficeRecoveryError('The original document fingerprint is unavailable.','RECOVERY_IDENTITY_UNAVAILABLE');
 const lock=await lockHistory(db,i,tables);
 try{
  await assertOfficeFileLive(i);await lock.assertTarget();
  if(supplied){
   if(supplied.length!==i.file.size||hashBytes(supplied)!==i.file.sha)throw new OfficeRecoveryError('Select the exact historical original.','OFFICE_CONFLICT');
   try{
   if(!await recordDocumentCopy({documentId:i.file.id,storageKey:i.file.key,serviceId:i.serviceId,mirrorPath:i.file.mirrorPath??`/OfficeOperations/${i.operationId}/${i.slot}`}))throw new OfficeRecoveryError('This document was deleted.','DOCUMENT_DELETED');
   await replaceStoredFile(i.file.key,i.sensitive?seal(supplied):supplied);
   }catch(error){if(error instanceof OfficeRecoveryError)throw error;throw new OfficeRecoveryError('A recovery source is unavailable. Retry after storage access is restored.','RECOVERY_UNAVAILABLE',503);}
  }
  await recoverOfficeFile(i);await ensureOfficeRecoveryCopy(i);await assertOfficeFileLive(i);
  const previous=historyGapFor(i,tables);
  if(previous){
   const recovered={...previous,state:'recovered',recoveredAt:new Date().toISOString()};
   const [updated]=await db.query(`WITH operation AS (
    UPDATE office_operations SET payload=jsonb_set(payload,ARRAY['historyRecovery',$3],$4::jsonb)
    WHERE id=$1 AND lease=$2 AND lease_until>now()
    AND NOT EXISTS(SELECT 1 FROM document_deletions WHERE storage_key=$5)
    AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM office_operations WHERE id=$6 AND lease=$7 AND lease_until>now()))
    AND ($8::uuid IS NULL OR $9::boolean OR EXISTS(SELECT 1 FROM orders WHERE id=$8 AND office_upload_id=$1)) RETURNING id
   ), history AS (UPDATE documents SET meta=meta||jsonb_build_object('historyRecovery',$4::jsonb)
    WHERE storage_key=$5 AND meta->>'officeHistory'='true' AND EXISTS(SELECT 1 FROM operation) RETURNING id)
   SELECT id FROM operation`,[i.operationId,lock.held.lease,i.slot,JSON.stringify(recovered),i.file.key,lock.targetId??null,lock.token,i.orderId,!!i.serviceId]);
   await assertHistoryFileLive(i);
   if(!updated)throw new OfficeRecoveryError('The recovery reservation expired. Retry.','OFFICE_BUSY');
  }else{
   const [held]=await db.query(`SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()
    AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM office_operations WHERE id=$3 AND lease=$4 AND lease_until>now()))
    AND ($5::uuid IS NULL OR $6::boolean OR EXISTS(SELECT 1 FROM orders WHERE id=$5 AND office_upload_id=$1))`,[i.operationId,lock.held.lease,lock.targetId??null,lock.token,i.orderId,!!i.serviceId]);
   if(!held)throw new OfficeRecoveryError('The recovery reservation expired. Retry.','OFFICE_BUSY');
  }
  await assertHistoryFileLive(i);
  await resolveBackupProblemAfterRecovery(db,id);
  return {state:'recovered',historyId:id};
 }finally{await lock.release();}
}
export async function checkedHistory(id:string){
 const db=await getDb(),found=await resolve(db,id);if(!found)return null;
 const inspection=await inspectHistoryOriginal(found.identity,found.tables);
 // A repair can commit bytes before its metadata. Complete that interrupted
 // transition under the same reservations as an explicit original recovery.
 if(inspection.state==='recoverable'&&historyGapFor(found.identity,found.tables))await restoreHistoricalOriginal(db,id);
 return inspection;
}

/** Prepare observations under the replacement's reservation. The caller must
 * commit these WITH publication, never while the predecessor is still current. */
export async function prepareCorrectionHistory(db:Db,op:OfficeOperation,actor:string):Promise<Record<string,Record<string,HistoryGap>>>{
 const tables=await officeRecoveryTables(db),identities=officeFileIdentities(tables);
 const from=op.payload.from,corrects=op.payload.corrects;
 if(!from&&!corrects)return {};
 const result:Record<string,Record<string,HistoryGap>>={};
 const fromDoc=from?tables.documents.find(d=>d.id===from):undefined;
 const targets=[...identities.values()].filter(i=>i.operationId!==op.id&&i.published&&(
  corrects?i.operationId===corrects:!!fromDoc&&i.orderId===fromDoc.order_id&&tables.documents.some(d=>d.storage_key===i.file.key&&!d.deleted_at&&['articles','statement'].includes(String(d.kind)))));
 for(const i of targets){
  const inspection=await inspectHistoryOriginal(i,tables);
  if(inspection.state==='recoverable'){await recoverOfficeFile(i);continue;}
  if(inspection.generation!==officeHash(await readRecoveryJournal()))throw new OfficeRecoveryError('The recovery sources changed during correction. Retry.','OFFICE_BUSY');
  const previous=historyGapFor({...i,historical:true},tables);
  const gap:HistoryGap=previous??{historyId:historyId(i),operationId:i.operationId,slot:i.slot,clientId:i.clientId,storageKey:i.file.key,documentId:i.file.id,expectedSha:i.file.sha!,expectedSize:i.file.size,state:'unrecoverable',...firstHistoryDecision(historyId(i),inspection.generation),actor,reason:'no_verified_controlled_copy',sourceResults:inspection.sourceResults};
  (result[i.operationId]??={})[i.slot]=gap;
 }
 return result;
}
