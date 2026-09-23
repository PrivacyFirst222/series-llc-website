import type {Db} from './db';
import {putFile,readStoredFile,deleteFile} from './storage';
import {documentMirrorPath,mirrorFile,readMirror,hashBytes} from './dropbox';
/** Preserve the exact old revision before the allowed in-place document-row
 * replacement. Never overwrite the legacy mirror an old snapshot may name. */
export async function replaceFilingDocument(db:Db,args:{id:string;expectedStorageKey:string;filename:string;bytes:Buffer;contentType:string}):Promise<boolean>{
 const [doc]=await db.query<{id:string;kind:string;title:string;storage_key:string;mirror_path:string|null;llc_name:string|null;email:string|null}>('SELECT d.id,d.kind,d.title,d.storage_key,d.mirror_path,o.llc_name,c.email FROM documents d LEFT JOIN orders o ON o.id=d.order_id AND o.client_id=d.client_id LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=$1',[args.id]);
 if(!doc||doc.storage_key!==args.expectedStorageKey)return false;
 if(!['articles','psd'].includes(doc.kind))throw Error('Only filing documents can use revision replacement');
 const old=await readStoredFile(doc.storage_key),archive=documentMirrorPath(doc);
 await mirrorFile({storageKey:doc.storage_key,path:archive});
 if(hashBytes((await readMirror(archive))!)!==hashBytes(old))throw Error('Prior filing revision could not be verified');
 const data=args.bytes.buffer.slice(args.bytes.byteOffset,args.bytes.byteOffset+args.bytes.byteLength) as ArrayBuffer;
 const stored=await putFile(args.filename,data,args.contentType);
 try{
  // Archive the new revision too; replacement is never acknowledged while its
  // sole recoverable copy is only the primary provider.
  const path=documentMirrorPath({...doc,storage_key:stored.storageKey});await mirrorFile({storageKey:stored.storageKey,path});
  const rows=await db.query('UPDATE documents SET storage_key=$2,content_type=$3,size_bytes=$4,mirrored_at=NULL,mirror_path=$5 WHERE id=$1 AND storage_key=$6 RETURNING id',[args.id,stored.storageKey,args.contentType,stored.sizeBytes,path,args.expectedStorageKey]);
  if(!rows.length){await deleteFile(stored.storageKey);return false;}
  await deleteFile(args.expectedStorageKey);return true;
 }catch(e){
  // A lost update response is ambiguous; do not remove a possibly current file.
  const [current]=await db.query<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1',[args.id]);
  if(current?.storage_key!==stored.storageKey)await deleteFile(stored.storageKey);
  throw e;
 }
}
