/** Actual portal and office components, controlled loopback API responses.
 * Server persistence/provider failures are exercised separately by batch28-check.
 */
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import {tmpdir} from 'node:os';
import {isolateBrowser} from './browser-isolation';
const source=process.argv.indexOf('--source');
const root=source<0?resolve(import.meta.dir,'..'):resolve(process.argv[source+1],'webapp');
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>{rows.push({label,ok,detail});console.log(JSON.stringify(rows.at(-1)));};
// One complete browser -> authenticated route -> database round trip, alongside
// the controlled-response UI failure scenarios below.
const fixture=mkdtempSync(resolve(tmpdir(),'batch28-browser-'));
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:resolve(fixture,'db'),DEV_STORAGE_DIR:resolve(fixture,'files'),DEV_MIRROR_DIR:resolve(fixture,'mirror')});
const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto');
const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline environment refused');
const db=await getDb(),realClient=crypto.randomUUID(),realCompany=crypto.randomUUID(),token=newToken();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Browser Client','browser@example.test')",[realClient]);
await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[token.tokenHash,realClient]);
await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,ra_renewal_date,square_customer_id,square_card_id,card_status) VALUES($1,$2,'Browser Client','browser@example.test','NEW','Browser Company LLC',$3,0,0,0,'formed',now(),'2030-06-01','browser-customer','browser-old-card','on_file')",[realCompany,realClient,JSON.stringify({registeredAgent:{choice:'SERVICE',renewalCardConsent:true}})]);
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{MemoryRouter}from'react-router-dom';import Portal from './src/pages/portal/PortalDashboard';import Office from './src/pages/admin/AdminDashboard';import{AgentServicePanel}from './src/pages/admin/AgentServicePanel';import{UpdateRenewalCard}from './src/pages/portal/UpdateRenewalCard';const q=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={q}><MemoryRouter>{new URLSearchParams(location.search).get('realCompany')?<UpdateRenewalCard company={new URLSearchParams(location.search).get('realCompany')}/>:location.search.includes('agent')?<AgentServicePanel orderId="company-0"/>:location.search.includes('office')?<Office/>:<Portal/>}</MemoryRouter></QueryClientProvider>);`;
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const css=(await postcss([tailwindcss({...tailwindConfig,content:[resolve(root,'src/**/*.{ts,tsx}')]})]).process(readFileSync(resolve(root,'src/index.css'),'utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:resolve(root,'src/index.css')})).css;
const evidence=process.env.BATCH28_BROWSER_EVIDENCE_DIR;if(evidence)mkdirSync(evidence,{recursive:true});
const companies=['First Company LLC','Second Company LLC'].map((name,i)=>({orderId:`company-${i}`,llcName:name,formed:true,raService:true,raAppointmentDate:'2026-01-01',raRenewalDate:'2027-01-01',raCancellationRequestedAt:i===0?'2026-12-20':null,raCancellationLate:i===0,cardStatus:'on_file',cardBrand:'VISA',cardLast4:i===0?'1111':'2222',renewals:i===0?[{date:'2027-01-01',amountCents:9900,status:'charged',chargedAt:'2026-12-17T12:00:00Z',purpose:'renewal'}]:[]}));
let agentNote:string|null=null;
let mode='success',configError=false,noticeError=false,contactSent=false,mailSent=false;
const posts:{path:string;body:Record<string,unknown>}[]=[],unexpected:string[]=[];
const data=(data:unknown)=>Response.json({data});const fail=(message='Fixture outage',code='UNRESOLVED')=>Response.json({error:{message,code}},{status:503});
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const p=new URL(req.url).pathname;
 if(p==='/app.js')return new Response(js.outputFiles[0].contents,{headers:{'content-type':'text/javascript'}});
 if(p==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});
 if(!p.startsWith('/api/'))return new Response('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
 if(p==='/api/auth/me')return data({name:'Fixture Client',email:'client@example.test',pendingEmail:null});
 if(p==='/api/portal/companies')return data(companies);
 if(p==='/api/portal/services')return data({orders:[],llcName:'First Company LLC',llcFormed:true,members:[],series:[],todayEastern:'2026-09-21',pricing:{seriesCents:5000,einCents:5000,sElectionCents:9500,certStatusCents:1500,certifiedCopyCents:4000},sElection:{eligible:false,reason:'already_ordered',orderBy:null},einCompanyOrdered:false});
 if(p==='/api/portal/oa')return data({seed:{llcName:'First Company LLC',members:[]},generations:[],saved:null});
 if(['/api/portal/library','/api/portal/documents','/api/admin/services'].includes(p))return data([]);
 if(p===`/api/portal/companies/${realCompany}/renewal-card`)return app.fetch(req);
 if(p.endsWith('/renewal-card')){if(req.method==='GET')return configError?fail():data({applicationId:'fixture',locationId:'fixture',sandbox:true,dev:mode!=='sdk',pendingAttemptId:null});
 const body=await req.json();posts.push({path:p,body});if(mode==='uncertain')return fail('We could not confirm the update. Your previous card remains on file. Retry this update.');if(mode==='decline')return Response.json({error:{message:'The card was refused. Your previous card remains unchanged; try another card.',code:'CARD_REFUSED'}},{status:400});companies[p.includes('company-0')?0:1].cardLast4='9876';return data({ok:true});}
 if(p==='/api/admin/orders/company-0/agent'){if(req.method==='POST'){const body=await req.json();posts.push({path:p,body});agentNote=body.note;return data({ok:true});}return data({ra_appointment_date:'2026-01-01',ra_renewal_date:'2027-01-01',ra_resignation_submitted:agentNote?'2026-09-21':null,ra_resignation_note:agentNote});}
 if(p==='/api/admin/me')return data({ok:true});
 if(p==='/api/admin/orders')return data({orders:[],total:0,shown:0});
 if(p==='/api/admin/clients')return data([{id:'client',name:'Fixture Client',email:'client@example.test',created_at:'2026-09-21',has_password:true,document_count:1,companies:[],ra_llcs:[],ra_cards:[]}]);
 if(p==='/api/admin/contact-messages')return noticeError?fail():data([{id:'contact',name:'Sender',email:'sender@example.test',message:'Retained customer message',notice_status:contactSent?'sent':'failed',notice_error:contactSent?null:'Fixture mail outage'}]);
 if(p==='/api/admin/clients/client/documents')return data([{id:'mail',kind:'legal_mail',title:'Service of process',notice_status:mailSent?'sent':'failed',notice_recipient:'current@example.test',notice_error:mailSent?null:'Fixture mail outage'}]);
 if(p.endsWith('/resend')||p.endsWith('/resend-notice')){posts.push({path:p,body:await req.json()});contactSent=p.endsWith('/resend')||contactSent;mailSent=p.endsWith('/resend-notice')||mailSent;return data({notified:true});}
 unexpected.push(req.method+' '+p);return fail();}});
const browser=await chromium.launch(),{blocked}=isolateBrowser(browser),page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(5000);
const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));const origin=`http://127.0.0.1:${server.port}`,dialog=page.getByRole('dialog');
async function shot(name:string){if(evidence)await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true,animations:'disabled'});}
async function scenario(name:string,fn:()=>Promise<void>){try{await fn();}catch(e){check(name,false,String(e));}}
try{
 await scenario('portal card update and receipts',async()=>{
  await page.goto(origin);await page.getByRole('button',{name:'Update renewal card',exact:true}).waitFor();
  check('batch28 browser receipt and stored card survive cancellation',await page.getByTestId('renewal-line').count()===1&&(await page.getByTestId('renewal-card').innerText()).includes('1111'));
  check('batch28 browser late cancellation names annual fee',await page.getByText(/The full annual renewal fee remains due/).count()===1);
  await page.getByRole('button',{name:'Update renewal card',exact:true}).click();await dialog.waitFor();
  check('batch28 browser consent required',await dialog.getByRole('button',{name:'Save renewal card',exact:true}).isDisabled());
  await shot('card-desktop');await page.setViewportSize({width:375,height:812});await shot('card-mobile');
  check('batch28 browser mobile dialog fits viewport',await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}));await page.setViewportSize({width:1280,height:900});
  await dialog.getByRole('checkbox',{name:'Agree to save renewal card'}).check();mode='uncertain';await dialog.getByRole('button',{name:'Save renewal card',exact:true}).click();await dialog.getByRole('alert').waitFor();
  const first=posts.at(-1)!;check('batch28 browser uncertain save preserves old card message',(await dialog.getByRole('alert').innerText()).includes('previous card remains'));
  mode='success';await dialog.getByRole('button',{name:'Retry card update',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check('batch28 browser retry reuses attempt and token',posts.at(-1)?.body.attemptId===first.body.attemptId&&posts.at(-1)?.body.source===first.body.source);
  await page.getByText('Renewal card: Visa ending 9876.',{exact:true}).waitFor();check('batch28 browser saved card refreshes without payment',await page.getByText('Renewal card saved. No payment was charged.',{exact:true}).count()===1);
  await page.getByRole('tab',{name:'Second Company LLC',exact:true}).click();await page.getByText('Renewal card: Visa ending 2222.',{exact:true}).waitFor();check('batch28 browser second company has its own card',(await page.getByTestId('renewal-card').innerText()).includes('2222'));
  await page.getByRole('button',{name:'Update renewal card',exact:true}).click();await dialog.getByRole('checkbox',{name:'Agree to save renewal card'}).check();mode='decline';await dialog.getByRole('button',{name:'Save renewal card',exact:true}).click();await dialog.getByRole('alert').waitFor();const refused=posts.at(-1)!;
  mode='success';await dialog.getByRole('button',{name:'Save renewal card',exact:true}).click();await dialog.waitFor({state:'hidden'});check('batch28 browser decline permits fresh attempt in selected company',posts.at(-1)?.path.includes('company-1')===true&&posts.at(-1)?.body.attemptId!==refused.body.attemptId);
 });
 await scenario('setup failure and retry',async()=>{configError=true;await page.goto(origin);await page.getByRole('button',{name:'Update renewal card',exact:true}).click();await dialog.getByRole('alert').waitFor();check('batch28 browser setup failure is explicit',await dialog.getByRole('button',{name:'Retry',exact:true}).count()===1);configError=false;await dialog.getByRole('button',{name:'Retry',exact:true}).click();await dialog.getByLabel('Offline test card').waitFor();check('batch28 browser setup retry works',true);});
 await scenario('production card entry contract',async()=>{
  mode='sdk';await page.addInitScript(()=>{(window as unknown as {Square:unknown}).Square={payments:()=>({card:async()=>({attach:async(selector:string)=>{document.querySelector(selector)!.textContent='Fixture secure card entry';},destroy:async()=>{},tokenize:async(options:unknown)=>{(window as unknown as {storeOptions:unknown}).storeOptions=options;return {status:'OK',token:'fixture-sdk-token'};}})})};});
  await page.goto(origin);await page.getByRole('button',{name:'Update renewal card',exact:true}).click();await dialog.getByText('Fixture secure card entry',{exact:true}).waitFor();await dialog.getByRole('checkbox',{name:'Agree to save renewal card'}).check();await dialog.getByRole('button',{name:'Save renewal card',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const options=await page.evaluate(()=>(window as unknown as {storeOptions:unknown}).storeOptions);check('batch28 browser Square SDK uses STORE without charge amount',JSON.stringify(options)===JSON.stringify({intent:'STORE',customerInitiated:true,sellerKeyedIn:false})&&posts.at(-1)?.body.source==='fixture-sdk-token',options);mode='success';
 });
 await scenario('office contact and legal mail retry',async()=>{
  await page.goto(origin+'/?office');await page.getByRole('tab',{name:'Contact messages',exact:true}).click();await page.getByText('Retained customer message',{exact:true}).waitFor();check('batch28 browser failed contact remains visible',await page.getByText('Email: failed',{exact:true}).count()===1);await shot('contact-failed');await page.getByRole('button',{name:'Retry office notification',exact:true}).click();await page.getByText('Email: accepted by provider',{exact:true}).waitFor();check('batch28 browser contact retry uses existing record',posts.at(-1)?.path==='/api/admin/contact-messages/contact/resend');
  await page.getByRole('tab',{name:'Clients',exact:true}).click();await page.getByRole('button',{name:'Legal-mail notices',exact:true}).click();await dialog.getByText('Service of process',{exact:true}).waitFor();await shot('legal-mail-failed');await dialog.getByRole('button',{name:'Resend notice',exact:true}).click();await dialog.getByText('Email: accepted by provider for current@example.test',{exact:true}).waitFor();check('batch28 browser legal mail retry uses document without upload',posts.at(-1)?.path==='/api/admin/documents/mail/resend-notice');
  noticeError=true;await page.goto(origin+'/?office');await page.getByRole('tab',{name:'Contact messages',exact:true}).click();await page.getByRole('alert').waitFor();check('batch28 browser failed contact lookup is not empty list',await page.getByText('No contact messages.',{exact:true}).count()===0);noticeError=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('Retained customer message',{exact:true}).waitFor();check('batch28 browser failed contact lookup can recover',true);
 });
 await scenario('complete authenticated card save',async()=>{
  await page.context().addCookies([{name:'fpsllc_session',value:token.token,url:origin}]);await page.goto(origin+'/?realCompany='+realCompany);await page.getByRole('button',{name:'Update renewal card',exact:true}).click();await dialog.getByLabel('Offline test card').waitFor();await dialog.getByRole('checkbox',{name:'Agree to save renewal card'}).check();await dialog.getByRole('button',{name:'Save renewal card',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const [order]=await db.query<{square_card_id:string;ra_renewal_date:unknown}>('SELECT square_card_id,ra_renewal_date FROM orders WHERE id=$1',[realCompany]);const payments=await db.query('SELECT id FROM ra_payment_attempts');check('batch28 browser actual route persists selected company card without charge',order.square_card_id.startsWith('dev-card-')&&new Date(String(order.ra_renewal_date)).toISOString().slice(0,10)==='2030-06-01'&&payments.length===0,{order,payments});
 });
 await scenario('office nonpayment resignation',async()=>{
  await page.goto(origin+'/?agent');await page.getByLabel('Agent event',{exact:true}).selectOption('submitted');await page.getByLabel('Resignation ground').selectOption('nonpayment');await page.getByLabel('Agent event date').fill('2026-09-21');check('batch28 browser resignation needs supporting record',await page.getByRole('button',{name:'Record event',exact:true}).isDisabled());await page.getByLabel('Resignation supporting record').fill('Unpaid invoice retained in office record');await page.getByRole('button',{name:'Record event',exact:true}).click();await page.getByText('Supporting record: Unpaid invoice retained in office record',{exact:true}).waitFor();check('batch28 browser resignation submits selected ground and date',posts.at(-1)?.body.reason==='nonpayment'&&posts.at(-1)?.body.date==='2026-09-21');await shot('nonpayment-resignation');
 });
 check('batch28 browser no runtime errors',errors.length===0,errors);check('batch28 browser no unhandled API request',unexpected.length===0,unexpected);check('batch28 browser no external request',blocked.size===0,[...blocked]);
}finally{await browser.close();server.stop(true);rmSync(fixture,{recursive:true,force:true});}
if(evidence)writeFileSync(resolve(evidence,'browser.json'),JSON.stringify({rows,posts,errors,unexpected,proof},null,2));
console.log(`Batch28 browser: ${rows.filter(r=>r.ok).length}/${rows.length} passed`);if(rows.some(r=>!r.ok))process.exitCode=1;
