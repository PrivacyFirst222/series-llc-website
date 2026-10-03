import type {Db} from './db';
import {officeHash,readOfficeFile,type OfficeOperation} from './office-operation';
import {readObject,replaceStoredFile,storageWasDeleted} from './storage';
import {isEncrypted,unseal,encryptionKeys,encryptedKeyId} from './encryption';
import {hashBytes,readMirror,compareWriteMirror,readMirrorVersion,deleteMirror} from './dropbox';
import {readRecoveryJournal,recordDocumentCopy} from './backup-deletions';
import {OfficeRecoveryError,officeFileIdentities,officeIdentityDeleted,collectOfficeRecoverySources,type OfficeIdentity,type OfficeTables} from './office-recovery-sources';
export {OfficeRecoveryError} from './office-recovery-sources';

export async function officeRecoveryTables(db:Db):Promise<OfficeTables> {
 const [r]=await db.query<{tables:OfficeTables}>(`SELECT json_build_object(
  'clients',(SELECT coalesce(json_agg(c),'[]') FROM (SELECT id,name,email FROM clients) c),
  'orders',(SELECT coalesce(json_agg(o),'[]') FROM orders o),
  'service_orders',(SELECT coalesce(json_agg(s),'[]') FROM service_orders s),
  'documents',(SELECT coalesce(json_agg(d),'[]') FROM documents d),
  'office_operations',(SELECT coalesce(json_agg(w),'[]') FROM office_operations w)) AS tables`);
 return r.tables;
}
const unavailable=(cause:unknown):never=>{const error=new OfficeRecoveryError('A recovery source is unavailable. Retry after storage access is restored. '+String(cause).slice(0,120),'RECOVERY_UNAVAILABLE',503);if(typeof (cause as {retryAfterMs?:unknown})?.retryAfterMs==='number')error.retryAfterMs=(cause as {retryAfterMs:number}).retryAfterMs;throw error;};
/** A corrupt envelope is damage; a missing decryption key is unavailable,
 * never evidence that an original has vanished. */
