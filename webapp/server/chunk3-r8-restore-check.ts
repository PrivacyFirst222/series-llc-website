/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated restore verification reads preserved fixture rows. */
import {readFileSync,mkdirSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const root=resolve(spec.target);mkdirSync(root,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:root+'/db',DEV_STORAGE_DIR:root+'/files',DEV_MIRROR_DIR:spec.mirror});
const {app}=await import('./app'),{getDb}=await import('./db'),{restoreBackup}=await import('./restore'),{env}=await import('./env'),{BACKUP_TABLES}=await import('./backup');
const {readObject}=await import('./storage'),{hashBytes}=await import('./dropbox'),{isEncrypted,unseal}=await import('./encryption'),{enumerateOfficeHistory}=await import('./office-history-recovery'),{newToken}=await import('./crypto');
const db=await getDb(),raw=db.query.bind(db),writes:string[]=[],mail:any[]=[];
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(root+'/files',spec.mirror,env):null;
env.RESEND_API_KEY='fixture';env.PUBLIC_BASE_URL='https://restore.example.test';globalThis.fetch=(async(input:any,init:any)=>{const providerResponse=await providers?.fetch(String(input),init);if(providerResponse)return providerResponse;if(String(input)!=='https://api.resend.com/emails')throw Error('Unexpected network '+String(input));mail.push(init.body);return Response.json({id:'mail-'+mail.length});}) as typeof fetch;
db.query=async<T>(sql:string,params?:unknown[])=>{if(/^\s*(INSERT|UPDATE|DELETE|WITH)/i.test(sql))writes.push(sql);return raw<T>(sql,params);};
const {spyOn}=await import('bun:test'),dropbox=await import('./dropbox');const mirrorReads:string[]=[],read=dropbox.readMirror;
const mirrorSpy=spyOn(dropbox,'readMirror').mockImplementation(async(path:string)=>{mirrorReads.push(path);return read(path);});
let result:any,error:any,errorCode:any;try{result=await restoreBackup(db,spec.dump);}catch(e){error=String(e);errorCode=(e as any).code;}db.query=raw;mirrorSpy.mockRestore();
const rows:any[]=[];const check=(id:string,pass:boolean,observed:any)=>{rows.push({id,result:pass?'pass':'fail',observed});console.log('CASE:'+JSON.stringify(rows.at(-1)));};
if(spec.expectRefusal){
 const files=existsSync(root+'/files')?readdirSync(root+'/files',{recursive:true}):[];
 check(spec.id,!!error&&(!spec.expectCode||errorCode===spec.expectCode)&&writes.length===0&&files.length===0&&(!spec.forbidMirror||!mirrorReads.includes(spec.forbidMirror)),{error,errorCode,writes,files,mirrorReads});
}else{
 check(spec.id+'-activation',!error&&result?.activationBlocked===true&&mail.length===0,{result,error,mail:mail.length});
 for(const expected of spec.originals){const bytes=await readObject(expected.key),plain=bytes?(isEncrypted(bytes)?unseal(bytes):bytes):null;check(spec.id+'-bytes-'+expected.slot,!!plain&&hashBytes(plain)===expected.sha&&plain.length===expected.size,{key:expected.key,actual:plain?hashBytes(plain):null,expected:expected.sha});}
 const history=await enumerateOfficeHistory(db);
 for(const gap of spec.dump.historyGaps??[]){const found=history.find(r=>r.historyId===gap.historyId);check(spec.id+'-gap-'+gap.slot,found?.status==='unrecoverable'&&!await readObject(gap.storageKey),{historyId:gap.historyId,status:found?.status,key:gap.storageKey});}
 if(spec.seedOnly)await raw("INSERT INTO clients(id,name,email) VALUES($1,'Isolated restore probe','restore@example.test')",[spec.client]);
 const token=newToken();await raw("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[token.tokenHash,spec.client]);
 // First establish that the restore stayed held, then explicitly activate this
 // disposable target through the operator function to exercise portal bytes.
 const {activateRecovery}=await import('./s-election-recovery');await activateRecovery(db,'https://restore.example.test','R8 fixture operator');
 if(spec.attention){
  const a=spec.attention,{observeBackupProblem,deliverBackupAttention,backupAttention}=await import('./backup-attention');env.ADMIN_NOTIFY_EMAIL='office@example.test';
  const first=await observeBackupProblem(a.reference,a.reason),sent=await deliverBackupAttention({problemId:first}),again=await observeBackupProblem(a.reference,a.reason),repeat=await deliverBackupAttention({problemId:again}),episode=(await backupAttention()).find(e=>e.problemId===first);
  check(spec.id+'-episode',first===a.id&&again===first&&episode?.mailState==='accepted'&&(a.expectedMail===0?episode.episodeId===a.episodeId:episode.episodeId!==a.episodeId)&&mail.length===a.expectedMail&&repeat?.state==='already_sent'&&mail.every(m=>JSON.parse(m).to[0]==='office@example.test'),{first,again,sent,repeat,episodeId:episode?.episodeId,priorEpisodeId:a.episodeId,mail:mail.length,expectedMail:a.expectedMail});
 }
 if(spec.resume){
  const admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
  let body:any=JSON.stringify(spec.resume.body??{});const headers:Record<string,string>={Cookie:'fpsllc_admin='+admin.token,'content-type':'application/json'};
  if(spec.resume.multipart){body=new FormData();for(const [key,value]of Object.entries(spec.resume.multipart.fields??{}))body.set(key,String(value));if(spec.resume.multipart.bytes)body.set(spec.resume.multipart.slot,new File([Buffer.from(spec.resume.multipart.bytes,'base64')],'original.pdf',{type:'application/pdf'}));delete headers['content-type'];}
  const response=await app.request('/api/'+spec.resume.path,{method:'POST',headers,body}),out=await response.json();
  const delivered=await raw("SELECT id,storage_key FROM documents WHERE deleted_at IS NULL");
  check(spec.id+'-resume',response.status===spec.resume.status&&out.error?.code===spec.resume.code&&mail.length===0,{status:response.status,response:out,mail:mail.length,documents:delivered});
 }
 if(spec.serviceBoundary){
  const b=spec.serviceBoundary,admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);const headers={Cookie:'fpsllc_admin='+admin.token};
  const send=(bytes?:string,review=false)=>{const f=new FormData();if(bytes)f.set('file',new File([Buffer.from(bytes,'base64')],'original.pdf',{type:'application/pdf'}));f.set('ein',b.ein);f.set('notify','true');if(review)f.set('reviewRestoredOriginal','true');return app.request('/api/admin/services/'+b.serviceId+'/fulfill',{method:'POST',headers,body:f});};
  const [initial]=await raw<any>('SELECT * FROM office_operations WHERE id=$1',[b.operationId]);
  if(b.phase==='open'){
   const wrong=await send(b.wrong,true),out=await wrong.json(),[held]=await raw<any>('SELECT * FROM office_operations WHERE id=$1',[b.operationId]),docs=await raw('SELECT id FROM documents WHERE client_id=$1',[spec.client]);
   check('RESTORED-REVIEW-WRONG',wrong.status===409&&out.error?.code==='OFFICE_CONFLICT'&&held.input_hash===initial.input_hash&&held.payload.assignedEin===b.ein&&held.payload.restoreReview?.required===true&&docs.length===0&&mail.length===0,{status:wrong.status,body:out,hold:held.payload.restoreReview,documents:docs.length,mail:mail.length});
  }
  const first=await send(b.phase==='open'?b.original:undefined,b.phase==='open'),firstBody=await first.json(),again=await send(b.phase==='open'?b.original:undefined,b.phase==='open'),secondBody=await again.json(),[finished]=await raw<any>('SELECT * FROM office_operations WHERE id=$1',[b.operationId]),[service]=await raw<any>('SELECT * FROM service_orders WHERE id=$1',[b.serviceId]),documents=await raw<any>('SELECT id,storage_key FROM documents WHERE client_id=$1 AND deleted_at IS NULL',[spec.client]);
  const dl=await app.request('/api/portal/documents/'+b.documentId+'/download',{headers:{Cookie:'fpsllc_session='+token.token}}),actual=Buffer.from(await dl.arrayBuffer());
  check(b.phase==='open'?'RESTORED-REVIEW-EXACT':'RESTORED-COMMITTED',first.status===200&&again.status===200&&firstBody.data.documentId===b.documentId&&secondBody.data.documentId===b.documentId&&documents.length===1&&documents[0].storage_key===b.key&&service.status==='fulfilled'&&service.details.assignedEin===b.ein&&finished.phase==='done'&&!finished.payload.restoreReview?.required&&(b.phase!=='committed'||!initial.payload.restoreReview?.required)&&dl.status===200&&hashBytes(actual)===b.sha&&mail.length===1,{first:first.status,firstBody,again:again.status,secondBody,documents,phase:finished.phase,initialReview:initial.payload.restoreReview,sha:hashBytes(actual),expected:b.sha,mail:mail.length});
 }

 if(spec.staleReview){
  const b=spec.staleReview,admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);const headers={Cookie:'fpsllc_admin='+admin.token},[old]=await raw<{payload:any}>('SELECT payload FROM office_operations WHERE id=$1',[b.oldId]),slot=b.family==='ein'?'upload':'articles',kind=b.family==='ein'?'service':'articles',oldValue=b.family==='ein'?'881234560':'L26000000001',newValue=b.family==='ein'?'881234561':'L26000000002';
  const form=(bytes:string,value:string,extra:Record<string,string>)=>{const f=new FormData();f.set(b.family==='ein'?'file':'articles',new File([Buffer.from(bytes,'base64')],'original.pdf',{type:'application/pdf'}));f.set(b.family==='ein'?'ein':'documentNumber',value);f.set('notify','false');for(const [k,v]of Object.entries(extra))f.set(k,v);return f;};
  const send=(bytes:string,value:string,extra:Record<string,string>)=>app.request('/api/'+b.route,{method:'POST',headers,body:form(bytes,value,extra)});
  const corrected=await send(b.newBytes,newValue,{correctionOf:b.oldId}),cb=await corrected.json(),[v]=await raw<{id:string;files:any;payload:any;phase:string}>("SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2",[kind,b.targetId]);
  const stale=await send(b.oldBytes,oldValue,{reviewRestoredOriginal:'true'}),sb=await stale.json(),[after]=await raw<{id:string;files:any;payload:any;phase:string}>("SELECT * FROM office_operations WHERE kind=$1 AND target_id=$2",[kind,b.targetId]);
  const download=await app.request('/api/portal/documents/'+v.files[slot].id+'/download',{headers:{Cookie:'fpsllc_session='+token.token}}),bytes=Buffer.from(await download.arrayBuffer()),{readRecoveryJournal,JOURNAL_PATH}=await import('./backup-deletions'),journal=await readRecoveryJournal();
  check(spec.id,old.payload.restoreReview?.required===true&&corrected.status===200&&stale.status===409&&sb.error?.code==='DOCUMENT_DELETED'&&after.id===v.id&&after.files[slot].key===v.files[slot].key&&after.payload[b.family==='ein'?'assignedEin':'documentNumber']===newValue&&after.phase==='done'&&download.status===200&&hashBytes(bytes)===b.newSha&&journal.records.some(r=>r.storageKey===b.oldKey&&r.reason==='superseded')&&mail.length===0,{corrected:corrected.status,correctedBody:cb,stale:stale.status,staleBody:sb,currentId:after.id,expectedId:v.id,key:after.files[slot].key,sha:hashBytes(bytes),expectedSha:b.newSha,phase:after.phase,mail:mail.length});
  const unrelated=await send(b.oldBytes,b.family==='ein'?'881234569':'L26000000009',{reviewRestoredOriginal:'true'}),ub=await unrelated.json();
  const read=dropbox.readMirrorVersion,blocked=spyOn(dropbox,'readMirrorVersion').mockImplementation(async(path:string)=>{if(path===JOURNAL_PATH)throw Error('Fixture unavailable retirement journal');return read(path);});let unavailable:any;
  try{const r=await send(b.oldBytes,oldValue,{reviewRestoredOriginal:'true'});unavailable={status:r.status,body:await r.json()};}finally{blocked.mockRestore();}
  const replay=await send(b.newBytes,newValue,{reviewRestoredOriginal:'true'}),[unchanged]=await raw<{files:any;phase:string}>('SELECT files,phase FROM office_operations WHERE id=$1',[v.id]);
  check(spec.id+'-neighbors',unrelated.status===409&&ub.error?.code==='OFFICE_CONFLICT'&&unavailable.status===503&&unavailable.body.error?.code==='RECOVERY_UNAVAILABLE'&&replay.status===200&&unchanged.phase==='done'&&unchanged.files[slot].key===v.files[slot].key&&mail.length===0,{unrelated:unrelated.status,unrelatedBody:ub,unavailable,replay:replay.status,mail:mail.length});
 }
 if(spec.claimRestore){
  const b=spec.claimRestore,admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);const headers={Cookie:'fpsllc_admin='+admin.token};
  const [reserved]=await raw<{office_upload_id:string}>('SELECT office_upload_id FROM orders WHERE id=$1',[b.orderId]);
  const response=await app.request('/api/admin/office-operations/'+b.oldId+'/continue',{method:'POST',headers}),body=await response.json(),before=await raw('SELECT id FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[b.orderId]);
  check(spec.id+'-continue',reserved.office_upload_id===b.oldId&&response.status===202&&body.data?.state==='awaiting_original'&&body.data?.operationId===b.successorId&&before.length===0&&mail.length===0,{reservation:reserved.office_upload_id,status:response.status,body,documents:before.length,mail:mail.length});
  const form=new FormData();form.set('documentNumber',b.number);form.set('articles',new File([Buffer.from(b.bytes,'base64')],'replacement.pdf',{type:'application/pdf'}));
  const uploaded=await app.request('/api/admin/orders/'+b.orderId+'/articles',{method:'POST',headers,body:form}),uploadBody=await uploaded.json(),documents=await raw<{id:string;kind:string;storage_key:string;meta:any}>('SELECT id,kind,storage_key,meta FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[b.orderId]),[operation]=await raw<{id:string;phase:string}>("SELECT id,phase FROM office_operations WHERE kind='articles' AND target_id=$1",[b.orderId]);
  const downloads:{kind:string;status:number;valid:boolean;sha:string;text:string}[]=[];for(const d of documents){const r=await app.request('/api/portal/documents/'+d.id+'/download',{headers:{Cookie:'fpsllc_session='+token.token}}),bytes=Buffer.from(await r.arrayBuffer());let valid=false,text='';if(d.kind==='articles')valid=hashBytes(bytes)===b.sha;else{const file=root+'/claim-statement.pdf';writeFileSync(file,bytes);const {spawnSync}=await import('node:child_process');const p=spawnSync('/opt/homebrew/bin/pdftotext',[file,'-'],{encoding:'utf8'});text=p.stdout;valid=p.status===0&&text.includes(b.number)&&!text.includes(b.oldNumber);}downloads.push({kind:d.kind,status:r.status,valid,sha:hashBytes(bytes),text});}
  check(spec.id+'-upload',uploaded.status===200&&operation.id===b.successorId&&operation.phase==='done'&&documents.length===2&&documents.filter(d=>d.kind==='articles').length===1&&documents.filter(d=>d.kind==='statement').length===1&&documents.every(d=>!b.oldKeys.includes(d.storage_key)&&d.meta.documentNumber===b.number)&&downloads.every(d=>d.status===200&&d.valid)&&mail.length===0,{status:uploaded.status,body:uploadBody,operation,documents,downloads,mail:mail.length});
 }
 if(spec.browserService){
  const b=spec.browserService,{chromium}=await import('playwright');
  const admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return app.fetch(request);const file=Bun.file(b.build+url.pathname);return new Response(await file.exists()?file:Bun.file(b.build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port;
  const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:b.width,height:900}}),page=await context.newPage();page.setDefaultTimeout(5000);
  await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try{
   await page.goto(origin+'/admin');await page.getByRole('button',{name:/^EIN —/}).click();const dialog=page.getByRole('dialog');
   await dialog.getByText('Review restored upload before resuming.',{exact:true}).waitFor();
   const visibleResume=await dialog.getByRole('button',{name:'Resume saved completion',exact:true}).count();
   const savedNumber=await dialog.getByText('Saved EIN: '+b.ein,{exact:true}).count();
   check(spec.id+'-review-controls',visibleResume===1&&savedNumber===1,{visibleResume,savedNumber,dialog:await dialog.innerText()});
   await page.screenshot({path:spec.output+'.png',fullPage:true});
   if(visibleResume!==1||savedNumber!==1)throw Error('Required restored review controls absent');
   const refusal=page.waitForResponse(r=>r.url().endsWith('/services/'+b.serviceId+'/fulfill')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Resume saved completion',exact:true}).click();const denied=await refusal,deniedBody=await denied.json();
   check(spec.id+'-bare-resume',denied.status()===409&&deniedBody.error?.code==='RECOVERY_REVIEW_REQUIRED'&&mail.length===0,{status:denied.status(),body:deniedBody,mail:mail.length});
   await dialog.getByRole('checkbox',{name:/I reviewed the restored upload/}).check();await dialog.locator('#service-attachment-file').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:Buffer.from(b.bytes,'base64')});await dialog.getByLabel('EIN as issued',{exact:true}).fill(b.ein);
   const success=page.waitForResponse(r=>r.url().endsWith('/services/'+b.serviceId+'/fulfill')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Upload & fulfill',exact:true}).click();const accepted=await success;
   const [service]=await raw('SELECT status FROM service_orders WHERE id=$1',[b.serviceId]);const [operation]=await raw<{payload:{restoreReview?:{required?:boolean}}}>("SELECT payload FROM office_operations WHERE kind='service' AND target_id=$1",[b.serviceId]);
   check(spec.id+'-reviewed-original',accepted.status()===200&&service.status==='fulfilled'&&!operation.payload.restoreReview?.required&&mail.length===1,{status:accepted.status(),service:service.status,review:operation.payload.restoreReview,mail:mail.length});
  }catch(e){check(spec.id+'-browser-completion',false,{error:String(e)});await page.screenshot({path:spec.output+'.failure.png',fullPage:true});}
  finally{await context.close();await browser.close();server.stop(true);}
 }
 if(spec.browserArticles){
  const b=spec.browserArticles,{chromium}=await import('playwright'),admin=newToken();await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async(request)=>{const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return app.fetch(request);const f=Bun.file(b.build+u.pathname);return new Response(await f.exists()?f:Bun.file(b.build+'/index.html'));}}),origin='http://127.0.0.1:'+server.port,browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:b.width,height:900}}),page=await context.newPage();page.setDefaultTimeout(6000);
  await context.addCookies([{name:'fpsllc_admin',value:admin.token,url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try{
   await page.goto(origin+'/admin');await page.getByRole('button',{name:/^Restored Articles LLC/}).click();const checkbox=page.getByRole('checkbox',{name:/Review restored upload: I confirmed/});await checkbox.waitFor();const number=page.locator('#articles-document-number'),saved=await number.inputValue();
   check(spec.id+'-saved-number',saved===b.number,{saved,expected:b.number});
   const denied=page.waitForResponse(r=>r.url().endsWith('/orders/'+b.orderId+'/articles')&&r.request().method()==='POST');await page.getByRole('button',{name:'Retry Articles and Statement',exact:true}).click();const dr=await denied,body=await dr.json();await page.getByTestId('articles-upload-error').waitFor();
   check(spec.id+'-bare',dr.status()===409&&body.error?.code==='RECOVERY_REVIEW_REQUIRED'&&mail.length===0,{status:dr.status(),body,mail:mail.length});
   await checkbox.check();await page.locator('#upload-articles-first').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:Buffer.from(b.bytes,'base64')});await number.fill(b.number);
   const accepted=page.waitForResponse(r=>r.url().endsWith('/orders/'+b.orderId+'/articles')&&r.request().method()==='POST');await page.getByRole('button',{name:'Retry Articles and Statement',exact:true}).click();const ar=await accepted;await page.waitForLoadState('networkidle');await page.screenshot({path:spec.output+'.png',fullPage:true});
   const [order]=await raw('SELECT status FROM orders WHERE id=$1',[b.orderId]),docs=await raw<{kind:string;meta:{documentNumber?:string}}>('SELECT kind,meta FROM documents WHERE order_id=$1 AND deleted_at IS NULL',[b.orderId]);
   check(spec.id+'-reviewed',ar.status()===200&&order.status==='filed'&&docs.length===2&&docs.every(d=>d.meta.documentNumber===b.number)&&mail.length===0,{status:ar.status(),order:order.status,docs,mail:mail.length});
  }catch(e){check(spec.id+'-browser',false,{error:String(e)});await page.screenshot({path:spec.output+'.failure.png',fullPage:true});}
  finally{await context.close();await browser.close();server.stop(true);}
 }
 if(spec.deleteAfterRestore){
  const d=spec.deleteAfterRestore,{officeRecoveryTables}=await import('./office-file-recovery'),{officeFileIdentities,collectOfficeRecoverySources}=await import('./office-recovery-sources'),{readRecoveryJournal}=await import('./backup-deletions'),dropbox=await import('./dropbox'),tables=await officeRecoveryTables(db),i=officeFileIdentities(tables).get(d.key)!,paths=collectOfficeRecoverySources(i,await readRecoveryJournal(),tables.documents),admin=newToken();
  await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);const response=await app.request('/api/admin/documents/'+d.id,{method:'DELETE',headers:{Cookie:'fpsllc_admin='+admin.token}}),download=await app.request('/api/portal/documents/'+d.id+'/download',{headers:{Cookie:'fpsllc_session='+token.token}}),remaining=await Promise.all(d.paths.map((p:string)=>dropbox.readMirror(p)));
  check(spec.id+'-delete-union',paths.includes(d.alias)&&d.paths.every((p:string)=>paths.includes(p))&&response.status===200&&download.status===404&&!await readObject(d.key)&&remaining.every((x:any)=>x===null)&&mail.length===0,{paths,expected:d.paths,deleted:response.status,download:download.status,remaining:remaining.map((x:any)=>!!x),mail:mail.length});
 }
 for(const d of spec.absent??[]){const r=await app.request('/api/portal/documents/'+d.id+'/download',{headers:{Cookie:'fpsllc_session='+token.token}});check(spec.id+'-absent-'+d.id,r.status===404&&!await readObject(d.key),{status:r.status,key:d.key});}
 for(const d of spec.downloads){const r=await app.request('/api/'+(d.path??'portal/documents/'+d.id+'/download'),{headers:{Cookie:'fpsllc_session='+token.token}}),bytes=Buffer.from(await r.arrayBuffer());let exact=hashBytes(bytes)===d.sha,text='';
  if(d.watermarked){const path=root+'/download-'+d.slot+'.pdf';writeFileSync(path,bytes);const {spawnSync}=await import('node:child_process');const extracted=spawnSync('/opt/homebrew/bin/pdftotext',[path,'-'],{encoding:'utf8'});text=extracted.stdout;const anonymous=await app.request('/api/'+d.path);exact=extracted.status===0&&bytes.subarray(0,4).toString()==='%PDF'&&text.includes('1 of 1')&&anonymous.status===401;}
  check(spec.id+'-download-'+d.slot,r.status===200&&exact,{status:r.status,actual:hashBytes(bytes),expected:d.sha,watermarked:d.watermarked??false,text});}
}
const counts:Record<string,number>={};for(const t of BACKUP_TABLES){const [r]=await raw<{n:string}>('SELECT count(*) n FROM '+t);counts[t]=Number(r.n);}
writeFileSync(spec.output,JSON.stringify({root,rows,counts,writes:writes.length,mail:mail.length,error,result,peakRSS:process.resourceUsage().maxRSS},null,2));
process.exit(rows.some(r=>r.result==='fail')?1:0);
