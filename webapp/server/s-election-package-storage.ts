import {activeDeadline} from './operation-deadline';
import {getDb,type Db} from './db';
import {env} from './env';
import {seal,unseal,isEncrypted} from './encryption';
import {assertOfficeLease,OfficeConflict,type OfficeOperation} from './office-operation';
import {encryptSecret} from './crypto';
import {putObject,removeStoredFile,readObject,replaceStoredFile} from './storage';
import {requestDocumentDeletion,deletionJournal} from './document-retention';
import {ensureDeletionMirror,readRecoveryJournal} from './backup-deletions';
import {documentMirrorPath,mirrorFile,hashBytes} from './dropbox';
import {beginPackageRecovery,recordPackageUpload,commitPackageRecovery,abortPackageRecovery,cleanupAbortedPackages,finalizeCommittedPackage,recoveryMetadata} from './package-recovery';
/** Retained cleanup intent precedes upload, so even a lost upload response has
 * a known path. Failed transactions cannot retire the previous usable package. */
export async function storeElectionPackage(db:Db,args:{serviceId:string;clientId:string;companyId:string|null;title:string;pdf:Buffer;details:Record<string,unknown>;ssns:string[];retainQuestionnaireNumbers?:boolean;priorDocumentId?:string;officeOperation?:{id:string;lease:string;parent?:boolean}}):Promise<string>{
 if(args.officeOperation){
  // A prior office writer cannot commit after its lease is superseded below.
  await db.query("UPDATE staged_documents SET state='cleanup' WHERE service_order_id=$1 AND state='staged' AND EXISTS(SELECT 1 FROM office_operations WHERE id=$2 AND lease=$3)",[args.serviceId,args.officeOperation.id,args.officeOperation.lease]);
  await cleanupStagedDocuments({serviceId:args.serviceId});
 }
 const id=crypto.randomUUID(),path=`staged/${id}.pdf.encrypted`;
 const key=env.BLOB_READ_WRITE_TOKEN?path:`dev:${path}`;
 await db.query('INSERT INTO staged_documents(id,service_order_id,storage_path,prior_document_id) VALUES($1,$2,$3,$4)',[id,args.serviceId,key,args.priorDocumentId||null]);
 let storedKey:string|null=null;
 try{
  const [service]=await db.query<{llc_name:string;fulfilled_at:unknown}>('SELECT llc_name,fulfilled_at FROM service_orders WHERE id=$1 AND client_id=$2',[args.serviceId,args.clientId]);
  if(!service)throw Error('Package owner missing');
  const createdAt=new Date().toISOString(),mirrorPath=documentMirrorPath({id,title:args.title,kind:'package',llc_name:service.llc_name,storage_key:key});
  await ensureDeletionMirror(await deletionJournal());
  await beginPackageRecovery({id,serviceId:args.serviceId,clientId:args.clientId,companyId:args.companyId,company:service.llc_name,priorDocumentId:args.priorDocumentId||null,storagePath:key,storageKey:key,mirrorPath,title:args.title,sha:hashBytes(args.pdf),size:args.pdf.length,createdAt,fulfilledAt:service.fulfilled_at?new Date(String(service.fulfilled_at)).toISOString():createdAt,details:recoveryMetadata(args.details),metadataVersion:2,state:'intent'});
  const stored=await putObject(path,seal(args.pdf));storedKey=stored;
  await recordPackageUpload(id,stored);
  await mirrorFile({storageKey:stored,path:mirrorPath});
  const [done]=await db.query<{document_id:string}>(`WITH fence AS (SELECT id FROM office_operations WHERE id=$13 AND lease=$14 FOR UPDATE), owner AS (SELECT id FROM service_orders WHERE id=$10 AND client_id=$3 AND (details->>'documentId') IS NOT DISTINCT FROM $11::text AND NOT(details ? 'documentDeletedAt') AND ($13::uuid IS NULL OR EXISTS(SELECT 1 FROM fence)) FOR UPDATE), stage AS (
    UPDATE staged_documents SET state='committed',storage_key=$2 WHERE id=$1 AND state='staged' AND EXISTS(SELECT 1 FROM owner) RETURNING *),
    inserted AS (INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta,mirror_path)
      SELECT id,$3,$4,'package',$5,$2,'application/pdf',$6,$7::jsonb,$12 FROM stage RETURNING id),
    updated AS (UPDATE service_orders SET details=$8::jsonb||jsonb_build_object('documentId',inserted.id),ein_secret=$9,status='fulfilled',fulfilled_at=COALESCE(fulfilled_at,now()),questionnaire_updated_at=now()
      FROM inserted WHERE service_orders.id=$10 AND service_orders.client_id=$3 RETURNING inserted.id)
    , operation AS (UPDATE office_operations SET phase='committed',result=jsonb_build_object('documentId',(SELECT id FROM updated)) WHERE id=$13 AND lease=$14 AND NOT $15::boolean AND EXISTS(SELECT 1 FROM updated) RETURNING id)
    SELECT id AS document_id FROM updated`,[id,stored,args.clientId,args.companyId,args.title,args.pdf.length,JSON.stringify({sensitive:true,serviceOrderId:args.serviceId,recoveryVersion:2}),JSON.stringify(args.details),args.retainQuestionnaireNumbers===false?null:encryptSecret(JSON.stringify(args.ssns)),args.serviceId,args.priorDocumentId||null,mirrorPath,args.officeOperation?.id??null,args.officeOperation?.lease??null,!!args.officeOperation?.parent]);
  if(!done)throw new Error('Package replacement was not committed');
  await commitPackageRecovery(id);
  await cleanupStagedDocuments({serviceId:args.serviceId}).catch(e=>console.error('[s-election] cleanup queued',e));return done.document_id;
 }catch(e){
  // If a response was lost after commit, leave the committed document intact.
  // If this query also fails, the pre-existing intent is recovered by the job.
  await db.query("UPDATE staged_documents SET state='cleanup',error=$2,storage_key=COALESCE(storage_key,$3) WHERE id=$1 AND state='staged'",[id,String(e).slice(0,300),storedKey]).catch(()=>{});
  await cleanupStagedDocuments({serviceId:args.serviceId}).catch(()=>{});throw e;
 }
}
export async function cleanupStagedDocuments(options:{serviceId?:string;limit?:number;deadline?:number}={}):Promise<void>{
 const db=await getDb();
 await ensureDeletionMirror(await deletionJournal());
 // Claim abandoned work before deleting: a late commit then finds no staged
 // row and cannot insert a document referencing the removed object.
 const limit=Math.max(1,Math.min(options.limit??50,100));
 await db.query(`UPDATE staged_documents SET state='cleanup' WHERE id IN (SELECT id FROM staged_documents WHERE state='staged' AND created_at<now()-interval '10 minutes' AND ($1::uuid IS NULL OR service_order_id=$1) ORDER BY created_at,id LIMIT $2)`,[options.serviceId??null,limit]);
 const rows=await db.query<{id:string;storage_path:string;storage_key:string|null;prior_document_id:string|null;state:string;service_order_id:string}>(`SELECT * FROM staged_documents WHERE state IN ('cleanup','committed') AND ($1::uuid IS NULL OR service_order_id=$1) ORDER BY cleanup_checked_at NULLS FIRST,created_at,id LIMIT $2`,[options.serviceId??null,limit]);
 for(const r of rows)try{
  if(Date.now()>=Math.min(options.deadline??Infinity,activeDeadline()))break;
  if(r.state==='cleanup'){
   await abortPackageRecovery(r.id);
   await removeStoredFile(r.storage_key||r.storage_path);
   // Retain the path: a delayed provider upload is removed on later sweeps too.
   await db.query('UPDATE staged_documents SET error=NULL WHERE id=$1',[r.id]);
  }else {
   await finalizeCommittedPackage(db,r.id);
   if(r.prior_document_id){const [so]=await db.query<{client_id:string}>('SELECT client_id FROM service_orders WHERE id=$1',[r.service_order_id]);if(!so)throw new Error('Package owner missing');await requestDocumentDeletion(r.prior_document_id,so.client_id,'superseded');}
   await db.query("UPDATE staged_documents SET state='retired',error=NULL WHERE id=$1 AND state='committed'",[r.id]);
  }
 }catch(e){await db.query('UPDATE staged_documents SET error=$2 WHERE id=$1',[r.id,String(e).slice(0,300)]);}
 finally{await db.query('UPDATE staged_documents SET cleanup_checked_at=now() WHERE id=$1',[r.id]);}
 if(Date.now()<Math.min(options.deadline??Infinity,activeDeadline()))await cleanupAbortedPackages(options.serviceId,limit);
}

