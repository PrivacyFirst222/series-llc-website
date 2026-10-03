import type {Db} from './db';
import {readRecoveryJournal,updateRecoveryJournal} from './backup-deletions';
import {readMirror,hashBytes,deleteMirror} from './dropbox';
import {isEncrypted,unseal} from './encryption';
import {removeStoredFile} from './storage';

/** Only projected document metadata enters the independent journal. Questionnaire
 * ciphertext and full taxpayer-number fields must never become recovery data. */
export interface PackageRecord {
 id:string;serviceId:string;clientId:string;companyId:string|null;company:string;
 priorDocumentId:string|null;storagePath:string;storageKey:string;mirrorPath:string;
 title:string;sha:string;size:number;createdAt:string;fulfilledAt:string;
 reconciliation?:{decision:'committed'|'aborted-before-commit'|'client-deletion';authority:'database-transaction'|'verified-client-request';reference:string;operator:string};
 details:Record<string,unknown>;state:'intent'|'committed'|'aborted';metadataVersion?:2;
}
const fields=['einPending','einSource','dateIncorporated','effectiveDate','officerName','officerTitle','phone','certifiedAt','timingAcknowledgedAt','eligibilityAcknowledgedAt','filingDeadline','purgedAt','fulfilledByOverride','overrideAt'] as const;
const shareholderFields=['name','address','percentage','dateAcquired','joint','name2','address2'] as const;
export function recoveryMetadata(details:Record<string,unknown>,version:1|2=2):Record<string,unknown>{
 const out:Record<string,unknown>={};
 for(const key of fields)if(['string','boolean','number'].includes(typeof details[key]))out[key]=details[key];
 if(version===2&&typeof details.ein==='string'&&/^(?:\d{2}-?\d{7})?$/.test(details.ein))out.ein=details.ein;
 if(Array.isArray(details.shareholders))out.shareholders=details.shareholders.map(value=>{
  const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>,safe:Record<string,unknown>={ssnLast4:'',ssnLast4Second:''};
  for(const key of shareholderFields)if(['string','number'].includes(typeof row[key]))safe[key]=row[key];
  if(version===2)for(const key of ['ssnLast4','ssnLast4Second'])if(typeof row[key]==='string'&&/^(?:\d{4})?$/.test(row[key] as string))safe[key]=row[key];
  return safe;
 });
 return out;
}
export const packageRecoveryFailure=(company:string)=>new Error(`Recovery could not verify the current S-election package for ${company}. Do not switch production to this restored database until the package and its document records are reconciled. No client deletion has been inferred.`);
export function validatePackageRecord(r:PackageRecord):void{
 if(!r||!r.id||!r.serviceId||!r.clientId||!r.storagePath||!r.storageKey||!r.mirrorPath||!r.sha||!r.title||!['intent','committed','aborted'].includes(r.state)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.fulfilledAt))||(r.metadataVersion!==undefined&&r.metadataVersion!==2)||JSON.stringify(recoveryMetadata(r.details,r.metadataVersion??1))!==JSON.stringify(r.details))throw Error('Invalid package recovery record');
 if(r.reconciliation&&(!['committed','aborted-before-commit','client-deletion'].includes(r.reconciliation.decision)||!['database-transaction','verified-client-request'].includes(r.reconciliation.authority)||!r.reconciliation.reference?.trim()||!r.reconciliation.operator?.trim()))throw Error('Invalid package reconciliation record');
}
export async function beginPackageRecovery(record:PackageRecord):Promise<void>{
 validatePackageRecord(record);
 await updateRecoveryJournal(j=>{
  if(j.packages.some(p=>p.id===record.id))throw Error('Package identity already exists');
  if(record.priorDocumentId&&j.records.some(d=>d.documentId===record.priorDocumentId))throw Error('The previous package has been deleted or replaced');
  if(j.packages.some(p=>p.serviceId===record.serviceId&&p.state==='intent'))throw Error('A package recovery commit is still pending');
  j.packages.push(record);
 });
}
export async function recordPackageUpload(id:string,key:string):Promise<void>{
 await updateRecoveryJournal(j=>{const r=j.packages.find(p=>p.id===id);if(!r||r.state!=='intent')throw Error('Package upload has no active recovery intent');r.storageKey=key;const decision=j.records.find(d=>d.documentId===id);if(decision&&!j.records.some(d=>d.storageKey===key))j.records.push({...decision,storageKey:key});});
}
export async function commitPackageRecovery(id:string,reconciliation?:PackageRecord['reconciliation']):Promise<void>{
 await updateRecoveryJournal(j=>{
  const r=j.packages.find(p=>p.id===id);if(!r)throw Error('Package recovery intent missing');
  if(r.state==='aborted'||j.records.some(d=>d.documentId===id||(d.reason!=='superseded'&&d.documentId===r.priorDocumentId)))throw Error('Package was deleted during replacement');
  if(j.packages.some(p=>p.serviceId===r.serviceId&&p.state==='committed'&&p.id!==r.id&&p.priorDocumentId===r.priorDocumentId))throw Error('Conflicting committed package replacement');
  r.state='committed';
  if(reconciliation)r.reconciliation=reconciliation;
 });
}
export async function abortPackageRecovery(id:string,reconciliation?:PackageRecord['reconciliation']):Promise<void>{
 await updateRecoveryJournal(j=>{const r=j.packages.find(p=>p.id===id);if(r&&r.state==='intent'){r.state='aborted';if(reconciliation)r.reconciliation=reconciliation;}});
}
/** Aborted intents are retained forever: a late provider upload can still land.
 * Their known primary and mirror destinations remain eligible for every sweep. */
