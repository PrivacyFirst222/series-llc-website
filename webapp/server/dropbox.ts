import { env } from "./env";
import { getDb } from "./db";
import { readStoredFile, storageWasDeleted } from "./storage";
import { createHash } from "node:crypto";

/** Verified client-file backup. Sensitive files are copied as ciphertext.
 * Deletion requests propagate through the durable deletion journal. Each run
 * continues through all pending files; saved progress resumes interruptions. */

const configured = () =>
  Boolean(env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET && env.DROPBOX_REFRESH_TOKEN);

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.DROPBOX_REFRESH_TOKEN,
      client_id: env.DROPBOX_APP_KEY,
      client_secret: env.DROPBOX_APP_SECRET,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

const safePathPart = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "unnamed";

/** Dropbox passes the upload path in an HTTP header, and headers are
 *  ASCII-only — an em dash in a document title (char 8212) kills the whole
 *  request with a ByteString TypeError (seen in production 25 Aug 2026; the
 *  dev fallback writes to disk and never builds the header, which is why the
 *  suite's 92 em-dashed files all passed). Dropbox's documented fix: escape
 *  every non-ASCII character as \uXXXX inside the header JSON. */
export const headerSafeJson = (v: unknown): string =>
  JSON.stringify(v).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );

async function uploadToDropbox(path: string, data: Buffer): Promise<void> {
  const token = await accessToken();
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": headerSafeJson({ path, mode: "overwrite", mute: true }),
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}): ${await res.text()}`);
}

async function uploadDev(path: string, data: Buffer): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");
  const root = process.env.DEV_MIRROR_DIR || fileURLToPath(new URL("../.dev-data/dropbox-mirror", import.meta.url));
  await mkdir(dirname(root + path), { recursive: true });
  await writeFile(root + path, data);
}


export const hashBytes = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export interface BackupFile { storageKey: string; path: string; sha?: string; }
export function documentMirrorPath(doc: {id: string; title: string; kind: string; llc_name?: string | null; email?: string | null; storage_key: string}): string {
  return `/${safePathPart(doc.llc_name || doc.email || "unassigned")}/${doc.id.slice(0,8)}-${safePathPart(doc.title || doc.kind)}.pdf${doc.storage_key.endsWith('.encrypted') ? '.encrypted' : ''}`;
}
const devMirror = async (path: string) => {
  const {fileURLToPath} = await import('node:url');
  return (process.env.DEV_MIRROR_DIR || fileURLToPath(new URL('../.dev-data/dropbox-mirror', import.meta.url))) + path;
};
export async function readMirror(path: string): Promise<Buffer | null> {
  if (!configured()) {
    if (env.isProd) throw new Error('Dropbox is not connected');
    const {readFile} = await import('node:fs/promises');
    try { return await readFile(await devMirror(path)); } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') return null; throw e; }
  }
  const r=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Dropbox-API-Arg':headerSafeJson({path})},signal:AbortSignal.timeout(20000)});
  if(r.status===409 && (await r.text()).includes('not_found')) return null;
  if(!r.ok) throw new Error(`Dropbox read failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}
export async function deleteMirror(path: string): Promise<void> {
  if (!configured()) {
    if (env.isProd) throw new Error('Dropbox is not connected');
    const {unlink}=await import('node:fs/promises');
    try {await unlink(await devMirror(path));} catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;} return;
  }
  const r=await fetch('https://api.dropboxapi.com/2/files/delete_v2',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({path}),signal:AbortSignal.timeout(20000)});
  if(!r.ok){const text=await r.text();if(r.status===409&&text.includes('not_found'))return;throw new Error(`Dropbox deletion failed (${r.status})`);}
}
export async function mirrorFile(file: BackupFile): Promise<{sha:string;copied:boolean}> {
  const bytes=await readStoredFile(file.storageKey), sha=hashBytes(bytes);
  const prior=await readMirror(file.path);
  let copied=false;
  if(!prior || hashBytes(prior)!==sha){
    if(configured())await uploadToDropbox(file.path,bytes);else await uploadDev(file.path,bytes);
    copied=true;
  }
  // Verify what was stored, not just the upload response.
  const saved=await readMirror(file.path);
  if(!saved || hashBytes(saved)!==sha)throw new Error('Backup file byte verification failed');
  // A client may delete while an upload is in flight. Do not recreate its copy.
  if(await storageWasDeleted(file.storageKey)){await deleteMirror(file.path);throw new Error('Document was deleted during backup');}
  return {sha,copied};
}
export interface MirrorStatus { configured:boolean; mirrored:number; pending:number; lastMirroredAt:string|null; complete:boolean; failures:number; lastError:string|null; }
export async function mirrorStatus(): Promise<MirrorStatus> {
  const db=await getDb();
  const [row]=await db.query<{mirrored:string;pending:string;last:string|null;failures:string}>(`SELECT count(*) FILTER(WHERE mirrored_at IS NOT NULL) AS mirrored, count(*) FILTER(WHERE mirrored_at IS NULL) AS pending, max(mirrored_at)::text AS last, count(*) FILTER(WHERE mirror_error IS NOT NULL) AS failures FROM documents WHERE deleted_at IS NULL`);
  const [progress]=await db.query<{completed_at:unknown;error:string|null}>("SELECT completed_at,error FROM backup_progress WHERE id='mirror'");
  const [deletions]=await db.query<{n:string}>("SELECT count(*) AS n FROM document_deletions WHERE completed_at IS NULL");
  return {configured:configured(),mirrored:Number(row.mirrored),pending:Number(row.pending),lastMirroredAt:row.last,failures:Number(row.failures)+Number(deletions.n),complete:!!progress?.completed_at&&!progress.error&&Number(row.pending)===0&&Number(deletions.n)===0,lastError:progress?.error||null};
}
/** Verifies all retained documents, continuing in pages until finished or the
 * invocation budget is reached. The five-minute continuation resumes its cursor;
 * failed files are recorded and revisited after later files have been attempted. */
