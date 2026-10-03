import {ioSignal,checkDeadline,activeDeadline,withDeadline,providerFailure} from './operation-deadline';
import { env } from "./env";
import { getDb } from "./db";
import { readStoredFile, storageWasDeleted } from "./storage";
import { createHash } from "node:crypto";
import {isEncrypted,unseal} from "./encryption";

/** Verified client-file backup. Sensitive files are copied as ciphertext.
 * Deletion requests propagate through the durable deletion journal. Each run
 * continues through all pending files; saved progress resumes interruptions. */

const configured = () =>
  Boolean(env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET && env.DROPBOX_REFRESH_TOKEN);

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
 checkDeadline();
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
    signal: ioSignal(),
  });
  if (!res.ok) throw providerFailure(res,'Dropbox token refresh');
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
    signal: ioSignal(),
  });
  if (!res.ok) throw providerFailure(res,'Dropbox upload');
}

async function uploadDev(path: string, data: Buffer): Promise<void> {
 checkDeadline();
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");
  const root = process.env.DEV_MIRROR_DIR || fileURLToPath(new URL("../.dev-data/dropbox-mirror", import.meta.url));
  await mkdir(dirname(root + path), { recursive: true });
  await writeFile(root + path, data);
}


export const hashBytes = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export interface BackupFile { storageKey: string; path: string; sha?: string; officeRecoveryIdentity?:unknown[]; }
export function documentMirrorPath(doc: {id: string; title: string; kind: string; llc_name?: string | null; email?: string | null; storage_key: string;mirror_path?:string|null}): string {
  if(doc.mirror_path)return doc.mirror_path;
  if(doc.kind==='articles'||doc.kind==='psd')return `/${safePathPart(doc.llc_name || doc.email || "unassigned")}/${doc.id}-${hashBytes(Buffer.from(doc.storage_key))}.pdf`;
  return `/${safePathPart(doc.llc_name || doc.email || "unassigned")}/${doc.id.slice(0,8)}-${safePathPart(doc.title || doc.kind)}.pdf${doc.storage_key.endsWith('.encrypted') ? '.encrypted' : ''}`;
}
const devMirror = async (path: string) => {
  const {fileURLToPath} = await import('node:url');
  return (process.env.DEV_MIRROR_DIR || fileURLToPath(new URL('../.dev-data/dropbox-mirror', import.meta.url))) + path;
};
export async function readMirror(path: string): Promise<Buffer | null> {
 checkDeadline();
  if (!configured()) {
    if (env.isProd) throw new Error('Dropbox is not connected');
    const {readFile} = await import('node:fs/promises');
    try { return await readFile(await devMirror(path)); } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') return null; throw e; }
  }
  const r=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Dropbox-API-Arg':headerSafeJson({path})},signal:ioSignal()});
  if(r.status===409 && (await r.text()).includes('not_found')) return null;
  if(!r.ok) throw providerFailure(r,'Dropbox read');
  return Buffer.from(await r.arrayBuffer());
}
export async function deleteMirror(path: string): Promise<void> {
 checkDeadline();
  if (!configured()) {
    if (env.isProd) throw new Error('Dropbox is not connected');
    const {unlink}=await import('node:fs/promises');
    try {await unlink(await devMirror(path));} catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;} return;
  }
  const r=await fetch('https://api.dropboxapi.com/2/files/delete_v2',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({path}),signal:ioSignal()});
  if(!r.ok){const text=await r.text();if(r.status===409&&text.includes('not_found'))return;throw providerFailure(r,'Dropbox deletion');}
}
export async function mirrorFile(file: BackupFile): Promise<{sha:string;copied:boolean}> {
  const {officeRecoveryTables,ensureOfficeMirrorCopy}=await import('./office-file-recovery');
  const {officeFileIdentities}=await import('./office-recovery-sources');
  const identity=officeFileIdentities(await officeRecoveryTables(await getDb())).get(file.storageKey);
  if(identity)return ensureOfficeMirrorCopy(identity,file.path);
  const bytes=await readStoredFile(file.storageKey), sha=hashBytes(bytes);
  const prior=await readMirror(file.path);
  let copied=false;
  if(prior && hashBytes(prior)!==sha){
    // A filename is a recovery identity. Only re-encryption of identical
    // plaintext may replace its bytes; a new document needs a new identity.
    if(!isEncrypted(prior)||!isEncrypted(bytes)||hashBytes(unseal(prior))!==hashBytes(unseal(bytes)))throw new Error('Refusing to overwrite different recovery file contents');
  }
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
export async function runFileMirror(options: {budgetMs?:number;deadline?:number;cleanupDeadline?:number} = {}): Promise<{mirrored:number;failed:number;skipped:boolean;complete:boolean}> {
 const db=await getDb();
 if(!configured()&&env.isProd)return {mirrored:0,failed:0,skipped:true,complete:false};
 const {retryDocumentDeletions}=await import('./document-retention');
 const until=Math.min(options.deadline??Date.now()+(options.budgetMs??180000),activeDeadline());
 const cleanupUntil=Math.min(options.cleanupDeadline??until,until);
 if(Date.now()<cleanupUntil)await withDeadline(cleanupUntil,()=>retryDocumentDeletions({deadline:cleanupUntil}));
 await db.query("INSERT INTO backup_progress(id) VALUES('mirror') ON CONFLICT DO NOTHING");
 const acquired=await db.query<{cursor:string|null}>(`UPDATE backup_progress SET lease_until=now()+interval '10 minutes',started_at=COALESCE(started_at,now()),completed_at=NULL WHERE id='mirror' AND (lease_until IS NULL OR lease_until<now()) RETURNING cursor`);
 if(!acquired.length)return {mirrored:0,failed:0,skipped:false,complete:false};
 const started=Date.now(),budget=Math.max(0,until-started); let cursor=acquired[0].cursor||'',mirrored=0,failed=0,complete=false;
 try {
  let exhausted=false;
  while(Date.now()-started<budget){
   const docs=await db.query<{id:string;client_id:string;title:string;kind:string;storage_key:string;mirror_path:string|null;llc_name:string|null;email:string|null}>(`SELECT d.id,d.client_id,d.title,d.kind,d.storage_key,d.mirror_path,o.llc_name,c.email FROM documents d LEFT JOIN orders o ON o.id=d.order_id AND o.client_id=d.client_id LEFT JOIN clients c ON c.id=d.client_id WHERE d.deleted_at IS NULL AND d.id::text>$1 ORDER BY d.id::text LIMIT 50`,[cursor]);
   if(!docs.length){exhausted=true;break;}
   for(const doc of docs){
    if(Date.now()-started>=budget)break;
    try {await withDeadline(until,async()=>{
      const proposed=documentMirrorPath(doc);
      const [saved]=await db.query<{mirror_path:string}>('UPDATE documents SET mirror_path=COALESCE(mirror_path,$2) WHERE id=$1 AND storage_key=$3 AND deleted_at IS NULL RETURNING mirror_path',[doc.id,proposed,doc.storage_key]);
      if(!saved)throw Error('The current document changed before mirror registration');
      const path=saved.mirror_path;
      const {ensureDeletionMirror,recordDocumentCopy,readRecoveryJournal}=await import('./backup-deletions');
      await ensureDeletionMirror([]);
      const registered=(await readRecoveryJournal()).copies?.find(c=>c.storageKey===doc.storage_key);
      let originalId=doc.id;
      if(registered&&registered.documentId!==doc.id){
       // Legacy ordinary rows can share one physical file. Keep that file's
       // already-registered identity, after proving every reference has the
       // same owner and no office operation owns this key. Never reassign an
       // office original or infer ownership from a pathname or its bytes.
       const [owner]=await db.query<{client_id:string}>('SELECT client_id FROM documents WHERE id=$1 AND storage_key=$2',[registered.documentId,doc.storage_key]);
       const foreign=await db.query('SELECT id FROM documents WHERE storage_key=$1 AND client_id<>$2',[doc.storage_key,doc.client_id]);
       const office=await db.query("SELECT o.id FROM office_operations o,jsonb_each(o.files) f WHERE f.value->>'key'=$1 LIMIT 1",[doc.storage_key]);
       if(!owner||owner.client_id!==doc.client_id||foreign.length||office.length)throw Error('Recovery copy ownership conflict');
       originalId=registered.documentId;
      }
      if(!await recordDocumentCopy({documentId:originalId,storageKey:doc.storage_key,mirrorPath:path}))throw Error('The document was deleted before mirroring');
      const r=await withDeadline(until,()=>mirrorFile({storageKey:doc.storage_key,path}));if(r.copied)mirrored++;
      await db.query('UPDATE documents SET mirrored_at=now(),mirror_path=$2,mirror_hash=$3,mirror_error=NULL,mirror_attempted_at=now() WHERE id=$1 AND storage_key=$4 AND deleted_at IS NULL',[doc.id,path,r.sha,doc.storage_key]);
    });}catch(e){failed++;await db.query('UPDATE documents SET mirrored_at=NULL,mirror_error=$2,mirror_attempted_at=now() WHERE id=$1',[doc.id,String(e)]);}
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
 checkDeadline();
 if(!configured()){const data=await readMirror(path);return data?{data,rev:hashBytes(data)}:null;}
 const r=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Dropbox-API-Arg':headerSafeJson({path})},signal:ioSignal()});
 if(r.status===409&&(await r.text()).includes('not_found'))return null;
 if(!r.ok){
  // Keep provider diagnostics useful without logging its raw body, credentials
  // or document contents. Production secrets cannot be read back for a probe.
  const text=await r.text().catch(()=>''),known=['missing_scope','invalid_access_token','expired_access_token','invalid_select_user','invalid_select_admin','user_suspended'];
  let category='unknown',requiredScope:string|null=null;
  try{const error=JSON.parse(text).error;if(known.includes(error?.['.tag']))category=error['.tag'];if(['files.content.read','files.content.write','files.metadata.read'].includes(error?.required_scope))requiredScope=error.required_scope;}catch{/* Plain-text provider errors also occur. */}
  const scope=text.match(/required scope ['"](files\.(?:content\.(?:read|write)|metadata\.read))['"]/);
  if(scope){category='missing_scope';requiredScope=scope[1];}
  else if(category==='unknown'&&text.includes('Content-Type'))category='bad_content_type';
  const requestId=r.headers.get('x-dropbox-request-id');
  console.error('[dropbox journal read]',{status:r.status,category,requiredScope,requestId:requestId&&/^[A-Za-z0-9_-]{1,128}$/.test(requestId)?requestId:null});
  throw providerFailure(r,'Deletion journal read');
 }
 const meta=JSON.parse(r.headers.get('dropbox-api-result')||'null');if(!meta?.rev)throw new Error('Deletion journal revision missing');
 return {data:Buffer.from(await r.arrayBuffer()),rev:meta.rev};
}
export async function compareWriteMirror(path:string,data:Buffer,rev:string|null):Promise<boolean>{
 checkDeadline();
 if(!configured()){
  if(env.isProd)throw new Error('Dropbox is not connected');
  const fs=await import('node:fs'),{dirname}=await import('node:path');const file=await devMirror(path);fs.mkdirSync(dirname(file),{recursive:true});
  // No await while holding the local lock; another fixture process cannot
  // interleave its read/compare/rename. A stale lock refuses rather than guesses.
  const lock=file+'.lock';let handle:number;try{handle=fs.openSync(lock,'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return false;throw e;}
  try{const current=fs.existsSync(file)?fs.readFileSync(file):null;if((current?hashBytes(current):null)!==rev)return false;const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);return true;}
  finally{fs.closeSync(handle);fs.unlinkSync(lock);}
 }
 const r=await fetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/octet-stream','Dropbox-API-Arg':headerSafeJson({path,mode:rev?{'.tag':'update',update:rev}:{'.tag':'add'},autorename:false,strict_conflict:true,mute:true})},body:new Uint8Array(data),signal:ioSignal()});
 if(r.status===409)return false;if(!r.ok)throw providerFailure(r,'Deletion journal write');return true;
}
