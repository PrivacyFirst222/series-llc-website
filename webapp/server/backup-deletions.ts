import {getDb} from './db';
import {readMirrorVersion,compareWriteMirror,hashBytes} from './dropbox';
import {readObject,putObject} from './storage';
import type {Deletion} from './document-retention';
export const JOURNAL_PATH='/recovery/deletion-journal-v1.json';
const SENTINEL='deletion-journal-initialized.json';
interface Journal {version:1;records:Deletion[];sha:string}
const encode=(records:Deletion[])=>Buffer.from(JSON.stringify({version:1,records,sha:hashBytes(Buffer.from(JSON.stringify(records)))}));
function decode(data:Buffer):Deletion[]{
 const j=JSON.parse(data.toString()) as Journal;
 if(j.version!==1||!Array.isArray(j.records)||j.sha!==hashBytes(Buffer.from(JSON.stringify(j.records))))throw new Error('Deletion journal is incomplete or corrupt');
 const keys=new Set<string>();for(const r of j.records){if(!r.storageKey||!r.documentId||!r.mirrorPath||!Number.isFinite(Date.parse(r.requestedAt))||keys.has(r.storageKey))throw new Error('Invalid deletion journal record');keys.add(r.storageKey);}return j.records;
}
/** Called only from the running source, never during restore. A missing journal
 * after initialization is a disaster, not permission to start an empty one. */
export async function ensureDeletionMirror(seed:Deletion[]):Promise<void>{
 const db=await getDb();
 const prior=await db.query<{storage_key:string;document_id:string;mirror_path:string;requested_at:unknown}>('SELECT storage_key,document_id,mirror_path,requested_at FROM document_deletions');
 seed=[...new Map([...seed,...prior.map(r=>({storageKey:r.storage_key,documentId:r.document_id,mirrorPath:r.mirror_path,requestedAt:new Date(String(r.requested_at)).toISOString()}))].map(r=>[r.storageKey,r])).values()];
 const j=await readMirrorVersion(JOURNAL_PATH);
 if(!j){
  if(await readObject(SENTINEL)||(await db.query("SELECT id FROM backup_progress WHERE id='deletion-journal'")).length)throw new Error('Independent deletion journal missing; recovery required');
  if(!await compareWriteMirror(JOURNAL_PATH,encode(seed),null)){if(!await readMirrorVersion(JOURNAL_PATH))throw new Error('Deletion journal initialization conflicted');}
 }
 const verified=await readDeletionMirror();
 for(const r of seed)if(!verified.some(x=>x.storageKey===r.storageKey))await appendDeletionMirror(r);
 await db.query("INSERT INTO backup_progress(id,completed_at) VALUES('deletion-journal',now()) ON CONFLICT DO NOTHING");
 if(!await readObject(SENTINEL))await putObject(SENTINEL,Buffer.from('{"version":1}'),true);
}
export async function readDeletionMirror():Promise<Deletion[]>{
 const j=await readMirrorVersion(JOURNAL_PATH);if(!j)throw new Error('Independent deletion journal is missing; restore refused');return decode(j.data);
}
export async function appendDeletionMirror(record:Deletion):Promise<void>{
 for(let n=0;n<12;n++){
  const j=await readMirrorVersion(JOURNAL_PATH);if(!j)throw new Error('Independent deletion journal missing');
  const records=decode(j.data),prior=records.find(r=>r.storageKey===record.storageKey);
  if(prior){if(prior.documentId!==record.documentId||prior.mirrorPath!==record.mirrorPath)throw new Error('Conflicting deletion identity');return;}
  if(await compareWriteMirror(JOURNAL_PATH,encode([...records,record]),j.rev)){
   if(!(await readDeletionMirror()).some(r=>r.storageKey===record.storageKey))throw new Error('Deletion decision could not be verified');return;
  }
 }
 throw new Error('Deletion journal busy; retry deletion');
}
