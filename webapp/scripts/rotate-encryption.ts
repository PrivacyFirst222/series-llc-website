/** Supply old and new keys together, select the new active key, then run this
 * against the intended environment during a write-maintenance window. Never
 * retire an old key until the script, full backup and restore rehearsal pass. */
import { getDb, type Db } from '../server/db';
import { decryptSecret, encryptSecret } from '../server/crypto';
import { seal, unseal, isEncrypted, encryptedKeyId, encryptionKeys } from '../server/encryption';
import { readObject, readStoredFile, replaceStoredFile, removeStoredFile, storageWasDeleted } from '../server/storage';
import { runFileMirror, readMirrorVersion, compareWriteMirror, deleteMirror, hashBytes } from '../server/dropbox';
import { readRecoveryJournal, ensureDeletionMirror } from '../server/backup-deletions';
import { deletionJournal } from '../server/document-retention';
import { officeRecoveryTables, verifiedOfficeBytes } from '../server/office-file-recovery';
import { officeFileIdentities, collectOfficeRecoverySources } from '../server/office-recovery-sources';
export async function rotateEncryption(db?:Db){
 db ||= await getDb();const {active}=encryptionKeys();let secrets=0,documents=0,copies=0;
 const rows=await db.query<{id:string;ein_secret:string}>('SELECT id,ein_secret FROM service_orders WHERE ein_secret IS NOT NULL');
 for(const r of rows){const plain=decryptSecret(r.ein_secret),next=encryptSecret(plain);if(decryptSecret(next)!==plain)throw new Error('Secret verification failed');
   const wrote=await db.query('UPDATE service_orders SET ein_secret=$2 WHERE id=$1 AND ein_secret=$3 RETURNING id',[r.id,next,r.ein_secret]);if(!wrote.length)throw new Error('An order changed during rotation; retry');secrets++;}
 await ensureDeletionMirror(await deletionJournal());
 const tables=await officeRecoveryTables(db),identities=officeFileIdentities(tables),journal=await readRecoveryJournal();
 const docs=await db.query<{id:string;storage_key:string}>("SELECT id,storage_key FROM documents WHERE deleted_at IS NULL AND meta->>'sensitive'='true'");
 const required=new Set(docs.map(d=>d.storage_key)),paths=new Map<string,Set<string>>();
 const add=(key:string,aliases:string[])=>{const set=paths.get(key)??new Set<string>();for(const path of aliases)if(path)set.add(path);paths.set(key,set);};
 for(const d of docs)add(d.storage_key,[]);
 for(const i of identities.values())add(i.file.key,collectOfficeRecoverySources(i,journal,tables.documents));
 for(const c of journal.copies??[])add(c.storageKey,[c.mirrorPath,...c.extraMirrorPaths??[]]);
 for(const p of journal.packages)if(p.state!=='aborted')add(p.storageKey,[p.mirrorPath]);
 const retired=async(key:string)=>{const j=await readRecoveryJournal();return j.records.some(r=>r.storageKey===key)||j.packages.some(p=>p.storageKey===key&&p.state==='aborted')||await storageWasDeleted(key);};
 const plaintext=(key:string,raw:Buffer)=>{
  const i=identities.get(key),p=journal.packages.find(p=>p.storageKey===key);
  if(i&&!verifiedOfficeBytes(i,raw))throw Error('Rotation original fingerprint or envelope mismatch');
  if((required.has(key)||p)&&!isEncrypted(raw))throw Error('Sensitive document is not encrypted');
  const plain=isEncrypted(raw)?unseal(raw):raw;
  if(p&&(hashBytes(plain)!==p.sha||plain.length!==p.size))throw Error('Rotation package original mismatch');
  return plain;
 };
 for(const [key,aliases] of paths){
  if(await retired(key))continue;
  const raw=required.has(key)?await readStoredFile(key):await readObject(key);
  if(raw){
   const plain=plaintext(key,raw);
   if(isEncrypted(raw)&&encryptedKeyId(raw)!==active){
    if(await retired(key))continue;
    await replaceStoredFile(key,seal(plain));
    if(await retired(key)){await removeStoredFile(key);continue;}
    const saved=await readStoredFile(key);if(encryptedKeyId(saved)!==active||!plaintext(key,saved).equals(plain))throw Error('Document rotation verification failed');
   }
   if(isEncrypted(raw))documents++;
  }
  for(const path of aliases){
   if(await retired(key))break;
   const original=await readMirrorVersion(path);if(!original)continue; // registered before upload, not proof the upload happened
   const plain=plaintext(key,original.data);if(!isEncrypted(original.data)||encryptedKeyId(original.data)===active)continue;
   if(await retired(key))break;
   if(!await compareWriteMirror(path,seal(plain),original.rev))throw Error('Rotation copy changed concurrently; keep all old keys and retry');
   if(await retired(key)){await deleteMirror(path);break;}
   const saved=await readMirrorVersion(path);
   if(!saved||encryptedKeyId(saved.data)!==active||!plaintext(key,saved.data).equals(plain))throw Error('Recovery copy rotation verification failed');
   copies++;
  }
 }
 const mirror=await runFileMirror();if(!mirror.complete)throw new Error('Rotation mirror is incomplete: keep all old keys and resume backup before retiring any key');
 return {secrets,documents,copies,active};
}
if(import.meta.main){if(!process.argv.includes('--maintenance-confirmed'))throw new Error('Stop document/order writes, keep all old keys, and use --maintenance-confirmed');console.log(JSON.stringify(await rotateEncryption()));}
