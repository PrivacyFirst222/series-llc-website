/** Actual rendered components with synthetic HTTP, not provider or authorization qualification. */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { guardedContextRoute, isolateBrowser } from './browser-isolation';
const root=resolve(import.meta.dir,'..'),out=process.argv[2] || mkdtempSync(join(tmpdir(),'chunk1-remaining-browser-'));
if(!out?.startsWith('/'))throw Error('Absolute evidence folder required');mkdirSync(out,{recursive:true});
const baseline=process.argv.find(x=>x.startsWith('--baseline='))?.slice(11);
const mutation=process.argv.find(x=>x.startsWith('--mutation='))?.slice(11);
const files=['src/pages/portal/ViewingAsBanner.tsx','src/pages/portal/PortalDashboard.tsx','src/pages/admin/AdminDashboard.tsx','src/pages/OrderConfirmed.tsx','src/lib/authMessages.ts','src/lib/englishText.ts'];
let applied=0;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Portal from './src/pages/portal/PortalDashboard';import Admin from './src/pages/admin/AdminDashboard';import Confirmed from './src/pages/OrderConfirmed';import {api} from './src/lib/api';import {loginErrorMessage} from './src/lib/authMessages';const q=new QueryClient({defaultOptions:{queries:{retryDelay:20,refetchOnWindowFocus:false}}});window.fixtureQuery=q;window.validationCheck=async(email)=>{try{await api.post('/api/auth/login',{email,password:'fixture'});return 'success';}catch(e){return loginErrorMessage(e);}};createRoot(document.getElementById('root')).render(<QueryClientProvider client={q}><BrowserRouter><Routes><Route path='/portal' element={<Portal/>}/><Route path='/admin' element={<Admin/>}/><Route path='/order/confirmed' element={<Confirmed/>}/><Route path='*' element={<h1>Sign in destination</h1>}/></Routes></BrowserRouter></QueryClientProvider>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{'@':root+'/src'},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'evidence-source',setup(b){b.onLoad({filter:/\.(ts|tsx)$/},args=>{const file=args.path.slice(root.length+1);if(!files.includes(file))return;let source=readFileSync(baseline?baseline+'/'+file:args.path,'utf8');const original=source;
 if(mutation==='R03a'&&file.endsWith('ViewingAsBanner.tsx'))source=source.replace('api.post("/api/auth/logout", {})','api.post("/api/auth/logout", {}).catch(() => undefined)');
 if(mutation==='R03b'&&file.endsWith('PortalDashboard.tsx'))source=source.replace('{logout.isError ? (','{false ? (');
 if(mutation==='R04'&&file.endsWith('AdminDashboard.tsx'))source=source.replace('authQuery.error instanceof ApiError && authQuery.error.status === 401','true');
 if(mutation==='R05'&&file.endsWith('OrderConfirmed.tsx'))source=source.replace(') : statusQuery.isError ? (',') : false ? (');
 if(mutation==='R06'&&file.endsWith('PortalDashboard.tsx'))source=source.replace('{libraryQuery.isError ? (','{false ? (');
 if(mutation==='R07'&&file.endsWith('authMessages.ts'))source=source.replace('  if (error instanceof InputValidationError) return error.message;','');
 if(source!==original){applied++;writeFileSync(out+'/mutated-'+file.split('/').at(-1),source);}return{contents:source,loader:file.endsWith('tsx')?'tsx':'ts'};});}}]});