export async function cleanupAbortedPackages(serviceId?:string,limit=50):Promise<void>{
 const {getDb}=await import('./db');const db=await getDb();
 const key='aborted-package-cleanup:'+ (serviceId??'all');
 const [saved]=await db.query<{cursor:string|null}>('SELECT cursor FROM backup_progress WHERE id=$1',[key]);
 const all=(await readRecoveryJournal()).packages.filter(p=>p.state==='aborted'&&(!serviceId||p.serviceId===serviceId)).sort((a,b)=>a.id.localeCompare(b.id));
 const after=all.filter(p=>p.id>(saved?.cursor??''));const batch=(after.length?after:all).slice(0,Math.max(1,Math.min(limit,100)));
 for(const r of batch){
  try{await removeStoredFile(r.storageKey);if(r.storagePath!==r.storageKey)await removeStoredFile(r.storagePath);await deleteMirror(r.mirrorPath);}
  catch(error){console.error('[package-cleanup] retained for retry',r.id,error);}
  // Every record, including a failure, returns on the next cursor cycle. No
  // age cutoff can drop a deletion obligation or a delayed upload destination.
  await db.query('INSERT INTO backup_progress(id,cursor) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET cursor=EXCLUDED.cursor',[key,r.id]);
 }
}
export async function verifyPackageCopy(r:PackageRecord):Promise<Buffer>{
 try{const data=await readMirror(r.mirrorPath);
  if(!data||!isEncrypted(data)||hashBytes(unseal(data))!==r.sha)throw packageRecoveryFailure(r.company);
  return data;
 }catch{throw packageRecoveryFailure(r.company);}
}
/** Project external committed successors onto the old snapshot before deleted
 * predecessors are filtered. Legacy tombstones never imply a successor. */
