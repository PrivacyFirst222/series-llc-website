import {chromium,type Browser} from 'playwright';
import {isolateBrowser,guardedRoute} from './browser-isolation';
import {startIsolatedStack} from './isolated-stack';
import {batch07Checks} from '../server/batch07-check';
import {agentFixture} from '../server/batch06-check';
import {stepForField} from '../src/components/forms/florida-llc/steps';
import {mkdirSync} from 'node:fs';
type Check=(ok:boolean,label:string,detail?:unknown)=>void;
export async function batch07Walk(browser:Browser,web:string,check:Check){
 await batch07Checks(check);
 check(stepForField('raRenewalCardConsent')==='agent','batch07 48: renewal consent errors return to agent step',{step:stepForField('raRenewalCardConsent')});
 const p=await browser.newPage();p.setDefaultTimeout(5000);
 const shot=async(name:string)=>{if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await p.screenshot({path:`${process.env.SHOT_DIR}/batch07-${name}.png`,fullPage:true});}};
 const attempt=async(label:string,run:()=>Promise<void>)=>{try{await run();}catch(e){check(false,label,String(e));}};
 try{
 await attempt('batch07 4: Terms allocate services consistently',async()=>{
 await p.goto(web+'/terms');await p.getByText('The Parties',{exact:false}).first().waitFor();const t=await p.locator('main').innerText();
 check(t.includes('Sections 9(c)–(g), 10, and 11(e)')&&t.includes('These Terms apply to both Company parties'),'batch07 4: Terms allocate services consistently',t.slice(0,1800));
 check(t.includes('Sections 24 through 34, apply to both Company parties, each enforceable independently'),'batch07 29: general Terms protect both service providers',t.slice(0,1800));
 check(t.includes('state filing fees and processing')&&t.includes('does not purchase another year')&&!/month.to.month/i.test(t),'batch07 201: no monthly billing promise',t.match(/.{0,80}month.{0,150}/gi));
 check(t.includes('give cancellation notice at any time')&&t.includes('at least thirty (30) days before')&&t.includes('renewal date'),'batch07 45: cancellation timing is explicit',t.match(/.{0,20}cancellation notice.{0,300}/g));await shot('terms');
 });
 await attempt('batch07 144: cancellation timing is consistent in intake',async()=>{
 const data=agentFixture({registeredAgentChoice:'SERVICE',raRenewalCardConsent:false});await p.addInitScript(data=>localStorage.setItem('fl-llc-formation-draft-v1',JSON.stringify({__draft:2,data,stepIndex:7,maxStep:18,visited:Array.from({length:19},(_,i)=>i)})),data);await p.goto(web+'/form-llc');await p.getByRole('heading',{name:'Registered agent',exact:true}).waitFor();const t=await p.locator('main').innerText();check(t.includes('I may give cancellation notice at any time')&&t.includes('at least 30 days before renewal')&&t.includes('replacement-agent proof by the renewal date')&&!/prepaid gift card/i.test(t),'batch07 144: cancellation timing is consistent in intake',t);await shot('agent-consent');
 });
 let checkoutAttempts=0;
 await guardedRoute(p,'**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;const data=(value:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:value})});
 if(path.startsWith('/api/agent-checkout/')){if(route.request().method()==='POST'){checkoutAttempts++;if(checkoutAttempts===1)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'Payment was declined. Try again now or use another card.',code:'GENERIC_DECLINE'}})});return data({ok:true,redirect:'/terms'});}return data({company:'Seven Company LLC',amountCents:9900,purpose:'renewal',paid:false,offline:true,email:'seven@example.test'});}
 if(path==='/api/admin/me')return data({ok:true});if(path==='/api/admin/orders')return data({orders:[],total:0,shown:0});if(path==='/api/admin/services')return data([]);
 if(path==='/api/admin/clients')return data([{id:'seven',name:'Seven Client',email:'seven@example.test',created_at:'2026-08-01',has_password:true,ra_cancellation_requested_at:'2026-08-01',orders:[],companies:[],documents:[],ra_llcs:['Alpha LLC (renews Aug 1, 2027 — cancellation requested Sep 1, 2026)','Beta LLC (renews Aug 1, 2027)'],ra_cards:[{llc_name:'Alpha LLC',card_status:null,consent:true,last_status:null},{llc_name:'Beta LLC',card_status:'none',card_note:'customer',consent:true,last_status:null}]}]);return data([]);
 });
 await attempt('batch07 171: unknown card status is distinct from absent consent',async()=>{
 await p.goto(web+'/admin');await p.getByRole('tab',{name:'Registered Agent Clients',exact:true}).click();await p.getByTestId('client-row').waitFor();const t=await p.getByTestId('client-row').innerText();check(t.includes('Card status not recorded')&&t.includes('Renewal permission: Agreed')&&!t.includes('No consent'),'batch07 171: unknown card status is distinct from absent consent',t);
 check(t.includes('Alpha LLC (renews Aug 1, 2027 — cancellation requested Sep 1, 2026)')&&t.includes('Beta LLC (renews Aug 1, 2027)')&&!(await p.getByTestId('client-row').getByText(/^RA cancel requested/).count()),'batch07 172: cancellation status belongs to the company',t);
 check(t.includes('Square customer setup failed'),'batch07 184: card failures have useful explanations',t);await shot('agent-office');
 });
 await attempt('batch07 checkout allows an immediate retry after a decline',async()=>{
 await p.goto(web+'/agent-checkout?kind=renewal&id=fixture&token=fixture');await p.getByRole('checkbox',{name:'Agree to payment'}).click();await p.getByRole('button',{name:'Pay now',exact:true}).click();await p.getByRole('alert').waitFor();const declined=await p.getByRole('alert').innerText();await shot('declined-payment');await p.getByLabel('Offline test card').selectOption('credit');await p.getByRole('button',{name:'Pay now',exact:true}).click();await p.waitForURL('**/terms');check(checkoutAttempts===2&&declined.includes('Try again now'),'batch07 checkout allows an immediate retry after a decline',{checkoutAttempts,declined});
 });
 }finally{await p.close();}
}
if(import.meta.main){const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failed=0;try{await batch07Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failed++;});}finally{await browser.close();stack.stop();}process.exit(failed?1:0);}
