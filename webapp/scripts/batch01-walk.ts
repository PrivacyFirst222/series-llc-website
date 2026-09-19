/** Batch 01 probes run actual built screens with deterministic saved-draft API fixtures.
 * Real API concurrency/entity validation is also covered by server/e2e.ts. */
import { chromium, type Browser } from "playwright";
import { guardedRoute, isolateBrowser } from "./browser-isolation";
import { startIsolatedStack } from "./isolated-stack";
import { mkdirSync } from "node:fs";

type Answer = { members: { name: string; address: string; percentage?: number; isEntity?: boolean; signerName?: string; signerTitle?: string }[]; [key: string]: unknown };
type Check = (ok: boolean, label: string, detail?: unknown) => void;
const LABELS: Record<string, string> = {
  'N3.01': 'saved contributions survive reopening', 'N3.02': 'reopened edits save and conflicts are visible',
  'N3.03': 'owner removal preserves contributors and requires review', 'N3.04': 'dollar inputs preserve cents and reject invalid amounts',
  'N3.13': 'entity owners are distinct from human signers', '141': 'owner note identifies unconfirmed order suggestions',
  '166': 'equal ownership uses the portal dialog', '134': 'effective-date help explains saved dates', 'N3.06': 'saved S-election addresses are not called verified',
};
const address = '100 Ocean Drive, Miami, FL 33139';
function answers(): Answer { return { firstOrAmended: 'first', effectiveDate: '2026-09-01', authorized: true, sElection: false, multiOwner: true, borrowingThreshold: 20000, includeCapitalCalls: false, competition: 'A', includeShotgun: false, ownershipMode: 'percent',
  members: ['Alice Example', 'Bob Example', 'Carol Example'].map((name,i) => ({ name, address, percentage: i===0?34:33 })),
  couples: [], series: [{}], assets: [{ description: 'Saved equipment', value: 100.50, kind: 'other', contributedBy: { mode: 'shares', shares: [0,100,0] }, allocatedTo: 'company' }] }; }

