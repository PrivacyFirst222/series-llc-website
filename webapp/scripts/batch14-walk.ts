import { chromium, type Browser } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { assembleNewSeries } from '../server/new-series';
import { assembleOa } from '../server/oa';
import { renderMarkdownPdf } from '../server/pdf-render';
type Check = (ok: boolean, label: string, detail?: unknown) => void;
const src = (p: string) => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const evidence = (name: string, bytes: string | Uint8Array) => { if (process.env.SHOT_DIR) { mkdirSync(process.env.SHOT_DIR, {recursive:true}); writeFileSync(join(process.env.SHOT_DIR,name),bytes); } };
async function routes() {
 const {app}=await import('../server/app'), {getDb}=await import('../server/db'), {newToken}=await import('../server/crypto');
 const {agentFixture}=await import('../server/batch06-check'), {buildPayload}=await import('../src/components/forms/florida-llc/buildPayload');
 const proof=await (await app.request('/api/dev/env-summary')).json(); if (!proof.data.offline || Object.values(proof.data.externals).some(Boolean)) throw Error('Not isolated');
 const db=await getDb(), client=crypto.randomUUID(), co=crypto.randomUUID(), other=crypto.randomUUID(), token=newToken();
 await db.query("INSERT INTO clients(id,email,name) VALUES($1,$2,'Jane Owner')",[client,client+'@example.test']);
 await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,false,now()+interval '1 day')",[token.tokenHash,client]);
 for (const id of [co,other]) await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Jane Owner','fourteen@example.test','NEW','Fourteen LLC',$3,0,0,0,'paid',now())",[id,client,JSON.stringify(buildPayload(agentFixture({desiredLlcName:'Fourteen'})))]);
 const req=async(path:string,body?:unknown,method?:string)=>{const r=await app.request('/api'+path,{method:method??(body===undefined?'GET':'POST'),headers:{Cookie:`fpsllc_session=${token.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const prior=crypto.randomUUID(),foreign=crypto.randomUUID();
 for (const [id,order,date] of [[prior,co,'January 2, 2025'],[foreign,other,'July 9, 2026']]) await db.query("INSERT INTO oa_generations(id,client_id,order_id,template_version,amended_restated,inputs,generation_number,created_at) VALUES($1,$2,$3,'test',false,$4,1,now())",[id,client,order,JSON.stringify({version:'single-s',effectiveDate:date})]);
 const answers={firstOrAmended:'first',multiOwner:false,sElection:false,effectiveDate:'2026-09-20',authorized:true,members:[{name:'Jane Owner',address:'101 Main St, Orlando, FL 32803'}],assets:[],managers:[{name:'Edited Manager'},{name:'Management LLC',isEntity:true,signerName:'Entity Signer',signerTitle:'President'}]};
 const generate=async(a:unknown)=>{const result=await req('/portal/oa/generate?company='+co,a);let inputs:Parameters<typeof assembleOa>[0]|null=null,markdown='';if(result.body.data?.generationId){const rows=await db.query<{inputs:Parameters<typeof assembleOa>[0]}>('SELECT inputs FROM oa_generations WHERE id=$1',[result.body.data.generationId]);inputs=rows[0].inputs;markdown=assembleOa(inputs).markdown;const pdf=await app.request('/api/portal/documents/'+result.body.data.documentId+'/download',{headers:{Cookie:`fpsllc_session=${token.token}`}});evidence(`agreement-${result.body.data.generationId}.pdf`,new Uint8Array(await pdf.arrayBuffer()));await db.query('DELETE FROM oa_generations WHERE id=$1',[result.body.data.generationId]);}return {...result,inputs,markdown};};
 const save=await req('/portal/oa/answers?company='+co,answers,'PUT'), restored=await req('/portal/oa?company='+co);
 const draft=await generate(answers);
 const missing=await generate({...answers,firstOrAmended:'amended'});
 const cross=await generate({...answers,firstOrAmended:'amended',priorAgreement:foreign,priorAgreementDate:'2026-07-09'});
 const selected=await generate({...answers,firstOrAmended:'amended',priorAgreement:prior,priorAgreementDate:'2025-01-02'});
 const external=await generate({...answers,firstOrAmended:'amended',priorAgreement:'external',priorAgreementDate:'2024-04-03'});
 const unknown=await generate({...answers,firstOrAmended:'amended',priorAgreement:'unknown'});
 const invalidDate=await generate({...answers,firstOrAmended:'amended',priorAgreement:'external',priorAgreementDate:'2026-02-30'});
 const empty=await generate({...answers,managers:[]}), incomplete=await generate({...answers,managers:[{name:'Management LLC',isEntity:true}]}), duplicate=await generate({...answers,managers:[{name:'Same Person'},{name:'Same Person'}]});
 const removed=await generate({...answers,managers:answers.managers.slice(1)});
 const consent=await req('/portal/series/consent',{company:co,seriesName:'Fourteen, LLC Protected Series 4',seriesNumber:'4',purpose:'',effectiveDate:'2026-09-20'});
 let consentText='';if(consent.body.data?.documentId){const pdf=await app.request('/api/portal/documents/'+consent.body.data.documentId+'/download',{headers:{Cookie:`fpsllc_session=${token.token}`}});const bytes=new Uint8Array(await pdf.arrayBuffer());evidence('saved-managers-consent.pdf',bytes);const text=Bun.spawnSync(['pdftotext','-layout','-','-'],{stdin:bytes});if(text.exitCode)throw Error('pdftotext failed');consentText=text.stdout.toString();}
 const servicesS=await req('/portal/services?company='+co);
 await db.query("UPDATE oa_generations SET inputs=jsonb_set(inputs,'{version}','\"single\"') WHERE id=$1",[prior]);
 const servicesOrdinary=await req('/portal/services?company='+co);
 // An S agreement for the other company does not change the ordinary company's warning.
 const servicesOther=await req('/portal/services?company='+other);
 console.log('B14:'+JSON.stringify({save,restored, draft,missing,cross,selected,external,unknown,invalidDate,empty,incomplete,duplicate,removed,consent,consentText,servicesS:servicesS.body.data?.oaSElection,servicesOrdinary:servicesOrdinary.body.data?.oaSElection,servicesOther:servicesOther.body.data?.oaSElection}));
}
export async function batch14Walk(browser:Browser,web:string,check:Check) {
 const emit=(name:string,ok:boolean,detail?:unknown)=>check(ok,'batch14 '+name,detail);
 const dir=mkdtempSync(join(tmpdir(),'batch14-'));let rt:ReturnType<typeof JSON.parse>;
 try {const p=Bun.spawn(['bun',import.meta.filename,'--routes'],{env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:dir},stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);const line=out.split('\n').find(l=>l.startsWith('B14:'));if(code||!line)throw Error(`Batch14 fixture ${code}: ${err}\n${out}`);rt=JSON.parse(line.slice(4));evidence('route-results.json',JSON.stringify(rt,null,2));}finally{rmSync(dir,{recursive:true,force:true});}
 const variants=[];for(const memberManaged of [false,true])for(const multi of [false,true]){const input={companyName:'Fourteen LLC',seriesName:'Fourteen LLC Protected Series 4',seriesNumber:'4',purpose:'',effectiveDate:'September 20, 2026',memberNames:multi?['Jane Owner','Second Owner']:['Jane Owner'],managerNames:['Management LLC'],entitySigners:[{entity:'Management LLC',name:'Entity Signer',title:'President'}],memberManaged};const assembled=assembleNewSeries(input),filled=assembleNewSeries({...input,contribution:'$500 cash'});variants.push({input,assembled,filled});evidence(`consent-${memberManaged?'member':'manager'}-${multi?'multi':'single'}.md`,assembled.markdown);if(process.env.SHOT_DIR)evidence(`consent-${memberManaged?'member':'manager'}-${multi?'multi':'single'}.pdf`,await renderMarkdownPdf({markdown:assembled.markdown,title:assembled.title}));}
 emit('empty consent contribution',variants.every(v=>v.assembled.markdown.includes('By the Company: None')&&v.filled.markdown.includes('By the Company: $500 cash')));
 emit('consent signature dates',variants.every(v=>{const [consent,exhibit]=v.assembled.markdown.split('[[pagebreak]]');return (consent.match(/Date: _/g)||[]).length===v.input.memberNames.length&&!exhibit.includes('Date: _');}));
 emit('consent asset schedule',variants.every(v=>{const md=v.assembled.markdown;return (md.match(/^\| \| \| \| \|$/gm)||[]).length===5&&md.includes(`completed by the ${v.input.memberNames.length>1?'Member(s)':'Member'},`);}));
 emit('consent document title',variants.every(v=>v.assembled.title==='Consent & Series Exhibit — Fourteen LLC Protected Series 4'&&v.assembled.markdown.includes('*Consent & Series Exhibit — Fourteen LLC Protected Series 4 —')));
 emit('contribution comment',src('server/new-series.ts').includes('An empty contribution prints None')&&!src('server/new-series.ts').includes('empty contribution prints a dash'));
 emit('consent effective date citation',variants.every(v=>v.assembled.markdown.includes('takes effect (ss. 605.2201(3) and 605.0207, Florida Statutes).')));
 emit('chosen company predecessor',rt.missing.status===400&&rt.cross.status===400&&rt.selected.status===200&&rt.selected.inputs?.priorAgreementDate==='January 2, 2025'&&rt.external.inputs?.priorAgreementDate==='April 3, 2024'&&rt.unknown.status===200&&rt.unknown.inputs?.priorAgreementDate===null&&rt.unknown.markdown.includes('any and all prior operating agreements')&&rt.invalidDate.status===400,{missing:rt.missing.status,cross:rt.cross.status,selected:rt.selected.inputs?.priorAgreementDate,external:rt.external.inputs?.priorAgreementDate,unknown:rt.unknown.inputs?.priorAgreementDate,invalidDate:rt.invalidDate.status});
 const p=await browser.newPage();p.setDefaultTimeout(4000);
 let saved:Record<string,unknown>={}, rev=0, sElection=true;const gens=[{id:'11111111-1111-4111-8111-111111111111',document_id:'d1',version:'single-s',created_at:'2026-09-20T12:00:00Z',generation_number:2,effective_date_iso:'2025-01-02',template_version:'test'},{id:'22222222-2222-4222-8222-222222222222',document_id:'d2',version:'single',created_at:'2026-09-19T12:00:00Z',generation_number:1,effective_date_iso:'2024-03-04',template_version:'test'}];
 await guardedRoute(p,'**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const send=(data:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
 if(path==='/api/auth/me')return send({name:'Jane Owner',email:'fourteen@example.test'});
 if(path==='/api/portal/companies')return send([{orderId:'c14',llcName:'Fourteen LLC',formed:true,registeredAgentChoice:'SELF'}]);
 if(path==='/api/portal/oa/answers'){saved=route.request().postDataJSON();return send({ok:true,rev:++rev});}
 if(path==='/api/portal/oa')return send({seed:{llcName:'Fourteen LLC',filingPath:'CONVERT',managementStructure:'MANAGER_MANAGED',managerNames:['Original Manager'],managerEntities:[false],members:[{name:'Jane Owner',address:'101 Main St'}],series:[],principalAddress:'101 Main St'},version:'single',multiOwner:false,memberManaged:false,blocked:false,todayEastern:'2026-09-20',templateVersion:'test',answers:saved,rev,generations:gens});
 if(path==='/api/portal/documents')return send(gens.map(g=>({id:g.document_id,title:'Operating Agreement',kind:'package',created_at:g.created_at,content_type:'application/pdf',size_bytes:1024})));
 if(path==='/api/portal/services')return send({llcName:'Fourteen LLC',dev:true,oaSElection:sElection,members:[{name:'Jane Owner',address:'101 Main St'}],llcFormed:true,todayEastern:'2026-09-20',einCompanyOrdered:false,sElection:{eligible:false,reason:'already_ordered'},series:[],pricing:{seriesCents:5000,einCents:5000,sElectionCents:9500,certStatusCents:2000,certifiedCopyCents:5000},orders:[{id:'series14',type:'series',status:'in_progress',llc_name:'Fourteen LLC',details:{seriesName:'Fourteen LLC Protected Series 4'},amount_cents:5000,fulfilled_at:'2026-09-20'}]});
 return send([]);});
 try {
 await p.goto(web+'/portal/agreement?company=c14');await p.getByRole('radio',{name:/first operating agreement/}).waitFor();
 const noAuto=!(await p.locator('input[name="firstOrAmended"]:checked').count());
 const adoptionText=await p.locator('main').innerText();
 await p.getByRole('radio',{name:/amending and restating/}).check();
 const priorSelect=p.getByLabel('Which adopted agreement are you replacing?');let chosen=false;
 if(await priorSelect.count()){await priorSelect.selectOption(gens[0].id);chosen=await p.getByLabel('Prior agreement effective date').inputValue()==='2025-01-02';}
 await p.getByRole('radio',{name:/first operating agreement/}).check();
 await p.getByRole('button',{name:'Continue',exact:true}).click();
 emit('adoption choice',noAuto&&chosen&&adoptionText.includes('oral or implied')&&rt.draft.status===200&&!rt.draft.inputs?.amendedRestated,{noAuto,chosen,draft:rt.draft.status});
 let managerUi=false;const mgr=p.getByLabel('Manager 1 full legal name');
 if(await mgr.count()){
 await mgr.fill('Edited Manager');await p.getByRole('button',{name:'Add manager',exact:true}).click();await p.getByLabel('Manager 2 full legal name').fill('Management LLC');await p.getByRole('checkbox',{name:'This manager is a company or trust'}).nth(1).check();await p.getByLabel('Who signs for Management LLC',{exact:true}).fill('Entity Signer');await p.getByLabel('Title of the signer for Management LLC',{exact:true}).fill('President');
 await p.getByRole('button',{name:'Remove manager 1',exact:true}).click();
 await p.waitForTimeout(800);await p.reload();await p.getByRole('button',{name:'Continue',exact:true}).click();managerUi=await p.getByLabel('Manager 1 full legal name').inputValue()==='Management LLC'&&await p.getByLabel('Who signs for Management LLC',{exact:true}).inputValue()==='Entity Signer'&&await p.getByLabel('Title of the signer for Management LLC',{exact:true}).inputValue()==='President';
 if(process.env.SHOT_DIR)await p.screenshot({path:join(process.env.SHOT_DIR,'agreement-managers.png'),fullPage:true});}
 emit('editable agreement managers',managerUi&&rt.save.status===200&&rt.restored.body.data?.answers?.managers?.length===2&&JSON.stringify(rt.draft.inputs?.managerNames)===JSON.stringify(['Edited Manager','Management LLC'])&&rt.empty.status===400&&rt.incomplete.status===400&&rt.duplicate.status===400&&rt.removed.inputs?.managerNames?.length===1&&rt.removed.inputs?.managerEntitySigners?.[0]?.name==='Entity Signer'&&rt.consent.status===200&&rt.consentText.includes('Entity Signer')&&!rt.consentText.includes('Edited Manager'),{managerUi,inputs:rt.draft.inputs?.managerNames,empty:rt.empty.status,incomplete:rt.incomplete.status,duplicate:rt.duplicate.status,consent:rt.consent.status});
 const oaText=await p.locator('main').innerText();
 await p.goto(web+'/portal?company=c14');await p.getByRole('button',{name:'Consent & Series Exhibit',exact:true}).waitFor();
 const portalText=await p.locator('main').innerText();
 emit('generation status labels',[oaText,portalText].every(t=>t.includes('Most recently generated')&&t.includes('Earlier generated copy')&&t.includes('Generation order does not determine which agreement is legally in effect.')),{oaText,portalText});
 emit('regeneration navigation',portalText.includes('using the Update / regenerate button under Operating agreement.')&&portalText.includes('correcting an unused draft'));
 await p.getByRole('button',{name:'Consent & Series Exhibit',exact:true}).click();
 const dialog=p.getByRole('dialog'), sText=await dialog.innerText();
 emit('full series identifier',await p.locator('input[name="seriesNumber"]').inputValue()==='4'&&await p.locator('input[name="seriesName"]').inputValue()==='Fourteen LLC Protected Series 4');
 emit('prepare consent action',await p.getByRole('button',{name:'Prepare the consent',exact:true}).count()===1);
 if(process.env.SHOT_DIR){await p.waitForTimeout(400);await p.getByRole('dialog').screenshot({path:join(process.env.SHOT_DIR,'s-consent-dialog.png')});}
 sElection=false;await p.reload();await p.getByRole('button',{name:'Consent & Series Exhibit',exact:true}).click();const ordinaryText=await p.getByRole('dialog').innerText();
 emit('S agreement warning',sText.includes('Article 9 (the tax rules protecting the S election)')&&!ordinaryText.includes('Article 9')&&ordinaryText.includes('Article 8 (records)')&&rt.servicesS===true&&rt.servicesOrdinary===false&&rt.servicesOther===true,{sText,ordinaryText,s:rt.servicesS,ordinary:rt.servicesOrdinary,other:rt.servicesOther});
 await p.goto(web+'/portal/amend?company=c14');await p.waitForTimeout(200);emit('amendment browser title',await p.title()==='Amendment to Operating Agreement — MyFloridaSeriesLLC.com',await p.title());
 } catch(e){for(const label of ['adoption choice','editable agreement managers','generation status labels','regeneration navigation','full series identifier','prepare consent action','S agreement warning','amendment browser title'])emit(label,false,String(e));}finally{await p.close();}
 emit('contribution regeneration help',src('src/content/oaLearnMore.tsx').includes('When the list changes, update it here and regenerate the agreement, including its exhibits.'));
 emit('ready to sign wording',src('src/pages/portal/PortalDashboard.tsx').includes('as a PDF ready to sign.')&&!src('src/pages/portal/PortalDashboard.tsx').includes('signed-ready'));
}
if(import.meta.main){if(process.argv.includes('--routes')){await routes();process.exit(0);}const s=await startIsolatedStack({cwd:process.cwd()}),b=await chromium.launch({headless:true});await isolateBrowser(b);let failed=0;try{await batch14Walk(b,s.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failed++;});}finally{await b.close();s.stop();}process.exit(failed?1:0);}
