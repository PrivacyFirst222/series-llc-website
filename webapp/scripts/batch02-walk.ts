import {chromium,type Browser} from 'playwright';
import {guardedRoute,isolateBrowser} from './browser-isolation';
import {startIsolatedStack} from './isolated-stack';
import {defaultFormData} from '../src/components/forms/florida-llc/defaults';
import {mkdirSync} from 'node:fs';
type Check=(ok:boolean,label:string,detail?:unknown)=>void;
export async function batch02Walk(browser:Browser,web:string,check:Check){
 const name='Scope Alpha, LLC',series=`${name}, PS Store`;
 const service={id:'ein1',type:'ein',status:'in_progress',llc_name:name,client_id:'client1',formation_order_id:'co1',amount_cents:9500,created_at:'2026-09-01',paid_at:'2026-09-01',fulfilled_at:null,has_secret:true,ein_pending:false,client_email:'scope@example.test',client_name:'Alice Example',details:{target:'series',seriesName:series,responsibleName:'Alice Example',memberCount:1}};
 const company={orderId:'co1',llcName:name,formed:true,formedAt:'2026-09-01',registeredAgentChoice:'SELF'};
 const page=await browser.newPage();page.setDefaultTimeout(6000);
 const screenshot=async(suffix:string)=>{if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SHOT_DIR}/batch02-${suffix}.png`,fullPage:true});}};
 let portalTarget='series',uploadBody='';
 await guardedRoute(page,'**/api/**',async route=>{
   const u=new URL(route.request().url()); const json=(data:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
   if(u.pathname==='/api/admin/documents'&&route.request().method()==='POST'){uploadBody=route.request().postDataBuffer()?.toString()??'';return json({notified:true});}
   if(u.pathname==='/api/admin/clients')return json([{id:'client1',name:'Alice Example',email:'scope@example.test',created_at:'2026-09-01',orders:[],companies:[{id:'co1',llc_name:name},{id:'co2',llc_name:'Scope Beta, LLC'}],documents:[]}]);
   if(u.pathname==='/api/admin/me')return json({ok:true});
   if(u.pathname==='/api/auth/me')return json({name:'Alice Example',email:'scope@example.test'});
   if(u.pathname==='/api/admin/orders')return json({orders:[{id:'co1',client_id:'client1',llc_name:name,contact_name:'Alice Example',contact_email:'scope@example.test',status:'formed',total_cents:0,created_at:'2026-09-01',paid_at:'2026-09-01',formed_at:'2026-09-01',series_count:1}],total:1,shown:1});
   if(u.pathname==='/api/admin/services')return json([service]);
   if(u.pathname==='/api/admin/services/ein1')return json({...service,tin:'123456789',sElectionPaid:false});
   if(u.pathname==='/api/portal/companies')return json([company,{...company,orderId:'co2',llcName:'Scope Beta, LLC'}]);
   if(u.pathname==='/api/portal/documents')return json([{id:'mailA',kind:'legal_mail',title:'Alpha summons',order_id:'co1',company_name:name,created_at:'2026-09-01',size_bytes:50},{id:'mailB',kind:'legal_mail',title:'Beta summons',order_id:'co2',company_name:'Scope Beta, LLC',created_at:'2026-09-01',size_bytes:50}]);
   if(u.pathname==='/api/portal/services')return json({llcName:name,llcFormed:true,dev:false,todayEastern:'2026-09-19',members:[],series:[],einCompanyOrdered:true,pricing:{seriesCents:5000,einCents:9500,sElectionCents:9500,certStatusCents:500,certifiedCopyCents:3000},sElection:{eligible:false,reason:'already_ordered'},orders:[{...service,status:'awaiting_info',details:{...service.details,target:portalTarget}}]});
   return json([]);
 });
 try{
  await page.goto(`${web}/admin`);await page.getByRole('button',{name:/EIN.*PS Store/}).click();
  const row=page.getByTestId('assistant-order').locator('li').filter({hasText:'Legal name'});await row.waitFor();const text=await row.innerText();
  check(text.includes(series),'batch02 N3.05: office EIN answers name the series applicant',text);
  const tax=await page.getByTestId('assistant-order').locator('li').filter({hasText:'Tax classification'}).innerText();
  check(tax.includes('Confirm this series'),'batch02 office series tax treatment requires confirmation',tax);await screenshot('office-ein');
 }catch(e){check(false,'batch02 N3.05: office EIN answers name the series applicant',String(e));}
 try{
  const texts:string[]=[];for(const target of ['series','company']){portalTarget=target;await page.goto(`${web}/portal?company=co1`);await page.reload();await page.getByRole('button',{name:'Provide details securely',exact:true}).click();texts.push(await page.getByRole('dialog').innerText());await screenshot(`portal-ein-${target}`);}
  check(texts[0].includes(`We use this information to complete the IRS EIN application for ${series}.`)&&texts[1].includes(`We use this information to complete the IRS EIN application for ${name}.`),'batch02 123: EIN description names the applicant directly',texts.map(t=>t.slice(0,400)));
 }catch(e){check(false,'batch02 123: EIN description names the applicant directly',String(e));}
 try{
  for(const [id,visible,hidden] of [['co1','Alpha summons','Beta summons'],['co2','Beta summons','Alpha summons']]){await page.goto(`${web}/portal?company=${id}`);await page.getByText(visible,{exact:true}).waitFor();const text=await page.locator('main').innerText();check(text.includes(visible)&&!text.includes(hidden),`batch02 legal mail stays on ${id} tab`,text.slice(-2500));await screenshot(`mail-${id}`);}
 }catch(e){check(false,'batch02 legal mail tab display',String(e));}
 try{
  await page.goto(`${web}/admin`);await page.getByRole('tab',{name:'Clients',exact:true}).click();await page.getByRole('button',{name:'Upload',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Legal mail',exact:true}).click();
  await dialog.getByLabel('Document title',{exact:true}).fill('Company-specific summons');await dialog.getByLabel('File',{exact:true}).setInputFiles({name:'mail.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture\n%%EOF')});await dialog.locator('input[type=date]').fill('2026-09-01');
  const disabled=await dialog.getByRole('button',{name:'Upload document',exact:true}).isDisabled();await dialog.getByLabel('Company',{exact:true}).selectOption('co1');await screenshot('upload-company');await dialog.getByRole('button',{name:'Upload document',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check(disabled&&/name="orderId"\r\n\r\nco1/.test(uploadBody)&&/name="kind"\r\n\r\nlegal_mail/.test(uploadBody),'batch02 office legal-mail upload selects and sends recipient company',{disabled,uploadBody});
 }catch(e){check(false,'batch02 office legal-mail upload selects and sends recipient company',String(e));}
 await page.close();
 const observations:{kind:string;ok:boolean;entity?:unknown;individual?:unknown;error?:string;screen?:string}[]=[];
 for(const kind of ['member','manager'] as const){const p=await browser.newPage();p.setDefaultTimeout(6000);try{
   const data=structuredClone(defaultFormData);data.filingPath='NEW';data.managementStructure=kind==='member'?'MEMBER_MANAGED':'MANAGER_MANAGED';data.members=[{...data.members[0],firstName:'Old',lastName:'Human'}];data.managers=[{...data.managers[0],id:'m1',role:'MGR',personOrEntity:'INDIVIDUAL',firstName:'Old',lastName:'Human',businessEntityName:''}];
   await p.addInitScript(({data,step})=>localStorage.setItem('fl-llc-formation-draft-v1',JSON.stringify({__draft:2,data,stepIndex:step,maxStep:step,visited:Array.from({length:step+1},(_,i)=>i)})),{data,step:kind==='member'?10:11});
   await p.goto(`${web}/form-llc`);
   const select=p.getByRole('combobox',{name:kind==='member'?/^Member type/:/^Manager type/});await select.click();await p.getByRole('option',{name:'Business entity',exact:true}).click();
   await p.getByLabel(kind==='member'?/^Entity name/:/^Business entity name/).fill('New Entity');await p.waitForTimeout(350);
   const entity=await p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data);
   await select.click();await p.getByRole('option',{name:'Individual',exact:true}).click();await p.waitForTimeout(350);
   const individual=await p.evaluate(()=>JSON.parse(localStorage.getItem('fl-llc-formation-draft-v1')!).data);
   const e=kind==='member'?entity.members[0]:entity.managers[0],i=kind==='member'?individual.members[0]:individual.managers[0];observations.push({kind,ok:!e.firstName&&!e.lastName&&!(i.entityName||i.businessEntityName),entity:e,individual:i});
 }catch(e){observations.push({kind,ok:false,error:String(e),screen:await p.locator('body').innerText()});}finally{await p.close();}}
 check(observations.every(x=>x.ok),'batch02 N4.01: changing party type clears the previous name',observations);
}
if(import.meta.main){const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failures=0;try{await batch02Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failures++;});}finally{await browser.close();stack.stop();}process.exit(failures?1:0);}
