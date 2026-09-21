/** B3-01: actual EIN form -> real Hono route -> disposable DB -> office assistant.
 * Also renders the approved Batch24 public refund and deadline wording.
 * Every external integration is disabled before application imports.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import { isolateBrowser, isLocal } from './browser-isolation';
import type { Db } from '../server/db';
const sourceFlag = process.argv.indexOf('--source');
if (sourceFlag >= 0 && !process.argv[sourceFlag + 1]) throw new Error('--source requires a repository path');
const root = sourceFlag >= 0 ? resolve(process.argv[sourceFlag + 1], 'webapp') : resolve(import.meta.dir, '..');
const evidence = process.env.BATCH24_BROWSER_EVIDENCE_DIR;
const rows: { label: string; ok: boolean; detail?: unknown }[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { rows.push({ label, ok, detail }); console.log(JSON.stringify(rows.at(-1))); };
async function runtime() {
 const { app } = await import(pathToFileURL(resolve(root, 'server/app.ts')).href);
 const { getDb } = await import(pathToFileURL(resolve(root, 'server/db.ts')).href);
 const { newToken } = await import(pathToFileURL(resolve(root, 'server/crypto.ts')).href);
 const proof = await (await app.request('/api/dev/env-summary')).json();
 if (!proof.data?.offline || Object.values(proof.data.externals).some(Boolean)) throw new Error('Offline proof failed');
 const originalFetch = globalThis.fetch;
 globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
   const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
   if (!isLocal(url)) throw new Error(`Unexpected external request: ${url}`);
   return originalFetch(input, init);
 }, { preconnect: originalFetch.preconnect });
 const db: Db = await getDb();
 const client = crypto.randomUUID(), company = crypto.randomUUID(), clientToken = newToken(), adminToken = newToken();
 await db.query("INSERT INTO clients(id,email,name)VALUES($1,'batch24@example.test','Fixture Owner')", [client]);
 await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at)VALUES($1,$2,false,now()+interval '1 day'),($3,NULL,true,now()+interval '1 day')", [clientToken.tokenHash, client, adminToken.tokenHash]);
 const payload = { filingPath:'NEW', llcName:{finalName:'Fixture Parent LLC'}, certifications:{articlesSignedBy:'CLIENT'}, management:{structure:'MEMBER_MANAGED'}, principalOfficeAddress:{address1:'100 Main Street',city:'Orlando',state:'FL',zip:'32801'}, members:{memberList:[{firstName:'Fixture',lastName:'Owner',address1:'100 Main Street',city:'Orlando',state:'FL',zip:'32801'}]},series:[],registeredAgent:{choice:'OWN'} };
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at)VALUES($1,$2,'Fixture Owner','batch24@example.test','NEW','Fixture Parent LLC',$3,0,0,0,'formed',now(),now())", [company, client, JSON.stringify(payload)]);
 const ids = { series: crypto.randomUUID(), company: crypto.randomUUID(), custom: crypto.randomUUID() };
 const targets = Object.fromEntries(Object.entries(ids).map(([key,id]) => [id, key === 'company' ? 'company' : 'series']));
 for (const id of Object.values(ids)) await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,details,amount_cents,paid_at)VALUES($1,$2,$3,'ein','awaiting_info','Fixture Parent LLC',$4,9900,now())", [id,client,company,JSON.stringify({target:targets[id],seriesName:targets[id]==='series'?'Fixture Parent LLC - PS '+(id===ids.custom?'2':'1'):undefined})]);
 const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {MemoryRouter} from 'react-router-dom';
import {OrdersInProgress} from './src/pages/portal/OrdersInProgress';
import {ServiceFulfillDialog} from './src/pages/admin/ServiceOrdersSection';
import Terms from './src/pages/Terms';import FAQ from './src/pages/FAQ';
const query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
const params=new URLSearchParams(location.search), mode=params.get('view');
const order={id:params.get('id'),type:'ein',status:'in_progress',llc_name:'Fixture Parent LLC',details:{target:params.get('target')||'series',seriesName:'Fixture Parent LLC - PS 1'},amount_cents:9900,client_id:${JSON.stringify(client)},formation_order_id:${JSON.stringify(company)},created_at:'2026-09-20T12:00:00Z',has_secret:true,ein_pending:false,client_email:'batch24@example.test',client_name:'Fixture Owner'};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><MemoryRouter>
{mode==='office'?<ServiceFulfillDialog viewing={order} onClose={()=>{}}/>:mode==='terms'?<Terms/>:mode==='faq'?<FAQ/>:<OrdersInProgress external={null} onExternalHandled={()=>{}}/>}
</MemoryRouter></QueryClientProvider>);`;
 const bundled = await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'raw-markdown',setup(b){b.onResolve({filter:/\.md\?raw$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'raw-markdown'}));b.onLoad({filter:/.*/,namespace:'raw-markdown'},args=>({contents:readFileSync(args.path,'utf8'),loader:'text'}));}}],logLevel:'silent'});
 const css = (await postcss([tailwindcss({...tailwindConfig,content:[resolve(root,'src/**/*.{ts,tsx}') ]})]).process(readFileSync(resolve(root,'src/index.css'),'utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:resolve(root,'src/index.css')})).css;
 let parentCount=3;
 const submitted: {id:string;body:Record<string,unknown>;status:number}[]=[];
 const unexpected:string[]=[];
 const json=(data:unknown)=>Response.json({data});
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
  const url=new URL(req.url),p=url.pathname;
  if(p==='/app.js')return new Response(bundled.outputFiles[0].contents,{headers:{'content-type':'text/javascript'}});
  if(p==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});
  if(!p.startsWith('/api/'))return new Response('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
  if(p==='/api/auth/me')return json({name:'Fixture Owner'});
  if(p==='/api/portal/services')return json({llcName:'Fixture Parent LLC',llcFormed:true,dev:false,todayEastern:'2026-09-20',members:Array.from({length:parentCount},(_,i)=>({name:`Parent Owner ${i+1}`,address:'100 Main Street, Orlando, FL 32801'})),sElection:{reason:'ok'},orders:Object.values(ids).map(id=>({id,type:'ein',status:'awaiting_info',llc_name:'Fixture Parent LLC',amount_cents:9900,details:{target:targets[id],seriesName:targets[id]==='series'?'Fixture Parent LLC - PS '+(id===ids.custom?'2':'1'):undefined}}))});
  if(p.startsWith('/api/portal/services/')&&p.endsWith('/ein-details')){const body=await req.json();const res=await app.request(p,{method:'POST',headers:{cookie:`fpsllc_session=${clientToken.token}`,'content-type':'application/json'},body:JSON.stringify(body)});submitted.push({id:p.split('/')[4],body,status:res.status});return res;}
  if(p.startsWith('/api/admin/services/'))return app.request(p,{headers:{cookie:`fpsllc_admin=${adminToken.token}`}});
  unexpected.push(`${req.method} ${p}`);return Response.json({error:{message:'Unexpected fixture endpoint'}},{status:404});
 }});
 const browser=await chromium.launch();const{blocked}=isolateBrowser(browser);
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(5000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 const origin=`http://127.0.0.1:${server.port}`,dialog=page.getByRole('dialog');
 const count=()=>dialog.getByRole('textbox',{name:'Number of members',exact:true});
 const open=async(index:number)=>{await page.getByRole('button',{name:'Provide details securely',exact:true}).nth(index).click();await count().waitFor();};
 const close=async()=>{await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});};
 async function shot(name:string){if(!evidence)return;mkdirSync(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,name+'.png'),animations:'disabled'});await page.setViewportSize({width:375,height:812});await page.screenshot({path:resolve(evidence,name+'-narrow.png'),animations:'disabled'});await page.setViewportSize({width:1280,height:900});}
 async function scenario(name:string,fn:()=>Promise<void>){try{await fn();}catch(e){check(name+': setup/runtime completed',false,String(e));}}
 async function submit(){await dialog.locator('input[name="responsibleFirst"]').fill('Fixture');await dialog.locator('input[name="responsibleLast"]').fill('Owner');await dialog.locator('input[name="tin"]').fill('123456789');await dialog.getByRole('textbox',{name:'Phone for IRS questions',exact:true}).fill('4075551234');await dialog.locator('input[name="county"]').fill('Orange');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Certify and submit securely',exact:true}).click();await page.waitForTimeout(300);}
 try{
  await scenario('B3-01 series default and persistence',async()=>{
   await page.goto(origin);await open(0);
   check('B3-01 series owned by a three-owner parent defaults to one member',await count().inputValue()==='1');
   check('B3-01 count-dependent hint does not call series several-member partnership',!(await dialog.innerText()).includes('a partnership'));
   await count().scrollIntoViewIfNeeded();await shot('series-member-count');
   await submit();const send=submitted.at(-1);check('B3-01 actual submitted payload carries one for series',send?.id===ids.series&&send.body.memberCount===1&&send.status===200,send?{id:send.id,count:send.body.memberCount,status:send.status}:null);
   const row=(await db.query<{details:{memberCount:number}}>('SELECT details FROM service_orders WHERE id=$1',[ids.series]))[0];check('B3-01 actual route persists series count one',row.details.memberCount===1,row.details.memberCount);
   await page.goto(`${origin}/?view=office&id=${ids.series}`);await page.getByTestId('assistant-order').waitFor();
   check('B3-01 office IRS assistant reads one from saved application',await page.getByTestId('assistant-order').getByText('Number of members: 1',{exact:true}).count()===1);
   await page.getByTestId('assistant-order').scrollIntoViewIfNeeded();await shot('office-series-member-count');
  });
  await scenario('B3-01 parent company default preserved',async()=>{
   await page.goto(origin);await open(1);check('B3-01 parent-company EIN still defaults to its three members',await count().inputValue()==='3');
   await submit();const send=submitted.at(-1);check('B3-01 parent-company submitted count stays three',send?.id===ids.company&&send.body.memberCount===3&&send.status===200,send?{count:send.body.memberCount,status:send.status}:null);
   await page.goto(`${origin}/?view=office&id=${ids.company}&target=company`);await page.getByTestId('assistant-order').waitFor();check('B3-01 parent office count stays three',await page.getByTestId('assistant-order').getByText('Number of members: 3',{exact:true}).count()===1);
  });
  await scenario('B3-01 explicit series answer survives drafts',async()=>{
   await page.goto(origin);await open(2);await count().fill('4');await close();await open(0);check('B3-01 editing other series does not leak count to first series',await count().inputValue()==='1');await close();await open(2);check('B3-01 explicit answer survives close and reopen',await count().inputValue()==='4');await close();await page.reload();await open(2);check('B3-01 explicit answer survives browser reload',await count().inputValue()==='4');await submit();const send=submitted.at(-1);check('B3-01 explicit answer is not overwritten at submission',send?.id===ids.custom&&send.body.memberCount===4&&send.status===200,send?{count:send.body.memberCount,status:send.status}:null);
   await page.goto(`${origin}/?view=office&id=${ids.custom}`);await page.getByTestId('assistant-order').waitFor();check('B3-01 office receives explicit client count',await page.getByTestId('assistant-order').getByText('Number of members: 4',{exact:true}).count()===1);
  });
  await scenario('B3-01 empty parent fallback and existing draft',async()=>{
   parentCount=0;await page.goto(origin);await page.evaluate(()=>localStorage.clear());await page.reload();await open(0);check('B3-01 series default remains one when parent owner list unavailable',await count().inputValue()==='1');await close();await open(1);check('B3-01 company empty-owner fallback remains one',await count().inputValue()==='1');
  });
  check('Batch24 browser no runtime errors',errors.length===0,errors);check('Batch24 browser no unexpected endpoints',unexpected.length===0,unexpected);check('Batch24 browser no external requests',blocked.size===0,[...blocked]);
 }finally{await browser.close();server.stop(true);}
 const passed=rows.filter(r=>r.ok).length;console.log(`Batch24 browser: ${passed}/${rows.length} checks passed`);if(passed!==rows.length)process.exitCode=1;
}
if(import.meta.main){
 if(process.argv.includes('--child'))await runtime();
 else{const dir=mkdtempSync(join(tmpdir(),'batch24-browser-'));try{const child=Bun.spawn(['bun',import.meta.filename,...process.argv.slice(2),'--child'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'storage'),DEV_MIRROR_DIR:join(dir,'mirror')},stdout:'inherit',stderr:'inherit'});process.exitCode=await child.exited;}finally{rmSync(dir,{recursive:true,force:true});}}
}
