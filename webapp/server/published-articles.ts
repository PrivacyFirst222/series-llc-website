import {prepareCorrectionHistory} from './office-history-recovery';
import type {Hono} from 'hono';
import {getDb,type Db} from './db';
import {requireAdmin,err,looksLikePdf,MAX_UPLOAD_BYTES} from './shared';
import {OfficeConflict,officeHash,findOfficeOperation,claimOfficeOperation,releaseOfficeOperation,saveOfficeFile,readOfficeFile,cleanupSupersededOfficeFiles,retireOfficeAttempt,assertOfficeInputNotRetired,type OfficeOperation} from './office-operation';
import {notifyDocument} from './office-notifications';
import {mirrorFile} from './dropbox';
import {verifyOfficeDelivery,OfficeRecoveryError} from './office-file-recovery';

interface FilingOrder {id:string;client_id:string;llc_name:string;payload:Record<string,unknown>;status:string}
interface CurrentArticles {id:string;storage_key:string;meta:Record<string,unknown>;notice_status:string|null}
export async function articlesCorrectionState(db:Db,orderId:string){
 const [doc]=await db.query<CurrentArticles>("SELECT id,storage_key,meta,notice_status FROM documents WHERE order_id=$1 AND kind='articles' AND deleted_at IS NULL",[orderId]);
 if(!doc)return null;
 const op=await findOfficeOperation(db,'articles-correction',orderId);
 return {documentId:doc.id,revision:officeHash(doc.storage_key),pendingOperation:op?.phase==='open'?op.id:null,
  pendingNumber:op?.phase==='open'?String(op.payload.documentNumber):null,
  retiringOperation:op?.phase==='retiring'?op.id:null,restoreReviewRequired:(op?.payload.restoreReview as {required?:boolean}|undefined)?.required===true,
  noticeId:doc.meta?.noticeKind==='formation-correction'?doc.id:null,noticeStatus:doc.notice_status};
}
/** Claim the current pair, its replacement intent, and its order reservation
 * in one statement. Stale tabs cannot replace a successor's input or files. */
