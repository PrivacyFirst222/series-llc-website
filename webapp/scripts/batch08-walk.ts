import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { isolateBrowser, guardedRoute, localFetch } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { agentFixture } from '../server/batch06-check';
import { orderFormSchema } from '../server/validation';
import { validateStep } from '../src/components/forms/florida-llc/stepValidation';
import { buildPayload } from '../src/components/forms/florida-llc/buildPayload';
import { nameCheckKey } from '../src/components/forms/florida-llc/nameSimilarity';
import { STEPS, type StepKey } from '../src/components/forms/florida-llc/steps';
import type { FloridaLLCFormData } from '../src/components/forms/florida-llc/types';
type Check = (ok: boolean, label: string, detail?: unknown) => void;
const member = {id:'owner8',memberType:'INDIVIDUAL' as const,firstName:'Jane',lastName:'Owner',address1:'101 Main St',city:'Orlando',state:'FL',zip:'32803',country:'United States',isInitialMember:true};
const fixture = (extra: Partial<FloridaLLCFormData> = {}) => agentFixture({clientEmail:'batch08@example.test',confirmClientEmail:'batch08@example.test',correspondentEmail:'',confirmCorrespondentEmail:'',nameCheck:{key:nameCheckKey(['Batch Six']),available:false,results:[]},...extra});
const parsedIssues = (data: FloridaLLCFormData) => { const p=orderFormSchema.safeParse(data); return p.success ? [] : p.error.issues.map(x=>({path:x.path.join('.'),message:x.message})); };
export async function batch08Walk(browser: Browser, web: string, check: Check, api=web) {
  const attempt = async (label:string, run:()=>Promise<void>) => {try {await run();}catch(e){check(false,label,String(e));}};
  const open = async (key:StepKey,data:FloridaLLCFormData):Promise<Page> => {
    const p=await browser.newPage();p.setDefaultTimeout(4500);
    await guardedRoute(p,'**/api/address/check',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({data:{status:'unavailable'}})}));
    await p.addInitScript(({data,step})=>localStorage.setItem('fl-llc-formation-draft-v1',JSON.stringify({__draft:2,data,stepIndex:step,maxStep:18,visited:Array.from({length:19},(_,i)=>i)})),{data,step:STEPS.findIndex(x=>x.key===key)});
    await p.goto(web+'/form-llc');await p.locator('main h2').waitFor();return p;
  };
  const shot = async (p:Page,name:string) => {if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await p.screenshot({path:`${process.env.SHOT_DIR}/batch08-${name}.png`,fullPage:true});}};
  const draft = (p:Page) => p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data as FloridaLLCFormData);
  await attempt('batch08 49: review states which member information is filed',async()=>{
    const texts:string[]=[];
    for(const convert of [false,true]){const d=fixture({managementStructure:'MEMBER_MANAGED',members:[member],includeMembersInArticles:false,...(convert?{filingPath:'CONVERT',existingLlcName:'Batch Eight LLC',sunbizDocumentNumber:'L26000000008',conversionAuthorityAcknowledgment:true}:{})});const p=await open('review',d);try{texts.push(await p.getByRole('heading',{name:'Members / Ownership',exact:true}).locator('../..').innerText());if(!convert)await shot(p,'member-review');}finally{await p.close();}}
    check(texts[0].includes('Yes — listed as authorized members (AMBR)')&&!texts[1].includes('In Articles?'),'batch08 49: review states which member information is filed',texts);
  });
  await attempt('batch08 55: missing country is caught and shown on the current step',async()=>{
    const cases:[StepKey,FloridaLLCFormData,string][]=[['client',fixture({clientAddress:{...fixture().clientAddress,country:''}}),'clientAddress.country'],['managers',fixture({managers:[{...fixture().managers[0],country:' '}]}),'managers.0.country'],['members',fixture({managementStructure:'MEMBER_MANAGED',members:[{...member,country:''}]}),'members.0.country']];
    const results=cases.map(([step,d,path])=>({path,stepError:validateStep(step,d)[path],server:parsedIssues(d).filter(x=>x.path===path)}));
    const p=await open('client',cases[0][1]);try{await p.getByRole('button',{name:'Continue',exact:true}).click();const text=await p.locator('main').innerText();check(results.every(x=>!!x.stepError&&x.server.length===1)&&text.includes('Country required.')&&await p.locator('#client-country').getAttribute('aria-invalid')==='true','batch08 55: missing country is caught and shown on the current step',{results,text});await shot(p,'country-error');}finally{await p.close();}
  });
  await attempt('batch08 56: ZIP validation agrees before and after submission',async()=>{
    const rows=[];for(const zip of ['1','12','123','ABCDE','32803','32803-1234']){const d=fixture({clientAddress:{...fixture().clientAddress,zip}});rows.push({zip,step:validateStep('client',d)['clientAddress.zip'],server:parsedIssues(d).filter(x=>x.path==='clientAddress.zip')});}
    const p=await open('client',fixture({clientAddress:{...fixture().clientAddress,zip:'12'}}));try{await p.getByRole('button',{name:'Continue',exact:true}).click();const text=await p.locator('main').innerText();check(rows.slice(0,4).every(x=>!!x.step&&x.server.length===1)&&rows.slice(4).every(x=>!x.step&&!x.server.length)&&text.includes('Enter a 5-digit ZIP code or ZIP+4.'),'batch08 56: ZIP validation agrees before and after submission',{rows,text});}finally{await p.close();}
  });
  await attempt('batch08 57: only the user email is required and optional errors are visible',async()=>{
    const blank=fixture(), bad=fixture({managers:[{...fixture().managers[0],email:'not-an-email'}]});
    const p=await open('managers',bad);let managerVisible=false;try{await p.getByRole('button',{name:'Continue',exact:true}).click();managerVisible=await p.locator('[id$="-email"]').getAttribute('aria-invalid')==='true';await shot(p,'optional-email-error');}finally{await p.close();}
    const signer=await open('certify',fixture({articlesSignerChoice:'SELF',authorizedRepresentativeName:'Jane Owner',authorizedRepresentativeSignature:'Jane Owner',authorizedRepresentativeSignatureCheckbox:true}));let removed=false;try{removed=await signer.locator('#representative-email,#representative-phone').count()===0;}finally{await signer.close();}
    const detail={blank:parsedIssues(blank),bad:parsedIssues(bad),step:validateStep('managers',bad),fallback:buildPayload(blank).correspondence.email,missingUser:parsedIssues(fixture({clientEmail:'',confirmClientEmail:''})),managerVisible,removed};
    check(!detail.blank.length&&detail.bad.some(x=>x.path==='managers.0.email')&&!!detail.step['managers.0.email']&&detail.fallback===blank.clientEmail&&detail.missingUser.some(x=>x.path==='clientEmail')&&managerVisible&&removed,'batch08 57: only the user email is required and optional errors are visible',detail);
  });
  await attempt('batch08 60: correspondence uses name and email without unused extra fields',async()=>{
    const d=fixture({correspondentCompany:'Abandoned Company',correspondentPhone:'123',correspondentAddress:{address1:'',city:'',state:'',zip:'',country:''}});
    const p=await open('correspondence',d);try{const text=await p.locator('main').innerText();const result=orderFormSchema.safeParse(d);const saved=result.success?buildPayload(result.data as FloridaLLCFormData).correspondence:null;const noExtra=await p.locator('#correspondent-company,#correspondent-phone,#corres-address1').count()===0;await shot(p,'correspondence');await p.getByRole('button',{name:'Continue',exact:true}).click();await p.waitForTimeout(150);check(noExtra&&text.includes('Leave the email blank')&&saved?.email===d.clientEmail&&!saved.company&&!saved.phone&&saved.address===null&&(await p.locator('main h2').innerText())!=='Correspondence contact','batch08 60: correspondence uses name and email without unused extra fields',{noExtra,text,saved,issues:parsedIssues(d)});await shot(p,'after-correspondence');}finally{await p.close();}
  });
  await attempt('batch08 85: manager and member type labels agree',async()=>{
    const labels=[];for(const step of ['managers','members']as const){const p=await open(step,fixture({managementStructure:step==='members'?'MEMBER_MANAGED':'MANAGER_MANAGED',members:[member]}));try{const text=await p.locator('main').innerText();await p.locator('[id$="-type"]').first().click();labels.push({text,option:await p.getByRole('option',{name:'Business entity',exact:true}).count()});}finally{await p.close();}}
    check(labels[0].text.includes('Manager type')&&labels[1].text.includes('Member type')&&labels.every(x=>x.option===1),'batch08 85: manager and member type labels agree',labels);
  });
  await attempt('batch08 94: member requirement describes the selected filing path',async()=>{
    const texts=[];for(const convert of [false,true]){const d=fixture({managementStructure:'MEMBER_MANAGED',members:[],...(convert?{filingPath:'CONVERT',existingLlcName:'Batch Eight LLC',sunbizDocumentNumber:'L26000000008',conversionAuthorityAcknowledgment:true}:{})});texts.push(validateStep('members',d).members);}
    check(texts[0]==='At least one member is required. We list these members in the Articles of Organization.'&&texts[1]==='At least one member is required for your operating agreement.','batch08 94: member requirement describes the selected filing path',texts);
  });
  await attempt('batch08 100: review includes exact-name instructions and omits inapplicable blanks',async()=>{
    const p=await open('review',fixture({exactNameOnly:true,registeredAgentEmail:'',registeredAgentPhone:''}));try{const name=await p.getByRole('heading',{name:'LLC Name',exact:true}).locator('../..').innerText();const agent=await p.getByRole('heading',{name:'Registered Agent',exact:true}).locator('../..').innerText();check(/Exact name only\s+Yes/i.test(name)&&!agent.includes('Email')&&!agent.includes('Phone'),'batch08 100: review includes exact-name instructions and omits inapplicable blanks',{name,agent});}finally{await p.close();}
  });
  await attempt('batch08 N4.09: hidden manager rows cannot block a member-managed order',async()=>{
    const d=fixture({managementStructure:'MEMBER_MANAGED',members:[member],managers:[{...fixture().managers[0],email:'bad',streetAddress1:'',city:'',zip:''}]});
    const p=await open('certify',d);try{let response:{status:number;body:unknown;raw:Record<string,unknown>}|undefined;
      await guardedRoute(p,'**/api/orders',async route=>{const request=route.request();const raw=JSON.parse(request.postData()!);const res=await localFetch(api+'/api/orders',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'192.0.2.208'},body:JSON.stringify(raw)});const body=await res.json();response={status:res.status,body,raw};await route.fulfill({status:res.status,contentType:'application/json',body:JSON.stringify(res.ok?{data:{...body.data,checkoutUrl:web+'/terms'}}:body)});});
      await p.getByRole('button',{name:'Submit intake',exact:true}).click();for(let i=0;!response&&i<45;i++)await p.waitForTimeout(100);
      const parsed=orderFormSchema.safeParse(d);const detail={response,parsed:parsed.success?{managers:parsed.data.managers}:parsed.error.issues,page:response?undefined:await p.locator("main").innerText(),steps:STEPS.map(s=>({key:s.key,errors:validateStep(s.key,d)})).filter(x=>Object.keys(x.errors).length)};
      check(response?.status===200&&Array.isArray(response.raw.managers)&&response.raw.managers.length===0&&parsed.success&&parsed.data.managers.length===0,'batch08 N4.09: hidden manager rows cannot block a member-managed order',detail);
      if(response?.status===200){const login=await localFetch(api+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'dev-admin'})});const cookie=(login.headers.get('set-cookie')??'').split(';')[0];const body=response.body as {data:{orderId:string}};const saved=await localFetch(api+'/api/admin/orders/'+body.data.orderId,{headers:{cookie}}).then(r=>r.json());const value=saved.data?.payload;check(value?.management?.managersOrAuthorizedRepresentatives?.length===0&&value.members.memberList.length===1&&value.correspondence.email===d.clientEmail,'batch08 stored order has only the chosen people and user email',value);}
    }finally{await p.close();}
  });
  await attempt('batch08 N4.05: ordinary LLC orders do not retain a hidden professional purpose',async()=>{
    const p=await open('intro',fixture({formationType:'PLLC',llcDesignator:'PLLC',purposeType:'PROFESSIONAL',businessPurposeText:'The practice of medicine'}));let changed:FloridaLLCFormData;try{await p.getByText('Domestic Florida LLC',{exact:true}).click();await p.waitForTimeout(200);changed=await draft(p);}finally{await p.close();}
    const stale=fixture({purposeType:'PROFESSIONAL',businessPurposeText:'The practice of medicine'});const q=await open('purpose',stale);try{await q.waitForTimeout(200);const restored=await draft(q);const errors=parsedIssues(stale);check(changed!.purposeType==='GENERAL'&&!changed!.businessPurposeText&&restored.purposeType==='GENERAL'&&!restored.businessPurposeText&&errors.some(x=>x.path==='purposeType'),'batch08 N4.05: ordinary LLC orders do not retain a hidden professional purpose',{changed:{type:changed!.purposeType,text:changed!.businessPurposeText},restored:{type:restored.purposeType,text:restored.businessPurposeText},errors});await shot(q,'ordinary-purpose');}finally{await q.close();}
  });
  const opposite=fixture({members:[{...member,firstName:'',lastName:'',zip:''}]});check(orderFormSchema.safeParse(opposite).success,'batch08 abandoned member row cannot block manager-managed checkout',parsedIssues(opposite));
  const alternate=fixture({correspondentEmail:'other@example.test',confirmCorrespondentEmail:'other@example.test'});check(orderFormSchema.safeParse(alternate).success&&buildPayload(alternate).correspondence.email==='other@example.test'&&!orderFormSchema.safeParse({...alternate,confirmCorrespondentEmail:'wrong@example.test'}).success,'batch08 an optional alternate email is preserved and checked');
}
if(import.meta.main){const s=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failed=0;try{await batch08Walk(browser,s.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failed++;},s.api);}finally{await browser.close();s.stop();}process.exit(failed?1:0);}
