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
 details:Record<string,unknown>;state:'intent'|'committed'|'aborted';
}
const fields=['einPending','einSource','dateIncorporated','effectiveDate','officerName','officerTitle','phone','certifiedAt','timingAcknowledgedAt','eligibilityAcknowledgedAt','filingDeadline','purgedAt'] as const;
const shareholderFields=['name','address','percentage','dateAcquired','joint','name2','address2'] as const;
export function recoveryMetadata(details:Record<string,unknown>):Record<string,unknown>{
 const out:Record<string,unknown>={};
 for(const key of fields)if(['string','boolean','number'].includes(typeof details[key]))out[key]=details[key];
 if(Array.isArray(details.shareholders))out.shareholders=details.shareholders.map(value=>{
  const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>,safe:Record<string,unknown>={ssnLast4:'',ssnLast4Second:''};
  for(const key of shareholderFields)if(['string','number'].includes(typeof row[key]))safe[key]=row[key];
  return safe;
 });
 return out;
}
export const packageRecoveryFailure=(company:string)=>new Error(`Recovery could not verify the current S-election package for ${company}. Do not switch production to this restored database until the package and its document records are reconciled. No client deletion has been inferred.`);
export function validatePackageRecord(r:PackageRecord):void{
 if(!r||!r.id||!r.serviceId||!r.clientId||!r.storagePath||!r.storageKey||!r.mirrorPath||!r.sha||!r.title||!['intent','committed','aborted'].includes(r.state)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.fulfilledAt))||JSON.stringify(recoveryMetadata(r.details))!==JSON.stringify(r.details))throw Error('Invalid package recovery record');
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
export async function commitPackageRecovery(id:string):Promise<void>{
 await updateRecoveryJournal(j=>{
  const r=j.packages.find(p=>p.id===id);if(!r)throw Error('Package recovery intent missing');
  if(r.state==='aborted'||j.records.some(d=>d.documentId===id||(d.reason!=='superseded'&&d.documentId===r.priorDocumentId)))throw Error('Package was deleted during replacement');
  if(j.packages.some(p=>p.serviceId===r.serviceId&&p.state==='committed'&&p.id!==r.id&&p.priorDocumentId===r.priorDocumentId))throw Error('Conflicting committed package replacement');
  r.state='committed';
 });
}
export async function abortPackageRecovery(id:string):Promise<void>{
 await updateRecoveryJournal(j=>{const r=j.packages.find(p=>p.id===id);if(r&&r.state==='intent')r.state='aborted';});
}
/** Aborted intents are retained forever: a late provider upload can still land.
 * Their known primary and mirror destinations remain eligible for every sweep. */
export async function cleanupAbortedPackages():Promise<void>{
 for(const r of (await readRecoveryJournal()).packages.filter(p=>p.state==='aborted')){
  await removeStoredFile(r.storageKey);if(r.storagePath!==r.storageKey)await removeStoredFile(r.storagePath);
  await deleteMirror(r.mirrorPath);
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
export async function recoverPackages(tables:Record<string,Record<string,unknown>[]>,checkpoint:string[]=[]):Promise<{files:{storageKey:string;path:string;sha:string}[];aborted:PackageRecord[]}>{
 const journal=await readRecoveryJournal(),packages=journal.packages;
 for(const id of checkpoint)if(!packages.some(p=>p.id===id))throw Error('Independent recovery journal is missing a recorded package');
 for(const doc of tables.documents)if((doc.meta as {recoveryVersion?:number}|null)?.recoveryVersion===2&&!packages.some(p=>p.id===doc.id))throw Error('Independent recovery journal is missing a recorded package');
 const ids=new Set(tables.service_orders.map(s=>String(s.id))),deleted=new Set(journal.records.map(d=>d.documentId));
 // Unresolved commits are deliberately not guessed, even if their service was
 // created after the snapshot. The independent intent still controls the copy.
 for(const r of packages)if(r.state==='intent'&&!deleted.has(r.id))throw packageRecoveryFailure(r.company);
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
   row.status='fulfilled';row.fulfilled_at=latest.fulfilledAt;row.questionnaire_updated_at=latest.createdAt;row.ein_secret=null;row.details={...latest.details,documentId:latest.id};
   files.push({storageKey:latest.storageKey,path:latest.mirrorPath,sha:latest.sha});
  }
  // The independently committed identities override stale 'staged/cleanup'
  // snapshot rows; no restored cleanup sweep may remove a retained successor.
  for(const stage of tables.staged_documents)if(records.some(p=>p.id===stage.id))stage.state='retired';
 }
 // Completed packages for post-snapshot services cannot be silently dropped:
 // owner/service rows needed for authorization cannot be invented from a PDF.
 for(const r of packages)if(r.state==='committed'&&!ids.has(r.serviceId)&&!deleted.has(r.id)&&!packages.some(p=>p.priorDocumentId===r.id&&p.state==='committed'))throw packageRecoveryFailure(r.company);
 return {files,aborted:packages.filter(p=>p.state==='aborted')};
}
/** Reconcile a DB-committed response before retiring its predecessor. */
export async function finalizeCommittedPackage(db:Db,id:string):Promise<void>{
 const journal=await readRecoveryJournal(),r=journal.packages.find(p=>p.id===id);if(!r)return; // legacy staged rows keep their original protocol
 const [doc]=await db.query<{id:string}>('SELECT id FROM documents WHERE id=$1 AND deleted_at IS NULL',[id]);
 if(!doc){if(journal.records.some(d=>d.documentId===id))return;throw packageRecoveryFailure(r.company);}
 await verifyPackageCopy(r);await commitPackageRecovery(id);
}
