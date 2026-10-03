/** Actual billing routes and rendered components. Only ancillary portal panels
 * are empty fixtures; every tested financial/lifecycle DTO is from the API. */
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import {isolateBrowser} from './browser-isolation';
const root=resolve(import.meta.dir,'..'),fixture=mkdtempSync(resolve(tmpdir(),'batch41-billing-walk-'));
const evidence=process.env.BATCH41_BILLING_EVIDENCE;if(evidence)mkdirSync(evidence,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:resolve(fixture,'db'),DEV_STORAGE_DIR:resolve(fixture,'files'),DEV_MIRROR_DIR:resolve(fixture,'mirror')});
const nativeFetch=globalThis.fetch;
globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(input instanceof Request?input.url:String(input));if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('External request refused: '+url.origin);return nativeFetch(input,{...init,redirect:'manual'});}) as typeof fetch;
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken,encryptSecret}=await import('../server/crypto');
const proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof?.offline||Object.values(proof.externals).some(Boolean))throw Error('Offline isolation unproven');
const db=await getDb(),client=crypto.randomUUID(),admin=newToken(),user=newToken();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Billing Fixture','billing41@example.test')",[client]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,false,now()+interval '1 day')",[user.tokenHash,client]);
const request=(path:string,init:RequestInit={})=>app.request('/api/'+path,{...init,headers:{Cookie:path.startsWith('admin/')?`fpsllc_admin=${admin.token}`:`fpsllc_session=${user.token}`,...init.headers}});
const post=(path:string,body:unknown)=>request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const company=async(name:string,date:string)=>{const id=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at,ra_appointment_date,ra_renewal_date,square_customer_id,square_card_id,card_status,card_last4) VALUES($1,$2,'Billing Fixture','billing41@example.test','NEW',$3,$4,0,0,0,'formed',now(),now(),'2025-09-15',$5,'fixture-customer','fixture-card','on_file','1234')",[id,client,name,JSON.stringify({filingPath:'NEW',registeredAgent:{choice:'SERVICE',renewalCardConsent:true},series:[],members:{memberList:[]}}),date]);return id;};
const renewal=async(id:string,date:string)=>{const rid=crypto.randomUUID(),token=newToken().token;await db.query("INSERT INTO ra_renewals(id,order_id,renewal_date,charge_due,amount_cents,status,checkout_token,link_url,notice_sent_at) VALUES($1,$2,$3,$3::date-15,9900,'declined',$4,$5,now())",[rid,id,date,token,`/agent-checkout?kind=renewal&id=${rid}&token=${token}`]);return {id:rid,url:`/agent-checkout?kind=renewal&id=${rid}&token=${token}`,api:`agent-checkout/renewal/${rid}?token=${token}`};};
const future=await company('Future Fee LLC','2026-11-20'),futureR=await renewal(future,'2026-11-20');
const debt=await company('Accrued Fee LLC','2026-09-15'),debtR=await renewal(debt,'2026-09-15');
const replaced=await company('Replaced Agent LLC','2026-11-20');
const ended=await company('Ended With Debt LLC','2026-06-15');await renewal(ended,'2026-06-15');
const active=await company('Active Agent LLC','2026-11-20');
for(const id of [future,debt,ended]){const response=await post(`admin/orders/${id}/agent`,{action:'submitted',date:id===ended?'2026-07-01':'2026-09-20',reason:'nonpayment',note:'Synthetic supporting record'});if(!response.ok)throw Error(await response.text());}
await post(`admin/orders/${ended}/agent`,{action:'filed',date:'2026-07-02'});
await post(`admin/orders/${replaced}/agent`,{action:'replacement',date:'2026-09-10',note:'Synthetic replacement proof'});
const pending=await company('Pending Payment LLC','2026-11-20'),pendingR=await renewal(pending,'2026-11-20');
const attempt=crypto.randomUUID();await db.query("INSERT INTO ra_payment_attempts(id,target_id,kind,source_token,status,square_payment_id) VALUES($1,$2,'renewal',$3,'approved',$4)",[attempt,pendingR.id,encryptSecret(JSON.stringify({token:'offline-credit'})),'dev-'+attempt]);
await post('portal/registered-agent/cancel',{company:pending});
let selected=active;
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{MemoryRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Portal from'./src/pages/portal/PortalDashboard';import Office from'./src/pages/admin/AdminDashboard';import Checkout from'./src/pages/AgentCheckout';import{AgentServicePanel}from'./src/pages/admin/AgentServicePanel';let root=createRoot(document.getElementById('root'));const q=new QueryClient({defaultOptions:{queries:{retry:false}}});window.mount=(kind,path='/')=>{flushSync(()=>root.unmount());q.clear();root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<QueryClientProvider client={q}><MemoryRouter initialEntries={[path]}>{kind==='portal'?<Portal/>:kind==='office'?<Office/>:kind==='agent'?<AgentServicePanel orderId={path}/>:<Checkout/>}</MemoryRouter></QueryClientProvider>));};window.ready=true;`;
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const css=(await postcss([tailwindcss({...tailwindConfig,content:[resolve(root,'src/**/*.{ts,tsx}')]})]).process(readFileSync(resolve(root,'src/index.css'),'utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:resolve(root,'src/index.css')})).css;
const data=(value:unknown)=>Response.json({data:value});
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.BATCH41_BILLING_PORT||0),async fetch(req){const p=new URL(req.url).pathname;
 if(p==='/app.js')return new Response(js.outputFiles[0].contents,{headers:{'content-type':'text/javascript'}});
 if(p==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});
 if(p==='/api/portal/companies'){const actual=await(await request('portal/companies')).json();return data(actual.data.filter((x:{orderId:string})=>x.orderId===selected));}
 if(p==='/api/portal/services')return request('portal/services?company='+selected);
 if(p==='/api/portal/oa')return data({seed:{llcName:'Fixture LLC',members:[]},generations:[],todayEastern:'2026-09-23'});
 if(['/api/portal/documents','/api/portal/library'].includes(p))return data([]);
 if(p.startsWith('/api/')){const headers=new Headers(req.headers);headers.set('Cookie',p.startsWith('/api/admin/')?`fpsllc_admin=${admin.token}`:`fpsllc_session=${user.token}`);return app.fetch(new Request(req,{headers}));}
 return new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch(),{blocked}=isolateBrowser(browser),page=await browser.newPage({viewport:{width:1200,height:950}}),errors:string[]=[];
page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(String(e)));
const mount=(kind:string,path='/')=>page.evaluate(({kind,path})=>window['mount'](kind,path),{kind,path});
const shot=async(name:string)=>{if(evidence){await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true,animations:'disabled'});writeFileSync(resolve(evidence,name+'.txt'),await page.locator('body').innerText());}};
const scenario=async(label:string,run:()=>Promise<boolean>)=>{try{check(label,await run());}catch(e){check(label,false,{error:String(e),text:await page.locator('body').innerText()});}};
try{
 await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>window['ready']);
 await scenario('active appointment retains renewal/card controls',async()=>{await mount('portal');await page.getByText(/Your registered agent service is active/).waitFor();return await page.getByRole('button',{name:/Update renewal card/i}).count()===1;});
 selected=future;await scenario('submitted resignation removes future renewal and card update',async()=>{await mount('portal');await page.getByText(/Resignation submitted September 20, 2026/).waitFor();await shot('future-resigned');const t=await page.getByRole('heading',{name:'Registered agent service',exact:true}).locator('..').locator('..').innerText();return !/renews on/i.test(await page.locator('body').innerText())&&!/is active|renews on/i.test(t)&&await page.getByRole('button',{name:/Update renewal card/i}).count()===0&&await page.getByRole('link',{name:/Pay renewal now/}).count()===0;});
 await scenario('saved future checkout refuses another year without consent control',async()=>{await mount('checkout',futureR.url);await page.getByRole('alert').waitFor();return (await page.getByRole('alert').innerText()).includes('This service renewal is cancelled. Any outstanding service fees and resignation charge are shown separately.')&&await page.getByRole('checkbox').count()===0;});
 selected=debt;await scenario('portal separates annual debt from resignation fee',async()=>{await mount('portal');await page.getByRole('link',{name:'Pay outstanding service fees',exact:true}).waitFor();await shot('debt-portal');return await page.getByRole('link',{name:/Pay resignation charge/}).count()===1&&!(await page.locator('body').innerText()).includes('two days');});
 await scenario('debt checkout shows limited authorization and no renewal promise',async()=>{await mount('checkout',debtR.url);await page.getByRole('heading',{name:'Pay outstanding service fees'}).waitFor();await shot('debt-checkout');const t=await page.locator('body').innerText();return t.includes('does not renew service')&&t.includes('I authorize payment of $99.00 toward the outstanding registered-agent service fees shown above.')&&!t.includes('automatic annual renewal');});
 await page.setViewportSize({width:375,height:812});await shot('debt-checkout-mobile');check('debt checkout fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1200,height:950});
 selected=replaced;await scenario('replacement displays ended appointment and removes proof/card requests',async()=>{await mount('portal');await page.getByText(/Replacement registered agent verified/).waitFor();await shot('replacement-portal');const t=await page.locator('body').innerText();return t.includes('ended on September 10, 2026')&&!t.includes('email proof of the change')&&await page.getByRole('button',{name:/Update renewal card/i}).count()===0;});
 await scenario('office shows both debt and resignation balances after end date',async()=>{await mount('office');await page.getByRole('tab',{name:'Registered Agent Clients',exact:true}).click();await page.getByTestId('client-row').waitFor();await shot('office-balances');const t=await page.getByTestId('client-row').innerText();return t.includes('Outstanding service fees: $99 — payment declined')&&t.includes('Resignation charge: $99 — unpaid; payment link available')&&t.includes('Ended With Debt LLC (Our registered-agent appointment ended on August 2, 2026.)')&&!t.includes('Accrued Fee LLC (renews');});
 const paid=await post(debtR.api,{sourceId:'offline-credit',consent:true});check('debt payment API completes',paid.ok,await paid.json());
 selected=debt;await scenario('paid debt history reports settlement without renewal',async()=>{await mount('portal');await page.getByText(/Outstanding service fees paid on/).waitFor();await shot('paid-debt-portal');return !(await page.locator('body').innerText()).includes('Renewed on')&&await page.getByRole('link',{name:'Pay outstanding service fees',exact:true}).count()===0;});
 selected=pending;await scenario('pending payment remains reachable after cancellation and page reload',async()=>{await mount('portal');await page.getByRole('link',{name:'Check payment result',exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>window['ready']);await mount('checkout',pendingR.url);await page.getByRole('button',{name:'Check payment result',exact:true}).waitFor();await shot('pending-reconciliation');const noCard=await page.getByRole('checkbox').count()===0&&await page.getByRole('combobox').count()===0;await page.getByRole('button',{name:'Check payment result',exact:true}).click();await page.waitForURL('**/portal');const [saved]=await db.query<{status:string;count:number}>("SELECT r.status,(SELECT count(*)::int FROM ra_payment_attempts a WHERE a.target_id=r.id) AS count FROM ra_renewals r WHERE id=$1",[pendingR.id]);return noCard&&saved.status==='paid_by_link'&&saved.count===1;});
 const officePending=await company('Office Payment LLC','2026-09-15'),officeR=await renewal(officePending,'2026-09-15'),officeAttempt=crypto.randomUUID();
 await db.query("UPDATE orders SET ra_resignation_submitted='2026-09-20',ra_ended_date='2026-09-22',ra_payment_target=$2 WHERE id=$1",[officePending,officeR.id]);
 await db.query("INSERT INTO ra_payment_attempts(id,target_id,kind,source_token,status,square_payment_id) VALUES($1,$2,'renewal',$3,'approved',$4)",[officeAttempt,officeR.id,encryptSecret(JSON.stringify({token:'offline-credit'})),'dev-'+officeAttempt]);
 const unauth=await app.request(`/api/admin/orders/${officePending}/agent/check-payment`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({targetId:officeR.id})});
 const wrongOrder=await post(`admin/orders/${active}/agent/check-payment`,{targetId:officeR.id});
 check('office payment check requires authentication and exact company',unauth.status===401&&wrongOrder.status===404,{unauth:unauth.status,wrongOrder:wrongOrder.status});
 await scenario('office check resolves ended-company payment and refreshes its panel',async()=>{
  await mount('agent',officePending);await page.getByRole('button',{name:'Check payment result',exact:true}).click();
  await page.getByText('Payment received.',{exact:true}).waitFor();await shot('office-check-result');
  const [saved]=await db.query<{status:string;count:number;ra_payment_target:string|null}>("SELECT r.status,o.ra_payment_target,(SELECT count(*)::int FROM ra_payment_attempts a WHERE a.target_id=r.id) AS count FROM ra_renewals r JOIN orders o ON o.id=r.order_id WHERE r.id=$1",[officeR.id]);
  return saved.status==='paid_by_link'&&saved.count===1&&saved.ra_payment_target===null&&await page.getByRole('button',{name:'Check payment result',exact:true}).count()===0;
 });
 check('no browser runtime errors or external requests',errors.length===0&&blocked.size===0,{errors,blocked:[...blocked]});
}finally{await browser.close();server.stop(true);globalThis.fetch=nativeFetch;rmSync(fixture,{recursive:true,force:true});}
if(evidence)writeFileSync(resolve(evidence,'walk-results.json'),JSON.stringify({proof,rows},null,2));
console.log('B41BILLING:'+JSON.stringify({proof,rows}));process.exitCode=rows.every(r=>r.ok)?0:1;
