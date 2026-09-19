/** Supply old and new keys together, select the new active key, then run this
 * against the intended environment during a write-maintenance window. Never
 * retire an old key until the script, full backup and restore rehearsal pass. */
import { getDb, type Db } from '../server/db';
import { decryptSecret, encryptSecret } from '../server/crypto';
import { seal, unseal, isEncrypted, encryptedKeyId, encryptionKeys } from '../server/encryption';
import { readStoredFile, replaceStoredFile } from '../server/storage';
import { runFileMirror } from '../server/dropbox';
export async function rotateEncryption(db?:Db){
 db ||= await getDb();const {active}=encryptionKeys();let secrets=0,documents=0;
 const rows=await db.query<{id:string;ein_secret:string}>('SELECT id,ein_secret FROM service_orders WHERE ein_secret IS NOT NULL');
 for(const r of rows){const plain=decryptSecret(r.ein_secret),next=encryptSecret(plain);if(decryptSecret(next)!==plain)throw new Error('Secret verification failed');
   const wrote=await db.query('UPDATE service_orders SET ein_secret=$2 WHERE id=$1 AND ein_secret=$3 RETURNING id',[r.id,next,r.ein_secret]);if(!wrote.length)throw new Error('An order changed during rotation; retry');secrets++;}
 const docs=await db.query<{id:string;storage_key:string}>("SELECT id,storage_key FROM documents WHERE deleted_at IS NULL AND meta->>'sensitive'='true'");
 for(const d of docs){const raw=await readStoredFile(d.storage_key);if(!isEncrypted(raw))throw new Error('Sensitive document is not encrypted');const plain=unseal(raw);
   if(encryptedKeyId(raw)!==active){await replaceStoredFile(d.storage_key,seal(plain));if(!unseal(await readStoredFile(d.storage_key)).equals(plain))throw new Error('Document verification failed');}
   await db.query('UPDATE documents SET mirrored_at=NULL WHERE id=$1',[d.id]);documents++;}
 const mirror=await runFileMirror();if(!mirror.complete)throw new Error('Rotation mirror is incomplete: keep all old keys and resume backup before retiring any key');
 return {secrets,documents,active};
}
if(import.meta.main){if(!process.argv.includes('--maintenance-confirmed'))throw new Error('Stop document/order writes, keep all old keys, and use --maintenance-confirmed');console.log(JSON.stringify(await rotateEncryption()));}
