/** A frozen audit run. Writes reports only; never starts a server or changes product files. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, lstatSync, appendFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { ROOT, git, gitBytes, type Ledger } from "./ledger-lib";
import { buckets, type InventoryFile } from "./inventory";
import { CHECKS, hash, lineCount, safeId, safePath, validateAudit, type Manifest, type AuditData, type FileEntry, type Report } from "./audit-session-lib";
export const readJson = <T>(path:string):T => JSON.parse(readFileSync(path,"utf8"));
export function artifact(dir:string, path:string):Buffer|null {
  if(!safePath(path)) return null;
  try {let p=dir;for(const part of path.split("/")){p=join(p,part);if(lstatSync(p).isSymbolicLink())return null;}return lstatSync(p).isFile()?readFileSync(p):null;}catch{return null;}
}
export function loadRun(dir:string):AuditData {
  const manifest=readJson<Manifest>(join(dir,"manifest.json"));
  const reports=readdirSync(dir).filter(n=>/^bucket-\d+\.json$/.test(n)).sort().map(n=>readJson<Report>(join(dir,n)));
  const receiptsDir=join(dir,"receipts");
  const receipts=existsSync(receiptsDir)?readdirSync(receiptsDir).filter(n=>n.endsWith(".jsonl")).flatMap(n=>readFileSync(join(receiptsDir,n),"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l))):[];
  return {manifest,reports,receipts,evidence:readJson(join(dir,"evidence.json")),checks:readJson(join(dir,"checks.json"))};
}
export function checkRun(dir:string) {
  const data=loadRun(dir);
  const expected=manifestFor(data.manifest.run,data.manifest.commit,data.manifest.requestedBuckets,data.manifest.createdAt);
  if(JSON.stringify(data.manifest)!==JSON.stringify(expected))throw Error("manifest differs from the exact candidate inventory, ledger, rulings or required obligations");
  const validation=validateAudit(data,p=>gitBytes(`${data.manifest.commit}:${p}`)?.toString("utf8")??null,p=>artifact(dir,p));
  return {data,validation};
}
const save=(path:string,value:unknown)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+"\n",{flag:"wx"});};
export function manifestFor(run:string,commit:string,n:number,createdAt=new Date().toISOString()):Manifest {
  if(!safeId(run)||!Number.isInteger(n)||n<1||n>32)throw Error("invalid run id or bucket count");
  commit=git(["rev-parse","--verify",`${commit}^{commit}`]).trim();
  const tracked=git(["ls-tree","-r","--name-only",commit]).split("\n").filter(Boolean);
  const texts=new Map<string,string>();
  const source=(p:string)=>{let t=texts.get(p);if(t===undefined){t=gitBytes(`${commit}:${p}`)!.toString("utf8");texts.set(p,t);}return t;};
  const area=(p:string):InventoryFile["area"]=>/^webapp\/src\/pages\/admin\//.test(p)?"office":/^webapp\/src\/(pages\/portal\/|content\/oaLearnMore)/.test(p)?"client portal":/^webapp\/src\/(components\/forms\/|pages\/(FormLLC|OrderConfirmed)\.tsx$)/.test(p)?"order form and payment":p.startsWith("webapp/src/")?"public pages":/^webapp\/server\/(templates-|(?:oa|oa-amendment|oa-capital|new-series|statement|s-election|order-summary|manual-pdf|pdf-render|filing)\.ts$)/.test(p)?"documents and masters":p.startsWith("webapp/")?"server and emails":"guidance";
  const candidates=tracked.filter(p=>/^(webapp\/(src|server)\/|docs\/)/.test(p)&&/\.(tsx?|md|json)$/.test(p)&&!/(^|\/)(node_modules|dist|\.dev-data|runs|source|word)\//.test(p)&&!p.startsWith("docs/audit/")&&!(p.startsWith("docs/")&&!p.endsWith(".md"))&&!(p.startsWith("webapp/src/")&&p.endsWith(".json"))).concat(["webapp/vercel.json"]);
  const exclusions=[[/^webapp\/src\/components\/ui\//,"stock UI widgets"],[/\.test\.tsx?$/,"test file"],[/^webapp\/server\/e2e\.ts$/,"check suite"],[/^docs\/(coverage-605|event-map|event-map-text-review|oa-map|dependency-audit|db-restore)\.md$/,"gate output or operations note"]] as const;
  const excluded:{path:string;reason:string}[]=[];
  const input:InventoryFile[]=[];
  for(const path of candidates){const ex=exclusions.find(([rx])=>rx.test(path));if(ex)excluded.push({path,reason:ex[1]});else input.push({path,lines:lineCount(source(path)),area:area(path)});}
  const order=["public pages","order form and payment","client portal","office","server and emails","documents and masters","guidance"];
  input.sort((a,b)=>order.indexOf(a.area)-order.indexOf(b.area)||a.path.localeCompare(b.path));
  const requestedBuckets=n;const primary=buckets(input,n);n=primary.length;
  const files:FileEntry[]=primary.flatMap((fs,i)=>fs.map(f=>({...f,sha:hash(source(f.path)),bucket:i+1,scope:"product" as const})));
  const supplemental=tracked.filter(p=>!files.some(f=>f.path===p)&&(
    /^webapp\/(index\.html|package\.json|src\/.*\.css|scripts\/.*\.ts|server\/.*\.test\.ts)$/.test(p)||
    /^webapp\/server\/e2e\.ts$/.test(p)||/^docs\/audit\/[^/]+\.ts$/.test(p)||/^docs\/audit\/batches\/[^/]+\/batch\.md$/.test(p)||/^\.githooks\//.test(p)||/^\.github\/workflows\//.test(p)||/^docs\/(format-check|docs-consistency|provision-map|coverage-605|event-map|structure|drafting-lint|md-to-docx)\.py$/.test(p)));
  const loads=Array.from({length:n},(_,i)=>files.filter(f=>f.bucket===i+1).reduce((s,f)=>s+f.lines,0));
  for(const path of supplemental){const text=source(path);const bucket=loads.indexOf(Math.min(...loads))+1;const lines=lineCount(text);loads[bucket-1]+=lines;files.push({path,lines,sha:hash(text),bucket,area:"supplemental controls and rendering",scope:"supplement"});}
  const ledger=JSON.parse(gitBytes(`${commit}:docs/audit/ledger.json`)!.toString("utf8")) as Ledger;
  const priors=ledger.items.flatMap((item,index)=>{
    const hits=files.filter(f=>item.text.includes(f.path)||item.codex?.evidence.includes(f.path));
    const bucket=hits[0]?.bucket??index%n+1;
    return item.parts.map(p=>({id:item.id,part:p.key,bucket,item}));
  });
  const obligations:Manifest["obligations"]=[];
  const statutes=new Set<string>();
  for(const f of files.filter(f=>f.scope==="product")) for(const m of source(f.path).matchAll(/\b(?:605|621|201)\.\d{2,5}\b/g))statutes.add(m[0]);
  for(const s of [...statutes].sort())obligations.push({id:`statute-${s}`,kind:"source",scope:`Open the applicable statute text on Online Sunshine; identify edition/effective date and inspect every claim using ${s}. Record unavailable text as not verified.`,targets:files.filter(f=>source(f.path).includes(s)).map(f=>f.path)});
  const masters=files.filter(f=>/^webapp\/server\/templates-oa-(single|multi|s|member|member-s|single-s|member-single|member-single-s)\.md$/.test(f.path));
  for(let i=0;i<masters.length;i++)for(let j=i+1;j<masters.length;j++)obligations.push({id:`masters-${i+1}-${j+1}`,kind:"comparison",scope:"Compare row by row; explain intentional management, ownership and tax differences and trace section references.",targets:[masters[i].path,masters[j].path]});
  for(const [i,m]of masters.entries())for(const [key,path]of [["consent","webapp/server/templates-new-series.md"],["manual","docs/owners-manual.md"],["instructions","docs/oa-instructions.md"]])obligations.push({id:`${key}-${i+1}`,kind:"comparison",scope:`Compare ${key} with this agreement, including exhibits and every descriptive claim.`,targets:[path,m.path]});
  for(const p of tracked.filter(p=>/^docs\/word\/.*\.docx$/.test(p)))obligations.push({id:`word-${hash(p).slice(0,12)}`,kind:"render",scope:"Render and inspect every page; record page count, text and layout defects, and master/output agreement.",targets:[p]});
  for(const [i,m]of masters.entries())for(const type of ["ordinary","professional"])obligations.push({id:`pdf-${i+1}-${type}`,kind:"render",scope:`Generate and inspect all pages of this ${type} client PDF with populated owners, assets and series.`,targets:[m.path]});
  for(const [id,path] of [["amendment","webapp/server/oa-amendment.ts"],["series-consent","webapp/server/new-series.ts"],["statement","webapp/server/statement.ts"],["s-election-package","webapp/server/s-election.ts"],["owners-manual","webapp/server/manual-pdf.ts"]])obligations.push({id:`pdf-${id}`,kind:"render",scope:"Generate a populated client deliverable; inspect every page, values, labels, references and layout against its master and actual workflow.",targets:[path]});
  for(const id of ["new-order","conversion","company-switching","oa-save-reopen-generate","asset-owner-removal","ein-formed-company","s-election-and-document-deletion","office-upload-and-notify","payment-failure-and-retry","renewal-cancel-and-replacement","backup-complete-and-restore","email-failure-and-retry","amendment-consent-statement"] )obligations.push({id:`workflow-${id}`,kind:"runtime",scope:`Exercise ${id}, including failure and retry paths; compare expected behavior with Adam's decisions and the delivered result. Use an owned offline stack with a throwaway database.`,targets:[]});
  const manifest:Manifest={schema:1,run,commit,createdAt,files,excluded:excluded.filter(e=>!files.some(f=>f.path===e.path)),priors,ledger,ledgerSha:hash(JSON.stringify(ledger)),rulingsText:gitBytes(`${commit}:docs/audit/rulings.md`)!.toString("utf8"),buckets:n,requestedBuckets,obligations};
  return manifest;
}
export function initRun(dir:string,run:string,commit:string,n:number):Manifest {
  if(existsSync(dir))throw Error("run directory exists; runs are never overwritten");
  const manifest=manifestFor(run,commit,n);commit=manifest.commit;n=manifest.buckets;const {files,priors}=manifest;
  mkdirSync(dir,{recursive:true});save(join(dir,"manifest.json"),manifest);mkdirSync(join(dir,"evidence"));mkdirSync(join(dir,"receipts"));
  save(join(dir,"evidence.json"),[]);save(join(dir,"checks.json"),[...CHECKS.map(id=>({id,status:"not verified",evidence:[],detail:""})),...manifest.obligations.map(o=>({id:o.id,status:"not verified",evidence:[],detail:""}))]);
  const prompt=readFileSync(join(ROOT,"docs/audit/audit-reader.md"),"utf8");
  for(let i=1;i<=n;i++){
    save(join(dir,`assignment-${i}.json`),{commit,files:files.filter(f=>f.bucket===i),priorFindings:priors.filter(p=>p.bucket===i),rulings:manifest.rulingsText});
    writeFileSync(join(dir,`reader-${i}.md`),`${prompt}\n\nRun: ${dir}\nBucket: ${i}\nAssignment: assignment-${i}.json\nReport: bucket-${i}.json\nCandidate: ${commit}\n`,{flag:"wx"});
  }
  return manifest;
}
export function renderAudit(d:AuditData,v:ReturnType<typeof validateAudit>):string {
  const m=d.manifest;
  const out=[`${v.files} of ${m.files.length} files, ${v.lines} of ${m.files.reduce((s,f)=>s+f.lines,0)} lines reported read; ${v.priors} of ${m.priors.length} prior parts reconciled.`,"",`# Audit ${m.run} — ${v.problems.length?"INCOMPLETE":"coverage and evidence checks passed"}`,`Commit: ${m.commit}`,"", "Reading receipts prove source delivery, not understanding. This report is not owner acceptance or publication authorization.","",...v.problems.map(p=>`- INCOMPLETE: ${p}`),"","## Every prior part"];
  const reported=d.reports.flatMap(r=>r.priorFindings);
  for(const p of m.priors){const r=reported.find(x=>x.id===p.id&&x.part===p.part);out.push(`- ${p.id}:${p.part} — ${r?.status??"NOT REVIEWED"}: ${r?.evidence??""}${r?.ruling?` Owner decision: ${r.ruling}`:""}`);}
  out.push("","## Findings");
  for(const r of d.reports)for(const f of r.findings)out.push("",`### ${f.key} — ${f.severity} (${f.relation})`,...(["where","file","line","reads","claims","truth","replacement"] as const).map(k=>`**${k}:** ${f[k]}`),`Recheck: ${f.review?.reviewer}: ${f.review?.evidence}; replacement: ${f.review?.replacement}`);
  out.push("","## File coverage");for(const f of m.files){const r=d.reports.flatMap(r=>r.files).find(x=>x.path===f.path);out.push(`- ${f.path}: ${r?.lines??0}/${f.lines}; ${!r?"NOT REVIEWED":r.noFindings?"no finding reported":"findings listed above"}`);}
  out.push("","## Required evidence");for(const c of d.checks)out.push(`- ${c.id}: ${c.status}; ${c.detail}; evidence ${c.evidence.join(", ")}`);
  return out.join("\n")+"\n";
}
if(import.meta.main){
 try {
  const [cmd,path,...args]=process.argv.slice(2);if(!path)throw Error("usage: init <new-dir> <run-id> [commit] [buckets] | read <dir> <reader-id> <file> <from> <to> | check <dir> | report <dir>");const dir=resolve(path);
  if(cmd==="init"){const m=initRun(dir,args[0],args[1]??"HEAD",Number(args[2]??7));console.log(`Audit initialized, NOT READ: ${m.files.filter(f=>f.scope==="product").length} product files plus ${m.files.filter(f=>f.scope==="supplement").length} supplementary files; ${m.priors.length} prior parts; ${CHECKS.length+m.obligations.length} evidence obligations.`);}
  else if(cmd==="read"){
    const [reader,file,fromArg,toArg]=args;const m=readJson<Manifest>(join(dir,"manifest.json"));const f=m.files.find(f=>f.path===file);const from=Number(fromArg),to=Number(toArg);
    if(!safeId(reader)||!f||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||(f.lines===0?from!==0||to!==0:from<1||to<from||to>f.lines)||to-from>299)throw Error("invalid read: use an assigned file and at most 300 exact lines");
    const text=gitBytes(`${m.commit}:${file}`)?.toString("utf8");if(text===undefined||hash(text)!==f.sha)throw Error("source hash mismatch");const chunk=f.lines?text.split("\n").slice(from-1,to).join("\n"):"";
    console.log(`${file} ${from}-${to}/${f.lines} at ${m.commit}\n`+chunk.split("\n").map((s,i)=>`${from+i}: ${s}`).join("\n"));
    appendFileSync(join(dir,"receipts",`${reader}.jsonl`),JSON.stringify({file,sha:f.sha,from,to,reader,chunkSha:hash(chunk)})+"\n");
  } else if(cmd==="check"||cmd==="report"){
    const {data,validation:v}=checkRun(dir);console.log(`${v.files}/${data.manifest.files.length} files, ${v.lines}/${data.manifest.files.reduce((s,f)=>s+f.lines,0)} lines; ${v.priors}/${data.manifest.priors.length} prior parts`);
    if(cmd==="report")writeFileSync(join(dir,"REPORT.md"),renderAudit(data,v));
    if(v.problems.length){for(const p of v.problems)console.error(p);process.exitCode=1;}else console.log("coverage check passed; required evidence and prior reconciliation passed");
  }else throw Error("unknown audit command");
 }catch(e){console.error(`audit: REFUSED — ${e instanceof Error?e.message:String(e)}`);process.exitCode=1;}
}