export async function runFileMirror(options: {budgetMs?:number} = {}): Promise<{mirrored:number;failed:number;skipped:boolean;complete:boolean}> {
 const db=await getDb();
 if(!configured()&&env.isProd)return {mirrored:0,failed:0,skipped:true,complete:false};
 const {retryDocumentDeletions}=await import('./document-retention');await retryDocumentDeletions();
 await db.query("INSERT INTO backup_progress(id) VALUES('mirror') ON CONFLICT DO NOTHING");
 const acquired=await db.query<{cursor:string|null}>(`UPDATE backup_progress SET lease_until=now()+interval '10 minutes',started_at=COALESCE(started_at,now()),completed_at=NULL WHERE id='mirror' AND (lease_until IS NULL OR lease_until<now()) RETURNING cursor`);
 if(!acquired.length)return {mirrored:0,failed:0,skipped:false,complete:false};
 const started=Date.now(),budget=options.budgetMs??180000; let cursor=acquired[0].cursor||'',mirrored=0,failed=0,complete=false;
 try {
  let exhausted=false;
  while(Date.now()-started<budget){
   const docs=await db.query<{id:string;title:string;kind:string;storage_key:string;llc_name:string|null;email:string|null}>(`SELECT d.id,d.title,d.kind,d.storage_key,o.llc_name,c.email FROM documents d LEFT JOIN orders o ON o.id=d.order_id AND o.client_id=d.client_id LEFT JOIN clients c ON c.id=d.client_id WHERE d.deleted_at IS NULL AND d.id::text>$1 ORDER BY d.id::text LIMIT 50`,[cursor]);
   if(!docs.length){exhausted=true;break;}
   for(const doc of docs){
    if(Date.now()-started>=budget)break;
    try {const path=documentMirrorPath(doc);const r=await mirrorFile({storageKey:doc.storage_key,path});if(r.copied)mirrored++;
      await db.query('UPDATE documents SET mirrored_at=now(),mirror_path=$2,mirror_hash=$3,mirror_error=NULL,mirror_attempted_at=now() WHERE id=$1 AND storage_key=$4 AND deleted_at IS NULL',[doc.id,path,r.sha,doc.storage_key]);
    }catch(e){failed++;await db.query('UPDATE documents SET mirrored_at=NULL,mirror_error=$2,mirror_attempted_at=now() WHERE id=$1',[doc.id,String(e)]);}
    cursor=doc.id;await db.query("UPDATE backup_progress SET cursor=$1 WHERE id='mirror'",[cursor]);
   }
  }
  if(exhausted){
    const [r]=await db.query<{n:string}>("SELECT count(*) AS n FROM documents WHERE deleted_at IS NULL AND mirrored_at IS NULL");
    const [deletions]=await db.query<{n:string}>('SELECT count(*) AS n FROM document_deletions WHERE completed_at IS NULL');
    complete=Number(r.n)===0&&Number(deletions.n)===0;
    await db.query("UPDATE backup_progress SET cursor=NULL,completed_at=CASE WHEN $1 THEN now() ELSE NULL END,error=$2 WHERE id='mirror'",[complete,complete?null:`${r.n} file(s) pending; automatic retry scheduled`]);
  }
 }finally{await db.query("UPDATE backup_progress SET lease_until=NULL WHERE id='mirror'");}
 return {mirrored,failed,skipped:false,complete};
}

/** Versioned object operations for the deletion journal. An old writer cannot
 * overwrite a concurrently appended decision. Missing is distinct from failure. */
export async function readMirrorVersion(path:string):Promise<{data:Buffer;rev:string}|null>{
 if(!configured()){const data=await readMirror(path);return data?{data,rev:hashBytes(data)}:null;}
 const r=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Dropbox-API-Arg':headerSafeJson({path})},signal:AbortSignal.timeout(20000)});
 if(r.status===409&&(await r.text()).includes('not_found'))return null;
 if(!r.ok)throw new Error(`Deletion journal read failed (${r.status})`);
 const meta=JSON.parse(r.headers.get('dropbox-api-result')||'null');if(!meta?.rev)throw new Error('Deletion journal revision missing');
 return {data:Buffer.from(await r.arrayBuffer()),rev:meta.rev};
}
export async function compareWriteMirror(path:string,data:Buffer,rev:string|null):Promise<boolean>{
 if(!configured()){
  if(env.isProd)throw new Error('Dropbox is not connected');
  const fs=await import('node:fs'),{dirname}=await import('node:path');const file=await devMirror(path);fs.mkdirSync(dirname(file),{recursive:true});
  // No await while holding the local lock; another fixture process cannot
  // interleave its read/compare/rename. A stale lock refuses rather than guesses.
  const lock=file+'.lock';let handle:number;try{handle=fs.openSync(lock,'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return false;throw e;}
  try{const current=fs.existsSync(file)?fs.readFileSync(file):null;if((current?hashBytes(current):null)!==rev)return false;const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);return true;}
  finally{fs.closeSync(handle);fs.unlinkSync(lock);}
 }
 const r=await fetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/octet-stream','Dropbox-API-Arg':headerSafeJson({path,mode:rev?{'.tag':'update',update:rev}:{'.tag':'add'},autorename:false,strict_conflict:true,mute:true})},body:new Uint8Array(data),signal:AbortSignal.timeout(20000)});
 if(r.status===409)return false;if(!r.ok)throw new Error(`Deletion journal write failed (${r.status})`);return true;
}