if(mutation&&applied!==1)throw Error('Expected exactly one mutation');
const js=bundle.outputFiles[0].text;writeFileSync(out+'/tested-browser.js',js);
const {default:config}=await import(root+'/tailwind.config.ts');const {default:postcss}=await import('postcss');const {default:tailwind}=await import('tailwindcss');const css=(await postcss([tailwind({...config,content:[root+'/src/**/*.{tsx,ts}']})]).process(readFileSync(root+'/src/index.css','utf8').replace(/^@import url\([^\n]+\);\n/m,''),{from:root+'/src/index.css'})).css;
const co='11111111-1111-4111-8111-111111111111';const requests:string[]=[],unexpected:string[]=[],errors:string[]=[];let mode='normal',viewing=false;let release:(()=>void)|undefined;
function releaseRequest(){release?.();}
const company={orderId:co,llcName:'Fixture Holdings LLC',formed:true,raService:false,raRenewalDate:null,raCancellationRequestedAt:null,cardStatus:'on_file',cardLast4:'4242',cardBrand:'VISA',renewals:[],recoveryHold:false};
const clients=[{id:'22222222-2222-4222-8222-222222222222',email:'fixture@example.test',name:'Fixture Client',created_at:'2026-09-01T12:00:00Z',ra_cancellation_requested_at:null,has_password:true,document_count:0,ra_llcs:['Fixture Holdings LLC'],companies:[{id:co,llc_name:'Fixture Holdings LLC'}],ra_cards:[]}];
const json=(data:unknown)=>Response.json({data});const failure=(status=500)=>Response.json({error:{code:'FIXTURE_FAILURE',message:'Fixture unavailable'}},{status});
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const u=new URL(req.url),p=u.pathname;if(p==='/app.js')return new Response(js,{headers:{'content-type':'text/javascript'}});if(p==='/app.css')return new Response(css,{headers:{'content-type':'text/css'}});if(!p.startsWith('/api/'))return new Response('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',{headers:{'content-type':'text/html'}});
 requests.push(`${mode} ${req.method} ${p}${u.search}`);
 if(p==='/api/auth/logout')return mode==='logout-error'?failure():json({ok:true});
 if(p==='/api/auth/login')return failure(401);
 if(req.method!=='GET'){unexpected.push(req.method+' '+p);return failure();}
 if(p==='/api/auth/me')return json({email:'fixture@example.test',name:'Fixture Client',pendingEmail:null,viewingAsAdmin:viewing});
 if(p==='/api/admin/me')return mode==='auth-error'?failure():mode==='auth-401'?failure(401):json({ok:true});
 if(p==='/api/admin/clients'){if(mode==='clients-pending')await new Promise<void>(r=>release=r);return mode==='clients-error'?failure():json(mode==='clients-empty'?[]:clients);}
 if(p.startsWith('/api/admin/orders'))return json({orders:[],total:0,page:1,pageSize:50});
 if(p==='/api/portal/companies')return json([company]);
 if(p==='/api/portal/documents')return json([]);
 if(p==='/api/portal/library'){if(mode==='library-pending')await new Promise<void>(r=>release=r);return mode==='library-error'?failure():json(mode==='library-empty'?[]:[{key:'owners-manual',title:"Series LLC Owner's Manual",edition:'First Edition',size_bytes:1000,updated_at:'2026-09-01T12:00:00Z'}]);}
 if(p==='/api/portal/oa')return json({seed:{llcName:company.llcName},generations:[],memberManaged:true});
 if(p==='/api/portal/services')return json({llcName:company.llcName,oaSElection:null,dev:false,members:[{name:'Fixture Client'}],pricing:{seriesCents:5000,einCents:5000,sElectionCents:9900,certStatusCents:5000,certifiedCopyCents:5000},sElection:{eligible:false,reason:'no_new_formation',orderBy:null,formationPaidAt:null},series:[],llcFormed:true,todayEastern:'2026-09-25',companyEin:null,einCompanyOrdered:false,orders:[]});
 if(p.startsWith('/api/orders/')&&p.endsWith('/status'))return mode==='payment-error'?failure():json({status:mode==='payment-pending'?'pending_payment':'paid',llcName:company.llcName,hasPassword:true});
 unexpected.push(p);return failure();}});