async function fixture(browser: Browser, web: string, initial = answers()) {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  let stored = structuredClone(initial), rev = 20, reject = false;
  const posts: Answer[] = [];
  const seed = { llcName: 'Batch One Test LLC', filingPath: 'NEW', managementStructure: 'MEMBER_MANAGED', managerNames: [], principalAddress: address, members: initial.members, suggestedOwners: [], series: [{ name: 'Batch One Test LLC, PS One', purpose: '' }] };
  await guardedRoute(page, '**/api/**', async route => {
    const req=route.request(), url=new URL(req.url());
    const json=(data: unknown,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{data}:data)});
    if (url.pathname==='/api/auth/me') return json({name:'Alice Example',email:'batch01@example.test'});
    if (url.pathname==='/api/portal/oa') return json({seed,version:'member',multiOwner:initial.members.length>1,memberManaged:true,blocked:false,templateVersion:'test',answers:stored,rev,generations:[]});
    if (url.pathname==='/api/portal/oa/answers') {
      const next=req.postDataJSON() as Answer;
      const base=url.searchParams.get('baseRev'), incoming=Number(url.searchParams.get('rev'));
      if (reject || (base!==null && Number(base)!==rev)) return json({error:{message:'Your latest changes were not saved because this draft changed elsewhere. Reload the draft before continuing.',code:'DRAFT_CONFLICT'}},409);
      if (base===null && incoming<=rev) return json({ok:true,stale:true});
      stored=next;rev=incoming;posts.push(next);return json({ok:true,rev});
    }
    if (url.pathname==='/api/address/verify') return json({status:'unavailable'});
    if (url.pathname==='/api/portal/services') return json({llcName:seed.llcName,llcFormed:true,dev:false,todayEastern:'2026-09-19',companyEin:'12-3456789',members:initial.members,series:[],einCompanyOrdered:true,pricing:{seriesCents:5000,einCents:9500,sElectionCents:9500,certStatusCents:500,certifiedCopyCents:3000},sElection:{eligible:false,reason:'already_ordered',orderBy:null},orders:[{id:'s1',type:'s-election',status:'awaiting_info',llc_name:seed.llcName,amount_cents:9500,created_at:'2026-09-01',paid_at:'2026-09-01',fulfilled_at:null,details:{ein:'12-3456789',dateIncorporated:'2026-09-01',shareholders:[{name:'Alice Example',address,percentage:100,dateAcquired:'2026-09-01',ssnLast4:'6789'}]}}]});
    if (url.pathname==='/api/portal/companies') return json([{orderId:'co1',llcName:seed.llcName,formed:true,formedAt:'2026-09-01',registeredAgentChoice:'SELF'}]);
    return json([]);
  });
  await page.goto(`${web}/portal/agreement`);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Full legal name of owner 1',{exact:true}).waitFor();
  return {page,posts,get stored(){return stored;},get rev(){return rev;},conflict(){reject=true;}};
}
export async function batch01Walk(browser: Browser, web: string, check: Check) {
  async function probe(id: string, run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<{ok:boolean;detail?:unknown}>, initial?: Answer) {
    const f=await fixture(browser,web,initial);
    const label=`batch01 ${id}: ${LABELS[id]}`;
    try { const result=await run(f);check(result.ok,label,result.detail); }
    catch(e){check(false,label,{error:String(e)});}
    finally {if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await f.page.screenshot({path:`${process.env.SHOT_DIR}/batch01-${id}.png`,fullPage:true});} await f.page.close();}
  }
  await probe('N3.01',async f=>{
    const before=await f.page.getByLabel('Description of asset 1',{exact:true}).inputValue().catch(()=>null);
    await f.page.getByLabel('Full legal name of owner 1',{exact:true}).fill('Alice Updated');await f.page.waitForTimeout(900);
    const assets=f.stored.assets;
    await f.page.reload();await f.page.getByRole('button',{name:'Continue',exact:true}).click();
    const after=await f.page.getByLabel('Description of asset 1',{exact:true}).inputValue().catch(()=>null);
    await f.page.getByLabel('Full legal name of owner 1',{exact:true}).fill('Alice Quick Navigation');
    await f.page.getByRole('link',{name:'Back to portal',exact:true}).click();await f.page.waitForTimeout(900);
    const navigatedSave=f.stored.members[0].name==='Alice Quick Navigation';
    return {ok:before==='Saved equipment'&&after===before&&JSON.stringify(assets).includes('Saved equipment')&&navigatedSave,detail:{before,after,assets,navigatedSave}};
  });
  await probe('N3.02',async f=>{
    await f.page.getByLabel('Full legal name of owner 1',{exact:true}).fill('Alice Saved');await f.page.waitForTimeout(900);
    const first=f.stored.members[0].name;
    f.conflict();await f.page.getByLabel('Full legal name of owner 1',{exact:true}).fill('Alice Conflict');await f.page.waitForTimeout(900);
    const text=await f.page.locator('main').innerText();
    const disabled=await f.page.getByRole('button',{name:/^Generate .*Operating Agreement/}).isDisabled();
    return {ok:first==='Alice Saved'&&f.stored.members[0].name===first&&text.includes('draft changed elsewhere')&&disabled,detail:{first,stored:f.stored.members[0].name,disabled,conflictVisible:text.includes('draft changed elsewhere')}};
  });
  await probe('N3.03',async f=>{
    // Build the allocation on the screen if the old initializer lost it.
    // This isolates owner removal from the separate saved-assets defect.
    if(await f.page.getByLabel('Description of asset 1',{exact:true}).count()===0){
      await f.page.getByRole('button',{name:'Add asset',exact:true}).click();
      await f.page.getByText('By share',{exact:true}).click();
      await f.page.getByLabel('Share of asset 1 contributed by Bob Example',{exact:true}).fill('100');
    }
    await f.page.getByRole('button',{name:'Remove Alice Example',exact:true}).click();
    const bob=await f.page.getByLabel('Share of asset 1 contributed by Bob Example',{exact:true}).inputValue().catch(()=>null);
    const carol=await f.page.getByLabel('Share of asset 1 contributed by Carol Example',{exact:true}).inputValue().catch(()=>null);
    const confirmation=await f.page.getByRole('button',{name:'Confirm contributors for asset 1',exact:true}).isVisible().catch(()=>false);
    return {ok:bob==='100'&&carol==='0'&&confirmation,detail:{bob,carol,confirmation}};
  });
  await probe('N3.04',async f=>{
    if(await f.page.getByLabel('Description of asset 1',{exact:true}).count()===0) await f.page.getByRole('button',{name:'Add asset',exact:true}).click();
    const input=f.page.getByLabel('Agreed value of asset 1',{exact:true});
    await input.fill('100.50');await input.blur();await f.page.waitForTimeout(900);
    const shown=await input.inputValue();
    await input.fill('-100');const invalid=await input.getAttribute('aria-invalid');
    const text=await f.page.locator('main').innerText();
    const blocked=await f.page.getByRole('button',{name:/^Generate .*Operating Agreement/}).isDisabled();
    return {ok:Number(shown.replace(/,/g,''))===100.5&&invalid==='true'&&text.includes('nonnegative dollar amount')&&blocked,detail:{shown,invalid,blocked}};
  });
  const entity=answers();entity.multiOwner=false;entity.assets=[];entity.members=[{name:'Acme',address,isEntity:true,signerName:'Alice Example',signerTitle:'Manager',percentage:100}];
  await probe('N3.13',async f=>{await f.page.waitForTimeout(900);const button=f.page.getByRole('button',{name:/^Generate .*Operating Agreement/});return {ok:await button.isEnabled(),detail:await f.page.locator('main').innerText()};},entity);
  await probe('141',async f=>{const text=await f.page.locator('main').innerText();return {ok:text.includes('may include the order contact or managers')&&text.includes('Confirm the actual'),detail:text.match(/Every name[\s\S]{0,400}/)?.[0]};});
  await probe('166',async f=>{
    f.page.on('dialog',dialog=>dialog.dismiss());
    await f.page.getByRole('button',{name:'Equal ownership',exact:true}).click();
    const dialog=f.page.getByRole('alertdialog');const visible=await dialog.isVisible();
    if(!visible)return {ok:false,detail:'No portal alert dialog appeared'};
    await dialog.getByRole('button',{name:'Keep percentages',exact:true}).click();
    const cancelled=await f.page.getByLabel('Ownership percentage for Alice Example',{exact:true}).inputValue();
    await f.page.getByRole('button',{name:'Equal ownership',exact:true}).click();await dialog.getByRole('button',{name:'Use fractions',exact:true}).click();
    return {ok:cancelled==='34'&&await f.page.getByLabel('Alice Example denominator',{exact:true}).inputValue()==='3',detail:{cancelled}};
  });
  await probe('134',async f=>{const card=f.page.locator('div.rounded-2xl').filter({has:f.page.getByRole('heading',{name:'Effective date',exact:true})}).last();await card.getByRole('button',{name:'Learn More',exact:true}).click();const text=await f.page.getByRole('dialog').innerText();return {ok:text.includes('when you return, we keep your saved date'),detail:text};});
  await probe('N3.06',async f=>{
    await f.page.goto(`${web}/portal`);await f.page.getByRole('button',{name:'Provide details securely',exact:true}).click();
    const text=await f.page.getByRole('dialog').innerText();
    await f.page.evaluate(()=>{const key='fpsllc-draft:sel:s1';const draft=JSON.parse(localStorage.getItem(key)!);draft.rows[0].verified=true;localStorage.setItem(key,JSON.stringify(draft));});
    await f.page.reload();await f.page.getByRole('button',{name:'Provide details securely',exact:true}).click();
    const restored=await f.page.getByRole('dialog').innerText();
    return {ok:text.includes('Address on file')&&!text.includes('Verified address')&&restored.includes('Address on file')&&!restored.includes('Verified address'),detail:{initial:text.match(/(?:Verified address|Address on file)/g),restored:restored.match(/(?:Verified address|Address on file)/g)}};
  });
}
if(import.meta.main){
  const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser,new Set());let failures=0;
  try{await batch01Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failures++;});}
  finally{await browser.close();stack.stop();}
  process.exit(failures?1:0);
}
