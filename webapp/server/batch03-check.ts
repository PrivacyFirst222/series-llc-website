/** Production routes, raw storage bytes and the actual restore path, using
 * disposable synthetic records. No external service credentials are loaded. */
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {PDFDocument,StandardFonts} from '@cantoo/pdf-lib';
import {spyOn} from 'bun:test';
export async function batch03Checks(check:(label:string,ok:boolean,detail?:unknown)=>void){
 const dir=mkdtempSync(join(tmpdir(),'batch03-'));
 try{
  const child=Bun.spawn(['bun',import.meta.filename,'--child'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'storage'),DEV_MIRROR_DIR:join(dir,'mirror'),BATCH03_DIR:dir,ADMIN_PASSWORD:'dev-admin',DOCUMENT_ENCRYPTION_ACTIVE_KEY:'a',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({a:Buffer.alloc(32,17).toString('base64'),b:Buffer.alloc(32,29).toString('base64')})},stdout:'pipe',stderr:'pipe'});
  const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  const rows=out.split('\n').filter(s=>s.startsWith('BATCH03:')).map(s=>JSON.parse(s.slice(8)));
  for(const r of rows)check(r.label,r.ok,r.detail);
  if(exit!==0||rows.length<13)throw new Error(`Batch03 fixture failed: ${exit}, ${rows.length} results\n${err}\n${out.slice(-3000)}`);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
