/** Exercise production routes and PDFs against deliberately conflicting legacy
 * records in a disposable database. No duplicate implementation of selectors. */
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';
export async function batch02Checks(check: (label:string,ok:boolean,detail?:unknown)=>void) {
  const dir=mkdtempSync(join(tmpdir(),'batch02-db-'));
  try {
    const child=Bun.spawn(['bun',import.meta.filename,'--child'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:dir,ADMIN_PASSWORD:'dev-admin'},stdout:'pipe',stderr:'pipe'});
    const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
    const results=out.split('\n').filter(x=>x.startsWith('BATCH02:')).map(x=>JSON.parse(x.slice(8)));
    for(const r of results)check(r.label,r.ok,r.detail);
    if(code===0){
      const migration=Bun.spawn(['bun',import.meta.filename,'--migration'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:dir},stdout:'pipe',stderr:'pipe'});
      const [mout,merr,mcode]=await Promise.all([new Response(migration.stdout).text(),new Response(migration.stderr).text(),migration.exited]);
      const line=mout.split('\n').find(x=>x.startsWith('BATCH02:'));
      if(mcode!==0||!line)throw new Error(`Migration fixture failed: ${merr}`);
      const m=JSON.parse(line.slice(8));check(m.label,m.ok,m.detail);
    }
    if(code!==0||results.length<12)throw new Error(`Batch02 fixture failed (${code}, ${results.length} results): ${err}\n${out.slice(-5000)}`);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
