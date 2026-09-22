import {getDb,type Db} from './db';
import {env} from './env';
import {seal} from './encryption';
import {encryptSecret} from './crypto';
import {putObject,removeStoredFile} from './storage';
import {requestDocumentDeletion} from './document-retention';
/** Retained cleanup intent precedes upload, so even a lost upload response has
 * a known path. Failed transactions cannot retire the previous usable package. */
export async function storeElectionPackage(db:Db,args:{serviceId:string;clientId:string;companyId:string|null;title:string;pdf:Buffer;details:Record<string,unknown>;ssns:string[];priorDocumentId?:string}):Promise<string>{
 const id=crypto.randomUUID(),path=`staged/${id}.pdf.encrypted`;
 const key=env.BLOB_READ_WRITE_TOKEN?path:`dev:${path}`;
 await db.query('INSERT INTO staged_documents(id,service_order_id,storage_path,prior_document_id) VALUES($1,$2,$3,$4)',[id,args.serviceId,key,args.priorDocumentId||null]);
 try{
  const stored=await putObject(path,seal(args.pdf));
  const [done]=await db.query<{document_id:string}>(`WITH owner AS (SELECT id FROM service_orders WHERE id=$10 AND client_id=$3 AND (details->>'documentId') IS NOT DISTINCT FROM $11::text FOR UPDATE), stage AS (
    UPDATE staged_documents SET state='committed',storage_key=$2 WHERE id=$1 AND state='staged' AND EXISTS(SELECT 1 FROM owner) RETURNING *),
    inserted AS (INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta)
      SELECT id,$3,$4,'package',$5,$2,'application/pdf',$6,$7::jsonb FROM stage RETURNING id),
    updated AS (UPDATE service_orders SET details=$8::jsonb||jsonb_build_object('documentId',inserted.id),ein_secret=$9,status='fulfilled',fulfilled_at=COALESCE(fulfilled_at,now()),questionnaire_updated_at=now()
      FROM inserted WHERE service_orders.id=$10 AND service_orders.client_id=$3 RETURNING inserted.id)
    SELECT id AS document_id FROM updated`,[id,stored,args.clientId,args.companyId,args.title,args.pdf.length,JSON.stringify({sensitive:true,serviceOrderId:args.serviceId}),JSON.stringify(args.details),encryptSecret(JSON.stringify(args.ssns)),args.serviceId,args.priorDocumentId||null]);
  if(!done)throw new Error('Package replacement was not committed');
  await cleanupStagedDocuments().catch(e=>console.error('[s-election] cleanup queued',e));return done.document_id;
 }catch(e){
  // If a response was lost after commit, leave the committed document intact.
  // If this query also fails, the pre-existing intent is recovered by the job.
  await db.query("UPDATE staged_documents SET state='cleanup',error=$2 WHERE id=$1 AND state='staged'",[id,String(e).slice(0,300)]).catch(()=>{});
  await cleanupStagedDocuments().catch(()=>{});throw e;
 }
}
export async function cleanupStagedDocuments():Promise<void>{
 const db=await getDb();
 // Claim abandoned work before deleting: a late commit then finds no staged
 // row and cannot insert a document referencing the removed object.
 await db.query("UPDATE staged_documents SET state='cleanup' WHERE state='staged' AND created_at<now()-interval '10 minutes'");
 const rows=await db.query<{id:string;storage_path:string;storage_key:string|null;prior_document_id:string|null;state:string;service_order_id:string}>("SELECT * FROM staged_documents WHERE state IN ('cleanup','committed')");
 for(const r of rows)try{
  if(r.state==='cleanup'){
   await removeStoredFile(r.storage_key||r.storage_path);
   // Retain the path: a delayed provider upload is removed on later sweeps too.
   await db.query('UPDATE staged_documents SET error=NULL WHERE id=$1',[r.id]);
  }else {
   if(r.prior_document_id){const [so]=await db.query<{client_id:string}>('SELECT client_id FROM service_orders WHERE id=$1',[r.service_order_id]);if(!so)throw new Error('Package owner missing');await requestDocumentDeletion(r.prior_document_id,so.client_id);}
   await db.query("UPDATE staged_documents SET state='retired',error=NULL WHERE id=$1 AND state='committed'",[r.id]);
  }
 }catch(e){await db.query('UPDATE staged_documents SET error=$2 WHERE id=$1',[r.id,String(e).slice(0,300)]);}
}
