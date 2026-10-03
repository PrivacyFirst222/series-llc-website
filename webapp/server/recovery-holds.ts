import {createHash} from 'node:crypto';
import type {Db} from './db';
import {readRecoveryJournal,appendDeletionMirror} from './backup-deletions';
import {verifyPackageCopy,commitPackageRecovery,abortPackageRecovery,type PackageRecord,recoveryMetadata,selectPackageMetadata} from './package-recovery';
import {replaceStoredFile} from './storage';
import {retryDocumentDeletions,requestDocumentDeletion,registerDeletion} from './document-retention';

interface Hold {id:string;service_id:string;client_id:string;record:PackageRecord;reason:string;status:string;acknowledged_at:unknown}
export async function heldPackageManifest(db:Db){
 const rows=await db.query<Hold>("SELECT id,service_id,client_id,record,reason,status,acknowledged_at FROM recovery_holds WHERE status='held' ORDER BY id");
 const content=rows.map(({acknowledged_at,...row})=>row);
 return {packages:rows,sha256:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}
export async function acknowledgeHeldPackages(db:Db,sha:string,operator:string){
 if(!operator.trim())throw Error('Name the operator acknowledging the held packages');
 const manifest=await heldPackageManifest(db);if(manifest.sha256!==sha)throw Error('Held-package list changed; inspect and acknowledge the current manifest');
 for(const h of manifest.packages)await db.query("UPDATE recovery_holds SET acknowledged_at=now(),acknowledged_by=$2 WHERE id=$1 AND status='held' AND record=$3::jsonb AND reason=$4",[h.id,operator,JSON.stringify(h.record),h.reason]);
 return {acknowledged:manifest.packages.length,sha256:sha};
}
/** Evidence is an operator-verified record of the original transaction or
 * authenticated client instruction. A PDF/name/email match is insufficient.
 * Existing account/service UUIDs must additionally match the independent journal.
 */
export interface HoldEvidence {documentId:string;serviceId:string;clientId:string;companyId:string|null;sha:string;decision:'committed'|'aborted-before-commit'|'client-deletion';authority:'database-transaction'|'verified-client-request';reference:string;operator:string}
export async function reconcileHeldPackage(db:Db,id:string,evidence:HoldEvidence){
 const [h]=await db.query<Hold>("SELECT * FROM recovery_holds WHERE id=$1 AND status='held'",[id]);if(!h)throw Error('Held package not found');
 const j=await readRecoveryJournal(),r=j.packages.find(p=>p.id===id);if(!r)throw Error('Independent package record missing');
 if(!evidence.operator?.trim()||!evidence.reference?.trim()||evidence.documentId!==r.id||evidence.serviceId!==r.serviceId||evidence.clientId!==r.clientId||evidence.companyId!==r.companyId||evidence.sha!==r.sha)throw Error('Evidence does not establish the exact held package identity');
 let cleanupPending=0;
 if(evidence.decision==='client-deletion'){
  if(evidence.authority!=='verified-client-request')throw Error('A verified client deletion instruction is required');
  // Retain the verified instruction before any durable deletion. Registration
  // makes the hold terminal, and a lost reply must not lose its authorization.
  const recorded=await db.query("UPDATE recovery_holds SET evidence=COALESCE(evidence,'{}'::jsonb)||$2::jsonb WHERE id=$1 AND status='held' RETURNING id",[id,JSON.stringify(evidence)]);
  if(!recorded.length)throw Error('Held package changed before its deletion instruction was recorded');
  await appendDeletionMirror({storageKey:r.storageKey,documentId:r.id,mirrorPath:r.mirrorPath,requestedAt:new Date().toISOString(),reason:'client'});
  const journal=await readRecoveryJournal(),covered=new Set(journal.packages.filter(p=>p.serviceId===r.serviceId).map(p=>p.id));
  covered.add(r.id);
  // Every durable decision becomes terminal even if physical cleanup times out.
  for(const decision of journal.records.filter(d=>covered.has(d.documentId)))await registerDeletion(decision);
  cleanupPending=(await retryDocumentDeletions({documentIds:[...covered],budgetMs:20000})).pending;
 }else{
  if(evidence.authority!=='database-transaction')throw Error('Original database transaction evidence is required; package presence alone proves no commit');
  if(evidence.decision==='aborted-before-commit'){
   if(r.state!=='intent'||j.packages.some(p=>p.priorDocumentId===id&&p.state==='committed'))throw Error('Committed package cannot be declared abandoned');
   await abortPackageRecovery(id,evidence);
   await db.query("UPDATE staged_documents SET state='cleanup' WHERE id=$1 AND state='held'",[id]);
  }else if(evidence.decision==='committed'){
   if(r.state==='aborted'||j.records.some(d=>d.documentId===id||d.reason!=='superseded'&&d.documentId===r.priorDocumentId)||j.packages.some(p=>p.serviceId===r.serviceId&&p.priorDocumentId===id&&p.state==='committed'))throw Error('Deleted, aborted or superseded package cannot be attached');
   const [owner]=await db.query(`SELECT s.id,s.details FROM service_orders s JOIN clients c ON c.id=s.client_id WHERE s.id=$1 AND s.client_id=$2 AND s.type='s-election' AND s.formation_order_id IS NOT DISTINCT FROM $3::uuid AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.id=$3 AND o.client_id=$2))`,[r.serviceId,r.clientId,r.companyId]);
   if(!owner)throw Error('Restore the authoritative account, company and service records first; names and email addresses cannot establish ownership');
   const current=(owner.details??{}) as Record<string,unknown>;
   if(current.documentDeletedAt||current.documentId&&![r.id,r.priorDocumentId].includes(String(current.documentId)))throw Error('Current service document conflicts with held package');
   const bytes=await verifyPackageCopy(r);await replaceStoredFile(r.storageKey,bytes);
   const details=selectPackageMetadata(r,current);
   const saved=await db.query(`WITH saved AS (INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta,created_at,mirror_path)
    SELECT $1::uuid,$2::uuid,$3::uuid,'package',$4,$5,'application/pdf',$6::bigint,$7::jsonb,$8::timestamptz,$9
    WHERE NOT EXISTS(SELECT 1 FROM document_deletions WHERE document_id=$1::uuid)
    ON CONFLICT(id) DO UPDATE SET storage_key=EXCLUDED.storage_key WHERE documents.deleted_at IS NULL AND documents.client_id=EXCLUDED.client_id AND documents.order_id IS NOT DISTINCT FROM EXCLUDED.order_id RETURNING id)
    UPDATE service_orders SET status='fulfilled',fulfilled_at=COALESCE(service_orders.fulfilled_at,$10::timestamptz),ein_secret=NULL,details=$11::jsonb||jsonb_build_object('documentId',saved.id) FROM saved WHERE service_orders.id=$12
    AND NOT EXISTS(SELECT 1 FROM document_deletions WHERE document_id=$1::uuid) RETURNING service_orders.id`,[r.id,r.clientId,r.companyId,r.title,r.storageKey,r.size,JSON.stringify({sensitive:true,serviceOrderId:r.serviceId,recoveryVersion:2}),r.createdAt,r.mirrorPath,r.fulfilledAt,JSON.stringify(details),r.serviceId]);
   if(!saved.length)throw Error('Document ownership changed; the package remains held');
   await commitPackageRecovery(id,evidence);
   if(r.priorDocumentId)await requestDocumentDeletion(r.priorDocumentId,r.clientId,'superseded');
   await db.query("UPDATE staged_documents SET state='retired' WHERE id=$1 AND state='held'",[id]);
  }else throw Error('Unknown reconciliation decision');
 }
 const transitioned=await db.query("UPDATE recovery_holds SET status=$2,evidence=$3 WHERE id=$1 AND status='held' RETURNING id",[id,evidence.decision==='client-deletion'?'deleted':evidence.decision==='committed'?'reconciled':'aborted',JSON.stringify(evidence)]);
 if(evidence.decision==='committed'&&!transitioned.length)throw Error('The package was deleted during reconciliation; it has not been reattached');
 await db.query(`UPDATE service_orders s SET details=CASE
  WHEN EXISTS(SELECT 1 FROM recovery_holds h WHERE h.service_id=s.id AND h.status='held')
  THEN COALESCE(s.details,'{}'::jsonb)||jsonb_build_object('recoveryHold',true)
  ELSE COALESCE(s.details,'{}'::jsonb)-'recoveryHold' END
  WHERE s.id=$1`,[r.serviceId]);
 return {id,decision:evidence.decision,cleanupPending};
}

/** Restore missing ownership rows only from an operator-verified original DB
 * export. Never look up/attach an account by name or email. Existing rows are
 * checked and preserved. This is a resumable import, not a general SQL console. */
export async function restoreHeldOwnerRecords(db:Db,id:string,input:{client?:Record<string,unknown>;company?:Record<string,unknown>;service:Record<string,unknown>;reference:string;operator:string}){
 const [h]=await db.query<Hold>("SELECT * FROM recovery_holds WHERE id=$1 AND status='held'",[id]);
 const record=(await readRecoveryJournal()).packages.find(p=>p.id===id);
 if(!h||!record||!input.operator?.trim()||!input.reference?.trim())throw Error('Held package and verified original database export reference are required');
 const service=input.service;
 if(!service||service.id!==record.serviceId||service.client_id!==record.clientId||service.formation_order_id!==record.companyId||service.type!=='s-election')throw Error('Original service identity does not match the independent package record');
 if(input.client&&input.client.id!==record.clientId)throw Error('Original client UUID does not match');
 if(input.company&&(input.company.id!==record.companyId||input.company.client_id!==record.clientId))throw Error('Original company ownership does not match');
 const clean=structuredClone(input);
 clean.service.ein_secret=null;
 clean.service.details={...recoveryMetadata((service.details??{}) as Record<string,unknown>),recoveryHold:true};
 // The package is attached only by the separately checked reconcile operation.
 clean.service.status='awaiting_info';clean.service.fulfilled_at=service.fulfilled_at??null;
 const rows:[string,Record<string,unknown>|undefined][]=[['clients',clean.client],['orders',clean.company],['service_orders',clean.service]];
 const prepared:{table:string;row:Record<string,unknown>;cols:string[]}[]=[];
 for(const [table,row] of rows){
  if(!row)continue;
  const valid=new Set((await db.query<{column_name:string}>('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table])).map(x=>x.column_name));
  const cols=Object.keys(row);if(!cols.length||cols.some(k=>!valid.has(k)||!/^\w+$/.test(k)))throw Error('Original export has invalid columns for '+table);
  const [existing]=await db.query<Record<string,unknown>>(`SELECT * FROM ${table} WHERE id=$1`,[row.id]);
  if(existing){
   if(table!=='clients'&&existing.client_id!==record.clientId||table==='service_orders'&&(existing.type!=='s-election'||existing.formation_order_id!==record.companyId))throw Error('Existing ownership conflicts with original export');
  }else prepared.push({table,row,cols});
 }
 // Validate missing prerequisites before any insert. Names/email are never
 // used to redirect to another row when a uniqueness constraint refuses.
 if(!input.client&&!(await db.query('SELECT id FROM clients WHERE id=$1',[record.clientId])).length)throw Error('Original client export is required');
 if(record.companyId&&!input.company&&!(await db.query('SELECT id FROM orders WHERE id=$1 AND client_id=$2',[record.companyId,record.clientId])).length)throw Error('Original company export is required');
 for(const {table,row,cols} of prepared)await db.query(`INSERT INTO ${table} (${cols.map(k=>'"'+k+'"').join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));
 await db.query("UPDATE recovery_holds SET evidence=COALESCE(evidence,'{}'::jsonb)||$2::jsonb WHERE id=$1 AND status='held'",[id,JSON.stringify({ownerExport:{reference:input.reference,operator:input.operator,sha256:createHash('sha256').update(JSON.stringify(input)).digest('hex')}})]);
 return {id,inserted:prepared.map(x=>x.table),status:'held'};
}
