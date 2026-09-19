import { isEncrypted, unseal } from "./encryption";
import { gzipSync } from "node:zlib";
import { env } from "./env";
import { getDb } from "./db";
import { putObject, readObject, storageWasDeleted, readStoredFile } from "./storage";
import { mirrorFile, documentMirrorPath, hashBytes, type BackupFile } from "./dropbox";

/**
 * Nightly logical backup of the tables that cannot be rebuilt from anywhere
 * else, stored as gzipped JSON in PRIVATE Vercel Blob storage (a different
 * company than the database, so a Neon-side disaster does not take the copy
 * with it). Deliberately excluded:
 *   - fl_entities        — 4.7M rows, fully reloadable from the state's files
 *   - sessions           — ephemeral sign-ins; a restore should not revive them
 *   - auth_tokens        — one-time secrets; same
 * Full taxpayer numbers in service_orders are excluded, even as ciphertext.
 * rate_limits and schema_migrations are recreated, not restored. Retained
 * tax PDFs are backed up as authenticated ciphertext; keys are kept separately.
 * Restore: scripts/db-restore.ts (see docs/db-restore.md).
 */
export const BACKUP_TABLES = [
  "clients",
  "orders",
  "service_orders",
  "documents",
  "oa_profiles",
  "oa_generations",
  "library_documents",
  "webhook_events",
  "fl_sync_state",
  "contact_messages",
  "email_log",
  "ra_renewals",
  "document_deletions",
] as const;

const PREFIX = "backups/";