const browser=await chromium.launch();const isolation=isolateBrowser(browser);const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});await guardedContextRoute(context,'**/*',route=>{const u=new URL(route.request().url());if(u.origin!==`http://127.0.0.1:${server.port}`){unexpected.push(u.origin);return route.abort();}if(mode==='network-error'&&u.pathname==='/api/auth/login')return route.abort();return route.continue();});
const page=await context.newPage();page.setDefaultTimeout(3000);page.on('pageerror',e=>errors.push(String(e)));const rows:{id:string;result:string;failure_code?:string;detail?:unknown}[]=[];
const settled=async()=>{
  const deadline=Date.now()+10000;
  const idle=()=>!!document.getElementById('root')?.childElementCount&&(window as unknown as{fixtureQuery:{isFetching():number;isMutating():number}}).fixtureQuery?.isFetching()===0&&(window as unknown as{fixtureQuery:{isMutating():number}}).fixtureQuery?.isMutating()===0;
  for(;;){
    try {
      await page.waitForFunction(idle);
      await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
      await page.waitForFunction(idle);
      await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
      return;
    }catch(error){
      // The broken Exit baseline navigates here. Rebind only after that known
      // navigation interruption; unrelated errors still fail the harness.
      if(Date.now()>=deadline||!String(error).includes('Execution context was destroyed'))throw error;
    }
  }
};
async function go(next:string,path='/portal'){mode=next;await page.goto(`http://127.0.0.1:${server.port}${path}`);await settled();}
async function check(id:string,test:()=>Promise<boolean>){let ok=false,detail:unknown;try{ok=await test();}catch(e){detail=String(e);}rows.push({id,result:ok?'pass':'fail',...(!ok?{failure_code:id.split('.')[0]+'_DEFECT'}:{}),detail});writeFileSync(out+'/'+id+'.txt',await page.locator('body').innerText());await page.screenshot({path:out+'/'+id+'.png',fullPage:true});console.log(JSON.stringify(rows.at(-1)));}
async function group(id:string,fn:()=>Promise<void>){try{await fn();}catch(e){rows.push({id:id+'.harness',result:'fail',failure_code:'HARNESS_ERROR',detail:String(e)});console.error(id,e);}}
const text=()=>page.locator('body').innerText();const draft='fpsllc-draft:ein:fixture';
const library=()=>page.locator('div.overflow-hidden').filter({has:page.getByRole('heading',{name:'Reference library',exact:true})}).first();
try{
 for(const admin of [true,false])await group(admin?'R03a':'R03b',async()=>{const id=admin?'R03a':'R03b';viewing=admin;await go('logout-error');await page.evaluate(key=>localStorage.setItem(key,'fixture'),draft);await page.getByRole('button',{name:admin?'Exit':'Sign out',exact:true}).click();await settled();await check(id+'.failure',async()=>new URL(page.url()).pathname==='/portal'&&(await text()).includes(admin?'We couldn’t end this client view':'We couldn’t sign you out')&&await page.evaluate(key=>localStorage.getItem(key),draft)==='fixture');
 mode='normal';const retry=page.getByRole('alert').filter({hasText:admin?'end this client view':'sign you out'}).getByRole('button',{name:'Retry',exact:true});if(await retry.count()){await retry.click();await page.waitForURL('**'+(admin?'/admin':'/portal/login'));await settled();}await check(id+'.downstream',async()=>new URL(page.url()).pathname===(admin?'/admin':'/portal/login')&&await page.evaluate(key=>localStorage.getItem(key),draft)===null);
 await go('normal');await page.getByRole('button',{name:admin?'Exit':'Sign out',exact:true}).click();await page.waitForURL('**'+(admin?'/admin':'/portal/login'));await check(id+'.normal',async()=>new URL(page.url()).pathname===(admin?'/admin':'/portal/login'));});viewing=false;
 await group('R04',async()=>{await go('auth-error','/admin');await check('R04.failure',async()=>new URL(page.url()).pathname==='/admin'&&(await text()).includes('We couldn’t load the office'));mode='normal';if(await page.getByRole('button',{name:'Retry',exact:true}).count())await page.getByRole('button',{name:'Retry',exact:true}).click();await settled();await check('R04.auth-retry',async()=>(await text()).includes('Orders & clients'));
 await go('auth-401','/admin');await check('R04.normal',async()=>new URL(page.url()).pathname==='/admin/login');
 for(const tab of ['Clients','Registered Agent Clients']){await go('clients-error','/admin');await page.getByRole('tab',{name:tab,exact:true}).click();await check('R04.list-'+tab.replaceAll(' ','-'),async()=>(await text()).includes('We couldn’t load the client list')&&!(await text()).includes('Clients appear here after')&&!(await text()).includes('No registered agent clients yet'));mode='normal';if(await page.getByRole('tabpanel').getByRole('button',{name:'Retry',exact:true}).count())await page.getByRole('tabpanel').getByRole('button',{name:'Retry',exact:true}).click();await settled();await check('R04.retry-'+tab.replaceAll(' ','-'),async()=>(await text()).includes('fixture@example.test'));}
 await go('clients-empty','/admin');await page.getByRole('tab',{name:'Clients',exact:true}).click();await check('R04.downstream',async()=>(await text()).includes('Clients appear here after their first paid order.')&&await page.getByRole('tabpanel').getByRole('alert').count()===0);
 mode='clients-pending';release=undefined;await page.goto(`http://127.0.0.1:${server.port}/admin`);await page.getByRole('tab',{name:'Clients',exact:true}).click();await check('R04.pending',async()=>(await text()).includes('Loading clients…'));releaseRequest();await settled();});
 await group('R05',async()=>{const start=requests.length;await go('payment-error','/order/confirmed?ref='+co);await check('R05.failure',async()=>(await text()).includes('We couldn’t check your payment status')&&!(await text()).includes('Finishing up'));mode='normal';if(await page.getByRole('button',{name:'Retry',exact:true}).count())await page.getByRole('button',{name:'Retry',exact:true}).click();await settled();await check('R05.downstream',async()=>(await text()).includes('Payment received.')&&requests.slice(start).every(r=>r.includes(' GET ')));await go('payment-pending','/order/confirmed?ref='+co);await check('R05.normal',async()=>(await text()).includes('Finishing up')&&!await page.getByRole('alert').count());});
 await group('R06',async()=>{await go('library-error');await check('R06.failure',async()=>(await library().innerText()).includes('We couldn’t load the reference library')&&!(await library().innerText()).includes('will appear here'));mode='normal';if(await library().getByRole('button',{name:'Retry',exact:true}).count())await library().getByRole('button',{name:'Retry',exact:true}).click();await settled();await check('R06.downstream',async()=>(await library().innerText()).includes("Series LLC Owner's Manual")&&await library().getByRole('link',{name:'Download',exact:true}).count()===1);await go('library-empty');await check('R06.normal',async()=>(await library().innerText()).includes('will appear here')&&!await library().getByRole('alert').count());mode='library-pending';release=undefined;await page.goto(`http://127.0.0.1:${server.port}/portal`);await page.getByRole('heading',{name:'Reference library',exact:true}).waitFor();await check('R06.pending',async()=>(await library().innerText()).includes('Loading reference library')&&!(await library().innerText()).includes('will appear here'));releaseRequest();await settled();});
 await group('R07',async()=>{await go('normal');const evaluate=(email:string)=>page.evaluate(value=>(window as unknown as{validationCheck(v:string):Promise<string>}).validationCheck(value),email);const start=requests.length,invalid=await evaluate('josé@example.test');await check('R07.failure',async()=>invalid.includes('Please use English letters')&&invalid.includes('email')&&requests.length===start);const valid=await evaluate('valid@example.test');await check('R07.normal',async()=>valid==='Incorrect email or password.');mode='network-error';const disconnected=await evaluate('valid@example.test');await check('R07.downstream',async()=>disconnected.includes('Check your connection'));writeFileSync(out+'/validation-outcomes.json',JSON.stringify({invalid,valid,disconnected},null,2));});
 await check('ISOLATION.browser',async()=>unexpected.length===0&&errors.length===0&&isolation.blocked.size===0);
}finally{releaseRequest();writeFileSync(out+'/requests.json',JSON.stringify({requests,unexpected,errors,isolation: [...isolation.blocked]},null,2));await browser.close();server.stop(true);}
writeFileSync(out+'/assertions.json',JSON.stringify(rows,null,2));console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions:rows}));if(rows.some(r=>r.result!=='pass'))process.exitCode=1;