async function child(){
 const {app}=await import('./app'),{getDb}=await import('./db'),{newToken,encryptSecret,decryptSecret}=await import('./crypto'),{env}=await import('./env');
 const storage=await import('./storage'),backup=await import('./backup'),mirror=await import('./dropbox');
 const {defaultFormData}=await import('../src/components/forms/florida-llc/defaults'),{buildPayload}=await import('../src/components/forms/florida-llc/buildPayload');
 const {postSElectionPackage,purgeExpiredSElections}=await import('./routes-portal');
 const report=(id:string,part:string,scope:string,ok:boolean,detail?:unknown)=>console.log('BATCH03:'+JSON.stringify({label:`batch03 ${id} ${part}: ${scope}`,ok,detail:ok?undefined:detail}));
 const extra=(name:string,ok:boolean,detail?:unknown)=>console.log('BATCH03:'+JSON.stringify({label:`batch03 ${name}`,ok,detail:ok?undefined:detail}));
 const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw new Error('Isolation not proven');
 const privacy=readFileSync('src/content/privacy.md','utf8');
 report('26','all','payment storage disclosure',/Square customer and card references/.test(privacy)&&/do not store the expiration date/.test(privacy));
 report('27','collection-channel','portal collection disclosure',/formation order form does not request/.test(privacy)&&/secure form in your client portal/.test(privacy)&&!/Our website forms do not request/.test(privacy));
 report('27','retention','client controlled document retention',/keep these documents in your portal or choose to delete/.test(privacy)&&/questionnaire numbers are excluded/.test(privacy)&&!/permanently delete every/.test(privacy));
 const emailText=readFileSync('server/email.ts','utf8');report('207','all','office email describes repeatable access',!emailText.includes('View them once')&&emailText.includes('until fulfillment'));
 report('162','all','closed editing message preserves documents',readFileSync('server/routes-portal.ts','utf8').includes('your completed document remains in Your documents unless you deleted it'));
 report('224','all','mirror description matches complete processing',!/Copies every not-yet-mirrored document/.test(readFileSync('server/dropbox.ts','utf8'))&&/continues through all pending files/.test(readFileSync('server/dropbox.ts','utf8')));
 const db=await getDb(),client=crypto.randomUUID(),company=crypto.randomUUID(),other=crypto.randomUUID();
 await db.query('INSERT INTO clients(id,email,name) VALUES($1,$2,$3),($4,$5,$6)',[client,`${client}@example.test`,'Retention Client',other,`${other}@example.test`,'Other Client']);
 const token=newToken(),admin=newToken(),otherToken=newToken();
 for(const [t,c,a]of[[token,client,false],[otherToken,other,false],[admin,null,true]]as const)await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",[t.tokenHash,c,a]);
 const req=(path:string,method='GET',body?:unknown,role='client')=>app.request('/api'+path,{method,headers:{Cookie:role==='admin'?`fpsllc_admin=${admin.token}`:`fpsllc_session=${role==='other'?otherToken.token:token.token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const data=structuredClone(defaultFormData);data.managementStructure='MEMBER_MANAGED';data.desiredLlcName='Retention Company';data.llcDesignator='LLC';data.clientEmail=`${client}@example.test`;data.clientFirstName='Retention';data.clientLastName='Client';data.members=[{...data.members[0],firstName:'Retention',lastName:'Client'}];data.principalAddress={address1:'111 Recovery Avenue',address2:'',city:'Miami',state:'FL',zip:'33139',country:'United States'};
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Retention Client',$3,'formation','Retention Company, LLC',$4,0,0,0,'formed',now(),now())",[company,client,data.clientEmail,JSON.stringify(buildPayload(data))]);
 const service=async(type:string)=>{const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,type,status,llc_name,details,amount_cents,formation_order_id,paid_at,ein_secret) VALUES($1,$2,$3,'awaiting_info','Retention Company, LLC','{}',0,$4,now(),$5)",[id,client,type,company,encryptSecret('123456789')]);return id;};
 const pdfDoc=await PDFDocument.create(),font=await pdfDoc.embedFont(StandardFonts.Helvetica);pdfDoc.addPage().drawText('Tax document fixture: 123-45-6789',{font});const pdf=await pdfDoc.save();
 const manual:string[]=[];let manualOk=true;
 for(const type of ['s-election','ein']){const id=await service(type);const form=new FormData();form.set('file',new File([new Uint8Array(pdf)],'tax.pdf',{type:'application/pdf'}));form.set('notify','false');form.set('ein','881234567');const response=await req(`/admin/services/${id}/fulfill`,'POST',form,'admin');
  const [row]=await db.query<{details:{documentId?:string};ein_secret:string|null}>('SELECT details,ein_secret FROM service_orders WHERE id=$1',[id]);
  if(!row.details.documentId){manualOk=false;continue;}manual.push(row.details.documentId);
  const [doc]=await db.query<{storage_key:string;meta:{sensitive?:boolean}}> ('SELECT storage_key,meta FROM documents WHERE id=$1',[row.details.documentId]);
  const readRaw=(storage as {readStoredFile?:typeof storage.readFileStream}).readStoredFile||storage.readFileStream;const raw=await readRaw(doc.storage_key);
  const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(await new Response(raw).arrayBuffer());
  const download=await req(`/portal/documents/${row.details.documentId}/download`);manualOk&&=response.status===200&&doc.meta?.sensitive===true&&bytes.toString().startsWith('FPSLLC-ENC-1')&&Buffer.from(await download.arrayBuffer()).equals(Buffer.from(pdf))&&row.ein_secret===null;
 }
 report('N1.03','all','manual tax documents use the same retention',manualOk&&manual.length===2,{manualOk,linked:manual.length});
 const sel=await service('s-election'),date=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
 const built=await postSElectionPackage({so:{id:sel,client_id:client,llc_name:'Retention Company, LLC'},merged:{ein:'881234567',dateIncorporated:date,effectiveDate:date,officerName:'Retention Client',officerTitle:'Member',phone:'3055550100',shareholders:[{name:'Retention Client',address:'111 Recovery Avenue, Miami FL 33139',percentage:100,dateAcquired:date,ssnLast4:'6789'}]},ssns:['123456789']});
 if(!built.ok)throw new Error('S-election fixture did not generate');
 const before=Buffer.from(await(await req(`/portal/documents/${built.documentId}/download`)).arrayBuffer());await db.query("UPDATE service_orders SET fulfilled_at=now()-interval '15 days' WHERE id=$1",[sel]);await purgeExpiredSElections();
 const after=await req(`/portal/documents/${built.documentId}/download`),afterBytes=Buffer.from(await after.arrayBuffer());const [expired]=await db.query<{ein_secret:string|null}>('SELECT ein_secret FROM service_orders WHERE id=$1',[sel]);
 report('121','all','editing expires without deleting documents',expired.ein_secret===null&&after.status===200&&afterBytes.equals(before),{status:after.status,same:afterBytes.equals(before)});
 const pendingEin=await service('ein');await db.query("UPDATE service_orders SET status='in_progress' WHERE id=$1",[pendingEin]);
 const oldSecret=env.SESSION_SECRET,secret=encryptSecret('987654321');env.SESSION_SECRET='changed-login-secret';let survives=false;try{survives=decryptSecret(secret)==='987654321';}catch{/* baseline cannot decrypt */}env.SESSION_SECRET=oldSecret;
 const emailId=crypto.randomUUID(),renewalId=crypto.randomUUID();await db.query("INSERT INTO email_log(id,to_address,subject,html,ok,provider_id) VALUES($1,'recipient@example.test','Recovery evidence','<p>Exact body</p>',true,'provider-fixture')",[emailId]);await db.query("INSERT INTO ra_renewals(id,order_id,renewal_date,amount_cents,status,square_payment_id) VALUES($1,$2,'2027-09-01',9900,'paid','fixture-payment')",[renewalId,company]);
 const snap=await backup.runDbBackup();
 const key=snap.key;
 const list=await backup.listBackups(),hit=list.find(x=>x.key===key);if(!hit)throw new Error('Backup fixture did not produce a snapshot');
 const stream=await storage.readFileStream(hit.storageKey),gz=Buffer.isBuffer(stream)?stream:Buffer.from(await new Response(stream).arrayBuffer());const dump=JSON.parse(gunzipSync(gz).toString());
 report('N1.01','all','backups exclude transient taxpayer numbers',dump.tables.service_orders.every((s:{ein_secret:unknown})=>s.ein_secret===null),{secretRows:dump.tables.service_orders.filter((s:{ein_secret:unknown})=>s.ein_secret!==null).length});
 if(survives&&existsSync('scripts/rotate-encryption.ts')){process.env.DOCUMENT_ENCRYPTION_ACTIVE_KEY='b';const {rotateEncryption}=await import('../scripts/rotate-encryption');await rotateEncryption(db);const [r]=await db.query<{ein_secret:string}>('SELECT ein_secret FROM service_orders WHERE id=$1',[pendingEin]);survives=decryptSecret(r.ein_secret)==='123456789'&&Buffer.from(await(await req(`/portal/documents/${built.documentId}/download`)).arrayBuffer()).equals(before);}
 if(survives)process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({b:Buffer.alloc(32,29).toString('base64')});
 report('226','all','key rotation preserves live information',survives);
 if(existsSync('server/encryption.ts')){
  const {seal,unseal}=await import('./encryption');const sealed=seal(Buffer.from('must stay private'));const altered=Buffer.from(sealed);altered[altered.length-5]^=1;let tamperRejected=false,missingRejected=false;
  try{unseal(altered);}catch{tamperRejected=true;}
  const keys=process.env.DOCUMENT_ENCRYPTION_KEYS;process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({c:Buffer.alloc(32,1).toString('base64')});try{unseal(sealed);}catch{missingRejected=true;}finally{process.env.DOCUMENT_ENCRYPTION_KEYS=keys;}
  extra('ciphertext tampering and unavailable keys fail closed',tamperRejected&&missingRejected);
  await storage.putObject('corrupt.encrypted',Buffer.from('plaintext must not download'));let envelopeRefused=false;try{await storage.readFileStream('dev:corrupt.encrypted');}catch{envelopeRefused=true;}extra('encrypted files cannot silently become plaintext',envelopeRefused);
  const preflight=Bun.spawn(['bun','-e',"import {seal} from './server/encryption';try{seal(Buffer.from('fixture'));process.exit(1);}catch(e){process.exit(String(e).includes('not configured')?0:2);}"],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'',VERCEL:'1',DOCUMENT_ENCRYPTION_KEYS:'',DOCUMENT_ENCRYPTION_ACTIVE_KEY:''},stdout:'pipe',stderr:'pipe'});extra('production without encryption keys refuses storage',await preflight.exited===0);

 }

 let recovery=false,deletion=false;
 if(manual.length===2&&dump.files&&existsSync('server/restore.ts')){
  const noAuth=await app.request(`/api/portal/documents/${manual[0]}`,{method:'DELETE'}),wrong=await req(`/portal/documents/${manual[0]}`,'DELETE',undefined,'other');
  const [victim]=await db.query<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1',[manual[0]]);
  const filePath=join(process.env.DEV_STORAGE_DIR!,victim.storage_key.slice(4));renameSync(filePath,filePath+'.held');mkdirSync(filePath);
  const removed=await req(`/portal/documents/${manual[0]}`,'DELETE');const removedBody=await removed.json();
  extra('failed deletion remains recorded for retry',removedBody.data?.cleanupPending===true,removedBody);
  rmSync(filePath,{recursive:true});renameSync(filePath+'.held',filePath);
  const {retryDocumentDeletions}=await import('./document-retention');const retry=await retryDocumentDeletions();
  extra('deletion retry removes both stored copies',retry.pending===0&&!existsSync(filePath),retry);
  const [deletedService]=await db.query<{id:string}>("SELECT id FROM service_orders WHERE details->>'documentId'=$1",[manual[0]]);
  const recreated=await postSElectionPackage({so:{id:deletedService.id,client_id:client,llc_name:'Retention Company, LLC'},merged:{dateIncorporated:date},ssns:[]});extra('a deleted tax document cannot be regenerated with stale details',!recreated.ok);
  const denied=await req(`/portal/documents/${manual[0]}/download`);
  extra('document deletion ownership enforced',noAuth.status===401&&wrong.status===404,{noAuth:noAuth.status,wrong:wrong.status});
  // Restore a snapshot made BEFORE deletion into an empty initialized DB,
  // after removing a retained source blob to force actual file recovery.
  const [retained]=await db.query<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1',[manual[1]]);await storage.removeStoredFile(retained.storage_key);
  const dir=process.env.BATCH03_DIR!;writeFileSync(join(dir,'dump.json'),JSON.stringify(dump));writeFileSync(join(dir,'expected.json'),JSON.stringify({emailId,renewalId,deleted:manual[0],retained:manual[1],pdf:Buffer.from(pdf).toString('base64')}));
  const child=Bun.spawn(['bun',import.meta.filename,'--restore'],{cwd:process.cwd(),env:{...process.env,DEV_PG_DIR:join(dir,'restored')},stdout:'pipe',stderr:'pipe'});const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  const line=out.split('\n').find(s=>s.startsWith('RESTORE:'));const result=line?JSON.parse(line.slice(8)):null;
  recovery=exit===0&&result?.recovered===true;deletion=removed.status===200&&denied.status===404&&result?.deleted===true;
  if(!recovery)extra('restore detail',false,{out,err,exit});
 }
 report('223','all','complete backup restores business history',recovery,{tables:Object.keys(dump.tables),manifest:!!dump.files});
 report('N1.02','all','encrypted documents and deletion survive restore',deletion,{manualCount:manual.length});
 // More than 200 documents, including an early missing file. Later files must
 // still be copied; after repairing it the run must converge to Complete.
 const shared=await storage.putFile('bulk.pdf',pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer,'application/pdf');
 for(let i=0;i<207;i++)await db.query("INSERT INTO documents(client_id,order_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,'package',$3,$4,'application/pdf',$5)",[client,company,`Bulk ${i}`,shared.storageKey,pdf.length]);
 const missingId='00000000-0000-4000-8000-000000000001';
 await db.query("INSERT INTO documents(id,client_id,order_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,$3,'package','Deliberately missing first file','dev:missing-fixture','application/pdf',10)",[missingId,client,company]);
 const first=await mirror.runFileMirror();const [count]=await db.query<{n:string}>("SELECT count(*) AS n FROM documents WHERE title LIKE 'Bulk%' AND mirrored_at IS NOT NULL");
 report('179','all','backup completes beyond 200 files',Number(count.n)===207,{mirroredBulk:count.n,result:first});
 if('backupProgress'in backup){
  extra('an early failure does not strand later files',first.failed===1&&first.complete===false&&Number(count.n)===207,first);
  await storage.putObject('missing-fixture',Buffer.from(pdf));const retried=await mirror.runFileMirror();extra('failed mirror converges after repair',retried.failed===0&&retried.complete===true,retried);

  // Expire the file-work budget after the first file checkpoint is saved.
  // A literal zero budget now forbids even snapshot IO; it cannot model a
  // persisted interruption. The controlled clock leaves the specified 5ms
  // checkpoint reserve and does not shorten or skip the resume assertions.
  const realNow=Date.now,realPut=storage.putObject;let clock=realNow(),expired=false;
  Date.now=()=>clock;
  const checkpoint=spyOn(storage,'putObject').mockImplementation(async(...args:Parameters<typeof storage.putObject>)=>{
   const result=await realPut(...args);if(args[0]==='backup-jobs/current.json'&&!expired&&JSON.parse(args[1].toString()).cursor>0){expired=true;clock+=20;}return result;
  });
  let interrupted:Awaited<ReturnType<typeof backup.runDbBackup>>;
  try{interrupted=await backup.runDbBackup({budgetMs:20});}finally{checkpoint.mockRestore();Date.now=realNow;}
  extra('interruption remains incomplete',expired&&interrupted.complete===false&&interrupted.pending>0,interrupted);
  const resumed=await backup.runDbBackup({resumeOnly:true});extra('interrupted backup automatically resumes to completion',resumed.complete===true&&resumed.pending===0,resumed);
 }
}
async function restore(){
 const dir=process.env.BATCH03_DIR!,dump=JSON.parse(readFileSync(join(dir,'dump.json'),'utf8')),want=JSON.parse(readFileSync(join(dir,'expected.json'),'utf8'));
 const {restoreBackup}=await import('./restore'),{getDb}=await import('./db'),{readFileStream}=await import('./storage');const db=await getDb();
 const retainedDump=dump.tables.documents.find((d:{id:string})=>d.id===want.retained);const entry=dump.files.find((f:{storageKey:string})=>f.storageKey===retainedDump.storage_key);const mirrorPath=process.env.DEV_MIRROR_DIR!+entry.path,encrypted=readFileSync(mirrorPath);let plaintextRefused=false;
 writeFileSync(mirrorPath,Buffer.from(want.pdf,'base64'));try{await restoreBackup(db,dump);}catch(e){plaintextRefused=String(e).includes('not encrypted')||String(e).includes('Saved original size, hash or envelope does not match');}finally{writeFileSync(mirrorPath,encrypted);}
 const [untouched]=await db.query<{n:number}>("SELECT count(*)::int n FROM clients");
 if(!plaintextRefused||untouched.n!==0)throw new Error('Restore did not refuse the unencrypted sensitive document before business writes');
 const result=await restoreBackup(db,dump);
 const [email]=await db.query<{html:string;provider_id:string}>('SELECT html,provider_id FROM email_log WHERE id=$1',[want.emailId]);const [renewal]=await db.query<{square_payment_id:string;amount_cents:number}>('SELECT square_payment_id,amount_cents FROM ra_renewals WHERE id=$1',[want.renewalId]);const [retained]=await db.query<{storage_key:string}>('SELECT storage_key FROM documents WHERE id=$1',[want.retained]);const deleted=await db.query('SELECT id FROM documents WHERE id=$1',[want.deleted]);
 const bytes=retained?await readFileStream(retained.storage_key):Buffer.alloc(0);
 console.log('RESTORE:'+JSON.stringify({result,recovered:email?.html==='<p>Exact body</p>'&&email.provider_id==='provider-fixture'&&renewal?.square_payment_id==='fixture-payment'&&renewal.amount_cents===9900&&Buffer.from(bytes).toString('base64')===want.pdf,deleted:deleted.length===0}));
}
if(import.meta.main){if(process.argv.includes('--restore')){await restore();process.exit(0);}if(process.argv.includes('--child')){await child();process.exit(0);}let failures=0;await batch03Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)failures++;});process.exit(failures?1:0);}