/** Metadata is not proof of delivery. Verify the package store as well as the
 * shared office-upload path, and repair only the same intended package. */
export async function verifyOfficeElectionPackage(db:Db,op:OfficeOperation,serviceId:string,clientId:string,original:Buffer|null):Promise<void>{
 await assertOfficeLease(db,op);
 const id=String(op.result.documentId||'');
 const [d]=await db.query<{storage_key:string;deleted_at:unknown}>(`SELECT d.storage_key,d.deleted_at FROM documents d JOIN service_orders so ON so.id=$2 AND so.client_id=d.client_id WHERE d.id=$1 AND d.client_id=$3 AND so.details->>'documentId'=d.id::text AND NOT(so.details ? 'documentDeletedAt')`,[id,serviceId,clientId]);
 const journal=await readRecoveryJournal(),record=journal.packages.find(p=>p.id===id&&p.serviceId===serviceId&&p.clientId===clientId);
 if(!d||d.deleted_at||journal.records.some(r=>r.documentId===id))throw new OfficeConflict('This package was deleted or replaced. Reload the service.','DOCUMENT_DELETED');
 if(!record)throw new OfficeConflict('The saved package cannot be verified. Use Correct completion to replace it.','UPLOAD_REQUIRED');
 const valid=async()=>{try{const raw=await readObject(d.storage_key);if(!raw||!isEncrypted(raw))return false;const plain=unseal(raw);return plain.length===record.size&&hashBytes(plain)===record.sha;}catch{return false;}};
 if(!await valid()){
  if(!original||original.length!==record.size||hashBytes(original)!==record.sha)throw new OfficeConflict('The saved package is missing or damaged. Attach the original PDF and retry.','UPLOAD_REQUIRED');
  await assertOfficeLease(db,op);
  if((await readRecoveryJournal()).records.some(r=>r.documentId===id))throw new OfficeConflict('This package was deleted. Reload the service.','DOCUMENT_DELETED');
  await replaceStoredFile(d.storage_key,seal(original));
  if(!await valid())throw new OfficeConflict('The uploaded package could not be verified. Retry.','UPLOAD_REQUIRED');
 }
 await assertOfficeLease(db,op);
 if((await readRecoveryJournal()).records.some(r=>r.documentId===id))throw new OfficeConflict('This package was deleted. Reload the service.','DOCUMENT_DELETED');
}
