/** Real office interactions against an owned offline app and throwaway DB. */
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import {isolateBrowser} from './browser-isolation';
const root=resolve(import.meta.dir,'..'),fixture=mkdtempSync(resolve(tmpdir(),'batch41-office-'));
const evidence=process.env.BATCH41_OFFICE_EVIDENCE;if(evidence)mkdirSync(evidence,{recursive:true});
const originalFetch=globalThis.fetch;
globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('External request refused: '+url.origin);
 return originalFetch(input,{...init,redirect:'manual'});
}) as typeof fetch;
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:resolve(fixture,'db'),DEV_STORAGE_DIR:resolve(fixture,'files'),DEV_MIRROR_DIR:resolve(fixture,'mirror')});
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto');
const proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(proof?.offline!==true||!['database','square','blob','resend','dropbox','smarty','sunbiz'].every(k=>proof.externals?.[k]===false))throw Error('Offline isolation unproven');
const db=await getDb(),client=crypto.randomUUID(),token=newToken();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Current Identity','current-office@example.test')",[client]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[token.tokenHash]);
const request=(path:string,init:RequestInit={})=>app.request('/api/admin/'+path,{...init,headers:{Cookie:`fpsllc_admin=${token.token}`,...init.headers}});
type Board={orders:{id:string;work_stage:string}[];total:number;page:number};
const board=async(query:string):Promise<Board>=>{const r=await request('orders?'+query);if(!r.ok)throw Error(await r.text());return(await r.json()).data;};
const company=async(name:string,status:string,cert=false)=>{
 const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,created_at,formed_at) VALUES($1,$2,'Original Identity','original-office@example.test','NEW',$3,$4,0,0,0,$5,'2026-01-01',$6)",[id,client,name,JSON.stringify({series:[],optionalDocuments:{certificateOfStatus:cert},registeredAgent:{choice:'SELF'}}),status,status==='formed'?'2026-02-01':null]);return id;
};
const cert=await company('Certificate Refresh LLC','formed',true),active=await company('Identity Search LLC','paid');
const {PDFDocument}=await import('@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
async function upload(){const form=new FormData();form.set('certStatus',new File([bytes],'certificate.pdf',{type:'application/pdf'}));form.set('notify','false');const r=await request(`orders/${cert}/certificates`,{method:'POST',body:form});if(!r.ok)throw Error(await r.text());}
await upload();await upload();
for(const [view,id] of [['active',active],['completed',cert]])for(const q of ['current-office@example.test','original-office@example.test','Current Identity','Original Identity']){
 const result=await board(`view=${view}&q=${encodeURIComponent(q)}`);check(`${view} finds ${q}`,result.total===1&&result.orders[0]?.id===id,result);
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{MemoryRouter}from'react-router-dom';import Office from './src/pages/admin/AdminDashboard';const q=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={q}><MemoryRouter><Office/></MemoryRouter></QueryClientProvider>);`;
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const css=(await postcss([tailwindcss({...tailwindConfig,content:[resolve(root,'src/**/*.{ts,tsx}')]})]).process(readFileSync(resolve(root,'src/index.css'),'utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:resolve(root,'src/index.css')})).css;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;
 if(path==='/app.js')return new Response(js.outputFiles[0].contents,{headers:{'content-type':'text/javascript'}});
 if(path==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});
 if(path.startsWith('/api/'))return app.fetch(req);
 return new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch(),{blocked}=isolateBrowser(browser),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(8000);const origin=`http://127.0.0.1:${server.port}`,errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
const shot=async(name:string)=>{if(evidence)await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true,animations:'disabled'});};
try{
 await page.context().addCookies([{name:'fpsllc_admin',value:token.token,url:origin}]);await page.goto(origin);
 await page.getByRole('searchbox').fill('current-office@example.test');
 const activeFound=await page.getByRole('button',{name:/Identity Search LLC/}).waitFor({timeout:2500}).then(()=>true,()=>false);check('rendered active search finds current email',activeFound);await shot('current-email-active');
 await page.getByRole('tab',{name:'Completed Orders',exact:true}).click();
 await page.getByRole('searchbox').fill('current-office@example.test');const completedFound=await page.getByRole('button',{name:/Certificate Refresh LLC/}).waitFor({timeout:2500}).then(()=>true,()=>false);check('rendered completed search finds current email',completedFound);
 if(!completedFound){await page.getByRole('searchbox').fill('original-office@example.test');await page.getByRole('button',{name:/Certificate Refresh LLC/}).waitFor();}
 await page.getByRole('button',{name:/Certificate Refresh LLC/}).click();
 await page.getByTestId('delete-copy').first().waitFor();
 const copies=await page.getByTestId('delete-copy').count();check('fixture has two qualifying certificate copies',copies===2,copies);
 await page.getByTestId('delete-copy').first().click();await page.getByTestId('confirm-delete-copy').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-testid="delete-copy"]').length===1);
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:/Certificate Refresh LLC/}).waitFor();
 check('deleting one of two copies leaves order complete',(await board('view=completed')).orders.some(o=>o.id===cert));
 await page.getByRole('button',{name:/Certificate Refresh LLC/}).click();await page.getByTestId('delete-copy').click();await page.getByTestId('confirm-delete-copy').click();await page.getByTestId('certificates-owed').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 const removed=await page.getByRole('button',{name:/Certificate Refresh LLC/}).waitFor({state:'hidden',timeout:2500}).then(()=>true,()=>false);
 const done=await board('view=completed');check('last deletion removes completed card without reload',removed&&done.total===0&&done.page===1,{removed,done});await shot('completed-refreshed');
 await page.getByRole('tab',{name:'Formations & Service Orders',exact:true}).click();await page.getByRole('button',{name:/Certificate Refresh LLC/}).waitFor();
 check('last deletion appears in post-filing without reload',(await board('view=active')).orders.some(o=>o.id===cert&&o.work_stage==='post-filing'));await shot('post-filing-refreshed');
 await page.setViewportSize({width:390,height:844});check('office view fits narrow viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('mobile-refreshed');
 check('no browser runtime errors or external requests',errors.length===0&&blocked.size===0,{errors,blocked:[...blocked]});
}catch(e){check('office UI workflow',false,String(e));await shot('failure');}
finally{await browser.close();server.stop(true);rmSync(fixture,{recursive:true,force:true});}
const result={proof,fixture,rows};if(evidence)writeFileSync(resolve(evidence,'results.json'),JSON.stringify(result,null,2));
console.log('B41OFFICE:'+JSON.stringify(result));process.exitCode=rows.every(r=>r.ok)?0:1;
