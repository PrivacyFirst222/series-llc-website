import {createHash} from 'node:crypto';
import {env} from './env';
import type {Db} from './db';
import {putObject, readObject, removeStoredFile, deletionPath} from './storage';
import {seal, unseal, isEncrypted} from './encryption';
import {ensureDeletionMirror,recordDocumentCopy,readRecoveryJournal,updateRecoveryJournal} from './backup-deletions';
import type {Deletion} from './document-retention';
import {deleteMirror,documentMirrorPath,mirrorFile} from './dropbox';
import {claimOfficeVerification} from './office-file-recovery';
import {OfficeRecoveryError} from './office-recovery-sources';

/** One immutable intent per office delivery. The lease fences database commits;
 * a late upload can only rewrite the same path with the same approved bytes.
 * Stored intent survives a failed request; a retry never guesses completion. */
export interface OfficeFile {id:string;key:string;size:number;kind:string;title:string;meta:Record<string,unknown>;sha?:string;mirrorPath?:string}
export interface OfficeOperation {id:string;kind:string;target_id:string;input_hash:string;payload:Record<string,unknown>;files:Record<string,OfficeFile>;phase:string;result:Record<string,unknown>;lease:string}
export class OfficeConflict extends Error {constructor(message:string,public code='OFFICE_BUSY'){super(message)}}
export const officeHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function findOfficeOperation(db:Db,kind:string,target:string):Promise<OfficeOperation|undefined>{return (await db.query<OfficeOperation>('SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2',[kind,target]))[0]}
/** External retirement/deletion takes precedence over the restored-upload
 * review hold. A review can never authorize an already discarded original. */
export async function assertRestoredOfficeAttemptLive(op:OfficeOperation){
 let journal;try{journal=await readRecoveryJournal();}catch{throw new OfficeRecoveryError('The recovery journal is unavailable. Retry after recovery storage is restored.','RECOVERY_UNAVAILABLE',503);}
 const keys=[...Object.values(op.files).map(f=>f.key),...Object.values((op.payload.fileIntents??{}) as Record<string,OfficeFileIntent>).map(f=>f.key)];
 if(journal.records.some(r=>keys.includes(r.storageKey)||(r.reason!=='superseded'&&op.kind==='service'&&r.serviceId===op.target_id)))throw new OfficeConflict('The restored upload has been retired or deleted.','DOCUMENT_DELETED');
}
/** Match the archived immutable input, not merely a different PDF or the
 * current successor. Retirement survives both a normal retry and restore. */
