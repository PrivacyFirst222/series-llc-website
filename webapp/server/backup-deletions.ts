import {getDb} from './db';
import {readMirrorVersion,compareWriteMirror,hashBytes} from './dropbox';
import {readObject,putObject} from './storage';
import type {Deletion} from './document-retention';
import {validatePackageRecord,type PackageRecord} from './package-recovery';
export const JOURNAL_PATH='/recovery/deletion-journal-v1.json';
const SENTINEL='deletion-journal-initialized.json';
export interface RecoveryJournal {version:1|2;records:Deletion[];packages:PackageRecord[]}
const encode=(j:RecoveryJournal)=>{
 const payload=j.version===1?{version:1,records:j.records}:{version:2,records:j.records,packages:j.packages};
 return Buffer.from(JSON.stringify({...payload,sha:hashBytes(Buffer.from(JSON.stringify(j.version===1?j.records:payload)))}));
};
function decode(data:Buffer):RecoveryJournal{
 const j=JSON.parse(data.toString());
 const payload=j.version===1?j.records:{version:2,records:j.records,packages:j.packages};
 if(![1,2].includes(j.version)||!Array.isArray(j.records)||j.sha!==hashBytes(Buffer.from(JSON.stringify(payload)))||(j.version===2&&!Array.isArray(j.packages)))throw Error('Deletion journal is incomplete or corrupt');
 const keys=new Set<string>();for(const r of j.records){if(!r.storageKey||!r.documentId||!r.mirrorPath||!Number.isFinite(Date.parse(r.requestedAt))||keys.has(r.storageKey))throw Error('Invalid deletion journal record');keys.add(r.storageKey);}
 const packages:PackageRecord[]=j.packages||[],ids=new Set<string>();for(const r of packages){validatePackageRecord(r);if(ids.has(r.id))throw Error('Duplicate package recovery identity');ids.add(r.id);}
 return {version:j.version,records:j.records,packages};
}
/** Missing journals are never initialized by restore. Legacy deletion identities
 * remain unchanged when the first new package upgrades the journal to v2. */
export async function ensureDeletionMirror(seed:Deletion[]):Promise<void>{
 const db=await getDb();
 const prior=await db.query<{storage_key:string;document_id:string;mirror_path:string;requested_at:unknown}>('SELECT storage_key,document_id,mirror_path,requested_at FROM document_deletions');
 seed=[...new Map([...seed,...prior.map(r=>({storageKey:r.storage_key,documentId:r.document_id,mirrorPath:r.mirror_path,requestedAt:new Date(String(r.requested_at)).toISOString()}))].map(r=>[r.storageKey,r])).values()];
 const j=await readMirrorVersion(JOURNAL_PATH);
 if(!j){
  if(await readObject(SENTINEL)||(await db.query("SELECT id FROM backup_progress WHERE id='deletion-journal'")).length)throw Error('Independent deletion journal missing; recovery required');
  if(!await compareWriteMirror(JOURNAL_PATH,encode({version:1,records:seed,packages:[]}),null)&&!await readMirrorVersion(JOURNAL_PATH))throw Error('Deletion journal initialization conflicted');
 }
 const verified=await readDeletionMirror();for(const r of seed)if(!verified.some(x=>x.storageKey===r.storageKey))await appendDeletionMirror(r);
 await db.query("INSERT INTO backup_progress(id,completed_at) VALUES('deletion-journal',now()) ON CONFLICT DO NOTHING");
 if(!await readObject(SENTINEL))await putObject(SENTINEL,Buffer.from('{"version":1}'),true);
}
export async function readRecoveryJournal():Promise<RecoveryJournal>{const j=await readMirrorVersion(JOURNAL_PATH);if(!j)throw Error('Independent deletion journal is missing; restore refused');return decode(j.data);}
export async function readDeletionMirror():Promise<Deletion[]>{return (await readRecoveryJournal()).records;}
export async function updateRecoveryJournal(change:(j:RecoveryJournal)=>void):Promise<void>{
 for(let n=0;n<12;n++){
  const current=await readMirrorVersion(JOURNAL_PATH);if(!current)throw Error('Independent deletion journal missing');
  const j=decode(current.data);change(j);if(j.packages.length)j.version=2;
  const encoded=encode(j);decode(encoded);
  if(await compareWriteMirror(JOURNAL_PATH,encoded,current.rev))return;
 }
 throw Error('Deletion journal busy; retry deletion');
}
export async function appendDeletionMirror(record:Deletion):Promise<void>{
 await updateRecoveryJournal(j=>{
  const add=(r:Deletion)=>{const prior=j.records.find(x=>x.storageKey===r.storageKey);if(prior){if(prior.documentId!==r.documentId||prior.mirrorPath!==r.mirrorPath)throw Error('Conflicting deletion identity');return;}j.records.push(r);};
  add(record);
  if(record.reason!=='superseded'){
   // One authoritative CAS covers the client decision and every known version,
   // including a concurrently prepared successor whose upload may finish later.
   const services=new Set(j.packages.filter(p=>p.id===record.documentId||p.priorDocumentId===record.documentId).map(p=>p.serviceId));
   for(const p of j.packages)if(services.has(p.serviceId))add({storageKey:p.storageKey,documentId:p.id,mirrorPath:p.mirrorPath,requestedAt:record.requestedAt,reason:'client'});
  }
 });
 const verified=await readDeletionMirror();if(!verified.some(r=>r.storageKey===record.storageKey))throw Error('Deletion decision could not be verified');
}