export interface BackupInfo {
  key: string;
  storageKey: string;
  sizeBytes: number;
  uploadedAt: string;
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { list } = await import("@vercel/blob");
    // Paginate to completion: backups are kept forever (Adam's ruling), and a
    // single page holds 1,000 — the old limit:100 with no cursor meant the
    // admin panel and its download route could see at most 100 backups ever,
    // silently orphaning the rest (Codex BAK-002).
    const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix: PREFIX, limit: 1000, cursor });
      blobs.push(...res.blobs);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return blobs
      .map((b) => ({
        key: b.pathname.slice(PREFIX.length),
        storageKey: b.url,
        sizeBytes: b.size,
        uploadedAt: new Date(b.uploadedAt).toISOString(),
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }
  const { readdir, stat } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = process.env.DEV_STORAGE_DIR ? `${process.env.DEV_STORAGE_DIR}/backups/` : fileURLToPath(new URL("../.dev-data/blob/backups/", import.meta.url));
  try {
    const names = await readdir(dir);
    const out: BackupInfo[] = [];
    for (const n of names) {
      const s = await stat(dir + n);
      out.push({
        key: n,
        storageKey: `dev:backups/${n}`,
        sizeBytes: s.size,
        uploadedAt: s.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => (a.key < b.key ? 1 : -1));
  } catch {
    return [];
  }
}


/** Backups are never pruned — Adam's ruling, 29 Aug 2026: at ~17 KB per
 *  nightly dump, years of them cost pennies, and a deleted backup is the one
 *  you needed. The admin panel shows the newest dump's date so a stall is
 *  visible. */

export interface BackupDump {version:1; dumpedAt:string; tables:Record<string,Record<string,unknown>[]>; files:BackupFile[]; fileManifestVersion:1}
interface BackupJob {key:string; dump:BackupDump; done:Record<string,string>; errors:Record<string,string>}
const JOB='backup-jobs/current.json';
export function backupFiles(tables:BackupDump['tables']):BackupFile[]{
 const orders=new Map((tables.orders||[]).map(o=>[o.id,o]));const clients=new Map((tables.clients||[]).map(c=>[c.id,c]));
 const files:BackupFile[]=[];
 for(const d of tables.documents||[]){if(d.deleted_at)continue;const o=orders.get(d.order_id),c=clients.get(d.client_id);
   files.push({storageKey:String(d.storage_key),path:documentMirrorPath({id:String(d.id),title:String(d.title),kind:String(d.kind),storage_key:String(d.storage_key),llc_name:o && o.client_id===d.client_id?String(o.llc_name):null,email:c?String(c.email):null})});}
 for(const d of tables.library_documents||[])files.push({storageKey:String(d.storage_key),path:`/reference/${encodeURIComponent(String(d.key))}-${encodeURIComponent(String(d.storage_key).split('/').pop()!)}.backup`});
 for(const o of tables.orders||[])if(o.summary_storage_key)files.push({storageKey:String(o.summary_storage_key),path:`/summaries/${o.id}-${encodeURIComponent(String(o.summary_storage_key).split('/').pop()!)}.backup`});
 return [...new Map(files.map(f=>[f.storageKey,f])).values()];
}
export async function backupProgress(){
 const db=await getDb();const [r]=await db.query<{started_at:unknown;completed_at:unknown;error:string|null}>("SELECT started_at,completed_at,error FROM backup_progress WHERE id='database'");
 const raw=await readObject(JOB);const j:BackupJob|null=raw?JSON.parse(raw.toString()):null;
 return {complete:!!r?.completed_at&&!r.error,startedAt:r?.started_at||null,completedAt:r?.completed_at||null,pending:j?j.dump.files.filter(f=>!j.done[f.storageKey]).length:0,errors:j?Object.values(j.errors):[],error:r?.error||null};
}
export async function runDbBackup(options:{resumeOnly?:boolean;budgetMs?:number}={}):Promise<{key:string;sizeBytes:number;rowCounts:Record<string,number>;complete:boolean;pending:number}>{
 const db=await getDb();await db.query("INSERT INTO backup_progress(id) VALUES('database') ON CONFLICT DO NOTHING");
 const locked=await db.query(`UPDATE backup_progress SET lease_until=now()+interval '10 minutes' WHERE id='database' AND (lease_until IS NULL OR lease_until<now()) RETURNING id`);
 if(!locked.length)return {key:'',sizeBytes:0,rowCounts:{},complete:false,pending:0};
 try{
  const saved=await readObject(JOB);let job:BackupJob|null=saved?JSON.parse(saved.toString()):null;
  if(!job&&options.resumeOnly)return {key:'',sizeBytes:0,rowCounts:{},complete:(await backupProgress()).complete,pending:0};
  if(!job){
   // One statement captures a consistent database snapshot. Never include
   // transient encrypted taxpayer numbers in a retained backup.
   const selects=BACKUP_TABLES.map(t=>`'${t}',(SELECT coalesce(json_agg(x),'[]'::json) FROM ${t} x)`).join(',');
   const [snap]=await db.query<{dump:BackupDump['tables']}>(`SELECT json_build_object(${selects}) AS dump`);
   for(const row of snap.dump.service_orders){row.ein_secret=null;}
   const dump:BackupDump={version:1,dumpedAt:new Date().toISOString(),tables:snap.dump,files:[],fileManifestVersion:1};dump.files=backupFiles(dump.tables);
   job={key:`db-${dump.dumpedAt.replace(/[:.]/g,'-')}.json.gz`,dump,done:{},errors:{}};
   await putObject(JOB,Buffer.from(JSON.stringify(job)),true);
   await db.query("UPDATE backup_progress SET started_at=now(),completed_at=NULL,error=NULL WHERE id='database'");
  }
  const began=Date.now();
  // A failed early file does not prevent attempting the rest. Checkpoints
  // survive process loss; the continuation cron repeats unfinished work.
  for(const f of job.dump.files){
   if(job.done[f.storageKey])continue;if(Date.now()-began>=(options.budgetMs??180000))break;
   try{
    if(await storageWasDeleted(f.storageKey)){job.done[f.storageKey]='deleted';delete job.errors[f.storageKey];}
    else{await mirrorFile(f);const raw=await readStoredFile(f.storageKey);f.sha=hashBytes(isEncrypted(raw)?unseal(raw):raw);job.done[f.storageKey]=f.sha;delete job.errors[f.storageKey];}
   }catch(e){job.errors[f.storageKey]=String(e);}
   await putObject(JOB,Buffer.from(JSON.stringify(job)),true);
  }
  const pending=job.dump.files.filter(f=>!job!.done[f.storageKey]).length;
  const rowCounts=Object.fromEntries(BACKUP_TABLES.map(t=>[t,job!.dump.tables[t].length]));
  if(pending){await db.query("UPDATE backup_progress SET error=$1 WHERE id='database'",[`${pending} file(s) pending; automatic continuation scheduled`]);return {key:job.key,sizeBytes:0,rowCounts,complete:false,pending};}
  // Deletions may arrive after a file was verified. Omit them from the final
  // manifest and rows; a later deletion is additionally enforced on restore.
  const deleted=new Set<string>();
  for(const f of job.dump.files)if(await storageWasDeleted(f.storageKey))deleted.add(f.storageKey);
  job.dump.files=job.dump.files.filter(f=>!deleted.has(f.storageKey));
  job.dump.tables.documents=job.dump.tables.documents.filter(d=>!d.deleted_at&&!deleted.has(String(d.storage_key)));
  const data=gzipSync(Buffer.from(JSON.stringify(job.dump)));
  const existing=await readObject(PREFIX+job.key);
  if(existing&&!existing.equals(data))throw new Error('Refusing to overwrite a different completed backup');
  if(!existing)await putObject(PREFIX+job.key,data);
  await db.query("UPDATE backup_progress SET completed_at=now(),error=NULL WHERE id='database'");
  const {removeStoredFile}=await import('./storage');await removeStoredFile(env.BLOB_READ_WRITE_TOKEN?JOB:`dev:${JOB}`);
  return {key:job.key,sizeBytes:data.length,rowCounts,complete:true,pending:0};
 }catch(e){await db.query("UPDATE backup_progress SET error=$1,completed_at=NULL WHERE id='database'",[String(e)]);throw e;}
 finally{await db.query("UPDATE backup_progress SET lease_until=NULL WHERE id='database'");}
}
