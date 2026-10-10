import type {Context,Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {getDb} from './db';
import {env} from './env';
import {requireAdmin,err} from './shared';
import {MAX_UPLOAD_BYTES} from '../src/lib/uploadLimits';
import {englishTextProblems,ENGLISH_TEXT_ERROR} from '../src/lib/englishText';
import {seal,unseal} from './encryption';
import {readObject,removeStoredFile} from './storage';
import {activeDeadline,ioSignal} from './operation-deadline';
import {officeRecoveryTables} from './office-file-recovery';
import {officeFileIdentities} from './office-recovery-sources';
import {historyId} from './office-history-recovery';

const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const spec=z.object({field:z.string().min(1),name:z.string().min(1),size:z.number().int().min(8).max(MAX_UPLOAD_BYTES),sha:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const initial=z.object({route:z.string(),fields:z.array(z.tuple([z.string(),z.string()])),files:z.array(spec).min(1)}).strict();
type FileSpec=z.infer<typeof spec>;
interface StagedFile extends FileSpec {id:string;path:string;key:string;iv:string}
interface Stage {id:string;session_hash:string;route:string;fields:[string,string][];files:StagedFile[];state:string;lease:string|null;lease_until:string|null;token_expires_at:string;expires_at:string;result_status:number|null;result_body:string|null}
interface ContextStage {stage:Stage;claimed:boolean}
const requests=new WeakMap<Context,ContextStage>();
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function reject(message:string,code:string,status:400|401|404|409|503=400):never{throw new HTTPException(status,{res:Response.json(err(message,code),{status})});}
function slots(route:string):string[]|null {
 if(/^\/api\/admin\/library\/[^/]+$/.test(route)||route==='/api/admin/documents')return ['file'];
 if(new RegExp(`^/api/admin/documents/${uuid}/replace$`).test(route))return ['file'];
 if(new RegExp(`^/api/admin/services/${uuid}/fulfill$`).test(route))return ['file'];
 if(new RegExp(`^/api/admin/orders/${uuid}/(?:articles|correct-articles)$`).test(route))return ['articles'];
 if(new RegExp(`^/api/admin/orders/${uuid}/certificates$`).test(route))return ['certStatus','certifiedCopy'];
 if(new RegExp(`^/api/admin/orders/${uuid}/formation-documents$`).test(route))return ['articles','psd','certStatus','certifiedCopy'];
 if(new RegExp(`^/api/admin/orders/${uuid}/agent-copy$`).test(route))return ['file'];
 if(new RegExp(`^/api/admin/orders/${uuid}/office-recovery/${uuid}/(?:articles|statement|upload)$`).test(route))return ['file'];
 if(/^\/api\/admin\/backups\/history-recovery\/[a-f0-9]{64}\/original$/.test(route))return ['file'];
 return null;
}
async function authorizeTarget(route:string,fields:[string,string][]){
 const db=await getDb(),order=route.match(new RegExp(`^/api/admin/orders/(${uuid})/`)),service=route.match(new RegExp(`^/api/admin/services/(${uuid})/`)),document=route.match(new RegExp(`^/api/admin/documents/(${uuid})/replace$`));
 if(order||service){const table=order?'orders':'service_orders';const [r]=await db.query(`SELECT id FROM ${table} WHERE id=$1 AND paid_at IS NOT NULL AND status NOT IN ('pending_payment','duplicate_payment')`,[(order||service)![1]]);if(!r)reject('Target not found.','NOT_FOUND',404);}
 if(document){const [r]=await db.query("SELECT id FROM documents WHERE id=$1 AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM recovery_holds WHERE id=documents.id AND status='held')",[document[1]]);if(!r)reject('Document not found.','NOT_FOUND',404);}
 if(route==='/api/admin/documents'){
  const values=Object.fromEntries(fields),[client]=await db.query('SELECT id FROM clients WHERE id=$1',[values.clientId]);if(!client)reject('Client not found.','NOT_FOUND',404);
  if(values.orderId&&! (await db.query('SELECT id FROM orders WHERE id=$1 AND client_id=$2 AND paid_at IS NOT NULL',[values.orderId,values.clientId])).length)reject('Company not found.','NOT_FOUND',404);
 }
 if(route.includes('/office-recovery/')||route.includes('/history-recovery/')){
  const tables=await officeRecoveryTables(db),identities=[...officeFileIdentities(tables,{includeUnknown:true}).values()];
  const found=route.includes('/history-recovery/')?identities.some(i=>historyId(i)===route.split('/').at(-2)):identities.some(i=>i.orderId===order?.[1]&&i.operationId===route.split('/').at(-2)&&i.slot===route.split('/').at(-1));
  if(!found)reject('Recovery document not found.','NOT_FOUND',404);
 }
}
async function boundedCipher(file:StagedFile):Promise<Buffer>{
 const maximum=file.size+16;
 if(!env.BLOB_READ_WRITE_TOKEN){const b=await readObject('dev:'+file.path);if(!b)reject('Upload has not completed. Retry the same upload.','UPLOAD_PENDING',503);if(b.length!==maximum)reject('Uploaded file length does not match.','UPLOAD_INVALID');return b;}
 const {get}=await import('@vercel/blob');
 const r=await get(file.path,{access:'private',token:env.BLOB_READ_WRITE_TOKEN,useCache:false,abortSignal:ioSignal()});
 if(!r||r.statusCode!==200)reject('Upload has not completed. Retry the same upload.','UPLOAD_PENDING',503);
 const reader=r.stream.getReader(),parts:Buffer[]=[];let total=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>maximum)reject('Uploaded file exceeds its authorized length.','UPLOAD_INVALID');parts.push(Buffer.from(chunk.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(total!==maximum)reject('Uploaded file is incomplete.','UPLOAD_INVALID');return Buffer.concat(parts,total);
}
async function plainFile(file:StagedFile):Promise<Buffer>{
 const ciphertext=await boundedCipher(file);let plain:Buffer;
 try{const decipher=createDecipheriv('aes-256-gcm',unseal(Buffer.from(file.key,'base64')),Buffer.from(file.iv,'base64'));decipher.setAAD(Buffer.from(file.id));decipher.setAuthTag(ciphertext.subarray(-16));plain=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);}
 catch{reject('Uploaded file authentication failed.','UPLOAD_INVALID');}
 if(plain.length!==file.size||plain.length>MAX_UPLOAD_BYTES||digest(plain)!==file.sha)reject('Uploaded file does not match the selected original.','UPLOAD_INVALID');
 if(!plain.subarray(0,8).toString().startsWith('%PDF-')||!plain.subarray(-1024).toString().includes('%%EOF'))reject('Choose a readable PDF.','NOT_A_PDF');return plain;
}
/** Preserve File-based handlers without retaining every large package file in RAM. */
class StagedPdf extends File {
 constructor(private readonly entry:StagedFile){super([],entry.name,{type:'application/pdf'});}
 override get size(){return this.entry.size;}
 override async arrayBuffer():Promise<ArrayBuffer>{return Uint8Array.from(await plainFile(this.entry)).buffer;}
}
export async function parseOfficeUpload(c:Context,options:{all?:boolean}={}):Promise<Record<string,string|File|(string|File)[]>>{
 const request=requests.get(c);if(!request)return c.req.parseBody(options);
 const {stage}=request,db=await getDb(),lease=crypto.randomUUID();
 const [held]=await db.query<Stage>(`UPDATE office_upload_stages SET state='validating',lease=$2,lease_until=now()+interval '15 minutes' WHERE id=$1 AND expires_at>now() AND (state='issued' OR (state='validating' AND lease_until<now())) RETURNING *`,[stage.id,lease]);
 if(!held)reject('This upload is already in use. Its result must be checked before retrying.','UPLOAD_BUSY',409);
 stage.lease=lease;
 try{for(const file of stage.files)await plainFile(file);}
 catch(error){
  const invalid=error instanceof HTTPException&&error.status===400;
  await db.query("UPDATE office_upload_stages SET state=$3,cleanup_pending=$4,lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2",[stage.id,lease,invalid?'rejected':'issued',invalid]);
  if(invalid)await cleanupOfficeUploads({id:stage.id}).catch(()=>{});
  throw error;
 }
 const [claimed]=await db.query("UPDATE office_upload_stages SET state='processing' WHERE id=$1 AND lease=$2 AND lease_until>now() RETURNING id",[stage.id,lease]);
 if(!claimed)reject('Upload reservation expired. No business operation was started.','UPLOAD_BUSY',409);
 request.claimed=true;
 const body:Record<string,string|File|(string|File)[]>={};
 const append=(key:string,value:string|File)=>{if(options.all&&key in body){const old=body[key];body[key]=Array.isArray(old)?[...old,value]:[old,value];}else body[key]=value;};
 for(const [key,value] of stage.fields)append(key,value);
 for(const file of stage.files)append(file.field,new StagedPdf(file));
 return body;
}
export async function cleanupOfficeUploads(options:{id?:string;deadline?:number}={}){
 const db=await getDb();
 const rows=await db.query<Stage>(`SELECT * FROM office_upload_stages WHERE ($1::uuid IS NULL OR id=$1) AND (cleanup_pending OR expires_at<now()) AND (lease_until IS NULL OR lease_until<now()) ORDER BY cleanup_checked_at NULLS FIRST,created_at LIMIT 50`,[options.id??null]);
 for(const stage of rows){
  if(Date.now()>=Math.min(options.deadline??Infinity,activeDeadline()))break;
  // Claim cleanup so a validating request cannot start while its objects vanish.
  const [claimed]=await db.query("UPDATE office_upload_stages SET state=CASE WHEN state IN ('issued','validating') THEN 'expired' ELSE state END,lease=$2,lease_until=now()+interval '15 minutes' WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",[stage.id,crypto.randomUUID()]);
  if(!claimed)continue;
  try{
   for(const file of stage.files){await removeStoredFile(env.BLOB_READ_WRITE_TOKEN?file.path:'dev:'+file.path);
    if(env.BLOB_READ_WRITE_TOKEN){const {get}=await import('@vercel/blob');const left=await get(file.path,{access:'private',token:env.BLOB_READ_WRITE_TOKEN,useCache:false,abortSignal:ioSignal()});if(left){if(left.statusCode===200)await left.stream.cancel();throw Error('Upload cleanup is not confirmed');}}
    else if(await readObject('dev:'+file.path))throw Error('Upload cleanup is not confirmed');
   }
   // Keep the assigned paths for subsequent sweeps: an upload already in flight
   // can arrive after its token expires or a cleanup acknowledgment is lost.
   await db.query('UPDATE office_upload_stages SET cleanup_pending=false,cleanup_checked_at=now(),lease=NULL,lease_until=NULL WHERE id=$1',[stage.id]);
  }catch(error){await db.query('UPDATE office_upload_stages SET cleanup_pending=true,cleanup_checked_at=now(),lease=NULL,lease_until=NULL WHERE id=$1',[stage.id]);if(options.id)throw error;}
 }
}
async function uploadGrants(stage:Pick<Stage,'id'|'files'|'token_expires_at'>){
 const until=Date.parse(stage.token_expires_at),grants:{id:string;field:string;path:string;key:string;iv:string;token:string|null}[]=[];
 for(const f of stage.files){
  const token=env.BLOB_READ_WRITE_TOKEN&&until>Date.now()?await generateClientTokenFromReadWriteToken({token:env.BLOB_READ_WRITE_TOKEN,pathname:f.path,maximumSizeInBytes:f.size+16,allowedContentTypes:['application/octet-stream'],validUntil:until,addRandomSuffix:false,allowOverwrite:false}):null;
  grants.push({id:f.id,field:f.field,path:f.path,key:unseal(Buffer.from(f.key,'base64')).toString('base64'),iv:f.iv,token});
 }
 return {id:stage.id,files:grants};
}
export function registerOfficeUploads(app:Hono){
 app.post('/admin/uploads',async c=>{
  const admin=await requireAdmin(c);if(!admin)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const parsed=initial.safeParse(await c.req.json());if(!parsed.success)return c.json(err('Select PDFs no larger than 40 MB per file and valid upload metadata.','INVALID_UPLOAD'),400);
  const body=parsed.data,allowed=slots(body.route);if(!allowed||body.files.some(f=>!allowed.includes(f.field)))return c.json(err('Upload destination is not supported.','INVALID_UPLOAD'),400);
  if(body.fields.some(([key])=>allowed.includes(key)))return c.json(err('A file field cannot also contain text.','INVALID_UPLOAD'),400);
  if(body.files.some((f,i)=>f.field!=='psd'&&body.files.findIndex(g=>g.field===f.field)!==i))return c.json(err('Duplicate document field.','INVALID_UPLOAD'),400);
  const problems=englishTextProblems(Object.fromEntries(body.fields));if(Object.keys(problems).length)return c.json({...err(ENGLISH_TEXT_ERROR,'INVALID_INPUT'),fields:problems},400);
  await authorizeTarget(body.route,body.fields);
  const id=crypto.randomUUID(),until=Date.now()+15*60*1000;
  const files:StagedFile[]=body.files.map(f=>{const fileId=crypto.randomUUID();return {...f,id:fileId,path:`office-uploads/${id}/${fileId}.encrypted`,key:seal(randomBytes(32)).toString('base64'),iv:randomBytes(12).toString('base64')};});
  await (await getDb()).query('INSERT INTO office_upload_stages(id,session_hash,route,fields,files,token_expires_at,expires_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,now()+interval \'24 hours\')',[id,admin.tokenHash,body.route,JSON.stringify(body.fields),JSON.stringify(files),new Date(until).toISOString()]);
  c.header('cache-control','no-store');return c.json({data:await uploadGrants({id,files,token_expires_at:new Date(until).toISOString()})});
 });
 app.get('/admin/uploads/:id',async c=>{
  const admin=await requireAdmin(c);if(!admin)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const id=c.req.param('id');if(!new RegExp(`^${uuid}$`).test(id))return c.json(err('Upload not found.','NOT_FOUND'),404);
  const [stage]=await(await getDb()).query<Stage>('SELECT * FROM office_upload_stages WHERE id=$1 AND session_hash=$2',[id,admin.tokenHash]);
  if(!stage)return c.json(err('Upload not found.','NOT_FOUND'),404);
  c.header('cache-control','no-store');
  if(stage.state==='complete')return c.json({data:{id,state:stage.state}});
  if(['processing','unconfirmed'].includes(stage.state))return c.json(err('The previous operation may have completed. Check the saved office record before submitting it again.','UPLOAD_UNCONFIRMED'),409);
  if(stage.state==='validating'&&stage.lease_until&&Date.parse(stage.lease_until)>Date.now())return c.json(err('This upload is being checked. Retry the same upload later.','UPLOAD_BUSY'),409);
  if(!['issued','validating'].includes(stage.state)||Date.parse(stage.expires_at)<=Date.now())return c.json(err('This upload expired or was rejected. Select the file again.','UPLOAD_EXPIRED'),409);
  await authorizeTarget(stage.route,stage.fields);
  // Expired upload tokens are never extended. Already uploaded files can still
  // be finalized; missing ones require a new, explicitly selected upload.
  return c.json({data:{...await uploadGrants(stage),state:stage.state}});
 });
 app.use('/admin/*',async(c,next)=>{
  const id=c.req.header('x-office-upload');if(!id)return next();
  if(c.req.method!=='POST'||!slots(c.req.path)||!new RegExp(`^${uuid}$`).test(id))return c.json(err('Invalid upload reference.','INVALID_UPLOAD'),400);
  const finalBody=await c.req.json().catch(()=>null);
  if(!finalBody||Object.keys(finalBody).length!==1||finalBody.uploadId!==id)return c.json(err('Upload metadata cannot be changed after authorization.','INVALID_UPLOAD'),400);
  const admin=await requireAdmin(c);if(!admin)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const db=await getDb(),[stage]=await db.query<Stage>('SELECT * FROM office_upload_stages WHERE id=$1 AND session_hash=$2 AND route=$3',[id,admin.tokenHash,c.req.path]);
  if(!stage)return c.json(err('Upload not found.','NOT_FOUND'),404);
  if(stage.state==='complete'&&stage.result_status!==null&&stage.result_body!==null)return new Response(stage.result_body,{status:stage.result_status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(['processing','unconfirmed'].includes(stage.state))return c.json(err('The previous operation may have completed. Check the saved office record before submitting it again.','UPLOAD_UNCONFIRMED'),409);
  if(!['issued','validating'].includes(stage.state)||Date.parse(stage.expires_at)<=Date.now())return c.json(err('This upload expired or was rejected. Select the file again.','UPLOAD_EXPIRED'),409);
  await authorizeTarget(stage.route,stage.fields);
  const request={stage,claimed:false};requests.set(c,request);
  try{
   await next();
   if(request.claimed){
    if(c.error||c.res.status>=500){await db.query("UPDATE office_upload_stages SET state='unconfirmed',lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2",[id,stage.lease]);}
    else{
     const result=await c.res.clone().text();
     const [saved]=await db.query("UPDATE office_upload_stages SET state='complete',result_status=$3,result_body=$4,cleanup_pending=true,lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2 RETURNING id",[id,stage.lease,c.res.status,result]);
     if(!saved)reject('The office result could not be confirmed. Check the saved record before retrying.','UPLOAD_UNCONFIRMED',409);
     await cleanupOfficeUploads({id}).catch(()=>{});
    }
   }
  }finally{requests.delete(c);}
 });
}
