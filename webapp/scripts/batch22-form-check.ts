/** Batch 22: real component probes for B1-N02, B1-N03, B2-01, B2-02, B2-03.
 * --repo points the unchanged harness at the pre-fix checkout. All lookup
 * responses are controlled promises in Chromium; no external service is used.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { resolve, join } from "node:path";
import { isolateBrowser } from "./browser-isolation";

const i = process.argv.indexOf("--repo");
const repo = i < 0 ? resolve(import.meta.dir, "../..") : resolve(process.argv[i + 1]);
const web = join(repo, "webapp");
const form = "./src/components/forms/florida-llc/";
const output = await build({ absWorkingDir: web, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "import.meta.env.VITE_SMARTY_EMBEDDED_KEY": '"fixture-key"', "import.meta.env.VITE_BACKEND_URL": '""', "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "layout-chrome-only", setup(b) { b.onResolve({ filter: /^\.\/(Header|Footer)$/ }, a => a.importer.endsWith("/layout/Layout.tsx") ? { path: a.path, namespace: "fixture" } : undefined); b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: `export function ${a.path.slice(2)}(){return null;}` })); } }],
  stdin: { resolveDir: web, loader: "tsx", contents: `
import React, {useState} from "react"; import {createRoot} from "react-dom/client"; import {flushSync} from "react-dom"; import {MemoryRouter} from "react-router-dom";
import {Layout} from "./src/components/layout/Layout";
import {AddressAutocomplete} from "${form}AddressAutocomplete";
import {StepName} from "${form}sections/StepName"; import {StepSeries} from "${form}sections/StepSeries";
import {defaultFormData} from "${form}defaults"; import {validateStep} from "${form}stepValidation"; import {buildPayload} from "${form}buildPayload";
import {englishTextProblems} from "./src/lib/englishText";
window.pending=[]; window.outside=[];
window.fetch=(url,opts={})=>new Promise((resolve,reject)=>{
 const u=new URL(String(url),location.href); const kind=u.hostname==="us-autocomplete-pro.api.smarty.com"?"address":u.pathname==="/api/entity-lookup"?"entity":null;
 if(!kind){window.outside.push(String(url));reject(new Error("unexpected fixture request"));return;}
 const text=kind==="address"?u.searchParams.get("search"):JSON.parse(opts.body).name;
 window.pending.push({kind,text,signal:opts.signal,resolve:(body)=>resolve(new Response(JSON.stringify(kind==="entity"?{data:body}:body),{headers:{"Content-Type":"application/json"}})),reject});
});
let root=createRoot(document.getElementById("root"));
function Fixture({kind,delta}) {const [data,setData]=useState({...structuredClone(defaultFormData),...delta});window.patch=p=>flushSync(()=>setData(d=>({...d,...p})));window.current=data;
 if(kind==="address")return <AddressAutocomplete id="address" value={data.desiredLlcName} onChangeText={t=>setData(d=>({...d,desiredLlcName:t}))} onSelect={s=>setData(d=>({...d,desiredLlcName:s.address1}))}/>;
 if(kind==="series")return <StepSeries data={data} patch={p=>setData(d=>({...d,...p}))} errors={{}}/>;
 return <StepName data={data} patch={p=>setData(d=>({...d,...p}))} errors={{}}/>;
}
window.mount=(kind,delta={})=>{flushSync(()=>root.unmount());root=createRoot(document.getElementById("root"));window.pending=[];flushSync(()=>root.render(kind==="title"?<MemoryRouter initialEntries={[delta.path]}><Layout/></MemoryRouter>:<Fixture kind={kind} delta={delta}/>));};
window.verify=(step,delta)=>{const data={...structuredClone(defaultFormData),...delta};const before=JSON.stringify(data);const errors=validateStep(step,data);const payload=buildPayload(data);return {errors,english:englishTextProblems(payload),payload,unchanged:JSON.stringify(data)===before};};
window.ready=true;
` } });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) { return new URL(req.url).pathname === "/fixture.js" ? new Response(output.outputFiles[0].contents, { headers: { "content-type": "text/javascript" } }) : new Response('<!doctype html><div id="root"></div><script src="/fixture.js"></script>', { headers: { "content-type": "text/html" } }); } });
const browser = await chromium.launch();
const { blocked } = isolateBrowser(browser);
const page = await browser.newPage();
const results: { label: string; ok: boolean; detail: unknown }[] = [];
function check(label: string, ok: boolean, detail: unknown) { results.push({ label, ok, detail }); console.log(JSON.stringify({ label, ok, detail })); }
async function mount(kind: string, delta = {}) { await page.evaluate(({ kind, delta }) => window["mount"](kind, delta), { kind, delta }); }
async function requests(n: number) { await page.waitForFunction(n => window["pending"].length >= n, n); }
async function answer(index: number, text: string, failure = false) { await page.evaluate(({index,text,failure}) => { const p=window["pending"][index]; if(failure)p.reject(new Error("fixture error"));else p.resolve(p.kind==="address"?{suggestions:[{street_line:text,city:"Orlando",state:"FL",zipcode:"32803"}]}:{available:true,matches:[{name:text,docNumber:"L00000000001",status:"Active",filingType:"FLAL"}]}); }, {index,text,failure}); await page.waitForTimeout(30); }
try {
 await page.goto(`http://127.0.0.1:${server.port}`); await page.waitForFunction(()=>window["ready"]);
 await mount("title",{path:"/agent-checkout"}); check("B1-N02 registered-agent payment browser title",await page.title()==="Registered Agent Payment — MyFloridaSeriesLLC.com",await page.title());
 await mount("title",{path:"/missing-page"});check("B1-N02 unknown route keeps not-found title",(await page.title()).startsWith("Page Not Found"),await page.title());
 for(const [filingPath,existingLlcName,desiredLlcName,expected] of [["CONVERT","Beta, LLC","Alpha","Beta, LLC, PS 1"],["NEW","Beta, LLC","Alpha","Alpha, LLC, PS 1"],["CONVERT","","Alpha","[Your LLC Name], PS 1"]]){
  await mount("series",{filingPath,existingLlcName,desiredLlcName,llcDesignator:"LLC",series:[{id:"s1",name:"PS 1"}]});const text=await page.locator("body").innerText();check(`B2-01 series preview ${filingPath} ${existingLlcName||"empty"}`,text.includes("Full name: "+expected),text.match(/Full name:.*/)?.[0]);
 }
 await mount("address");await page.locator("#address").fill("1234");await page.locator("#address").fill("");await page.waitForTimeout(350);check("B1-N03 clear cancels queued debounce",await page.evaluate(()=>window["pending"].length)===0,await page.evaluate(()=>window["pending"].map(p=>p.text)));
 await mount("address");await page.locator("#address").fill("1234");await requests(1);await page.locator("#address").fill("");await answer(0,"1234 Old St");check("B1-N03 clear ignores late response",await page.locator("li").count()===0,await page.locator("body").innerText());
 await mount("address");await page.locator("#address").fill("1234");await requests(1);await page.locator("#address").fill("5678");await requests(2);await answer(1,"5678 New St");await answer(0,"1234 Old St");check("B1-N03 newest address survives late older result",(await page.locator("body").innerText()).includes("5678 New St")&&!(await page.locator("body").innerText()).includes("1234 Old St"),await page.locator("body").innerText());
 await page.locator("li button").click();check("B1-N03 selection closes suggestions",await page.locator("li").count()===0,{value:await page.locator("#address").inputValue()});
 await mount("address");await page.locator("#address").fill("1234");await requests(1);await page.evaluate(()=>window["patch"]({desiredLlcName:"Selected elsewhere"}));await answer(0,"1234 Old St");check("B1-N03 controlled value replacement ignores old request",await page.locator("li").count()===0,await page.locator("body").innerText());
 await mount("address");await page.locator("#address").fill("1234");await requests(1);const aborted = await page.evaluate(()=>{const p=window["pending"][0];window["mount"]("series");return p.signal?.aborted===true;});check("B1-N03 unmount aborts request",aborted,aborted);
 for(const failure of [false,true]){
  await mount("name",{filingPath:"CONVERT"});await page.locator("#existing-llc-name").fill("Old");await requests(1);await page.locator("#existing-llc-name").fill("Current");await requests(2);await answer(1,"Current LLC");await answer(0,"Old LLC",failure);const text=await page.locator("body").innerText();check(`B2-03 latest company choices survive old ${failure?"failure":"response"}`,text.includes("Current LLC")&&!text.includes("Old LLC"),text);
 }
 await mount("name",{filingPath:"CONVERT"});await page.locator("#existing-llc-name").fill("Old");await requests(1);await page.locator("#existing-llc-name").fill("Current");await requests(2);await answer(0,"Old LLC");check("B2-03 old response cannot clear latest loading state",await page.getByText("Looking up the company on Florida's records…").count()===1,await page.locator("body").innerText());await answer(1,"Current LLC");await page.getByTestId("entity-match").click();check("B2-03 selecting current result fills correct company and number",await page.locator("#existing-llc-name").inputValue()==="Current LLC"&&await page.locator("#sunbiz-doc-number").inputValue()==="L00000000001",await page.evaluate(()=>({name:window["current"].existingLlcName,number:window["current"].sunbizDocumentNumber})));
 await mount("name",{filingPath:"CONVERT"});await page.locator("#existing-llc-name").fill("Old");await requests(1);await page.locator("#existing-llc-name").fill("O");check("B2-03 short query immediately clears obsolete loading",await page.getByText("Looking up the company on Florida's records…").count()===0,await page.locator("body").innerText());await answer(0,"Old LLC");check("B2-03 short query never displays old matches",await page.getByTestId("entity-match").count()===0,await page.locator("body").innerText());
 const addr={address1:"123 Main St",city:"Orlando",state:"FL",zip:"32803",country:"United States"};
 const cases:[string,string,Record<string,unknown>,string|undefined][]=[
  ["conversion ignores abandoned new name","name",{filingPath:"CONVERT",existingLlcName:"Beta LLC",sunbizDocumentNumber:"L123",desiredLlcName:"旧公司",alternateName1:"旧备份"},undefined],
  ["new formation ignores abandoned existing company","name",{filingPath:"NEW",desiredLlcName:"Alpha",existingLlcName:"旧公司",sunbizDocumentNumber:"旧编号"},undefined],
  ["exact-only ignores disabled alternates","name",{exactNameOnly:true,alternateName1:"旧备份",alternateName2:"旧备份"},undefined],
  ["mailing-same ignores discarded mailing address","mailing",{mailingSameAsPrincipal:true,principalAddress:addr,mailingAddress:{...addr,address1:"旧地址"}},undefined],
  ["entity manager ignores hidden person","managers",{managementStructure:"MANAGER_MANAGED",managers:[{id:"m",role:"MGR",personOrEntity:"ENTITY",firstName:"旧",lastName:"旧",businessEntityName:"Manager LLC",streetAddress1:"123 Main",city:"Orlando",state:"FL",zip:"32803",country:"United States"}]},undefined],
  ["individual member ignores hidden entity","members",{managementStructure:"MEMBER_MANAGED",members:[{id:"m",memberType:"INDIVIDUAL",firstName:"Jane",lastName:"Doe",entityName:"旧公司",...addr,isInitialMember:true}]},undefined],
  ["conversion ignores Articles purpose","purpose",{filingPath:"CONVERT",businessPurposeText:"旧目的"},undefined],
  ["general purpose ignores disabled specific text","purpose",{purposeType:"GENERAL",businessPurposeText:"旧目的"},undefined],
  ["appointed signer ignores hidden self signature","certify",{articlesSignerChoice:"SERVICE",authorizedRepresentativeName:"旧名字",authorizedRepresentativeSignature:"旧名字"},undefined],
  ["retained agent ignores hidden acceptance","acceptance",{filingPath:"CONVERT",registeredAgentChoice:"SELF",registeredAgentAcceptanceName:"旧名字",registeredAgentElectronicSignature:"旧名字"},undefined],
  ["individual manager ignores hidden entity","managers",{managementStructure:"MANAGER_MANAGED",managers:[{id:"m",role:"MGR",personOrEntity:"INDIVIDUAL",firstName:"Jane",lastName:"Doe",businessEntityName:"旧公司",streetAddress1:"123 Main",city:"Orlando",state:"FL",zip:"32803",country:"United States"}]},undefined],
  ["entity member ignores hidden person","members",{managementStructure:"MEMBER_MANAGED",members:[{id:"m",memberType:"ENTITY",firstName:"旧",lastName:"旧",entityName:"Owner LLC",...addr,isInitialMember:true}]},undefined],
  ["member-managed ignores discarded managers","managers",{managementStructure:"MEMBER_MANAGED",managers:[{id:"m",personOrEntity:"ENTITY",businessEntityName:"旧公司"}]},undefined],
  ["manager-managed ignores discarded members","members",{managementStructure:"MANAGER_MANAGED",members:[{id:"m",memberType:"ENTITY",entityName:"旧公司"}]},undefined],
  ["service agent ignores abandoned personal details","agent",{registeredAgentChoice:"SERVICE",registeredAgentFirstName:"旧名字",registeredAgentStreetAddress1:"旧地址",registeredAgentAcceptanceName:"旧名字"},undefined],
  ["retained entity agent ignores hidden individual","agent",{filingPath:"CONVERT",registeredAgentChoice:"SELF",registeredAgentType:"ENTITY",registeredAgentBusinessEntityName:"Agent LLC",registeredAgentFirstName:"旧",registeredAgentLastName:"旧"},undefined],
  ["personal agent ignores hidden entity","agent",{registeredAgentChoice:"SELF",registeredAgentType:"INDIVIDUAL",registeredAgentFirstName:"Jane",registeredAgentLastName:"Doe",registeredAgentBusinessEntityName:"旧公司"},undefined],
  ["filed-date ignores discarded requested date","effective",{effectiveDateOption:"FILED_BY_DIVISION",requestedEffectiveDate:"旧日期"},undefined],
  ["obsolete correspondence fields never block","correspondence",{correspondentCompany:"旧公司",correspondentPhone:"旧电话",correspondentAddress:{...addr,address1:"旧地址"}},undefined],
  ["active agent name still rejects unsupported alphabet","agent",{registeredAgentChoice:"SELF",registeredAgentType:"INDIVIDUAL",registeredAgentFirstName:"旧",registeredAgentLastName:"Doe"},"registeredAgentFirstName"],
  ["selected existing name still rejects unsupported alphabet","name",{filingPath:"CONVERT",existingLlcName:"旧公司"},"existingLlcName"],
  ["selected new name still rejects unsupported alphabet","name",{desiredLlcName:"旧公司"},"desiredLlcName"],
  ["active alternate still rejects unsupported alphabet","name",{exactNameOnly:false,alternateName1:"旧公司"},"alternateName1"],
  ["active mailing address still rejects unsupported alphabet","mailing",{mailingSameAsPrincipal:false,mailingAddress:{...addr,address1:"旧地址"}},"mailingAddress.address1"],
  ["specific purpose still rejects unsupported alphabet","purpose",{purposeType:"SPECIFIC",businessPurposeText:"旧目的"},"businessPurposeText"],
  ["active signer still rejects unsupported alphabet","certify",{articlesSignerChoice:"SELF",authorizedRepresentativeName:"旧名字"},"authorizedRepresentativeName"],
 ];
 for(const [label,step,delta,field] of cases){const r=await page.evaluate(({step,delta})=>window["verify"](step,delta),{step,delta});const englishErrors=Object.entries(r.errors).filter(([,v])=>String(v).includes("Please use English letters"));check("B2-02 "+label,field?englishErrors.some(([k])=>k===field)&&Object.keys(r.english).length>0:englishErrors.length===0&&Object.keys(r.english).length===0,{errors:r.errors,submittedEnglishErrors:r.english});check("B2-02 source answers preserved: "+label,r.unchanged,r.unchanged);}
 const consent = await page.evaluate(()=>window["verify"]("agent",{registeredAgentChoice:"SERVICE",raRenewalCardConsent:false}));
 check("B2-02 service choice cannot invent renewal permission",!!consent.errors.raRenewalCardConsent&&consent.payload.registeredAgent.renewalCardConsent===false&&consent.payload.registeredAgent.acceptance.accepted===false&&consent.payload.registeredAgent.acceptance.signatureAuthorizationConfirmed===false&&consent.payload.acknowledgments.registeredAgentNotSameAsLlc===false,consent.errors);
 const retained = await page.evaluate(()=>window["verify"]("purpose",{purposeType:"SPECIFIC",businessPurposeText:"Investment holdings",filingPath:"NEW",desiredLlcName:"Alpha",llcDesignator:"LLC",existingLlcName:"Beta LLC",sunbizDocumentNumber:"L123",mailingSameAsPrincipal:false,mailingAddress:{address1:"42 Oak St",city:"Orlando",state:"FL",zip:"32803",country:"United States"}}));
 check("B2-02 selected English answers reach payload unchanged",retained.payload.purpose.businessPurposeText==="Investment holdings"&&retained.payload.llcName.finalName==="Alpha, LLC"&&retained.payload.mailingAddress.address1==="42 Oak St"&&retained.payload.existingLlcName===""&&retained.payload.sunbizDocumentNumber==="",retained.payload);
 check("All component probes stayed offline",blocked.size===0&&await page.evaluate(()=>window["outside"].length)===0,{blocked:[...blocked],unexpected:await page.evaluate(()=>window["outside"])});
} finally { await browser.close();server.stop(true); }
const passed=results.filter(r=>r.ok).length;console.log(`Batch 22 form: ${passed}/${results.length} probes passed`);if(passed!==results.length)process.exitCode=1;