export function verifiedOfficeBytes(i:OfficeIdentity,raw:Buffer|null):Buffer|null {
 if(!raw)return null;
 if(i.sensitive&&!isEncrypted(raw))return null;
 if(isEncrypted(raw)) {
  let key:string|null;try{key=encryptedKeyId(raw);}catch{return null;}
  let keys:ReturnType<typeof encryptionKeys>;try{keys=encryptionKeys();}catch(e){return unavailable(e);}
  if(!key||!keys.keys[key])return unavailable('The original encryption key is missing.');
 }
 let plain:Buffer;try{plain=isEncrypted(raw)?unseal(raw):raw;}catch{return null;}
 return plain.length===i.file.size&&hashBytes(plain)===i.file.sha?plain:null;
}
export async function assertOfficeFileLive(i:OfficeIdentity) {
 try {if(officeIdentityDeleted(i,await readRecoveryJournal())||await storageWasDeleted(i.file.key))throw new OfficeRecoveryError('This document was deleted or this upload was retired.','DOCUMENT_DELETED');}
 catch(e){if(e instanceof OfficeRecoveryError)throw e;return unavailable(e);}
}
export async function recoverOfficeFile(i:OfficeIdentity,options:{supplied?:Buffer;repair?:boolean;documents?:OfficeTables['documents']}={}):Promise<{plain:Buffer;raw:Buffer;source:string}> {
 await assertOfficeFileLive(i);
 if(options.supplied&&(options.supplied.length!==i.file.size||hashBytes(options.supplied)!==i.file.sha))throw new OfficeRecoveryError('Select the original PDF. This file does not match the saved original.','OFFICE_CONFLICT');
 let journal;try{journal=await readRecoveryJournal();}catch(e){return unavailable(e);}
 const sources=collectOfficeRecoverySources(i,journal,options.documents);
 let raw:Buffer|null;try{raw=await readObject(i.file.key);}catch(e){return unavailable(e);}
 const plain=verifiedOfficeBytes(i,raw);
 if(plain){await assertOfficeFileLive(i);return {plain,raw:raw!,source:i.file.key};}
 let sourceError:unknown;
 for(const path of sources) {
  try{raw=await readMirror(path);}catch(e){sourceError=e;continue;}
  const original=verifiedOfficeBytes(i,raw);
  if(!original)continue;
  await assertOfficeFileLive(i);
  if(options.repair!==false) {
   try{await replaceStoredFile(i.file.key,raw!);}catch(e){return unavailable(e);}
   await assertOfficeFileLive(i);
   let stored;try{stored=await readObject(i.file.key);}catch(e){return unavailable(e);}
   if(!verifiedOfficeBytes(i,stored))return unavailable('Original readback failed.');
  }
  return {plain:original,raw:raw!,source:path};
 }
 if(sourceError)return unavailable(sourceError);
 throw new OfficeRecoveryError('Select the original PDF. No verified original was found in registered controlled sources.','UPLOAD_REQUIRED');
}
export async function claimOfficeVerification(db:Db,op:OfficeOperation):Promise<OfficeOperation> {
 const lease=crypto.randomUUID();
 const [held]=await db.query<OfficeOperation>(`UPDATE office_operations SET lease=$2,lease_until=now()+interval '3 minutes'
 WHERE id=$1 AND input_hash=$3 AND (phase IN ('committed','done') OR (phase='superseded' AND payload->>'previousPhase' IN ('committed','done')))
 AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[op.id,lease,op.input_hash]);
 if(!held)throw new OfficeRecoveryError('Another request is using this document. Wait, then retry.','OFFICE_BUSY');
 return held;
}
export async function verifyOfficeDelivery(db:Db,op:OfficeOperation,supplied?:{slot:string;bytes:Buffer}):Promise<void> {
 const tables=await officeRecoveryTables(db),identities=officeFileIdentities(tables,{includeUnknown:true});
 // Preserve the explicitly retained legacy assurance level. An exact supplied
 // immutable input may replay an older record without per-file digests. This
 // neither invents an original hash nor permits automatic history-gap recovery.
 const legacyInput=!!supplied&&(op.kind==='service'
  ?officeHash({pdf:supplied.bytes.toString('base64'),assignedEin:String(op.payload.assignedEin||''),titleOverride:String(op.payload.titleOverride||''),notify:Boolean(op.payload.notify)})===op.input_hash
  :op.kind==='articles'&&!op.payload.existingId&&officeHash({documentNumber:String(op.payload.documentNumber||''),pdf:supplied.bytes.toString('base64')})===op.input_hash);
 for(const slot of ['articles','statement','upload']) {
  const f=op.files[slot];if(!f)continue;
  const i=identities.get(f.key);
  if(!i||(!f.sha&&!legacyInput))throw new OfficeRecoveryError('The original document fingerprint is unavailable. Select the original PDF.','UPLOAD_REQUIRED');
  // Reject changed user input before automatically repairing either pair member.
  if(supplied&&supplied.slot===slot&&((f.sha&&hashBytes(supplied.bytes)!==f.sha)||supplied.bytes.length!==f.size))throw new OfficeRecoveryError('Select the original PDF.','OFFICE_CONFLICT');
 }
 for(const slot of ['articles','statement','upload']) {
  const f=op.files[slot];if(!f)continue;
  const [held]=await db.query('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()',[op.id,op.lease]);
  if(!held)throw new OfficeRecoveryError('The recovery reservation expired. Retry.','OFFICE_BUSY');
  const identity=identities.get(f.key);
  if(identity?.file.sha)await recoverOfficeFile(identity,{documents:tables.documents});
  else{
   // Caller has already fenced and verified the full immutable request input.
   // Keep the historical read check for legacy generated members; no metadata
   // is changed and no newly observed digest becomes their original identity.
   await assertOfficeFileLive(identity!);
   const plain=await readOfficeFile(f);
   await assertOfficeFileLive(identity!);
   if(supplied?.slot===slot&&!plain.equals(supplied.bytes))throw new OfficeRecoveryError('Select the original PDF.','UPLOAD_REQUIRED');
  }
 }
 const [held]=await db.query('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()',[op.id,op.lease]);
 if(!held)throw new OfficeRecoveryError('The recovery reservation expired before verification completed. Retry.','OFFICE_BUSY');
}
/** One owned immutable file revision, shared by every snapshot. */
export async function ensureOfficeRecoveryCopy(i:OfficeIdentity):Promise<void> { await ensureOfficeCopyAt(i,i.recoveryPath); }
export async function ensureOfficeMirrorCopy(i:OfficeIdentity,path=i.file.mirrorPath??`/OfficeOperations/${i.operationId}/${i.slot}`):Promise<{sha:string;copied:boolean}> { return ensureOfficeCopyAt(i,path); }
async function ensureOfficeCopyAt(i:OfficeIdentity,path:string):Promise<{sha:string;copied:boolean}> {
 await assertOfficeFileLive(i);
 const copy={documentId:i.file.id,storageKey:i.file.key,...(i.serviceId?{serviceId:i.serviceId}:{}),mirrorPath:i.file.mirrorPath??`/OfficeOperations/${i.operationId}/${i.slot}`,extraMirrorPaths:[path,i.recoveryPath,`/OfficeOperations/${i.operationId}/${i.slot}`]};
 try{if(!await recordDocumentCopy(copy))throw new OfficeRecoveryError('This document was deleted.','DOCUMENT_DELETED');}catch(e){if(e instanceof OfficeRecoveryError)throw e;return unavailable(e);}
 let before;try{before=await readMirrorVersion(path);}catch(e){return unavailable(e);}
 if(verifiedOfficeBytes(i,before?.data??null)){await assertOfficeFileLive(i);return {sha:hashBytes(before!.data),copied:false};}
 const original=await recoverOfficeFile(i);
 await assertOfficeFileLive(i);
 try{await compareWriteMirror(path,original.raw,before?.rev??null);}catch(e){return unavailable(e);}
 try{await assertOfficeFileLive(i);}catch(e){
  if(e instanceof OfficeRecoveryError&&e.code==='DOCUMENT_DELETED'){
   // Registration preceded this write. A failed immediate removal is still
   // owed by the durable deletion journal; preserve the deletion refusal.
   try{await deleteMirror(path);}catch{/* ordinary deletion retry owns cleanup */}
  }
  throw e;
 }
 let saved;try{saved=await readMirrorVersion(path);}catch(e){return unavailable(e);}
 if(!verifiedOfficeBytes(i,saved?.data??null))return unavailable('The recovery copy could not be verified.');
 return {sha:hashBytes(saved!.data),copied:true};
}
