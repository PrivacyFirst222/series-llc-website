import {createHash} from 'node:crypto';
import type {Db} from './db';
import {env} from './env';
import {putObject,readObject,removeStoredFile} from './storage';
import {documentMirrorPath} from './dropbox';
import {ensureDeletionMirror,recordDocumentCopy,readRecoveryJournal,RecoveryRecordError} from './backup-deletions';
import {OfficeRecoveryError} from './office-recovery-sources';
import {notifyDocument} from './office-notifications';

export class DocumentUploadError extends Error {
 constructor(message:string,public code:string,public status:404|409|503){super(message);}
}
interface Upload {
 id:string;clientId:string;orderId:string;kind:'package'|'legal_mail';title:string;
 receivedOn:string;notify:boolean;bytes:Buffer;llcName:string;
}
interface Saved {
 id:string;client_id:string;order_id:string;kind:string;title:string;storage_key:string;
 deleted_at:unknown;notice_status:string|null;meta:{uploadSubmission?:{version:number;fingerprint:string;sha:string}};
}
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const changed=()=>new DocumentUploadError('This upload already saved different information. Retry the original upload or choose New upload.','DOCUMENT_CHANGED',409);
const deleted=()=>new DocumentUploadError('This document has been deleted.','NOT_FOUND',404);

/** One tab submission owns one document primary key. Only INSERT RETURNING
 * proves authority to start its notice; a replay never calls the resend helper. */
export async function saveDocumentSubmission(db:Db,input:Upload){
 const {id,clientId,orderId,kind,title,receivedOn,notify,bytes,llcName}=input;
 const verifyRecovery=async<T>(phase:string,read:()=>Promise<T>):Promise<T>=>{
  try{return await read();}catch(error){
   if(error instanceof OfficeRecoveryError||error instanceof DocumentUploadError)throw error;
   const needsRepair=error instanceof RecoveryRecordError;
   console.error('[document-upload] recovery verification failed',{phase,category:needsRepair?'record':'unknown'});
   const message=needsRepair
    ?"The backup records need repair, so this upload's result is not confirmed. Contact technical support before retrying; waiting alone will not fix this. Keep this submission and the original PDF. After repair, retry the same submission. Check Document notices before separately resending an email."
    :"The backup protection check could not be completed, so this upload's result is not confirmed. Keep this submission and contact technical support. After the problem is resolved, retry the same PDF. Do not choose New upload for this retry. Check Document notices before separately resending an email.";
   throw new DocumentUploadError(message+(kind==='legal_mail'?' If this is urgent legal mail, contact the client directly now. Keep the PDF for upload after the problem is resolved.':''),'RECOVERY_UNAVAILABLE',503);
  }
 };
 const sha=hash(bytes),fingerprint=hash(JSON.stringify({clientId,orderId,kind,title,receivedOn,notify,sha}));
 const lookup=async()=> (await db.query<Saved>('SELECT * FROM documents WHERE id=$1',[id]))[0];
 const validate=(row:Saved)=>{
  if(row.deleted_at)throw deleted();
  if(row.client_id!==clientId||row.order_id!==orderId||row.kind!==kind||row.title!==title||row.meta?.uploadSubmission?.version!==1||row.meta.uploadSubmission.fingerprint!==fingerprint)throw changed();
 };
 let saved=await lookup();if(saved)validate(saved);
 const path=`document-uploads/${clientId}/${id}/${sha}.pdf`;
 const store=env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([^_]+)_/i)?.[1];
 if(env.BLOB_READ_WRITE_TOKEN&&!store)throw new DocumentUploadError('The storage namespace is unavailable. Retry after storage is restored.','RECOVERY_UNAVAILABLE',503);
 const key=env.BLOB_READ_WRITE_TOKEN?`https://${store!.toLowerCase()}.private.blob.vercel-storage.com/${path}`:`dev:${path}`;
 if(saved&&saved.storage_key!==key)throw changed();
 // Conflicting contenders have different paths; neither can overwrite the
 // winner's bytes or reserve its mirror destination.
 const mirrorPath=documentMirrorPath({id,title,kind,llc_name:llcName,storage_key:key}).replace(`/${id.slice(0,8)}-`,`/${id}-`).replace(/\.pdf$/,`-${sha}.pdf`);
 const assertLive=async()=>{
  await verifyRecovery('journal',()=>ensureDeletionMirror([]));
  if(!await verifyRecovery('copy',()=>recordDocumentCopy({documentId:id,storageKey:key,mirrorPath})))throw deleted();
  const row=await lookup();if(row)validate(row);
 };
 await assertLive();
 const original=await readObject(key);
 if(!original?.equals(bytes)){
  const written=await putObject(path,bytes,true);
  if(written!==key||!(await readObject(key))?.equals(bytes))throw new DocumentUploadError('The saved upload could not be verified. Retry the original PDF.','UPLOAD_REQUIRED',409);
 }
 await assertLive();
 let inserted=false;
 if(!saved){
  try{
   const rows=await db.query<Saved>(`INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta,notice_status,mirror_path)
    VALUES($1,$2,$3,$4,$5,$6,'application/pdf',$7,$8::jsonb,$9,$10)
    ON CONFLICT(id) DO NOTHING RETURNING *`,[id,clientId,orderId,kind,title,key,bytes.length,JSON.stringify({...(kind==='legal_mail'?{receivedOn}:{}),...(notify?{noticeKind:'document'}:{}),uploadSubmission:{version:1,fingerprint,sha}}),notify?'pending':null,mirrorPath]);
   inserted=rows.length===1;saved=rows[0];
  }catch(error){
   // A connection failure can follow a committed INSERT. Its saved receipt
   // can be returned, but it cannot authorize a second initial send.
   saved=await lookup();if(!saved)throw error;
  }
  saved??=await lookup();
 }
 if(!saved)throw new DocumentUploadError('The upload result is not available. Retry this same submission.','RECOVERY_UNAVAILABLE',503);
 try{validate(saved);}catch(error){
  // A proven other-key winner cannot use these candidate bytes. Ambiguous
  // results and same-key contenders are deliberately never cleaned here.
  if(saved.storage_key!==key&&saved.client_id===clientId)await removeStoredFile(key).catch(()=>{});
  throw error;
 }
 await assertLive();
 if(inserted&&notify)await notifyDocument(id);
 const result=await lookup();if(!result)throw deleted();validate(result);
 const journal=await verifyRecovery('final',()=>readRecoveryJournal());
 if(journal.records.some(r=>r.storageKey===key||(r.documentId===id&&r.reason!=='superseded')))throw deleted();
 return {id,notified:result.notice_status==='sent',noticeStatus:result.notice_status};
}
