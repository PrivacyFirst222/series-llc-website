import {getDb} from './db';
import {readMirrorVersion,compareWriteMirror,hashBytes} from './dropbox';
import {readObject,putObject} from './storage';
import type {Deletion} from './document-retention';
import {validatePackageRecord,type PackageRecord} from './package-recovery';
import {OfficeRecoveryError} from './office-recovery-sources';
export const JOURNAL_PATH='/recovery/deletion-journal-v1.json';
const SENTINEL='deletion-journal-initialized.json';
/** Known record damage is distinct from a failed provider or database call. */
export class RecoveryRecordError extends Error {}
export interface DocumentCopy {serviceId?:string;documentId:string;storageKey:string;mirrorPath:string;extraMirrorPaths?:string[]}
export interface RecoveryJournal {version:1|2|3|4;records:Deletion[];packages:PackageRecord[];copies?:DocumentCopy[];firstNoticeCutoff?:string}
const encode=(j:RecoveryJournal)=>{
 const payload=j.version===1?{version:1,records:j.records}:{version:j.version,records:j.records,packages:j.packages,...(j.firstNoticeCutoff?{firstNoticeCutoff:j.firstNoticeCutoff}:{}),...(j.version===4?{copies:j.copies??[]}: {})};
 return Buffer.from(JSON.stringify({...payload,sha:hashBytes(Buffer.from(JSON.stringify(j.version===1?j.records:payload)))}));
};
function decode(data:Buffer):RecoveryJournal{
 try {
 const j=JSON.parse(data.toString());
 const payload=j.version===1?j.records:{version:j.version,records:j.records,packages:j.packages,...(j.firstNoticeCutoff?{firstNoticeCutoff:j.firstNoticeCutoff}:{}),...(j.version===4?{copies:j.copies??[]}: {})};
 if(![1,2,3,4].includes(j.version)||!Array.isArray(j.records)||j.sha!==hashBytes(Buffer.from(JSON.stringify(payload)))||(j.version>=2&&!Array.isArray(j.packages)))throw Error('Deletion journal is incomplete or corrupt');
 const keys=new Set<string>();for(const r of j.records){if((r.serviceId!==undefined&&(typeof r.serviceId!=='string'||!r.serviceId))||!r.storageKey||!r.documentId||!r.mirrorPath||(r.extraMirrorPaths!==undefined&&(!Array.isArray(r.extraMirrorPaths)||r.extraMirrorPaths.some((p:unknown)=>typeof p!=='string'||!p)))||!Number.isFinite(Date.parse(r.requestedAt))||keys.has(r.storageKey))throw Error('Invalid deletion journal record');keys.add(r.storageKey);}
 const packages:PackageRecord[]=j.packages||[],ids=new Set<string>();for(const r of packages){validatePackageRecord(r);if(ids.has(r.id))throw Error('Duplicate package recovery identity');ids.add(r.id);}
 if(j.firstNoticeCutoff!==undefined&&(![3,4].includes(j.version)||typeof j.firstNoticeCutoff!=='string'||!Number.isFinite(Date.parse(j.firstNoticeCutoff))))throw Error('Invalid initial-launch notice cutoff');
 const copies:DocumentCopy[]=j.version===4?j.copies:[];
 if(!Array.isArray(copies))throw Error('Document copy lineage is missing');
 const copyKeys=new Set<string>();for(const c of copies){if((c.serviceId!==undefined&&(typeof c.serviceId!=='string'||!c.serviceId))||!c.documentId||!c.storageKey||!c.mirrorPath||(c.extraMirrorPaths!==undefined&&(!Array.isArray(c.extraMirrorPaths)||c.extraMirrorPaths.some((p:unknown)=>typeof p!=='string'||!p)))||copyKeys.has(c.storageKey))throw Error('Invalid document copy lineage');copyKeys.add(c.storageKey);}
 return {version:j.version,records:j.records,packages,copies,...(j.firstNoticeCutoff?{firstNoticeCutoff:j.firstNoticeCutoff}:{})};
 } catch(error) {
  throw new RecoveryRecordError(error instanceof Error?error.message:'Invalid recovery record');
 }
}
/** Missing journals are never initialized by restore. Legacy deletion identities
 * remain unchanged when the first new package upgrades the journal to v2. */
