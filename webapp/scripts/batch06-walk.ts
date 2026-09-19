import { chromium, type Browser, type Page } from 'playwright';
import { isolateBrowser, guardedRoute, localFetch } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { agentFixture, batch06Checks } from '../server/batch06-check';
import { mkdirSync } from 'node:fs';
import type { FloridaLLCFormData } from '../src/components/forms/florida-llc/types';
type Check=(ok:boolean,label:string,detail?:unknown)=>void;
export async function batch06Walk(browser:Browser,web:string,check:Check){
 batch06Checks(check);
 const open=async(step:number,data:FloridaLLCFormData):Promise<Page>=>{const p=await browser.newPage();p.setDefaultTimeout(4000);await guardedRoute(p,'**/api/address/check',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({data:{status:'unavailable'}})}));await p.addInitScript(({data,step})=>localStorage.setItem('fl-llc-formation-draft-v1',JSON.stringify({__draft:2,data,stepIndex:step,maxStep:18,visited:Array.from({length:19},(_,i)=>i)})),{data,step});await p.goto(web+'/form-llc');await p.getByRole('heading',{name:step===7?'Registered agent':step===8?'Registered agent acceptance':step===17?(data.filingPath==='CONVERT'?'Certification':'Certification & signature'):'Review your information',exact:true}).waitFor();return p;};
 const shot=async(p:Page,name:string)=>{if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await p.screenshot({path:`${process.env.SHOT_DIR}/batch06-${name}.png`,fullPage:true});}};
 const attempt=async(label:string,run:()=>Promise<void>)=>{try{await run();}catch(e){check(false,label,String(e));}};
 const retained=()=>agentFixture({filingPath:'CONVERT',existingLlcName:'Batch Six LLC',sunbizDocumentNumber:'L26000000001',conversionAuthorityAcknowledgment:true});
 await attempt('batch06 51: retained agents support individuals and entities',async()=>{const p=await open(7,retained());try{const choice=p.locator('#ra-type');let ok=false;if(await choice.count()){await choice.selectOption('ENTITY');await p.locator('#ra-entity').fill('Existing Agent Inc.');await p.waitForTimeout(100);const d=await p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data);ok=d.registeredAgentType==='ENTITY'&&d.registeredAgentBusinessEntityName==='Existing Agent Inc.'&&!d.registeredAgentFirstName&&!d.registeredAgentLastName&&!d.registeredAgentSuffix;}check(ok,'batch06 51: retained agents support individuals and entities',await p.locator('main').innerText());await shot(p,'retained-entity');}finally{await p.close();}});
 await attempt('batch06 71: retained agents do not promise a new acceptance',async()=>{const p=await open(7,retained());try{const t=await p.locator('main').innerText();check(t.includes('Keep the registered agent already on file')&&!t.includes("you'll sign the acceptance on the next screen")&&!t.includes('I am accepting this role personally'),'batch06 71: retained agents do not promise a new acceptance',t);}finally{await p.close();}});
 await attempt('batch06 59: agent change is included in conversion authority',async()=>{const texts=[];for(const service of [true,false]){const p=await open(17,{...retained(),registeredAgentChoice:service?'SERVICE':'SELF'});try{texts.push(await p.locator('label[for="cert-conversion-authority"]').innerText());}finally{await p.close();}}check(texts[0].includes('and the change of registered agent')&&!texts[1].includes('and the change of registered agent'),'batch06 59: agent change is included in conversion authority',texts);});
 await attempt('batch06 62: agent signature matches the complete legal name',async()=>{const p=await open(8,agentFixture({registeredAgentElectronicSignature:'Different Person'}));try{await p.getByRole('button',{name:'Continue',exact:true}).click();const t=await p.locator('main').innerText();check(t.includes('must match')&&t.includes('John Smith, Jr.'),'batch06 62: agent signature matches the complete legal name',t);await shot(p,'signature-mismatch');}finally{await p.close();}});
 await attempt('batch06 69: non-Florida addresses are never relabeled',async()=>{const d=agentFixture();d.clientAddress={...d.clientAddress,city:'Atlanta',state:'GA',zip:'30303',address1:'100 Peachtree St'};const p=await open(7,d);try{await p.getByRole('button',{name:/Use my information/}).click();await p.waitForTimeout(100);const state=await p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data);check(state.registeredAgentCity==='Orlando'&&state.registeredAgentStreetAddress1==='101 Main St'&&(await p.locator('main').innerText()).includes('Florida address'),'batch06 69: non-Florida addresses are never relabeled',state);await shot(p,'out-of-state-copy');}finally{await p.close();}});
 await attempt('batch06 70: individual agent confirms Florida residency',async()=>{const p=await open(7,agentFixture());try{const t=await p.locator('main').innerText();check(t.includes('I live in Florida, and the Florida street address entered above is my business address and the LLC’s registered office, not a P.O. Box.'),'batch06 70: individual agent confirms Florida residency',t);}finally{await p.close();}});
 await attempt('batch06 72: mail promise matches the Terms',async()=>{const p=await open(7,agentFixture({registeredAgentChoice:'SERVICE'}));try{const t=await p.locator('main').innerText();check(t.includes('service of process and official government correspondence we receive for your LLC is posted to your client portal')&&!t.includes('anything we receive'),'batch06 72: mail promise matches the Terms',t);}finally{await p.close();}});
 await attempt('batch06 73: agent accepts and is familiar with obligations',async()=>{const p=await open(8,agentFixture());try{const t=await p.locator('main').innerText();check(t.includes('I accept the appointment as registered agent for this Florida LLC, and I am familiar with and accept the obligations of that position.'),'batch06 73: agent accepts and is familiar with obligations',t);}finally{await p.close();}});
 await attempt('batch06 75: signature warning punctuation is corrected',async()=>{const p=await open(17,agentFixture());try{const t=await p.locator('main').innerText();check(t.includes('a bank or the Division of Workers’ Compensation may ask')&&!t.includes('a bank, or'),'batch06 75: signature warning punctuation is corrected',t);}finally{await p.close();}});
 await attempt('batch06 N4.07: retained agent agreement covers every series',async()=>{const p=await open(17,{...retained(),...{registeredAgentSeriesAgreementAcknowledgment:false}});try{const t=await p.locator('main').innerText(),box=p.locator('#cert-agent-series'),present=await box.count();await p.getByRole('button',{name:'Submit intake',exact:true}).click();const blocked=await p.getByRole('heading',{name:'Certification',exact:true}).count();check(t.includes('including every protected series in this order')&&present===1&&blocked===1,'batch06 N4.07: retained agent agreement covers every series',{t,present,blocked});if(present){await box.click();await shot(p,'series-agreement');}}finally{await p.close();}});
 await attempt('batch06 N4.11: agent suffix survives acceptance and review',async()=>{const p=await open(8,agentFixture({registeredAgentAcceptanceName:''}));let acceptance='';try{acceptance=await p.locator('#ra-accept-name').inputValue();}finally{await p.close();}const r=await open(16,agentFixture());try{const text=await r.getByText('Registered Agent',{exact:true}).locator('..').locator('..').innerText();check(acceptance==='John Smith, Jr.'&&text.includes('John Smith, Jr.'),'batch06 N4.11: agent suffix survives acceptance and review',{acceptance,text});await shot(r,'review');}finally{await r.close();}});
 await attempt('batch06 retained entity submits and reaches office intact',async()=>{
   const data={...retained(),registeredAgentType:'ENTITY' as const,registeredAgentBusinessEntityName:'Existing Agent Inc.',registeredAgentFirstName:'',registeredAgentLastName:'',registeredAgentSuffix:'',registeredAgentAcceptanceName:'',registeredAgentElectronicSignature:'',registeredAgentAcceptanceCheckbox:false,registeredAgentSignatureAuthorizationCheckbox:false,registeredAgentNotSameAsLlc:false,registeredAgentPhysicalAddressAcknowledgment:false};
   const p=await open(17,data);
   try {
     let observed: {ok:boolean; body: {data?: {orderId?:string}}} | undefined;
     await guardedRoute(p,'**/api/orders',async route=>{
       const request=route.request();const response=await localFetch(request.url(),{method:request.method(),headers:request.headers(),body:request.postData()});const body=await response.text();
       observed={ok:response.ok,body:JSON.parse(body)};
       await route.fulfill({status:response.status,contentType:'application/json',body});
     });
     await p.getByRole('button',{name:'Submit intake',exact:true}).click();
     for(let i=0;!observed&&i<40;i++)await p.waitForTimeout(100);
     check(observed?.ok===true,'batch06 retained entity submits through actual form',observed);
     if(observed?.ok) {
       const login=await p.request.post(web+'/api/admin/login',{data:{password:'dev-admin'},headers:{'x-forwarded-for':'192.0.2.206'}});
       const detail=await p.request.get(web+'/api/admin/orders/'+observed.body.data?.orderId);
       const saved=(await detail.json()).data?.payload;
       check(login.ok()&&detail.ok()&&saved?.registeredAgent?.type==='ENTITY'&&saved.registeredAgent.businessEntityName==='Existing Agent Inc.'&&saved.registeredAgent.name==='Existing Agent Inc.'&&!saved.registeredAgent.firstName&&!saved.registeredAgent.acceptance.electronicSignature&&saved.acknowledgments.registeredAgentSeriesAgreementAcknowledgment===true&&saved.acknowledgments.registeredAgentExistingRecordAcknowledgment===true,'batch06 retained entity submits and reaches office intact',saved);
     }
   } finally {await p.close();}
 });
 await attempt('batch06 editing agent facts clears prior confirmations',async()=>{
   const p=await open(7,retained());try{
     await p.locator('#ra-last-name').fill('Changed');await p.waitForTimeout(100);
     const d=await p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data);
     check(!d.registeredAgentExistingRecordAcknowledgment&&!d.registeredAgentSeriesAgreementAcknowledgment&&!d.registeredAgentElectronicSignature,'batch06 editing agent facts clears prior confirmations',d);
   }finally{await p.close();}
 });

}
if(import.meta.main){const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failed=0;try{await batch06Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failed++;});}finally{await browser.close();stack.stop();}process.exit(failed?1:0);}