async function begin(db:Db,o:FilingOrder,from:string,revision:string,inputHash:string,payload:Record<string,unknown>,replaceAttempt:string){
 const current=await findOfficeOperation(db,'articles-correction',o.id);
 if(current?.payload.from===from&&current.payload.revision===revision&&current.input_hash===inputHash)return current;
 const replacingCurrent=current&&['open','retiring'].includes(current.phase)&&replaceAttempt===current.id;
 if(replacingCurrent&&(current.payload.from!==from||current.payload.revision!==revision))throw new OfficeConflict('The Articles have changed. Reload before correcting them.');
 // A deliberate replacement owns a new intent and new keys. Old replay
 // identities remain retired even when staff select those PDF bytes again.
 if(!replacingCurrent)await assertOfficeInputNotRetired(db,'articles-correction',o.id,inputHash);
 if(current?.payload.from===from&&current.payload.revision===revision&&['committed','done'].includes(current.phase))throw new OfficeConflict('This completed correction saved different information. Select its original PDF, or reload to start a new correction.','OFFICE_CONFLICT');
 if(current?.phase==='open'&&replaceAttempt!==current.id)throw new OfficeConflict('A correction is already pending. Reload and use Correct pending upload to change it.');
 if(current&&['open','retiring'].includes(current.phase)){
  if(replaceAttempt!==current.id)throw new OfficeConflict('Continue the saved replacement before correcting it.');
  const successor=await retireOfficeAttempt(db,current,inputHash,payload);
  await cleanupSupersededOfficeFiles(db);
  return successor;
 }
 const id=crypto.randomUUID();
 const [created]=await db.query<OfficeOperation>(`WITH owner AS (
  UPDATE orders SET office_upload_id=$1 WHERE id=$2 AND replacing_at IS NULL AND status IN ('filed','formed') AND client_id=$3
   AND (office_upload_id IS NULL OR office_upload_id=$4::uuid)
   AND EXISTS(SELECT 1 FROM documents WHERE id=$5 AND order_id=$2 AND kind='articles' AND deleted_at IS NULL AND storage_key=$6)
   AND NOT EXISTS(SELECT 1 FROM office_operations WHERE kind='articles-correction' AND target_id=$2 AND (lease_until>now() OR (phase='open' AND id IS DISTINCT FROM $4::uuid))) RETURNING id
 ), archived AS (
  UPDATE office_operations SET kind='articles-correction-history:'||id::text,phase='superseded',lease=NULL,lease_until=NULL,
   payload=payload||jsonb_build_object('previousPhase',phase,'supersededBy',$1::text)
  WHERE kind='articles-correction' AND target_id=$2 AND EXISTS(SELECT 1 FROM owner) RETURNING id
 ) INSERT INTO office_operations(id,kind,target_id,input_hash,payload)
 SELECT $1,'articles-correction',$2,$7,$8::jsonb FROM owner WHERE (SELECT count(*) FROM archived)>=0 RETURNING *`,
 [id,o.id,o.client_id,replaceAttempt||null,from,payload.fromKey,inputHash,JSON.stringify(payload)]);
 if(!created)throw new OfficeConflict('The filing has changed or another upload is running. Reload before correcting it.');
 await cleanupSupersededOfficeFiles(db);
 return created;
}
export function registerPublishedArticles(app:Hono,prepare:(o:FilingOrder,n:string)=>Promise<{title:string;buf:ArrayBuffer}>,signed:(payload:unknown)=>boolean){
 app.post('/admin/orders/:id/correct-articles',async c=>{
  if(!await requireAdmin(c))return c.json(err('Not signed in','UNAUTHENTICATED'),401);
  if(!/^[0-9a-f-]{36}$/i.test(c.req.param('id')))return c.json(err('Not found','NOT_FOUND'),404);
  const db=await getDb();
  const [o]=await db.query<FilingOrder>("SELECT id,client_id,llc_name,payload,status FROM orders WHERE id=$1 AND client_id IS NOT NULL AND status IN ('paid','filed','formed')",[c.req.param('id')]);
  if(!o)return c.json(err('Not found','NOT_FOUND'),404);
  if(typeof o.payload==='string')o.payload=JSON.parse(o.payload);
  if(o.payload.filingPath==='CONVERT'||!['filed','formed'].includes(o.status))return c.json(err('Only filed formation Articles can be corrected.','BAD_STATE'),400);
  const form=await c.req.parseBody(),file=form.articles;
  const number=String(form.documentNumber||'').trim(),from=String(form.documentId||''),revision=String(form.revision||'');
  if(!/^L\d{11}$/.test(number))return c.json(err('Enter the Florida document number: L followed by eleven digits.','DOCUMENT_NUMBER_SHAPE'),400);
  if(!(file instanceof File)||file.size>MAX_UPLOAD_BYTES||!await looksLikePdf(file))return c.json(err('Choose the corrected Articles PDF, under 20 MB.','NOT_A_PDF'),400);
  const bytes=Buffer.from(await file.arrayBuffer()),hash=officeHash({from,revision,number,pdf:bytes.toString('base64')});
  let op:OfficeOperation|undefined;
  try{
   const [old]=await db.query<CurrentArticles>("SELECT * FROM documents WHERE id=$1 AND order_id=$2 AND kind='articles'",[/^[0-9a-f-]{36}$/i.test(from)?from:null,o.id]);
   if(!old||officeHash(old.storage_key)!==revision)throw new OfficeConflict('The Articles have changed. Reload before correcting them.');
   await begin(db,o,from,revision,hash,{from,revision,fromKey:old.storage_key,documentNumber:number,weSigned:signed(o.payload)},String(form.replaceAttempt||''));
   op=await claimOfficeOperation(db,'articles-correction',o.id,hash,{},false,form.reviewRestoredOriginal==='true');
   if(op.phase==='done'){
    await verifyOfficeDelivery(db,op,{slot:'articles',bytes});
    const notified=await notifyDocument(String(op.result.documentId),op);
    await releaseOfficeOperation(db,op);
    return c.json({data:{...op.result,notified}});
   }
   // Generated Statement bytes belong to the same immutable intent as the PDF.
   if(op.payload.weSigned&&!op.payload.statementPdf){
    const made=await prepare(o,number);
    const [intent]=await db.query<{payload:Record<string,unknown>}>("UPDATE office_operations SET payload=payload||$3::jsonb WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' RETURNING payload",[op.id,op.lease,JSON.stringify({statementPdf:Buffer.from(made.buf).toString('base64'),statementTitle:made.title})]);
    if(!intent)throw new OfficeConflict('Another request resumed this correction. Reload and retry.');op.payload=intent.payload;
   }
   const article=await saveOfficeFile(db,op,'articles',bytes,{kind:'articles',title:`Articles of Organization — ${o.llc_name}`,meta:{documentNumber:number,noticeKind:'formation-correction',correctionId:op.id}});
   if(op.payload.weSigned)await saveOfficeFile(db,op,'statement',Buffer.from(String(op.payload.statementPdf),'base64'),{kind:'statement',title:String(op.payload.statementTitle),meta:{documentNumber:number,correctionId:op.id}});
   const files=Object.values(op.files);
   for(const f of files){await readOfficeFile(f);await mirrorFile({storageKey:f.key,path:`/OfficeOperations/${op.id}/${f.kind}`});}
   const gaps=await prepareCorrectionHistory(db,op,(await requireAdmin(c))!.tokenHash);
   const result={ok:true,documentId:article.id,statement:!!op.payload.weSigned};
   const [done]=await db.query(`WITH operation AS (SELECT id FROM office_operations WHERE id=$1 AND lease=$2 AND lease_until>now() AND phase='open' FOR UPDATE), owner AS (
    UPDATE orders SET office_upload_id=NULL WHERE id=$3 AND office_upload_id=$1 AND replacing_at IS NULL AND status IN ('filed','formed')
    AND EXISTS(SELECT 1 FROM operation) AND EXISTS(SELECT 1 FROM documents WHERE id=$4 AND order_id=$3 AND storage_key=$5 AND deleted_at IS NULL) RETURNING id
   ), retired AS (
    UPDATE documents SET deleted_at=now(),meta=meta||jsonb_build_object('officeHistory',true,'supersededBy',$1::text)
    WHERE order_id=$3 AND kind IN ('articles','statement') AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM owner) RETURNING id
   ), inserted AS (
    INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes,meta)
    SELECT f.id,$6,$3,f.kind,f.title,f.key,'application/pdf',f.size,f.meta FROM jsonb_to_recordset($7::jsonb) AS f(id uuid,kind text,title text,key text,size int,meta jsonb)
    WHERE EXISTS(SELECT 1 FROM owner) AND EXISTS(SELECT 1 FROM retired) RETURNING id
   ), history AS (
    UPDATE office_operations h SET payload=jsonb_set(h.payload,'{historyRecovery}',coalesce(h.payload->'historyRecovery','{}'::jsonb)||g.value) FROM jsonb_each($10::jsonb) g
    WHERE h.id::text=g.key AND EXISTS(SELECT 1 FROM owner) AND (SELECT count(*) FROM inserted)=$9 RETURNING h.id
   ) UPDATE office_operations SET phase='done',payload=payload-'statementPdf',result=$8,lease=NULL,lease_until=NULL,error=NULL
   WHERE id=$1 AND EXISTS(SELECT 1 FROM owner) AND (SELECT count(*) FROM inserted)=$9 RETURNING id`,
   [op.id,op.lease,o.id,from,old.storage_key,o.client_id,JSON.stringify(files),JSON.stringify(result),files.length,JSON.stringify(gaps)]);
   if(!done)throw new OfficeConflict('The filing changed while saving. Reload and retry.');
   return c.json({data:{...result,notified:await notifyDocument(article.id)}});
  }catch(e){if(op)await releaseOfficeOperation(db,op,e);if(e instanceof OfficeRecoveryError)return c.json(err(e.message,e.code),e.status);if(e instanceof OfficeConflict)return c.json(err(e.message,e.code),409);throw e;}
 });
}
