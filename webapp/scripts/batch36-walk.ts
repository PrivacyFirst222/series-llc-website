/** Actual Office -> authenticated Hono routes -> throwaway Postgres -> rendered board.
 * All fixtures are synthetic; no provider, real database or publication is used.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import { isolateBrowser } from './browser-isolation';
const root=resolve(import.meta.dir,'..'), fixture=mkdtempSync(resolve(tmpdir(),'batch36-'));
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:resolve(fixture,'db'),DEV_STORAGE_DIR:resolve(fixture,'files'),DEV_MIRROR_DIR:resolve(fixture,'mirror')});
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto');
const proof=await(await app.request('/api/dev/env-summary')).json();
if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline isolation refused');
const db=await getDb(),client=crypto.randomUUID(),token=newToken();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Office Fixture','office@example.test')",[client]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[token.tokenHash]);
const headers={Cookie:`fpsllc_admin=${token.token}`};
const request=(path:string,init:RequestInit={})=>app.request('/api/admin/'+path,{...init,headers:{...headers,...init.headers}});
const get=async(path:string)=>{const response=await request(path);const body=await response.json();if(!response.ok)throw Error(path+': '+JSON.stringify(body));return body.data;};
async function company(name:string,status:string,cert=false,created='2026-01-01',formed='2026-02-01') {
 const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,created_at,formed_at) VALUES($1,$2,'Office Fixture','office@example.test','NEW',$3,$4,0,0,0,$5,$6,$7)",[id,client,name,JSON.stringify({series:[],optionalDocuments:{certificateOfStatus:cert},registeredAgent:{choice:'SELF'}}),status,created,status==='formed'?formed:null]);return id;
}
async function service(order:string|null,type='ein',status='awaiting_info',created='2026-01-02') {
 const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,created_at) VALUES($1,$2,$3,$4,$5,'Fixture LLC',0,'{}',$6)",[id,client,order,type,status,created]);return id;
}
const paid=await company('Old Unfiled LLC','paid'),state=await company('Awaiting State LLC','filed'),post=await company('Post Filing EIN LLC','formed'),cert=await company('Certificate Owed LLC','formed',true),again=await company('Returning Customer LLC','formed'),finished=await company('Finished Fixture LLC','formed'),legacyOld=await company('Legacy Older LLC','formed');
await service(post);await service(again,'certificate-of-status','in_progress','2026-03-01');await service(finished,'ein','fulfilled');await service(finished,'ein','cancelled');await service(finished,'ein','pending_payment');
for(let i=0;i<205;i++)await company(`Completed History ${String(i).padStart(3,'0')} LLC`,'formed',false,'2026-04-01','2026-04-02');
const latest=await company('Legacy Latest LLC','formed',false,'2026-05-01','2026-05-02');const legacyService=await service(null,'ein','awaiting_info','2026-05-03');
const active=await get('orders?view=active');
check('old unfinished orders survive more than 200 newer completed orders',active.orders.some((o:{id:string})=>o.id===paid),active);
const stages=Object.fromEntries(active.orders.map((o:{id:string;work_stage:string})=>[o.id,o.work_stage]));
check('filing and post-filing queues distinguish remaining work',stages[paid]==='new'&&stages[state]==='state'&&stages[post]==='post-filing'&&stages[cert]==='post-filing'&&stages[again]==='new'&&stages[latest]==='new',stages);
const complete=await get('orders?view=completed');
check('completed history filtered before pagination',complete.total===207&&complete.shown===50&&complete.orders.every((o:{work_stage:string})=>o.work_stage==='completed'),{total:complete.total,shown:complete.shown});
const ids=new Set<string>();for(let p=1;p<=5;p++){const page=await get('orders?view=completed&page='+p);page.orders.forEach((o:{id:string})=>ids.add(o.id));}
check('all completed pages reachable with no duplicate cards',ids.size===207&&ids.has(finished)&&ids.has(legacyOld)&&!ids.has(post),{unique:ids.size});
check('out-of-range page clamps to last page',(await get('orders?view=completed&page=99')).page===5);
check('search stays within selected queue',(await get('orders?view=completed&q=Post%20Filing')).total===0&&(await get('orders?view=completed&q=Finished%20Fixture')).orders[0]?.id===finished&&(await get('orders?view=active&q=office%40example.test')).total===6);
const legacyFiltered=await get('orders?view=completed&q=Legacy%20Older');
const scoped=await get('services?orders='+legacyOld),latestServices=await get('services?orders='+latest);
check('legacy service company does not move with search or page',legacyFiltered.orders[0]?.id===legacyOld&&scoped.length===0&&latestServices.some((s:{id:string;board_order_id:string})=>s.id===legacyService&&s.board_order_id===latest));
check('service query only returns selected company',(await get('services?orders='+post)).every((s:{board_order_id:string})=>s.board_order_id===post));
check('invalid page view company and unsigned access refused',(await request('orders?view=oops')).status===400&&(await request('orders?page=0')).status===400&&(await request('services?orders=not-a-uuid')).status===400&&(await app.request('/api/admin/orders?view=completed')).status===401);
// Upload an actual readable PDF using the real certificate-delivery route.
const {PDFDocument}=await import('@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
const form=new FormData();form.set('certStatus',new File([bytes],'certificate.pdf',{type:'application/pdf'}));form.set('notify','false');
const delivered=await request(`orders/${cert}/certificates`,{method:'POST',body:form});
check('real certificate upload moves completed company out of active queue',delivered.status===200&&!(await get('orders?view=active')).orders.some((o:{id:string})=>o.id===cert)&&(await get('orders?view=completed&q=Certificate%20Owed')).orders[0]?.id===cert);
// Before-fix runs should expose the queue defect, not fail for absent UI controls.
if(rows.some(r=>!r.ok)){console.log('B36:'+JSON.stringify({proof,rows}));rmSync(fixture,{recursive:true,force:true});process.exit(1);}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{MemoryRouter}from'react-router-dom';import Office from './src/pages/admin/AdminDashboard';const q=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={q}><MemoryRouter><Office/></MemoryRouter></QueryClientProvider>);`;
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const css=(await postcss([tailwindcss({...tailwindConfig,content:[resolve(root,'src/**/*.{ts,tsx}')]})]).process(readFileSync(resolve(root,'src/index.css'),'utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:resolve(root,'src/index.css')})).css;
let serviceFailure=false;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;
 if(path==='/app.js')return new Response(js.outputFiles[0].contents,{headers:{'content-type':'text/javascript'}});
 if(path==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});
 if(path.startsWith('/api/')){if(serviceFailure&&path==='/api/admin/services')return Response.json({error:{message:'Fixture outage'}},{status:503});return app.fetch(req);}
 return new Response('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch(),{blocked}=isolateBrowser(browser),page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);
const origin=`http://127.0.0.1:${server.port}`,errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
const evidence=process.env.BATCH36_EVIDENCE_DIR;if(evidence)mkdirSync(evidence,{recursive:true});
const shot=async(name:string)=>{if(evidence)await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true,animations:'disabled'});};
try{
 await page.context().addCookies([{name:'fpsllc_admin',value:token.token,url:origin}]);await page.goto(origin);await page.getByRole('heading',{name:'Post-Filing Items',exact:true}).waitFor();
 await page.getByRole('button',{name:/Post Filing EIN LLC/}).waitFor();
 check('actual office shows three active columns and completed tab',await page.getByRole('heading',{name:'New Orders',exact:true}).count()===1&&await page.getByRole('heading',{name:'With The State',exact:true}).count()===1&&await page.getByRole('tab',{name:'Completed Orders',exact:true}).count()===1&&await page.getByText('Finished Fixture LLC',{exact:true}).count()===0);
 await shot('active-desktop');
 await page.getByRole('tab',{name:'Completed Orders',exact:true}).click();await page.getByText('Page 1 of 5',{exact:true}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('Page 2 of 5',{exact:true}).waitFor();check('completed tab has working pagination',true);
 const search=page.getByRole('searchbox');await search.fill('Finished Fixture');await page.getByRole('button',{name:/Finished Fixture LLC/}).waitFor();
 check('search reaches older completed orders',await page.getByRole('button',{name:'Next',exact:true}).count()===0);
 await page.getByRole('button',{name:/Finished Fixture LLC/}).click();await page.getByRole('button',{name:'Close',exact:true}).waitFor();check('completed order retains detail access',await page.getByText('Formation documents',{exact:true}).count()===1);await page.getByRole('button',{name:'Close',exact:true}).click();
 await search.fill('');await page.getByText('Page 1 of 5',{exact:true}).waitFor();await shot('completed-desktop');
 await page.setViewportSize({width:1024,height:768});await shot('completed-tablet');
 await page.setViewportSize({width:390,height:844});await shot('completed-mobile');
 check('completed tab fits narrow screen',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:1000});
 // Real Fulfill interaction removes a later purchase from New Orders and puts it in Completed.
 await page.getByRole('tab',{name:'Formations & Service Orders',exact:true}).click();await page.getByRole('button',{name:/Returning Customer LLC/}).waitFor();
 const card=page.getByRole('button',{name:/Returning Customer LLC/}).locator('..');await card.getByRole('button',{name:/Cert. of Status/}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.locator('input[type=file]').setInputFiles({name:'certificate.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});await dialog.getByRole('button',{name:'Upload & fulfill',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:/Returning Customer LLC/}).waitFor({state:'hidden'});
 await page.getByRole('tab',{name:'Completed Orders',exact:true}).click();await page.getByRole('searchbox').fill('Returning Customer');await page.getByRole('button',{name:/Returning Customer LLC/}).waitFor();check('real browser fulfillment moves company automatically to Completed Orders',true);
 serviceFailure=true;await page.reload();await page.getByRole('tab',{name:'Completed Orders',exact:true}).click();await page.getByTestId('service-load-status').getByRole('button',{name:'Try again'}).waitFor();check('service failure cannot present unchecked completed cards',await page.getByRole('heading',{name:'Completed Orders',exact:true}).count()===0);serviceFailure=false;await page.getByTestId('service-load-status').getByRole('button',{name:'Try again'}).click();await page.getByRole('heading',{name:'Completed Orders',exact:true}).waitFor();check('service retry recovers completed view',true);
 check('browser has no runtime error or external request',errors.length===0&&blocked.size===0,{errors,blocked:[...blocked]});
}catch(e){check('browser workflow',false,String(e));await shot('failure');}
finally{await browser.close();server.stop(true);rmSync(fixture,{recursive:true,force:true});}
if(evidence)writeFileSync(resolve(evidence,'results.json'),JSON.stringify({proof,rows},null,2));console.log('B36:'+JSON.stringify({proof,rows}));process.exitCode=rows.some(r=>!r.ok)?1:0;