export async function ensureDeletionMirror(seed:Deletion[]):Promise<void>{
 const db=await getDb();
 const prior=await db.query<{storage_key:string;document_id:string;mirror_path:string;requested_at:unknown}>('SELECT storage_key,document_id,mirror_path,requested_at FROM document_deletions');
 seed=[...new Map([...seed,...prior.map(r=>({storageKey:r.storage_key,documentId:r.document_id,mirrorPath:r.mirror_path,requestedAt:new Date(String(r.requested_at)).toISOString()}))].map(r=>[r.storageKey,r])).values()];
 const j=await readMirrorVersion(JOURNAL_PATH);
 if(!j){
  if(await readObject(SENTINEL)||(await db.query("SELECT id FROM backup_progress WHERE id='deletion-journal'")).length)throw new RecoveryRecordError('Independent deletion journal missing; recovery required');
  if(!await compareWriteMirror(JOURNAL_PATH,encode({version:1,records:seed,packages:[]}),null)&&!await readMirrorVersion(JOURNAL_PATH))throw Error('Deletion journal initialization conflicted');
 }
 const verified=await readDeletionMirror();for(const r of seed)if(!verified.some(x=>x.storageKey===r.storageKey))await appendDeletionMirror(r);
 await db.query("INSERT INTO backup_progress(id,completed_at) VALUES('deletion-journal',now()) ON CONFLICT DO NOTHING");
 const [policy]=await db.query<{first_notice_cutoff:unknown}>("SELECT first_notice_cutoff::text AS first_notice_cutoff FROM launch_policy WHERE id='initial-launch'");
 if(policy)await updateRecoveryJournal(j=>{if(!j.firstNoticeCutoff){j.firstNoticeCutoff=String(policy.first_notice_cutoff);j.version=j.copies?.length?4:3;}});
 if(!await readObject(SENTINEL))await putObject(SENTINEL,Buffer.from('{"version":1}'),true);
}
export async function readRecoveryJournal():Promise<RecoveryJournal>{const j=await readMirrorVersion(JOURNAL_PATH);if(!j)throw new RecoveryRecordError('Independent deletion journal is missing; restore refused');return decode(j.data);}
export async function readDeletionMirror():Promise<Deletion[]>{return (await readRecoveryJournal()).records;}
let journalQueue:Promise<void>=Promise.resolve();
export async function updateRecoveryJournal(change:(j:RecoveryJournal)=>void):Promise<void>{
 const previous=journalQueue;let release!:()=>void;
 journalQueue=new Promise<void>(resolve=>{release=resolve;});
 await previous;
 try{await changeRecoveryJournal(change);}finally{release();}
}
async function changeRecoveryJournal(change:(j:RecoveryJournal)=>void):Promise<void>{
 for(let n=0;n<12;n++){
  const current=await readMirrorVersion(JOURNAL_PATH);if(!current)throw new RecoveryRecordError('Independent deletion journal missing');
  const j=decode(current.data);change(j);if(j.copies?.length||j.version===4)j.version=4;else if(j.packages.some(p=>p.metadataVersion===2))j.version=3;else if(j.packages.length&&j.version===1)j.version=2;
  const encoded=encode(j);decode(encoded);
  if(encoded.equals(current.data))return;
  if(await compareWriteMirror(JOURNAL_PATH,encoded,current.rev))return;
 }
 throw Error('Deletion journal busy; retry deletion');
}
export async function appendDeletionMirror(record:Deletion):Promise<void>{
 await updateRecoveryJournal(j=>{
  const add=(r:Deletion)=>{const prior=j.records.find(x=>x.storageKey===r.storageKey);if(prior){if(prior.documentId!==r.documentId)throw Error('Conflicting deletion identity');if(r.serviceId)prior.serviceId=r.serviceId;if(r.reason&&r.reason!=='superseded')prior.reason=r.reason;prior.extraMirrorPaths=[...new Set([...(prior.extraMirrorPaths??[]),...(r.extraMirrorPaths??[]),...(prior.mirrorPath!==r.mirrorPath?[r.mirrorPath]:[])])];return;}j.records.push(r);};
  add(record);
  if(record.reason!=='superseded'){
   const services=new Set([record.serviceId,...(j.copies??[]).filter(c=>c.documentId===record.documentId).map(c=>c.serviceId)].filter(Boolean));
   for(const copy of j.copies??[])if(copy.documentId===record.documentId||(copy.serviceId&&services.has(copy.serviceId)))add({...record,...copy});
  }
  if(record.reason!=='superseded'){
   // One authoritative CAS covers the client decision and every known version,
   // including a concurrently prepared successor whose upload may finish later.
   const services=new Set(j.packages.filter(p=>p.id===record.documentId||p.priorDocumentId===record.documentId).map(p=>p.serviceId));
   for(const p of j.packages)if(services.has(p.serviceId))add({storageKey:p.storageKey,documentId:p.id,mirrorPath:p.mirrorPath,requestedAt:record.requestedAt,reason:'client'});
  }
 });
 const verified=await readDeletionMirror();if(!verified.some(r=>r.storageKey===record.storageKey))throw Error('Deletion decision could not be verified');
}

