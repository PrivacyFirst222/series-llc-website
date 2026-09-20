/** Import verified new findings. It never closes prior items or approves repairs. */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkRun } from "./audit-session";
import { hash } from "./audit-session-lib";
import { intakeItems, fingerprint, type Intake } from "./audit-import-lib";
import { ROOT, loadLedger, saveLedger, ledgerRegressions, readTree, type Ledger } from "./ledger-lib";
import { renderList } from "./ledger-print";
export function prepareIntake(dir:string,ledger:Ledger) {
  const {data,validation}=checkRun(dir);
  if(validation.problems.length)throw Error(`audit incomplete: ${validation.problems.join("; ")}`);
  const {manifest:m}=data;
  if((ledger.auditImports??[]).some(r=>r.path===`docs/audit/intakes/${m.run}.json`))throw Error("this audit run was already imported");
  const findings=data.reports.flatMap(r=>r.findings).filter(f=>f.relation==="new");
  if(!findings.length)throw Error("no new findings to import; reconciliation stays in the audit report");
  const previous=(ledger.auditImports??[]).flatMap(r=>(JSON.parse(readFileSync(join(ROOT,r.path),"utf8")) as Intake).findings);
  if(findings.some(f=>previous.some(p=>fingerprint(p)===fingerprint(f))))throw Error("an exact defect was already imported; classify it against the prior item");
  const receipt:Intake={schema:1,run:m.run,commit:m.commit,completedAt:new Date().toISOString(),manifestSha:hash(JSON.stringify(m)),auditSha:hash(JSON.stringify(data)),findings};
  const path=`docs/audit/intakes/${m.run}.json`,text=JSON.stringify(receipt,null,2)+"\n";
  if(existsSync(join(ROOT,path)))throw Error("intake path already exists; retained sources are never overwritten");
  const after=structuredClone(ledger);after.auditImports=[...(after.auditImports??[]),{path,sha:hash(text)}];after.items.push(...intakeItems(receipt,path));
  const errors=ledgerRegressions(ledger,after,{read:p=>p===path?text:readTree(p)});
  if(errors.length)throw Error(errors.join("; "));
  return {after,path,text,count:findings.length,receipt};
}
if(import.meta.main){
 try{
  const [dir,flag]=process.argv.slice(2);if(!dir||![undefined,"--apply"].includes(flag))throw Error("usage: audit-import.ts <completed-run-dir> [--apply]; default is a preview");
  const before=loadLedger(),plan=prepareIntake(resolve(dir),before);
  console.log(`${plan.count} verified new finding(s), imported as OPEN; no repair is approved. Existing ${before.items.length} records remain identical.`);
  if(flag==="--apply"){
    if(JSON.stringify(loadLedger())!==JSON.stringify(before))throw Error("ledger changed during validation; retry against the current record");
    mkdirSync(join(ROOT,"docs/audit/intakes"),{recursive:true});writeFileSync(join(ROOT,plan.path),plan.text,{flag:"wx"});
    // All validation happens before writes. Retained intake is written first;
    // on interruption an orphan source is safe and requires explicit recovery.
    saveLedger(plan.after);writeFileSync(join(ROOT,"docs/audit/findings-open.md"),renderList(plan.after));
    console.log(`intake recorded at ${plan.path}; review the diff and commit through the normal guard`);
  }else console.log(`Preview only. Run the same command with --apply to record the findings.`);
 }catch(e){console.error(`intake: REFUSED — ${e instanceof Error?e.message:String(e)}`);process.exitCode=1;}
}