export async function assertOfficeInputNotRetired(db:Db,kind:string,target:string,inputHash:string){
 const predecessors=await db.query<OfficeOperation>(`SELECT * FROM office_operations
  WHERE target_id=$1 AND input_hash=$2 AND kind=$3||'-history:'||id::text
  AND phase='superseded'`,[target,inputHash,kind]);
 for(const prior of predecessors)await assertRestoredOfficeAttemptLive(prior);
}
export async function claimOfficeOperation(db:Db,kind:string,target:string,inputHash:string|null,payload:Record<string,unknown>,recheckDone=false,reviewRestoredOriginal=false):Promise<OfficeOperation>{
 if(inputHash){
  if(kind==='articles'){
   if(!await findOfficeOperation(db,kind,target)){
    const id=crypto.randomUUID();
    await db.query(`WITH owner AS (UPDATE orders SET office_upload_id=$5 WHERE id=$2 AND replacing_at IS NULL AND office_upload_id IS NULL AND (status='filed' OR (status='formed' AND ($4::jsonb->>'existingId') IS NOT NULL)) RETURNING id)
     INSERT INTO office_operations(id,kind,target_id,input_hash,payload) SELECT $5,$1,$2,$3,$4 FROM owner ON CONFLICT(kind,target_id) DO NOTHING`,[kind,target,inputHash,JSON.stringify(payload),id]);
   }
  }else await db.query(`INSERT INTO office_operations(kind,target_id,input_hash,payload) VALUES($1,$2,$3,$4) ON CONFLICT(kind,target_id) DO NOTHING`,[kind,target,inputHash,JSON.stringify(payload)]);
 }
 const op=await findOfficeOperation(db,kind,target);
 if(!op)throw new OfficeConflict(kind==='articles'&&inputHash?'A formation upload is already being saved. Wait for it to finish, then reload.':'Upload the required document to start this work.',kind==='articles'&&inputHash?'OFFICE_BUSY':'UPLOAD_REQUIRED');
 if(inputHash&&op.input_hash!==inputHash){
  await assertOfficeInputNotRetired(db,kind,target,inputHash);
  throw new OfficeConflict('Another completion already saved different information. Reload this order before proceeding.','OFFICE_CONFLICT');
 }
 if(op.phase==='superseded')throw new OfficeConflict('This attempt was replaced. Reload the service.','OFFICE_CONFLICT');
 if(op.phase==='retiring')throw new OfficeConflict('Continue the saved replacement before resuming this work.','DOCUMENT_DELETED');
 const review=op.payload.restoreReview as {required?:boolean;inputHash?:string}|undefined;
 if(review?.required)await assertRestoredOfficeAttemptLive(op);
 if(review?.required&&(!reviewRestoredOriginal||!inputHash||review.inputHash!==inputHash))throw new OfficeConflict('Review the restored upload and attach its original PDF before resuming.','RECOVERY_REVIEW_REQUIRED');
 if(op.phase==='done'&&!recheckDone)return claimOfficeVerification(db,op);
 const lease=crypto.randomUUID();
 let claimed:OfficeOperation|undefined;
 try{[claimed]=await db.query<OfficeOperation>(`UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes',error=NULL,phase=CASE WHEN phase='done' THEN 'committed' ELSE phase END WHERE id=$1 AND (phase IN ('open','committed') OR ($3::boolean AND phase='done')) AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[op.id,lease,recheckDone]);}
 catch(error){await releaseOfficeOperation(db,{...op,lease},error);throw error;}
 if(!claimed)throw new OfficeConflict('This work is being saved in another request. Wait for it to finish, then retry.');
 if(review?.required){
  try{await assertRestoredOfficeAttemptLive(claimed);}catch(error){await releaseOfficeOperation(db,claimed,error);throw error;}
  const [cleared]=await db.query<OfficeOperation>("UPDATE office_operations SET payload=jsonb_set(payload,'{restoreReview,required}','false'::jsonb) WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' RETURNING *",[op.id,lease]);
  if(!cleared)throw new OfficeConflict('The restored work changed. Reload.');claimed=cleared;
 }
 return claimed;
}
export async function releaseOfficeOperation(db:Db,op:OfficeOperation,error?:unknown){await db.query('UPDATE office_operations SET lease=NULL,lease_until=NULL,error=$3 WHERE id=$1 AND lease=$2',[op.id,op.lease,error?String(error).slice(0,300):null]).catch(()=>{})}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function assertOfficeLease(db:Db,op:OfficeOperation){
 const rows=await db.query("SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase IN ('open','committed','done')",[op.id,op.lease]);
 if(!rows.length)throw new OfficeConflict('Another request resumed or corrected this work. Reload and retry.');
}
export async function readOfficeFile(file:OfficeFile):Promise<Buffer>{
 try{
  const bytes=await readObject(file.key);if(!bytes)throw Error('missing');
  const plain=isEncrypted(bytes)?unseal(bytes):bytes;
  if(plain.length!==file.size||(file.sha&&digest(plain)!==file.sha))throw Error('changed');
  return plain;
 }catch{throw new OfficeConflict('The saved upload is missing or damaged. Select the original PDF and retry.','UPLOAD_REQUIRED');}
}
export interface OfficeFileIntent { id:string; path:string; key:string; namespace:string; sensitive:boolean; sha:string; size:number; mirrorPath:string; operationMirrorPath:string }
export async function saveOfficeFile(db:Db,op:OfficeOperation,slot:string,pdf:Buffer,info:Omit<OfficeFile,'id'|'key'|'size'>,sensitive=false):Promise<OfficeFile>{
 await assertOfficeLease(db,op);
 const prior=op.files[slot],sha=digest(pdf);
 if(prior?.sha&&prior.sha!==sha)throw new OfficeConflict('The selected PDF differs from the saved upload. Use Correct completion to change it.','OFFICE_CONFLICT');
 let intent=(op.payload.fileIntents as Record<string,OfficeFileIntent>|undefined)?.[slot];
 if(!intent){
  const path=prior?.key.startsWith('dev:')?prior.key.slice(4):prior?.key.startsWith('https:')?new URL(prior.key).pathname.slice(1):`office-work/${op.id}/${slot}.pdf${sensitive?'.encrypted':''}`;
  const id=prior?.id??(slot==='upload'&&op.payload.previousDocumentId?String(op.payload.previousDocumentId):op.kind==='service'?op.id:crypto.randomUUID());
  const [owner]=await db.query<{llc_name:string}>(op.kind==='service'?'SELECT llc_name FROM service_orders WHERE id=$1':'SELECT llc_name FROM orders WHERE id=$1',[op.target_id]);
  const baseMirror=documentMirrorPath({id,title:info.title,kind:info.kind,llc_name:owner?.llc_name,storage_key:path,mirror_path:prior?.mirrorPath});
  const mirrorPath=prior?.mirrorPath??(op.payload.previousDocumentId?baseMirror.replace(/[^/]+$/,`${id}-${op.id}.pdf${sensitive?'.encrypted':''}`):baseMirror);
  // The token's store id determines the private object origin; never strip an
  // arbitrary caller-supplied URL down to a path and treat it as our store.
  const store=env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([^_]+)_/i)?.[1];
  if(env.BLOB_READ_WRITE_TOKEN&&!store&&!prior?.key.startsWith('https:'))throw new OfficeRecoveryError('The storage namespace is unavailable.','RECOVERY_UNAVAILABLE',503);
  const namespace=prior?.key.startsWith('https:')?new URL(prior.key).origin:env.BLOB_READ_WRITE_TOKEN?`https://${store!.toLowerCase()}.private.blob.vercel-storage.com`:'dev';
  intent={id,path,key:prior?.key??(namespace==='dev'?`dev:${path}`:`${namespace}/${path}`),namespace,sensitive,sha,size:pdf.length,mirrorPath,operationMirrorPath:`/OfficeOperations/${op.id}/${slot}`};
  const [saved]=await db.query<{payload:OfficeOperation['payload']}>(`UPDATE office_operations SET payload=jsonb_set(payload,'{fileIntents}',coalesce(payload->'fileIntents','{}'::jsonb)||jsonb_build_object($3::text,$4::jsonb))
   WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase IN ('open','committed','done') AND NOT(coalesce(payload->'fileIntents','{}'::jsonb) ? $3) RETURNING payload`,[op.id,op.lease,slot,JSON.stringify(intent)]);
  if(!saved)throw new OfficeConflict('The saved upload changed. Reload and retry.');op.payload=saved.payload;
 }
 if(intent.sha!==sha||intent.size!==pdf.length||intent.sensitive!==sensitive||(prior&&(prior.id!==intent.id||prior.key!==intent.key)))throw new OfficeConflict('The selected PDF differs from the saved original.','OFFICE_CONFLICT');
 await ensureDeletionMirror([]);
 const register=async(key:string)=>{
  if(!await recordDocumentCopy({...(op.kind==='service'?{serviceId:op.target_id}:{}),documentId:intent!.id,storageKey:key,mirrorPath:intent!.mirrorPath,extraMirrorPaths:[intent!.operationMirrorPath]}))throw new OfficeConflict('This document was deleted or this attempt was retired.','DOCUMENT_DELETED');
 };
 await register(intent.key);
 const file:OfficeFile=prior??{...info,id:intent.id,key:intent.key,size:intent.size,sha:intent.sha,mirrorPath:intent.mirrorPath};
 let usable=false;try{usable=(await readOfficeFile(file)).equals(pdf);}catch{/* Original supplied bytes are verified above. */}
 if(!usable){
  const key=await putObject(intent.path,sensitive?seal(pdf):pdf,true);
  if(key!==intent.key)throw new OfficeRecoveryError('Storage returned a different object identity.','RECOVERY_IDENTITY_CONFLICT');
  await register(key);
  if(!(await readOfficeFile(file)).equals(pdf))throw new OfficeConflict('Original upload readback failed.','UPLOAD_REQUIRED');
 }
 await assertOfficeLease(db,op);
 await register(file.key);
 await mirrorFile({storageKey:file.key,path:intent.operationMirrorPath});
 await register(file.key);
 if(prior)return prior;
 const [saved]=await db.query<OfficeOperation>(`UPDATE office_operations SET files=files||jsonb_build_object($3::text,$4::jsonb) WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' RETURNING *`,[op.id,op.lease,slot,JSON.stringify(file)]);
 if(!saved)throw new OfficeConflict('Another request resumed this work. Reload and retry.');
 op.files=saved.files;return op.files[slot];
}
/** Explicit corrections supersede an identified revision. Replaying a lost
 * correction response finds its successor; a stale tab cannot supersede that successor. */
export async function correctOfficeOperation(db:Db,target:string,expectedId:string,inputHash:string,payload:Record<string,unknown>):Promise<OfficeOperation>{
 const current=await findOfficeOperation(db,'service',target);
 if(current?.payload.corrects===expectedId){
  if(current.input_hash!==inputHash)throw new OfficeConflict('A different correction is already saved. Reload the service.','OFFICE_CONFLICT');
  return current;
 }
 if(current?.id===expectedId&&['open','retiring'].includes(current.phase))return retireOfficeAttempt(db,current,inputHash,payload);
 const id=crypto.randomUUID();
 const [created]=await db.query<OfficeOperation>(`WITH prior AS (
  SELECT * FROM office_operations WHERE id=$1 AND kind='service' AND target_id=$2 AND phase IN ('open','committed','done') AND (lease_until IS NULL OR lease_until<now()) FOR UPDATE
 ), archived AS (
  UPDATE office_operations o SET kind='service-history:'||o.id::text,phase='superseded',lease=NULL,lease_until=NULL,
   payload=o.payload||jsonb_build_object('previousPhase',o.phase,'supersededBy',$3::text)
  FROM prior WHERE o.id=prior.id RETURNING prior.*
 ), next AS (
  INSERT INTO office_operations(id,kind,target_id,input_hash,payload)
  SELECT $3::uuid,'service',$2::uuid,$4,$5::jsonb||jsonb_build_object('corrects',id,'previousEin',CASE WHEN phase='open' AND payload ? 'previousEin' THEN payload->>'previousEin' ELSE payload->>'assignedEin' END,'previousEins',COALESCE(payload->'previousEins','[]'::jsonb)||jsonb_build_array(payload->>'assignedEin',payload->>'previousEin'),'previousDocumentId',COALESCE(result->>'documentId',payload->>'previousDocumentId')) FROM archived RETURNING *
 ) SELECT * FROM next`,[expectedId,target,id,inputHash,JSON.stringify(payload)]);
 if(!created){
  const next=await findOfficeOperation(db,'service',target);
  if(next?.payload.corrects===expectedId&&next.input_hash===inputHash)return next;
  throw new OfficeConflict('This attempt is still running or has changed. Wait for it to finish, then reload before correcting it.');
 }
 return created;
}
/** The initial Articles and generated Statement are one unpublished intent.
 * Transfer the order reservation and supersede it atomically. Published filing
 * documents continue through the existing replacement workflow. */
export async function correctArticlesOperation(db:Db,target:string,expectedId:string,inputHash:string,payload:Record<string,unknown>){
 const current=await findOfficeOperation(db,'articles',target);
 if(current?.payload.corrects===expectedId){
  if(current.input_hash===inputHash)return current;
  throw new OfficeConflict('A different correction is already saved. Reload the order.','OFFICE_CONFLICT');
 }
 if(current?.id===expectedId&&['open','retiring'].includes(current.phase))return retireOfficeAttempt(db,current,inputHash,payload);
 const id=crypto.randomUUID();
 const [created]=await db.query<OfficeOperation>(`WITH prior AS (
  SELECT * FROM office_operations WHERE id=$1 AND kind='articles' AND target_id=$2 AND phase='open' AND (lease_until IS NULL OR lease_until<now()) FOR UPDATE
 ), owner AS (
  UPDATE orders SET office_upload_id=$3::uuid WHERE id=$2 AND office_upload_id=$1 AND replacing_at IS NULL AND status='filed'
   AND EXISTS(SELECT 1 FROM prior) AND NOT EXISTS(SELECT 1 FROM documents WHERE order_id=$2 AND kind IN ('articles','statement') AND deleted_at IS NULL) RETURNING id
 ), archived AS (
  UPDATE office_operations o SET kind='articles-history:'||o.id::text,phase='superseded',lease=NULL,lease_until=NULL,
   payload=o.payload||jsonb_build_object('previousPhase',o.phase,'supersededBy',$3::text)
  FROM prior WHERE o.id=prior.id AND EXISTS(SELECT 1 FROM owner) RETURNING prior.id
 ), next AS (
  INSERT INTO office_operations(id,kind,target_id,input_hash,payload)
  SELECT $3::uuid,'articles',$2,$4,$5::jsonb||jsonb_build_object('corrects',id) FROM archived RETURNING *
 ) SELECT * FROM next`,[expectedId,target,id,inputHash,JSON.stringify(payload)]);
 if(created)return created;
 const next=await findOfficeOperation(db,'articles',target);
 if(next?.payload.corrects===expectedId&&next.input_hash===inputHash)return next;
 throw new OfficeConflict('The upload is running, has changed, or is already published. Reload the order; published Articles use the document replacement controls.');
}
export interface RetirementClaim {id:string; predecessorId:string; predecessorHash:string; successorId:string; kind:string; inputHash:string; payload:Record<string,unknown>; decisions:Deletion[]}
export async function claimRetirement(db:Db,prior:OfficeOperation,inputHash:string,payload:Record<string,unknown>):Promise<OfficeOperation>{
 const existing=prior.payload.retirement as RetirementClaim|undefined;
 if(existing&&(existing.inputHash!==inputHash||existing.predecessorHash!==prior.input_hash))throw new OfficeConflict('A different replacement is already reserved. Continue that replacement before correcting it.','OFFICE_CONFLICT');
 const decisions:Deletion[]=[];
 if(!existing){
  const slots=new Set([...Object.keys(prior.files),...Object.keys((prior.payload.fileIntents??{}) as Record<string,unknown>),...(prior.kind==='service'?['upload']:['articles',...(prior.payload.weSigned?['statement']:[])])]);
  for(const slot of slots){
   const f=prior.files[slot],intent=(prior.payload.fileIntents as Record<string,OfficeFileIntent>|undefined)?.[slot];
   const keys=f?[f.key]:intent?[intent.key]:[`${env.BLOB_READ_WRITE_TOKEN?'':'dev:'}office-work/${prior.id}/${slot}.pdf`,`${env.BLOB_READ_WRITE_TOKEN?'':'dev:'}office-work/${prior.id}/${slot}.pdf.encrypted`];
   for(const key of keys)decisions.push({storageKey:key,documentId:f?.id??intent?.id??prior.id,mirrorPath:f?.mirrorPath??intent?.mirrorPath??`/OfficeOperations/${prior.id}/${slot}`,extraMirrorPaths:[`/OfficeOperations/${prior.id}/${slot}`],reason:'superseded',requestedAt:new Date().toISOString(),...(prior.kind==='service'?{serviceId:prior.target_id}:{})});
  }
 }
 const claim=existing??{id:crypto.randomUUID(),predecessorId:prior.id,predecessorHash:prior.input_hash,successorId:crypto.randomUUID(),kind:prior.kind,inputHash,payload,decisions};
 const lease=crypto.randomUUID();
 const [held]=await db.query<OfficeOperation>(`WITH eligible AS (
 SELECT * FROM office_operations WHERE id=$1 AND kind=$2 AND input_hash=$3 AND phase IN ('open','retiring')
 AND (lease_until IS NULL OR lease_until<now())
 AND NOT EXISTS(SELECT 1 FROM documents WHERE storage_key=ANY($4::text[])) FOR UPDATE
 ), owner AS (
 UPDATE orders SET office_upload_id=$1 WHERE id=$5 AND replacing_at IS NULL AND status IN ('filed','formed')
 AND (office_upload_id IS NULL OR office_upload_id=$1) AND EXISTS(SELECT 1 FROM eligible) RETURNING id
 ) UPDATE office_operations SET phase='retiring',lease=$6,lease_until=now()+interval '3 minutes',payload=payload||jsonb_build_object('retirement',$7::jsonb)
 WHERE id=$1 AND EXISTS(SELECT 1 FROM eligible) AND ($2='service' OR EXISTS(SELECT 1 FROM owner)) RETURNING *`,
 [prior.id,prior.kind,prior.input_hash,claim.decisions.map(d=>d.storageKey),prior.target_id,lease,JSON.stringify(claim)]);
 if(!held)throw new OfficeConflict('This attempt changed or is still being saved. Reload before correcting it.');
 return held;
}
export async function persistRetirementSet(db:Db,op:OfficeOperation):Promise<void>{
 const claim=op.payload.retirement as RetirementClaim;
 const [held]=await db.query("SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='retiring'",[op.id,op.lease]);
 if(!held)throw new OfficeConflict('The retirement reservation expired. Continue the saved replacement.');
 try{
  await ensureDeletionMirror([]);
  await updateRecoveryJournal(j=>{
   for(const record of claim.decisions){
    const copies=(j.copies??[]).filter(c=>c.storageKey===record.storageKey);
    if(copies.some(c=>c.documentId!==record.documentId||(c.serviceId&&c.serviceId!==record.serviceId)))throw new OfficeRecoveryError('Retirement identity differs from its registered owner.','RECOVERY_IDENTITY_CONFLICT');
    const paths=[...new Set([...(record.extraMirrorPaths??[]),...copies.flatMap(c=>[c.mirrorPath,...c.extraMirrorPaths??[]])])];
    const existing=j.records.find(r=>r.storageKey===record.storageKey);
    if(existing){if(existing.documentId!==record.documentId)throw new OfficeRecoveryError('Retirement identity conflict.','RECOVERY_IDENTITY_CONFLICT');existing.extraMirrorPaths=[...new Set([...(existing.extraMirrorPaths??[]),...paths])];}
    else j.records.push({...record,extraMirrorPaths:paths});
   }
  });
  const j=await readRecoveryJournal();
  if(claim.decisions.some(d=>!j.records.some(r=>r.storageKey===d.storageKey&&r.documentId===d.documentId)))throw Error('Retirement readback missing');
 }catch(e){if(e instanceof OfficeRecoveryError)throw e;throw new OfficeRecoveryError('Retirement could not be saved. Use Continue when recovery storage is available.','RECOVERY_UNAVAILABLE',503);}
}
export async function completeRetirement(db:Db,op:OfficeOperation):Promise<OfficeOperation>{
 const claim=op.payload.retirement as RetirementClaim;
 // The journal readback does not extend this worker's lease. A successor
 // saved by another worker is a fresh replay's result, never this claim's.
 const [held]=await db.query("SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='retiring'",[op.id,op.lease]);
 if(!held)throw new OfficeConflict('The retirement reservation changed. Reload and Continue.');
 const payload={...claim.payload,corrects:op.id,...(op.kind==='service'?{previousEin:op.payload.previousEin??op.payload.assignedEin,previousEins:[...(Array.isArray(op.payload.previousEins)?op.payload.previousEins:[]),op.payload.assignedEin,op.payload.previousEin],previousDocumentId:op.result.documentId??op.payload.previousDocumentId}:{})};
 const [next]=await db.query<OfficeOperation>(`WITH prior AS (
 SELECT * FROM office_operations WHERE id=$1 AND phase='retiring' AND lease=$2 AND lease_until>now() AND payload->'retirement'->>'id'=$3 FOR UPDATE
 ), owner AS (
 UPDATE orders SET office_upload_id=$4 WHERE id=$5 AND office_upload_id=$1 AND EXISTS(SELECT 1 FROM prior) RETURNING id
 ), archived AS (
 UPDATE office_operations SET kind=$6||'-history:'||id::text,phase='superseded',lease=NULL,lease_until=NULL,
 payload=payload||jsonb_build_object('previousPhase','open','supersededBy',$4::text)
 WHERE id=$1 AND EXISTS(SELECT 1 FROM prior) AND ($6='service' OR EXISTS(SELECT 1 FROM owner)) RETURNING id
 ) INSERT INTO office_operations(id,kind,target_id,input_hash,payload)
 SELECT $4,$6,$5,$7,$8::jsonb FROM archived RETURNING *`,[op.id,op.lease,claim.id,claim.successorId,op.target_id,claim.kind,claim.inputHash,JSON.stringify(payload)]);
 if(next)return next;
 throw new OfficeConflict('The retirement reservation changed. Reload and Continue.');
}
export async function retireOfficeAttempt(db:Db,prior:OfficeOperation,inputHash:string,payload:Record<string,unknown>):Promise<OfficeOperation>{
 const held=await claimRetirement(db,prior,inputHash,payload);
 try{await persistRetirementSet(db,held);return await completeRetirement(db,held);}
 catch(e){await releaseOfficeOperation(db,held,e);throw e;}
}
/** Cleanup consumes durable decisions. It never substitutes for recording the
 * whole retirement set before the database predecessor is replaced. */
export async function cleanupSupersededOfficeFiles(db:Db,options:{deadline?:number}={}){
 const rows=await db.query<OfficeOperation>("SELECT * FROM office_operations WHERE phase='superseded' AND payload->>'previousPhase'='open' ORDER BY payload->>'cleanupCheckedAt' NULLS FIRST,created_at,id LIMIT 100");
 if(!rows.length)return;
 const journal=await readRecoveryJournal();
 for(const op of rows){
  if(Date.now()>=(options.deadline??Infinity))break;
  const claim=op.payload.retirement as RetirementClaim|undefined;
  // Old test snapshots without the ordered claim are preserved as test data;
  // cleanup cannot invent the missing authorization to retire their files.
  for(const d of claim?.decisions??[]){
   const record=journal.records.find(r=>r.storageKey===d.storageKey&&r.documentId===d.documentId);
   if(!record)continue;
   if((await db.query('SELECT id FROM documents WHERE storage_key=$1',[record.storageKey])).length)continue;
   await putObject(deletionPath(record.storageKey),Buffer.from(JSON.stringify(record)),true);
   try{await removeStoredFile(record.storageKey);for(const path of new Set([record.mirrorPath,...record.extraMirrorPaths??[]]))await deleteMirror(path);}catch{/* Durable obligation remains for deletion retry. */}
  }
  await db.query("UPDATE office_operations SET payload=payload||jsonb_build_object('cleanupCheckedAt',now()) WHERE id=$1 AND phase='superseded'",[op.id]);
 }
}
export async function finishOfficeOperation(db:Db,op:OfficeOperation,result:Record<string,unknown>){
 const [saved]=await db.query(`UPDATE office_operations SET phase='done',result=$3,lease=NULL,lease_until=NULL,error=NULL WHERE id=$1 AND lease=$2 AND lease_until>now() RETURNING id`,[op.id,op.lease,JSON.stringify(result)]);
 if(!saved)throw new OfficeConflict('Another request resumed this work. Reload and retry.');
}