export interface PackageHold {record:PackageRecord;reason:'a service created after this backup'|'an interrupted package operation'}
export async function recoverPackages(tables:Record<string,Record<string,unknown>[]>,checkpoint:string[]=[],options:{holdUnresolved?:boolean}={}):Promise<{files:{storageKey:string;path:string;sha:string}[];aborted:PackageRecord[];holds:PackageHold[]}>{
 const journal=await readRecoveryJournal(),packages=journal.packages;
 const holds:PackageHold[]=[];
 const hold=async(record:PackageRecord,reason:PackageHold['reason'])=>{
  if(!options.holdUnresolved)throw Error(`This backup cannot restore every S-election package automatically. ${record.company}: ${reason} needs reconciliation. Choose Restore with packages held for reconciliation to restore verified data and preserve the affected packages separately.`);
  // Missing bytes are possible before an interrupted upload. Existing bytes
  // must still authenticate; the explicit option never ignores corruption.
  const bytes=await readMirror(record.mirrorPath);
  if(record.state==='committed'||bytes)await verifyPackageCopy(record);
  holds.push({record,reason});
 };
 for(const id of checkpoint)if(!packages.some(p=>p.id===id))throw Error('Independent recovery journal is missing a recorded package');
 for(const doc of tables.documents)if((doc.meta as {recoveryVersion?:number}|null)?.recoveryVersion===2&&!packages.some(p=>p.id===doc.id))throw Error('Independent recovery journal is missing a recorded package');
 const ids=new Set(tables.service_orders.map(s=>String(s.id))),deleted=new Set(journal.records.map(d=>d.documentId));
 // Unresolved commits are deliberately not guessed, even if their service was
 // created after the snapshot. The independent intent still controls the copy.
 for(const r of packages)if(r.state==='intent'&&!deleted.has(r.id))await hold(r,'an interrupted package operation');
 const files:{storageKey:string;path:string;sha:string}[]=[];
 for(const serviceId of ids){
  const records=packages.filter(p=>p.serviceId===serviceId&&p.state==='committed');
  const row=tables.service_orders.find(s=>s.id===serviceId)!;
  if(!records.length){const details=(row.details||{}) as Record<string,unknown>;if(row.type==='s-election'&&journal.records.some(d=>d.reason==='superseded'&&d.documentId===details.documentId))throw packageRecoveryFailure(String(row.llc_name));continue;}
  if(records.some(p=>p.clientId!==row.client_id||p.companyId!==(row.formation_order_id??null)||!tables.clients.some(c=>c.id===p.clientId)||(p.companyId&&!tables.orders.some(o=>o.id===p.companyId&&o.client_id===p.clientId))))throw packageRecoveryFailure(records[0].company);
  const successors=new Set(records.map(p=>p.priorDocumentId)),heads=records.filter(p=>!successors.has(p.id));
  if(heads.length!==1)throw packageRecoveryFailure(records[0].company);
  const latest=heads[0];
  if(deleted.has(latest.id)){
   row.ein_secret=null;row.details={...latest.details,documentId:latest.id,documentDeletedAt:journal.records.find(d=>d.documentId===latest.id)!.requestedAt};
  }else{
   // A client deletion of any ancestor defeats a late competing successor.
   if(journal.records.some(d=>d.reason!=='superseded'&&records.some(p=>p.id===d.documentId||p.priorDocumentId===d.documentId)))throw packageRecoveryFailure(latest.company);
   await verifyPackageCopy(latest);
   tables.documents=tables.documents.filter(d=>d.id!==latest.id);
   tables.documents.push({id:latest.id,client_id:latest.clientId,order_id:latest.companyId,kind:'package',title:latest.title,storage_key:latest.storageKey,content_type:'application/pdf',size_bytes:latest.size,meta:{sensitive:true,serviceOrderId:latest.serviceId,recoveryVersion:2},created_at:latest.createdAt,mirror_path:latest.mirrorPath,mirror_hash:null,mirrored_at:null});
   const prior=(row.details||{}) as Record<string,unknown>;
   const metadata=latest.metadataVersion===2?latest.details:prior.documentId===latest.id?recoveryMetadata(prior):{...latest.details,recoveryMetadataUnavailable:true};
   row.status='fulfilled';row.fulfilled_at=latest.fulfilledAt;row.questionnaire_updated_at=latest.createdAt;row.ein_secret=null;row.details={...metadata,documentId:latest.id};
   files.push({storageKey:latest.storageKey,path:latest.mirrorPath,sha:latest.sha});
  }
  for(const record of records)if(!deleted.has(record.id)&&!tables.staged_documents.some(stage=>stage.id===record.id)){
   tables.staged_documents.push({id:record.id,service_order_id:record.serviceId,storage_path:record.storagePath,storage_key:record.storageKey,prior_document_id:record.priorDocumentId,state:'committed',created_at:record.createdAt});
  }
  // The independently committed identities override stale 'staged/cleanup'
  // snapshot rows; no restored cleanup sweep may remove a retained successor.
  for(const stage of tables.staged_documents)if(records.some(p=>p.id===stage.id))stage.state=!deleted.has(String(stage.id))?'committed':'retired';
 }
 // Completed packages for post-snapshot services cannot be silently dropped:
 // owner/service rows needed for authorization cannot be invented from a PDF.
 for(const r of packages)if(r.state==='committed'&&!ids.has(r.serviceId)&&!deleted.has(r.id)&&!packages.some(p=>p.priorDocumentId===r.id&&p.state==='committed'))await hold(r,'a service created after this backup');
 // A snapshot of a hold predates its later resolution. Replay the durable
 // package state; a new unresolved hold below still takes precedence.
 const unresolved=new Set(holds.map(h=>h.record.id));
 for(const old of tables.recovery_holds??[]){
  const record=packages.find(p=>p.id===old.id);
  if(!record||unresolved.has(record.id))continue;
  if(deleted.has(record.id))old.status='deleted';
  else if(record.state==='aborted')old.status='aborted';
  else if(record.state==='committed'&&ids.has(record.serviceId))old.status='reconciled';
  if(record.reconciliation)old.evidence=record.reconciliation;
 }
 for(const row of tables.service_orders){
  if(!holds.some(h=>h.record.serviceId===row.id)&&!(tables.recovery_holds??[]).some(h=>h.service_id===row.id&&h.status==='held')){
   const details={...(row.details as Record<string,unknown>||{})};delete details.recoveryHold;row.details=details;
  }
 }
 for(const h of holds){
  const row=tables.service_orders.find(s=>s.id===h.record.serviceId);
  if(row)row.details={...(row.details as Record<string,unknown>||{}),recoveryHold:true};
  for(const stage of tables.staged_documents)if(stage.id===h.record.id)stage.state='held';
 }
 return {files,aborted:packages.filter(p=>p.state==='aborted'),holds};
}
/** Reconcile a DB-committed response before retiring its predecessor. */
export async function finalizeCommittedPackage(db:Db,id:string):Promise<void>{
 const journal=await readRecoveryJournal(),r=journal.packages.find(p=>p.id===id);if(!r)return; // legacy staged rows keep their original protocol
 const [doc]=await db.query<{id:string}>('SELECT id FROM documents WHERE id=$1 AND deleted_at IS NULL',[id]);
 if(!doc){if(journal.records.some(d=>d.documentId===id))return;throw packageRecoveryFailure(r.company);}
 await verifyPackageCopy(r);await commitPackageRecovery(id);
}