/** Register every controlled revision before publishing it. A racing deletion
 * also captures a late copy in the same CAS, so cleanup and restore know it. */
export async function recordDocumentCopy(copy:DocumentCopy):Promise<boolean>{
 let live=true;
 await updateRecoveryJournal(j=>{
  const copies=j.copies??(j.copies=[]),prior=copies.find(c=>c.storageKey===copy.storageKey);
  const paths=[copy.mirrorPath,...copy.extraMirrorPaths??[]];
  if(paths.some(p=>!p.startsWith('/')||p.split('/').some(s=>s==='..'||s==='.')||p.includes('\\')))throw new OfficeRecoveryError('The recovery path is invalid.','RECOVERY_IDENTITY_CONFLICT');
  const wanted=new Set(paths.map(p=>p.normalize('NFC').toLowerCase()));
  if(copies.some(c=>c.storageKey!==copy.storageKey&&[c.mirrorPath,...c.extraMirrorPaths??[]].some(p=>wanted.has(p.normalize('NFC').toLowerCase()))))throw new OfficeRecoveryError('A recovery path belongs to a different original. No copy was written.','RECOVERY_IDENTITY_CONFLICT');
  if(prior&&prior.documentId!==copy.documentId)throw new RecoveryRecordError('Conflicting document copy identity');
  if(prior&&copy.serviceId){if(prior.serviceId&&prior.serviceId!==copy.serviceId)throw new RecoveryRecordError('Conflicting service copy identity');prior.serviceId=copy.serviceId;}
  if(prior)prior.extraMirrorPaths=[...new Set([...(prior.extraMirrorPaths??[]),...(copy.extraMirrorPaths??[]),...(prior.mirrorPath!==copy.mirrorPath?[copy.mirrorPath]:[])])];else copies.push(copy);
  const deletion=j.records.find(r=>r.storageKey===copy.storageKey||((r.documentId===copy.documentId||(copy.serviceId&&r.serviceId===copy.serviceId))&&r.reason!=='superseded'));
  live=!deletion;
  if(deletion){const existing=j.records.find(r=>r.storageKey===copy.storageKey);const linked=prior??copy;if(existing)existing.extraMirrorPaths=[...new Set([...(existing.extraMirrorPaths??[]),...(linked.extraMirrorPaths??[]),...(existing.mirrorPath!==linked.mirrorPath?[linked.mirrorPath]:[])])];else j.records.push({...deletion,...linked});}
 });
 return live;
}
