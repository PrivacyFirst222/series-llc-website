import {parseOfficeUpload} from './office-uploads';
import type {Hono} from 'hono';
import {getDb} from './db';
import {requireAdmin,err,MAX_UPLOAD_BYTES,looksLikePdf} from './shared';
import {officeRecoveryTables,claimOfficeVerification,assertOfficeFileLive,recoverOfficeFile,ensureOfficeRecoveryCopy} from './office-file-recovery';
import {officeFileIdentities,OfficeRecoveryError} from './office-recovery-sources';
import {releaseOfficeOperation,retireOfficeAttempt,type OfficeOperation,type RetirementClaim} from './office-operation';
import {enumerateOfficeHistory,checkedHistory,acknowledgeHistoryGap,restoreHistoricalOriginal} from './office-history-recovery';
import {hashBytes} from './dropbox';
import {recordDocumentCopy} from './backup-deletions';
import {replaceStoredFile} from './storage';
import {seal} from './encryption';
import {backupAttention,deliverBackupAttention} from './backup-attention';
import {restartBackupAfterHistoryChange} from './backup';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function registerOfficeRecovery(app:Hono){
 app.post('/admin/backups/restart-after-history-change',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const body=await c.req.json().catch(()=>({}));
  if(body.acknowledge!==true)return c.json(err('Confirm starting a new snapshot with the disclosed historical gap.','ACKNOWLEDGMENT_REQUIRED'),400);
  return c.json({data:await restartBackupAfterHistoryChange(String(body.expectedJobKey??''),String(body.historyId??''))},202);
 });
 app.get('/admin/backups/attention',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const [progress]=await (await getDb()).query<{error:string|null}>("SELECT error FROM backup_progress WHERE id='database'");
  if(progress?.error?.includes('Backup alert persistence failed'))throw new OfficeRecoveryError('Backup alert persistence failed. Review backup recovery; document recovery remains available.','RECOVERY_UNAVAILABLE',503);
  return c.json({data:await backupAttention()});
 });
 app.post('/admin/backups/attention/:problemId/retry',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(!/^[a-f0-9]{64}$/.test(c.req.param('problemId')))return c.json(err('Not found','NOT_FOUND'),404);
  const result=await deliverBackupAttention({problemId:c.req.param('problemId')});
  return result?c.json({data:result}):c.json(err('Not found','NOT_FOUND'),404);
 });
 app.get('/admin/orders/:id/office-recovery',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(!uuid.test(c.req.param('id')))return c.json(err('Not found','NOT_FOUND'),404);
  const db=await getDb(),tables=await officeRecoveryTables(db),order=tables.orders.find(o=>o.id===c.req.param('id')&&['paid','filed','formed'].includes(String(o.status)));
  if(!order)return c.json(err('Not found','NOT_FOUND'),404);
  const rows=[...officeFileIdentities(tables,{includeUnknown:true}).values()].filter(i=>i.orderId===order.id&&i.clientId===order.client_id);
  return c.json({data:rows.map(i=>({operationId:i.operationId,slot:i.slot,title:i.file.title,historical:i.historical,sha:i.file.sha,size:i.file.size}))});
 });
 app.post('/admin/orders/:id/office-recovery/:operationId/:slot',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(!uuid.test(c.req.param('id'))||!uuid.test(c.req.param('operationId')))return c.json(err('Not found','NOT_FOUND'),404);
  if(!['articles','statement','upload'].includes(c.req.param('slot')))return c.json(err('Invalid document slot','INVALID_SLOT'),400);
  const db=await getDb(),tables=await officeRecoveryTables(db);
  const order=tables.orders.find(o=>o.id===c.req.param('id')&&['paid','filed','formed'].includes(String(o.status)));
  const i=[...officeFileIdentities(tables,{includeUnknown:true}).values()].find(i=>i.operationId===c.req.param('operationId')&&i.slot===c.req.param('slot')&&i.orderId===order?.id&&i.clientId===order?.client_id);
  if(!i||!order)return c.json(err('Not found','NOT_FOUND'),404);
  if(!i.file.sha)return c.json(err('The original document fingerprint is unavailable.','RECOVERY_IDENTITY_UNAVAILABLE'),409);
  const form=await parseOfficeUpload(c),file=form.file;
  if(file instanceof File&&file.size>MAX_UPLOAD_BYTES)return c.json(err('File is too large (40 MB per file).','TOO_LARGE'),400);
  if(file instanceof File&&!await looksLikePdf(file))return c.json(err('Choose a readable PDF.','NOT_A_PDF'),400);
  const supplied=file instanceof File?Buffer.from(await file.arrayBuffer()):undefined;
  const original=tables.office_operations.find(o=>o.id===i.operationId) as unknown as OfficeOperation;
  const held=await claimOfficeVerification(db,original);
  try{
   await assertOfficeFileLive(i);
   if(supplied){
    if(supplied.length!==i.file.size||hashBytes(supplied)!==i.file.sha)throw new OfficeRecoveryError('Select the exact original PDF.','OFFICE_CONFLICT');
    if(!await recordDocumentCopy({documentId:i.file.id,storageKey:i.file.key,serviceId:i.serviceId,mirrorPath:i.file.mirrorPath??`/OfficeOperations/${i.operationId}/${i.slot}`}))throw new OfficeRecoveryError('This document was deleted.','DOCUMENT_DELETED');
    await replaceStoredFile(i.file.key,i.sensitive?seal(supplied):supplied);
   }
   await recoverOfficeFile(i);await ensureOfficeRecoveryCopy(i);await assertOfficeFileLive(i);
   const [reservation]=await db.query('SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now()',[held.id,held.lease]);
   if(!reservation)throw new OfficeRecoveryError('The recovery reservation expired. Retry.','OFFICE_BUSY');
   return c.json({data:{state:'recovered',message:'Original document recovered. Current filing information is unchanged.'}});
  }finally{await releaseOfficeOperation(db,held);}
 });
 app.post('/admin/office-operations/:id/continue',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(!uuid.test(c.req.param('id')))return c.json(err('Not found','NOT_FOUND'),404);
  const db=await getDb();const [op]=await db.query<OfficeOperation>('SELECT * FROM office_operations WHERE id=$1',[c.req.param('id')]);
  if(!op)return c.json(err('Not found','NOT_FOUND'),404);
  const claim=op.payload.retirement as RetirementClaim|undefined;
  if(!claim)return c.json(err('This operation has no saved replacement to continue.','OFFICE_CONFLICT'),409);
  if(op.phase==='superseded'){
   const [next]=await db.query<OfficeOperation>('SELECT * FROM office_operations WHERE id=$1',[claim.successorId]);
   if(!next)return c.json(err('The saved successor is unavailable.','OFFICE_CONFLICT'),409);
   return c.json({data:{state:'awaiting_original',operationId:next.id}},202);
  }
  if(op.phase!=='retiring')return c.json(err('The operation has changed.','OFFICE_CONFLICT'),409);
  const next=await retireOfficeAttempt(db,op,claim.inputHash,claim.payload);
  return c.json({data:{state:'awaiting_original',operationId:next.id,message:'Replacement reserved. Attach the original replacement PDF or correct this pending attempt.'}},202);
 });
 app.get('/admin/backups/history-recovery',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const orderId=c.req.query('orderId'),historyId=c.req.query('historyId');
  if((orderId&&!uuid.test(orderId))||(historyId&&!/^[a-f0-9]{64}$/.test(historyId)))return c.json(err('Invalid history filter','INVALID_FILTER'),400);
  const rows=(await enumerateOfficeHistory(await getDb())).filter(r=>(!orderId||r.orderId===orderId)&&(!historyId||r.historyId===historyId));
  let cursor:string[]|null=null;
  try{if(c.req.query('cursor')){cursor=JSON.parse(Buffer.from(c.req.query('cursor')!,'base64url').toString());if(!Array.isArray(cursor)||cursor.length!==3||cursor.some(s=>typeof s!=='string'))throw Error();}}catch{return c.json(err('Invalid cursor','INVALID_CURSOR'),400);}
  const limit=Math.min(100,Math.max(1,Number(c.req.query('limit')??50)||50));
  const key=(r:typeof rows[number])=>[r.createdAt,r.identity.operationId,r.slot];
  const compare=(a:string[],b:string[])=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||a[2].localeCompare(b[2]);
  const remaining=rows.filter(r=>!cursor||compare(key(r),cursor)>0),page=remaining.slice(0,limit);
  return c.json({data:{rows:page.map(({identity,...row})=>({...row,operationId:identity.operationId})),nextCursor:remaining.length>limit?Buffer.from(JSON.stringify(key(page[page.length-1]))).toString('base64url'):null}});
 });
 app.post('/admin/backups/history-recovery/:historyId/check',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const result=await checkedHistory(c.req.param('historyId'));
  return result?c.json({data:result}):c.json(err('Not found','NOT_FOUND'),404);
 });
 app.post('/admin/backups/history-recovery/:historyId/unrecoverable',async c=>{
  const admin=await requireAdmin(c);if(!admin)return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const body=await c.req.json().catch(()=>({}));
  if(body.acknowledge!==true)return c.json(err('Confirm this exact historical original is unavailable.','ACKNOWLEDGMENT_REQUIRED'),400);
  const result=await acknowledgeHistoryGap(await getDb(),c.req.param('historyId'),String(body.expectedRevision??''),admin.tokenHash);
  return result?c.json({data:result}):c.json(err('Not found','NOT_FOUND'),404);
 });
 app.post('/admin/backups/history-recovery/:historyId/original',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  const form=await parseOfficeUpload(c),file=form.file;
  if(file instanceof File&&file.size>MAX_UPLOAD_BYTES)return c.json(err('File is too large (40 MB per file).','TOO_LARGE'),400);
  if(file instanceof File&&!await looksLikePdf(file))return c.json(err('Choose a readable original PDF.','NOT_A_PDF'),400);
  const result=await restoreHistoricalOriginal(await getDb(),c.req.param('historyId'),file instanceof File?Buffer.from(await file.arrayBuffer()):undefined);
  return result?c.json({data:result}):c.json(err('Not found','NOT_FOUND'),404);
 });
}
