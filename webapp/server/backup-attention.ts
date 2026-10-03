import {env} from './env';
import type {Db} from './db';
import {sendMail} from './email';
import {readMirrorVersion,compareWriteMirror,hashBytes} from './dropbox';
import {OfficeRecoveryError} from './office-recovery-sources';
import {withDeadline} from './operation-deadline';

interface Episode {
 version:1;problemId:string;reference:string;reason:string;generation:number;active:boolean;
 firstSeenAt:string;lastSeenAt:string;episodeId:string;resolvedAt?:string;
 mail:{to:string;subject:string;html:string};mailState:'pending'|'accepted'|'failed'|'unconfirmed'|'configuration_error';
 providerId?:string;firstAttemptAt?:string;lastAttemptAt?:string;lease?:string;leaseUntil?:string;error?:string;
 nextEligibleAt?:string;
}
interface Index {version:1;ids:string[];cursor?:string}
const root='/recovery/backup-attention/',indexPath=root+'index.json';
const encoded=(value:unknown)=>{const body=JSON.stringify(value);return Buffer.from(JSON.stringify({body,sha:hashBytes(Buffer.from(body))}));};
function decoded<T>(bytes:Buffer):T{const e=JSON.parse(bytes.toString());if(typeof e.body!=='string'||e.sha!==hashBytes(Buffer.from(e.body)))throw Error('Backup attention record checksum mismatch');return JSON.parse(e.body);}
async function index():Promise<Index>{const raw=await readMirrorVersion(indexPath);const i=raw?decoded<Index>(raw.data):{version:1 as const,ids:[]};if(i.version!==1||!Array.isArray(i.ids)||i.ids.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw Error('Invalid backup attention index');return i;}
async function register(id:string){for(let n=0;n<12;n++){const raw=await readMirrorVersion(indexPath),i=raw?decoded<Index>(raw.data):{version:1 as const,ids:[]};if(i.ids.includes(id))return;i.ids.push(id);i.ids.sort();if(await compareWriteMirror(indexPath,encoded(i),raw?.rev??null))return;}throw Error('Backup attention index busy');}
function validate(e:Episode,id:string){if(e.version!==1||e.problemId!==id||!e.episodeId||!Number.isSafeInteger(e.generation)||e.generation<1||!Number.isFinite(Date.parse(e.firstSeenAt))||!['pending','accepted','failed','unconfirmed','configuration_error'].includes(e.mailState)||typeof e.mail?.html!=='string')throw Error('Invalid backup attention record');return e;}
async function load(id:string){const raw=await readMirrorVersion(root+id+'.json');return raw?{...raw,episode:validate(decoded<Episode>(raw.data),id)}:null;}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function observeBackupProblem(reference:string,reason:string):Promise<string>{
 const id=hashBytes(Buffer.from(JSON.stringify([reference,reason])));
 for(let n=0;n<12;n++){
  const raw=await load(id);if(raw?.episode.active){
   const refreshed={...raw.episode,lastSeenAt:new Date().toISOString()};
   if(!await compareWriteMirror(root+id+'.json',encoded(refreshed),raw.rev))continue;
   await register(id);return id;
  }
  const now=new Date().toISOString();
  const episode:Episode={version:1,problemId:id,reference,reason,generation:(raw?.episode.generation??0)+1,active:true,firstSeenAt:now,lastSeenAt:now,episodeId:crypto.randomUUID(),mailState:'pending',mail:{to:env.ADMIN_NOTIFY_EMAIL,subject:'Backup needs office attention',html:`<p>A new backup cannot finish until an office document issue is resolved. Existing completed backups have not been removed. Open Backup recovery to review the affected file.</p><p>First blocked: ${escape(now)}. Reason: ${escape(reason)}.</p><p><a href="${escape(env.PUBLIC_BASE_URL)}/admin?backupProblem=${id}">Review backup issue</a></p>`}};
  if(await compareWriteMirror(root+id+'.json',encoded(episode),raw?.rev??null)){await register(id);return id;}
 }
 throw Error('Backup attention record busy');
}
export async function resolveBackupProblem(reference:string){
 for(const id of (await index()).ids)for(let n=0;n<12;n++){
  const raw=await load(id);if(!raw||!raw.episode.active||raw.episode.reference!==reference)break;
  const e={...raw.episode,active:false,resolvedAt:new Date().toISOString()};
  if(await compareWriteMirror(root+id+'.json',encoded(e),raw.rev))break;
 }
}
/** Notification storage must not prevent a successful document recovery. */
export async function resolveBackupProblemAfterRecovery(db:Db,reference:string){
 try{await resolveBackupProblem(reference);}
 catch(error){await db.query("INSERT INTO backup_progress(id,error) VALUES('database',$1) ON CONFLICT(id) DO UPDATE SET error=EXCLUDED.error",['Backup alert persistence failed: '+String(error)]).catch(()=>{});}
}
export async function backupAttention(){
 const rows:Episode[]=[];for(const id of (await index()).ids){const r=await load(id);if(r)rows.push(r.episode);}
 return rows;
}
export async function deliverBackupAttention(options:{problemId?:string;deadline?:number}={}){
 const deadline=options.deadline??Date.now()+20000;
 return withDeadline(deadline,()=>dispatchBackupAttention(options,deadline));
}
async function dispatchBackupAttention(options:{problemId?:string;deadline?:number},deadline:number){
 const inventory=await index(),ids=inventory.ids;
 if(options.problemId&&!ids.includes(options.problemId))return null;
 const order=options.problemId?[options.problemId]:[...ids.filter(id=>id>(inventory.cursor??'')),...ids.filter(id=>id<=(inventory.cursor??''))];
 for(const id of order){
  if(Date.now()+1000>=deadline)break;
  const raw=await load(id);if(!raw)continue;
  const e=raw.episode;if(!e.active){if(options.problemId)return {state:'resolved',problemId:id};continue;}
  if(e.mailState==='accepted'){if(options.problemId)return {state:'already_sent',problemId:id};continue;}
  if(e.nextEligibleAt&&Date.parse(e.nextEligibleAt)>Date.now()){if(options.problemId)return {state:'retry_scheduled',problemId:id,nextEligibleAt:e.nextEligibleAt};continue;}
  if(e.leaseUntil&&Date.parse(e.leaseUntil)>Date.now()){if(options.problemId)throw new OfficeRecoveryError('This notification is being sent.','OFFICE_BUSY');continue;}
  if(!options.problemId){
   for(let n=0;n<12;n++){const cursor=await readMirrorVersion(indexPath);if(!cursor)throw Error('Backup attention index missing');const next=decoded<Index>(cursor.data);next.cursor=id;if(await compareWriteMirror(indexPath,encoded(next),cursor.rev))break;if(n===11)throw Error('Backup attention cursor busy');}
  }
  if(e.firstAttemptAt&&e.mail.to!==env.ADMIN_NOTIFY_EMAIL)throw new OfficeRecoveryError('The configured recipient differs from this frozen notification. Review the backup issue.','NOTIFICATION_PAYLOAD_CHANGED');
  if(e.firstAttemptAt&&Date.now()-Date.parse(e.firstAttemptAt)>=23*3600000){
   await compareWriteMirror(root+id+'.json',encoded({...e,mailState:'unconfirmed',error:'Notification acceptance is unconfirmed; review the backup issue.'}),raw.rev);
   if(options.problemId)throw new OfficeRecoveryError('Notification acceptance is unconfirmed. Review the backup issue.','NOTIFICATION_UNCONFIRMED');continue;
  }
  if(!env.ADMIN_NOTIFY_EMAIL||(env.isProd&&!env.RESEND_API_KEY)){
   await compareWriteMirror(root+id+'.json',encoded({...e,mailState:'configuration_error',error:'Office email configuration is incomplete.'}),raw.rev);
   return {state:'configuration_error',problemId:id};
  }
  const lease=crypto.randomUUID(),now=new Date().toISOString();
  const sending:Episode={...e,mail:e.firstAttemptAt?e.mail:{...e.mail,to:env.ADMIN_NOTIFY_EMAIL},lease,leaseUntil:new Date(Date.now()+60000).toISOString(),firstAttemptAt:e.firstAttemptAt??now,lastAttemptAt:now};
  if(!await compareWriteMirror(root+id+'.json',encoded(sending),raw.rev))continue;
  const held=await load(id);if(!held?.episode.active||held.episode.lease!==lease)continue;
  let providerId:string|undefined,error:string|undefined,nextEligibleAt:string|undefined;
  try{providerId=await sendMail({...sending.mail,idempotencyKey:'backup-attention/'+sending.episodeId},{deadline:deadline-1000});}catch(e){error=String(e).slice(0,500);const ms=(e as {retryAfterMs?:number}).retryAfterMs;if(ms!==undefined)nextEligibleAt=new Date(Date.now()+ms).toISOString();}
  for(let n=0;n<12;n++){
   const latest=await load(id);if(!latest||latest.episode.lease!==lease)break;
   const done={...latest.episode,mailState:providerId?'accepted' as const:'failed' as const,providerId,error,nextEligibleAt,lease:undefined,leaseUntil:undefined};
   if(await compareWriteMirror(root+id+'.json',encoded(done),latest.rev))return {state:done.mailState,problemId:id};
  }
  throw Error('Notification result could not be persisted; provider acceptance remains unconfirmed.');
 }
 return {state:'idle'};
}
