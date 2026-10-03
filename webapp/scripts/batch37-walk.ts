/** Actual routes and rendered components, on a private offline fixture. */
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {isolateBrowser} from './browser-isolation';
const root=resolve(import.meta.dir,'..'),dir=mkdtempSync(resolve(tmpdir(),'b37-'));
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:resolve(dir,'db'),DEV_STORAGE_DIR:resolve(dir,'files'),DEV_MIRROR_DIR:resolve(dir,'mirror')});
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto'),{env}=await import('../server/env');
const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline proof failed');
const db=await getDb(),client=crypto.randomUUID(),admin=newToken(),user=newToken();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Fixture Owner','owner@example.test')",[client]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,false,now()+interval '1 day')",[user.tokenHash,client]);
const request=(path:string,init:RequestInit={})=>app.request('/api/'+path,{...init,headers:{Cookie:path.startsWith('admin/')?`fpsllc_admin=${admin.token}`:`fpsllc_session=${user.token}`,...init.headers}});
const jsonPost=(path:string,data:unknown)=>request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const companies:string[]=[];
for(const reason of ['nonpayment','inaccurate-contact','unlawful-use']){
 const id=crypto.randomUUID();companies.push(id);
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at,ra_appointment_date,ra_renewal_date) VALUES($1,$2,'Fixture Owner','owner@example.test','NEW',$3,$4,0,0,0,'formed',now(),now(),'2026-01-01','2027-01-01')",[id,client,reason+' LLC',JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SERVICE'},series:[],members:{memberList:[]}})]);
 const r=await jsonPost(`admin/orders/${id}/agent`,{action:'submitted',date:'2026-09-01',reason,note:'Synthetic evidence'});check('office records '+reason+' resignation',r.ok,await r.json());
}
let mailFails=true,mailCalls=0;const originalFetch=globalThis.fetch;
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url==='https://api.resend.com/emails'){mailCalls++;return mailFails?new Response('Synthetic provider outage',{status:503}):Response.json({id:'fixture-provider-id'});}if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))throw Error('Unexpected external fetch '+url);return originalFetch(input,init);}) as typeof fetch;
env.RESEND_API_KEY='fixture-not-a-key';
const {PDFDocument}=await import('@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
async function upload(notify:boolean){const f=new FormData();f.set('submissionId',crypto.randomUUID());f.set('clientId',client);f.set('orderId',companies[0]);f.set('title','Fixture document');f.set('notify',String(notify));f.set('file',new File([bytes],'fixture.pdf',{type:'application/pdf'}));return await(await request('admin/documents',{method:'POST',body:f})).json();}
const failed=await upload(true),id=failed.data?.id;
check('failed ordinary upload retains tracked failure',!!id&&failed.data.notified===false&&(await db.query<{notice_status:string}>('SELECT notice_status FROM documents WHERE id=$1',[id]))[0]?.notice_status==='failed',failed);
const before=(await db.query<{count:number}>('SELECT count(*)::int AS count FROM documents'))[0].count;
mailFails=false;const retry=await jsonPost(`admin/documents/${id}/resend-notice`,{});
check('retry sends existing document without another upload',(await retry.json()).data?.notified===true&&(await db.query<{count:number}>('SELECT count(*)::int AS count FROM documents'))[0].count===before);
const silent=await upload(false),calls=mailCalls;const refused=await jsonPost(`admin/documents/${silent.data.id}/resend-notice`,{});
check('unchecked optional notice cannot be sent by retry',(await refused.json()).data?.notified===false&&mailCalls===calls);
const formation=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Fixture Owner','owner@example.test','NEW','Formation LLC',$3,0,0,0,'paid',now())",[formation,client,JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SELF'},series:[]})]);
const ff=new FormData();ff.set('articles',new File([bytes],'articles.pdf'));ff.set('psd',new File([bytes],'psd.pdf'));ff.set('psdSeries','[]');mailFails=true;
const fr=await request(`admin/orders/${formation}/formation-documents`,{method:'POST',body:ff});const fb=await fr.json();
const anchors=await db.query<{id:string;notice_status:string}>("SELECT id,notice_status FROM documents WHERE order_id=$1 AND meta->>'noticeKind'='formation'",[formation]);
check('formation failure has exactly one retry anchor',fr.ok&&fb.data?.notified===false&&anchors.length===1&&anchors[0].notice_status==='failed',fb);
mailFails=false;const fcount=(await db.query<{count:number}>('SELECT count(*)::int AS count FROM documents WHERE order_id=$1',[formation]))[0].count;
if(anchors[0]){const r=await jsonPost(`admin/documents/${anchors[0].id}/resend-notice`,{});check('formation retry sends original package without duplicate documents',(await r.json()).data?.notified===true&&(await db.query<{count:number}>('SELECT count(*)::int AS count FROM documents WHERE order_id=$1',[formation]))[0].count===fcount);}
const limit=await request('portal/oa/answers?company='+companies[0],{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({members:Array.from({length:101},()=>({name:'Fixture Owner'}))})});const limitBody=await limit.json();check('101-owner response explains exact limit',limit.status===400&&limitBody.error?.message==='The operating agreement supports up to 100 owners. Remove an owner before saving.',limitBody);
// Render actual components. Office detail failures and source absence are controlled API fixtures.
const filed=await jsonPost(`admin/orders/${companies[2]}/agent`,{action:'filed',date:'2026-09-02'});check('state filing recorded separately from submission',filed.ok);
const actualCompanies=await(await request('portal/companies')).json();check('portal company API returns recorded resignations',Array.isArray(actualCompanies.data)&&actualCompanies.data.filter((x:{raResignationSubmitted?:string})=>x.raResignationSubmitted).length===3,actualCompanies);
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{MemoryRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Portal from'./src/pages/portal/PortalDashboard';import Amend from'./src/pages/portal/AmendAgreement';import Office from'./src/pages/admin/AdminDashboard';import{ServiceFulfillDialog}from'./src/pages/admin/ServiceOrdersSection';let root=createRoot(document.getElementById('root'));const q=new QueryClient({defaultOptions:{queries:{retry:false}}});window.mount=(kind,props={})=>{flushSync(()=>root.unmount());q.clear();root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<QueryClientProvider client={q}><MemoryRouter>{kind==='portal'?<Portal/>:kind==='amend'?<Amend/>:kind==='office'?<Office/>:<ServiceFulfillDialog viewing={{id:'fixture-service',type:props.type||'s-election',status:'in_progress',llc_name:'Fixture LLC',details:props.details||{},created_at:'2026-09-01',client_name:'Fixture Owner',client_email:'owner@example.test',amount_cents:0}} onClose={()=>{}}/>}</MemoryRouter></QueryClientProvider>));};window.ready=true;`;
const built=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
let detailFails=true,sourcesFail=false,companyIndex=0;
const data=(d:unknown)=>Response.json({data:d});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;
 if(p==='/app.js')return new Response(built.outputFiles[0].text,{headers:{'content-type':'text/javascript'}});
 if(p==='/api/auth/me')return data({name:'Fixture Owner',email:'owner@example.test',isAdmin:true});
 if(p==='/api/portal/companies')return data([actualCompanies.data.find((x:{orderId:string})=>x.orderId===companies[companyIndex])]);
 if(p==='/api/portal/services')return data({orders:[{id:'sel',type:'s-election',status:'awaiting_info',details:{},amount_cents:9500}],llcName:'Fixture LLC',llcFormed:true,members:[],series:[],pricing:{},sElection:{eligible:false,reason:'already_ordered'},einCompanyOrdered:true});
 if(p==='/api/portal/oa')return data({seed:{llcName:'Fixture LLC',members:[]},generations:[{id:'deleted-generation',number:1}],todayEastern:'2026-09-23'});
 if(p==='/api/portal/oa/sources')return sourcesFail?Response.json({error:{message:'Fixture source outage'}},{status:503}):data([]);
 if(['/api/portal/documents','/api/portal/library'].includes(p))return data([]);
 if(p==='/api/admin/services/fixture-service')return detailFails?Response.json({error:{message:'Fixture details outage'}},{status:503}):data({details:{ein:'123456789',target:'series',memberCount:1,responsibleName:'Fixture Owner'},tin:null,ssns:[],sElectionPaid:true});
 if(p==='/api/admin/clients')return data([{id:client,name:'Fixture Owner',email:'owner@example.test',created_at:'2026-09-01',ra_cancellation_requested_at:'2026-09-01',ra_llcs:[],companies:[],document_count:2}]);
 if(p.startsWith('/api/admin/'))return app.fetch(new Request(req,{headers:{Cookie:`fpsllc_admin=${admin.token}`}}));
 if(p.startsWith('/api/'))return data([]);
 return new Response('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch(),{blocked}=isolateBrowser(browser),page=await browser.newPage({viewport:{width:1200,height:900}});page.setDefaultTimeout(8000);
const evidence=process.env.BATCH37_EVIDENCE_DIR;if(evidence)mkdirSync(evidence,{recursive:true});
const mount=async(kind:string,props:unknown={})=>page.evaluate(({kind,props})=>window['mount'](kind,props),{kind,props});
const scenario=async(label:string,fn:()=>Promise<boolean>)=>{try{check(label,await fn());}catch(e){check(label,false,{error:String(e),body:await page.locator('body').innerText()});}};
try{
 await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>window['ready']);
 for(companyIndex=0;companyIndex<3;companyIndex++)await scenario('portal shows submitted resignation '+companyIndex,async()=>{await mount('portal');await page.getByText(/Resignation submitted September 1, 2026/).waitFor();const t=await page.getByRole('heading',{name:'Registered agent service',exact:true}).locator('..').locator('..').innerText();return !/is active|renews on/i.test(t)&&!t.includes('to avoid')&&(companyIndex===2?t.includes('Filed by the state September 2, 2026')&&t.includes('Appointment end date: October 3, 2026'):t.includes('appointment end date when it is recorded'));});
 companyIndex=0;
 await scenario('S questionnaire dialog explains both retention clocks',async()=>{await mount('portal');await page.getByRole('button',{name:'Provide details securely',exact:true}).click();await page.getByRole('heading',{name:'S corporation election details'}).waitFor();const text=await page.getByRole('dialog').innerText();return text.includes('fourteen-day editing window')&&text.includes('90 days without an update')&&text.includes('until you choose to delete it');});
 await scenario('S details failure is explicit and retry recovers',async()=>{await mount('service');await page.getByRole('alert').waitFor();const before=!(await page.getByRole('dialog').innerText()).includes('not yet provided');detailFails=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('EIN: 12-3456789',{exact:true}).waitFor();return before;});
 await scenario('series classification ignores parent S package',async()=>{await mount('service',{type:'ein',details:{target:'series',memberCount:1,responsibleName:'Fixture Owner'}});await page.getByText('Tax classification: Disregarded entity',{exact:true}).waitFor();return !(await page.getByRole('dialog').innerText()).includes('S corporation');});
 await scenario('amendment with deleted generation shows actionable empty state',async()=>{await mount('amend');await page.getByText(/No usable operating agreement is available/).waitFor();return await page.getByRole('link',{name:'Go to the operating agreement',exact:true}).count()===1;});
 await scenario('amendment source outage is not an empty state',async()=>{sourcesFail=true;await mount('amend');await page.getByRole('button',{name:/Try again|Retry/}).waitFor();const absent=await page.getByText(/No usable operating agreement/).count()===0;sourcesFail=false;await page.getByRole('button',{name:/Try again|Retry/}).click();await page.getByText(/No usable operating agreement/).waitFor();return absent;});
 await scenario('document retry is accessible from Clients tab',async()=>{await mount('office');await page.getByRole('tab',{name:'Clients',exact:true}).click();await page.getByTestId('client-row').waitFor();check('cancelled company leaves no empty cancellation chip',await page.getByTestId('client-row').locator('span.bg-amber-100').count()===0);await page.getByRole('button',{name:'Document notices',exact:true}).first().click();await page.getByRole('dialog').getByText('Fixture document',{exact:true}).first().waitFor();return await page.getByRole('button',{name:'Resend notice',exact:true}).count()>=2;});
 if(evidence)await page.screenshot({path:resolve(evidence,'document-notices.png'),fullPage:true});
 check('browser external requests blocked',blocked.size===0,[...blocked]);
}finally{await browser.close();server.stop(true);globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
if(evidence)writeFileSync(resolve(evidence,'results.json'),JSON.stringify({proof,rows},null,2));console.log('B37:'+JSON.stringify({proof,rows}));process.exit(rows.some(r=>!r.ok)?1:0);
