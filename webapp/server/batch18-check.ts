import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Hono } from "hono";
import { assembleOa, type OaInputs } from "./oa";
import { assembleNewSeries } from "./new-series";
import { assertTemplateComplete, encodeDocumentText, decodeDocumentText } from "./document-text";
import { englishBusinessInput } from "./english-input";
import { englishTextError, englishTextProblems } from "../src/lib/englishText";
import { parseMarkdown, renderMarkdownPdf } from "./pdf-render";
import { agentFixture, summaryFor } from "./batch06-check";
import { validateStep } from "../src/components/forms/florida-llc/stepValidation";

type Check = (label: string, ok: boolean, detail?: unknown) => void;
export async function batch18Checks(check: Check, baseUrl?: string) {
  const rejects = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
  const fixture: OaInputs = {
    version: "multi", companyName: "[ACME] | Holdings LLC", principalAddress: "101 Main St, Suite 7", managerNames: ["Jane [TITLE] Smith"],
    effectiveDate: "September 20, 2026", amendedRestated: false, priorAgreementDate: null, borrowingThreshold: 50000,
    members: [{name:"Jane | [TITLE] Smith",address:"101 Main St\nSuite 7",percentage:100,contribution:"Equipment | tools\nSecond line",todBeneficiary:"[ACME] Trust"}],
    series: [{name:"[ACME] | Holdings LLC - PS 1",purpose:"Property | rental",contribution:"Equipment | tools\nSecond line",specialTerms:"Keep [ACME] | tools\nIn room 2"}],
    assets: [{description:"Pump | valve\nSecond line",value:"$500",by:"Jane | [TITLE] Smith",to:"Company"}],
  };
  const forms: OaInputs["version"][] = ["single","single-s","member-single","member-single-s","multi","s","member","member-s"];
  let complete = true, cells = true;
  const detail: unknown[] = [];
  const dir = mkdtempSync(join(tmpdir(), "batch18-documents-"));
  try {
    for (const version of forms) {
      const result = assembleOa({...fixture,version});
      const tables = parseMarkdown(result.markdown, result.encodedClientText).filter(b=>b.kind==="table");
      const uniform = tables.every(t=>t.rows.every(row=>row.length===t.rows[0].length));
      const pdf = await renderMarkdownPdf({...result,watermark:null});
      const file = join(dir,`${version}.pdf`);writeFileSync(file,pdf);
      const text = execFileSync("pdftotext",["-layout",file,"-"],{encoding:"utf8"});
      const preserves = text.includes("Jane | [TITLE] Smith") && text.includes("Pump | valve") && text.includes("Second line") && !text.includes("&#");
      complete &&= !result.markdown.includes("<!--") && result.title.endsWith(fixture.companyName);
      cells &&= uniform && preserves;detail.push({version,uniform,preserves});
    }
    const result = assembleNewSeries({companyName:fixture.companyName,seriesName:fixture.series[0].name,seriesNumber:"1",purpose:"Rental",contribution:"Equipment | tools\nSecond line",specialTerms:"[ACME] | property",effectiveDate:fixture.effectiveDate,memberNames:["Jane [TITLE] Smith"],managerNames:fixture.managerNames,memberManaged:false});
    const tables = parseMarkdown(result.markdown, result.encodedClientText).filter(b=>b.kind==="table");
    cells &&= tables.every(t=>t.rows.every(row=>row.length===t.rows[0].length));
    const file=join(dir,"consent.pdf");writeFileSync(file,await renderMarkdownPdf({...result,watermark:null}));
    const text=execFileSync("pdftotext",["-layout",file,"-"],{encoding:"utf8"});
    cells &&= text.includes("Equipment | tools") && text.includes("Second line") && text.includes("[ACME] | property");
    complete &&= result.markdown.includes("ASSET SCHEDULE") && result.title.endsWith(fixture.series[0].name);
  } catch(e) { complete=false;cells=false;detail.push(String(e)); }
  finally { rmSync(dir,{recursive:true,force:true}); }
  complete &&= ["[UNKNOWN FIELD]","<!-- if:unknown -->", "[DATE]", "v1 draft"].every(x=>rejects(()=>assertTemplateComplete(x)));
  complete &&= !rejects(()=>assertTemplateComplete(encodeDocumentText("[ACME] [TITLE] <!-- v1 draft Form document —")));
  complete &&= decodeDocumentText(encodeDocumentText("literal &#124; | [TITLE]")) === "literal &#124; | [TITLE]";
  const plain = parseMarkdown("Literal &#124; and &#10; must stay as typed");
  complete &&= plain[0]?.kind === "para" && plain[0].segs.map(s=>s.text).join("") === "Literal &#124; and &#10; must stay as typed";
  check("batch18 263: unresolved template fields fail without mistaking client text",complete,detail);
  check("batch18 N2.21: client pipes and line breaks remain inside their document cells",cells,detail);

  const data = agentFixture();
  data.managers[0].streetAddress2 = "Suite 512";
  data.includeMembersInArticles=true;
  data.members=[{id:"owner18",isInitialMember:true,memberType:"INDIVIDUAL",firstName:"Jane",lastName:"Smith",address1:"101 Main St",address2:"Apartment 813",city:"Orlando",state:"FL",zip:"32803",country:"United States"}];
  const summary = summaryFor(data);
  check("batch18 N2.19: manager and member suites survive the office summary",summary.includes("Suite 512") && summaryFor({...data,managementStructure:"MEMBER_MANAGED"}).includes("Apartment 813"),summary);

  let writes=0;
  const app=new Hono().use("*",englishBusinessInput).post("/business",async c=>{writes++;return c.json(await c.req.json());}).post("/upload",async c=>{writes++;const f=await c.req.formData();return c.text(String(f.get("name")));});
  let blocked=true;
  for(const name of ["José","李","Иван","😀","Nu\u0000ll"]){
    const res=await app.request("/business",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:{name}})});
    blocked &&= res.status===400 && (await res.text()).includes("English letters");
  }
  const form=new FormData();form.set("name","José");form.set("file",new File(["sample"],"sample.pdf"));
  blocked &&= (await app.request("/upload",{method:"POST",body:form})).status===400 && writes===0;
  const positive={name:"O'Brien & Smith | [ACME]",password:"密碼é😀"};
  const good=await app.request("/business",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(positive)});
  blocked &&= good.status===200 && JSON.stringify(await good.json())===JSON.stringify(positive) && writes===1;
  blocked &&= !!validateStep("client",{...agentFixture(),clientFirstName:"José"}).clientFirstName;
  blocked &&= englishTextError("Jane O'Brien-Smith 123")===null && Object.keys(englishTextProblems({password:"é"})).length===0;
  if(baseUrl){
    const res=await fetch(`${baseUrl}/api/portal/oa/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyName:"李"})});
    blocked &&= res.status===400 && (await res.text()).includes("English letters");
  }
  check("batch18 N2.20: English input is enforced before business writes",blocked,{writes});
}
if(import.meta.main){let failures=0;await batch18Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail:ok?undefined:detail}));if(!ok)failures++;});process.exit(failures?1:0);}