async function child() {
  const {app}=await import('./app'); const {getDb}=await import('./db');
  const {newToken}=await import('./crypto'); const {defaultFormData}=await import('../src/components/forms/florida-llc/defaults');
  const {buildPayload}=await import('../src/components/forms/florida-llc/buildPayload');
  const {oaSeed,postSElectionPackage,purgeExpiredSElections}=await import('./routes-portal');
  const {filingGroups}=await import('./filing');
  const db=await getDb();
  const report=(label:string,ok:boolean,detail?:unknown)=>console.log('BATCH02:'+JSON.stringify({label,ok,detail}));
  const proof=await (await app.request('/api/dev/env-summary')).json();
  if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw new Error('Isolation not proven');
  const clientId=crypto.randomUUID(), a=crypto.randomUUID(),b=crypto.randomUUID(), email=`batch02-${a}@example.test`;
  await db.query('INSERT INTO clients (id,email,name) VALUES ($1,$2,$3)',[clientId,email,'Alice Example']);
  const c=newToken(),ad=newToken();
  for(const [token,admin] of [[c,false],[ad,true]] as const)await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",[token.tokenHash,admin?null:clientId,admin]);
  const cc=`fpsllc_session=${c.token}`,ac=`fpsllc_admin=${ad.token}`;
  const req=(path:string,body?:unknown,admin=false)=>app.request('/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:admin?ac:cc,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
  const json=async(path:string,body?:unknown,admin=false)=>(await req(path,body,admin)).json();
  const base=structuredClone(defaultFormData);
  Object.assign(base,{filingPath:'NEW',desiredLlcName:'Scope Alpha',llcDesignator:'LLC',registeredAgentChoice:'SELF',managementStructure:'MEMBER_MANAGED',clientFirstName:'Alice',clientLastName:'Example',clientEmail:email,orderEin:false,orderSElection:false,principalAddress:{address1:'111 Alpha Avenue',address2:'',city:'Miami',state:'FL',zip:'33139',country:'United States'},members:[{...base.members[0],firstName:'Alice',lastName:'Example',ownershipPercentage:100,address1:'111 Alpha Avenue',city:'Miami',state:'FL',zip:'33139'}],series:[{id:'s1',name:'Scope Alpha, LLC, PS A'}]});
  const pa=buildPayload(base),pb=buildPayload({...base,desiredLlcName:'Scope Beta',principalAddress:{...base.principalAddress,address1:'999 Beta Boulevard'},series:[{id:'s2',name:'Scope Beta, LLC, PS B'}]});
  for(const [id,name,p,age] of [[a,'Scope Alpha, LLC',pa,2],[b,'Scope Beta, LLC',pb,1]] as const)await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at,created_at) VALUES($1,$2,'Alice Example',$3,'formation',$4,$5,0,0,0,'formed',now(),now(),now()-($6||' days')::interval)",[id,clientId,email,name,JSON.stringify(p),String(age)]);
  const service=async(company:string,type:string,details:unknown,status='awaiting_info')=>{const id=crypto.randomUUID();await db.query('INSERT INTO service_orders(id,client_id,type,status,llc_name,details,amount_cents,formation_order_id,paid_at) VALUES($1,$2,$3,$4,$5,$6,0,$7,now())',[id,clientId,type,status,company===a?'Scope Alpha, LLC':'Scope Beta, LLC',JSON.stringify(details),company]);return id;};
  const einA=await service(a,'ein',{target:'company'}),sel=await service(a,'s-election',{});
  await service(a,'series',{seriesName:'Scope Alpha, LLC, PS Added A'},'fulfilled');
  await service(b,'series',{seriesName:'Scope Beta, LLC, PS Added B'},'fulfilled');
  const seed=await oaSeed(clientId,a);
  report('batch02 N1.05: agreement series belong to the selected company',!!seed&&seed.series.length===2&&seed.series.every(s=>s.name.startsWith('Scope Alpha')),seed?.series);
  const einB=await json(`/portal/services/ein?company=${b}`,{target:'company'});
  const duplicate=await json(`/portal/services/ein?company=${a}`,{target:'company'});
  report('batch02 N1.06: EIN duplicate checks stay within one company',!!einB.data?.serviceOrderId&&duplicate.error?.code==='ALREADY_ORDERED',{einB,duplicate});
  const taxB=await service(b,'ein',{target:'company'}),taxSeries=await service(a,'ein',{target:'series',seriesName:'Scope Alpha, LLC, PS A'});
  const tax=[await json(`/admin/services/${einA}`,undefined,true),await json(`/admin/services/${taxB}`,undefined,true),await json(`/admin/services/${taxSeries}`,undefined,true)];
  report('batch02 N1.07: EIN tax instructions do not borrow another entity election',tax[0].data?.sElectionPaid===true&&tax.slice(1).every(x=>x.data?.sElectionPaid===false),tax.map(x=>x.data?.sElectionPaid));
  const date=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
  const merged={ein:'881234567',einPending:false,dateIncorporated:date,effectiveDate:date,officerName:'Alice Example',officerTitle:'Member',phone:'3055550100',shareholders:[{name:'Alice Example',address:'25 Owner Street, Miami, FL 33139',percentage:100,dateAcquired:date,ssnLast4:'6789'}]};
  const built=await postSElectionPackage({so:{id:sel,client_id:clientId,llc_name:'Scope Alpha, LLC'},merged,ssns:['123456789']});
  // These controlled ASCII fixtures are drawn with standard PDF fonts as hex Tj
  // operators, including the flattened Form 2553 appearances. Read those actual
  // content streams with the installed library; no optional system executable
  // and no skipped PDF checks in CI. This is not a general-purpose extractor.
  const pdf=async(res:Response)=>{
    if(res.status!==200)return `HTTP ${res.status}: ${await res.text()}`;
    const document=await PDFDocument.load(await res.arrayBuffer(),{password:''});
    const text:string[]=[];
    for(const [,object] of document.context.enumerateIndirectObjects())if(object instanceof PDFRawStream){
      const raw=Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
      for(const match of raw.matchAll(/<([\da-fA-F]+)>\s*Tj/g))text.push(Buffer.from(match[1],'hex').toString('latin1'));
    }
    if(!text.length)throw new Error('PDF fixture has no readable rendered text operators');
    return text.join(' ');
  };
  const generated=await json(`/portal/oa/generate?company=${a}`,{firstOrAmended:'first',effectiveDate:date,authorized:true,members:[{todBeneficiary:'Jordan Example'}],series:[]});
  const oaText=generated.data?.documentId?await pdf(await req(`/portal/documents/${generated.data.documentId}/download`)):JSON.stringify(generated);
  report('batch02 generated Series Exhibit excludes the other company',oaText.includes('Scope Alpha, LLC, PS Added A')&&!oaText.includes('Scope Beta')&&!!generated.data?.documentId,{generated,otherCompany:oaText.includes('Scope Beta')});
  const texts:string[]=[];
  if(built.ok){texts.push(await pdf(await req(`/portal/documents/${built.documentId}/download`)));texts.push(await pdf(await req(`/admin/services/${sel}/s-election-draft`,undefined,true)));await db.query("UPDATE service_orders SET fulfilled_at=now()-interval '15 days' WHERE id=$1",[sel]);await purgeExpiredSElections();const docs=await db.query<{id:string}>("SELECT id FROM documents WHERE order_id=$1 AND id=$2",[a,built.documentId]);if(docs[0])texts.push(await pdf(await req(`/portal/documents/${docs[0].id}/download`)));}
  report('batch02 N1.04: S-election copies use their own company address',texts.length===3&&texts.every(t=>t.includes('111 Alpha Avenue')&&!t.includes('999 Beta Boulevard')),{copies:texts.length,addresses:texts.map(t=>t.match(/.{0,20}(?:Alpha Avenue|Beta Boulevard).{0,40}/g))});
  const mail=new FormData();mail.set('clientId',clientId);mail.set('kind','legal_mail');mail.set('title','Batch02 summons');mail.set('receivedOn',date);mail.set('notify','false');mail.set('file',new File(['%PDF-1.4 test\n%%EOF'],'mail.pdf',{type:'application/pdf'}));
  const missing=await req('/admin/documents',mail,true);mail.set('orderId',a);const uploaded=await req('/admin/documents',mail,true);
  const mailDocs=(await json('/portal/documents')).data as {id:string;kind:string;order_id:string;company_name:string}[];const mailDoc=mailDocs.find(x=>x.kind==='legal_mail');
  report('batch02 146: legal mail uploads require and retain their company',missing.status===400&&uploaded.status===200&&mailDoc?.order_id===a&&mailDoc?.company_name==='Scope Alpha, LLC',{missing:missing.status,uploaded:uploaded.status,mailDoc});
  const orphanId=crypto.randomUUID();
  await db.query(`INSERT INTO documents(id,client_id,kind,title,storage_key,content_type,size_bytes)
    SELECT $1,client_id,'legal_mail','Legacy mail without recipient',storage_key,content_type,size_bytes FROM documents WHERE id=$2`,[orphanId,mailDoc?.id]);
  await req('/admin/file-mirror/run',{},true);
  const mirror=fileURLToPath(new URL('../.dev-data/dropbox-mirror/',import.meta.url));
  const contains=(name:string)=>existsSync(join(mirror,name))&&readdirSync(join(mirror,name)).some(f=>f.startsWith(mailDoc?.id.slice(0,8)??'MISSING'));
  const orphanIn=(name:string)=>existsSync(join(mirror,name))&&readdirSync(join(mirror,name)).some(f=>f.startsWith(orphanId.slice(0,8)));
  report('batch02 225: legal mail mirror uses its recipient company',!!mailDoc&&contains('Scope Alpha, LLC')&&!contains('Scope Beta, LLC')&&orphanIn(email)&&!orphanIn('Scope Beta, LLC'),{legacyAccountFolder:orphanIn(email),alpha:contains('Scope Alpha, LLC'),beta:contains('Scope Beta, LLC')});
  await db.query("DELETE FROM service_orders WHERE formation_order_id=$1 AND type='ein'",[b]);
  const formed=new FormData();formed.set('articles',new File(['%PDF-1.4 test\n%%EOF'],'articles.pdf',{type:'application/pdf'}));formed.set('psd',new File(['%PDF-1.4 test\n%%EOF'],'psd.pdf',{type:'application/pdf'}));formed.set('psdSeries',JSON.stringify(['Scope Beta, LLC, PS B']));
  const formedRes=await req(`/admin/orders/${b}/formation-documents`,formed,true);const outbox=(await json('/dev/outbox')).data as {to:string;subject:string;html:string}[];const notice=outbox.filter(x=>x.to===email&&/formed/i.test(x.subject)).at(-1);
  report('batch02 209: formed email lists only that company services',formedRes.status===200&&!!notice&&!/EIN|S corporation election|S Corporation Election/i.test(notice.html),{status:formedRes.status,notice});
  const conversion=buildPayload({...base,filingPath:'CONVERT',existingLlcName:'Actual Existing, LLC',desiredLlcName:'Abandoned Candidate',sunbizDocumentNumber:'L24000999888'});
  report('batch02 101: existing-company orders discard abandoned new names',conversion.llcName.finalName==='',conversion.llcName);
  conversion.llcName.finalName='Abandoned Candidate, LLC';await db.query('UPDATE orders SET llc_name=$1,payload=$2 WHERE id=$3',['Actual Existing, LLC',JSON.stringify(conversion),b]);
  const legacy=await oaSeed(clientId,b);
  report('batch02 155: existing-company documents use the recorded company name',legacy?.llcName==='Actual Existing, LLC',legacy?.llcName);
  const consent=await json('/portal/series/consent',{company:b,seriesName:'Actual Existing, LLC, PS New',seriesNumber:'New',purpose:'',effectiveDate:date});
  const consentText=consent.data?.documentId?await pdf(await req(`/portal/documents/${consent.data.documentId}/download`)):JSON.stringify(consent);
  report('batch02 existing-company consent names the recorded company',!!consent.data?.documentId&&consentText.includes('Actual Existing')&&!consentText.includes('Abandoned Candidate'),consent);
  const dirty=structuredClone(pa);dirty.members.memberList=[{...dirty.members.memberList[0],memberType:'ENTITY',firstName:'Obsolete',lastName:'Human',entityName:'Current Entity'}];await db.query('UPDATE orders SET payload=$1 WHERE id=$2',[JSON.stringify(dirty),a]);
  const typed=await oaSeed(clientId,a);const filing=JSON.stringify(filingGroups(dirty));
  report('batch02 party consumers honor explicit type',typed?.members[0]?.name==='Current Entity'&&filing.includes('Current Entity')&&!filing.includes('Obsolete'),{member:typed?.members[0],filing});
  const sole=crypto.randomUUID(),order=crypto.randomUUID();
  await db.query('INSERT INTO clients(id,email,name) VALUES($1,$2,$3)',[sole,`sole-${sole}@example.test`,'Sole Client']);
  await db.query(`INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,paid_at)
    VALUES($1,$2,'Sole Client','sole@example.test','formation','Sole Company, LLC',$3,0,0,0,now())`,[order,sole,JSON.stringify(pa)]);
  for(const [client,title,kind] of [[sole,'Batch02 migration sole','legal_mail'],[clientId,'Batch02 migration ambiguous','legal_mail'],[clientId,'Batch02 migration package','package']])await db.query(`INSERT INTO documents(client_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,$3,'fixture-only','application/pdf',0)`,[client,kind,title]);
  // Roll back ONLY the migration marker in this disposable fixture. Restart
  // then executes the actual production migration, not copied SQL.
  await db.query('DELETE FROM schema_migrations WHERE id=12');
}
async function migration(){
 const {getDb}=await import('./db');const db=await getDb();
 const rows=await db.query<{title:string;order_id:string|null;mirrored_at:string|null}>("SELECT title,order_id,mirrored_at FROM documents WHERE title LIKE 'Batch02 migration%'");
 console.log('BATCH02:'+JSON.stringify({label:'batch02 legacy mail migration assigns sole company and removes ambiguous test rows',ok:rows.length===2&&rows.some(x=>x.title==='Batch02 migration sole'&&x.order_id&&x.mirrored_at===null)&&rows.some(x=>x.title==='Batch02 migration package'&&x.order_id===null),detail:rows}));
}
if(import.meta.main){if(process.argv.includes('--migration')){await migration();process.exit(0);}if(process.argv.includes('--child')){await child();process.exit(0);}let failures=0;await batch02Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail:ok?undefined:detail}));if(!ok)failures++;});process.exit(failures?1:0);}
