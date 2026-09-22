import { ensureDeletionMirror, appendDeletionMirror, readDeletionMirror } from './backup-deletions';
/** An append-only deletion marker outside database snapshots prevents an old
 * restore from reviving a client's deleted document. Cleanup is retryable. */
import { getDb } from './db';
import { putObject, readObject, listObjects, deletionPath, removeStoredFile } from './storage';
import { deleteMirror, documentMirrorPath } from './dropbox';
export interface Deletion {storageKey:string;documentId:string;mirrorPath:string;requestedAt:string}
export async function deletionJournal(): Promise<Deletion[]> {
 const keys=await listObjects('deletions/'), out:Deletion[]=[];
 for(const key of keys){const b=await readObject(key);if(!b)throw new Error('Deletion journal changed during read');out.push(JSON.parse(b.toString()));}return out;
}
export async function requestDocumentDeletion(id:string,clientId:string):Promise<boolean>{
 const db=await getDb();
 const [d]=await db.query<{id:string;storage_key:string;mirror_path:string|null;title:string;kind:string;llc_name:string|null;email:string|null;meta:{sensitive?:boolean}|null}>(`SELECT d.*,o.llc_name,c.email FROM documents d LEFT JOIN orders o ON o.id=d.order_id AND o.client_id=d.client_id LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=$1 AND d.client_id=$2`,[id,clientId]);
 if(!d || !d.meta?.sensitive)return false;
 const record:Deletion={storageKey:d.storage_key,documentId:d.id,mirrorPath:d.mirror_path||documentMirrorPath(d),requestedAt:new Date().toISOString()};
 await ensureDeletionMirror(await deletionJournal());
 await appendDeletionMirror(record);
 const path=deletionPath(d.storage_key);
 if(!await readObject(path))await putObject(path,Buffer.from(JSON.stringify(record)));
 await registerDeletion(record);
 await retryDocumentDeletions({documentId:id,budgetMs:20000});return true;
}
async function registerDeletion(r:Deletion){
 const db=await getDb();
 await db.query('INSERT INTO document_deletions(storage_key,document_id,mirror_path,requested_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[r.storageKey,r.documentId,r.mirrorPath,r.requestedAt]);
 await db.query('UPDATE documents SET deleted_at=COALESCE(deleted_at,$2) WHERE storage_key=$1',[r.storageKey,r.requestedAt]);
 // Prevent further questionnaire regeneration from recreating a deleted copy.
 await db.query(`UPDATE service_orders SET ein_secret=NULL,details=COALESCE(details,'{}'::jsonb)||jsonb_build_object('documentDeletedAt',$2::text) WHERE details->>'documentId'=$1`,[r.documentId,r.requestedAt]);
}
export async function retryDocumentDeletions(options:{documentId?:string;budgetMs?:number}={}):Promise<{pending:number}>{
 const db=await getDb();
 // Replay the external journal after a restore, including previously completed
 // deletions absent from the restored database. No existing test-copy cleanup.
 if(!options.documentId){
  const local=await deletionJournal();await ensureDeletionMirror(local);
  for(const r of await readDeletionMirror()){
   if(!await readObject(deletionPath(r.storageKey)))await putObject(deletionPath(r.storageKey),Buffer.from(JSON.stringify(r)),true);
   await registerDeletion(r);
  }
 }
 const rows=await db.query<{storage_key:string;mirror_path:string|null}>('SELECT storage_key,mirror_path FROM document_deletions WHERE completed_at IS NULL AND ($1::text IS NULL OR document_id::text=$1)',[options.documentId||null]);
 const started=Date.now();
 for(const r of rows){if(Date.now()-started>=(options.budgetMs??30000))break;try{
   await removeStoredFile(r.storage_key);if(r.mirror_path)await deleteMirror(r.mirror_path);
   await db.query('UPDATE document_deletions SET completed_at=now(),error=NULL WHERE storage_key=$1',[r.storage_key]);
 }catch(e){await db.query('UPDATE document_deletions SET error=$2 WHERE storage_key=$1',[r.storage_key,String(e)]);}}
 const [n]=await db.query<{n:string}>('SELECT count(*) AS n FROM document_deletions WHERE completed_at IS NULL');return {pending:Number(n.n)};
}
