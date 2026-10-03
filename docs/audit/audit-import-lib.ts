/** Checked additions only. Existing findings, decisions and fixes remain immutable. */
import { hash, safeId, sha, type Finding } from "./audit-session-lib";
import type { Item, Ledger, AuditAdjudication } from "./ledger-lib";
export interface Intake { schema: 1; run: string; commit: string; completedAt: string; manifestSha: string; auditSha: string; findings: Finding[]; adjudications?: AuditAdjudication[] }
export interface ImportRef { path: string; sha: string }
export const fingerprint = (f: Finding) => hash(JSON.stringify([f.file, f.reads, f.claims]));
export function intakeItems(r: Intake, path: string): Item[] {
  return r.findings.map(f => {
    const id = `AUD-${r.run}-${f.key}`;
    const area = /pages\/admin|routes-admin/.test(f.file) ? "Office" : /pages\/portal|routes-portal/.test(f.file) ? "Client portal" : /components\/forms|routes-payments/.test(f.file) ? "Order form and payment" : /^webapp\/src/.test(f.file) ? "Public pages, Terms and Privacy" : /server\/(email|renewals|backup)/.test(f.file) ? "Emails and jobs" : "Agreements and guidance";
    return {id,tag:f.severity,area,housekeeping:f.severity==="housekeeping",source:`${path} finding ${f.key}`,text:`${f.where} — \`${f.file}:${f.line}\`\nReads: ${f.reads}\nClaims: ${f.claims}\nTrue: ${f.truth}\nProposed replacement (not approved): ${f.replacement}\nRechecked by ${f.review.reviewer}: ${f.review.evidence}`,verdict:"open",waitsOn:f.review.replacement==="needs owner ruling"?[`ruling:${id}`]:[],parts:[{key:"all",scope:"The verified audit finding; proposed repair still requires the owner workflow.",status:"open",waitsOn:[],history:[{at:r.completedAt,event:"recorded from verified audit",note:`${r.run} at ${r.commit}; audit ${r.auditSha}`}]}]};
  });
}
export function importProblems(before: Ledger, after: Ledger, read: (path: string)=>string|null, strict: boolean): {problems:string[]; allowed:Set<string>} {
  const problems:string[]=[],allowed=new Set<string>();
  if(JSON.stringify((after.auditAdjudications??[]).slice(0,(before.auditAdjudications??[]).length))!==JSON.stringify(before.auditAdjudications??[])) problems.push("audit adjudications were rewritten");
  const expectedAdjudications:AuditAdjudication[]=[];
  const old=before.auditImports??[], refs=after.auditImports??[];
  if(JSON.stringify(refs.slice(0,old.length))!==JSON.stringify(old)) problems.push("audit import history was rewritten");
  if(strict && refs.length>old.length) problems.push("new audit intake needs review; never a records-only publication");
  const seenPaths=new Set<string>(),seenRuns=new Set<string>(),seenDefects=new Set<string>(),seenIds=new Set<string>(), findingKeys=new Set<string>();
  for(const ref of refs) {
    if(!/^docs\/audit\/intakes\/[A-Za-z0-9_-]+\.json$/.test(ref.path) || !sha(ref.sha) || seenPaths.has(ref.path)) {problems.push("invalid/duplicate audit import reference");continue;} seenPaths.add(ref.path);
    const text=read(ref.path);if(!text || hash(text)!==ref.sha){problems.push(`audit intake missing/changed: ${ref.path}`);continue;}
    let r:Intake;try{r=JSON.parse(text);}catch{problems.push(`invalid audit intake JSON: ${ref.path}`);continue;}
    if(r.schema!==1 || !safeId(r.run) || seenRuns.has(r.run) || !/^[a-f0-9]{40}$/.test(r.commit) || !sha(r.manifestSha) || !sha(r.auditSha) || !Number.isFinite(Date.parse(r.completedAt)) || !Array.isArray(r.findings) || !r.findings.length) {problems.push(`invalid/duplicate audit intake: ${ref.path}`);continue;} seenRuns.add(r.run);
    for(const a of r.adjudications??[]) {
      if(!safeId(a.sourceId)||a.verdict!=="disputed"||a.replacementVerdict!=="unsafe as a blanket cleanup"||a.codeRemovalApproved!==false||!a.reason?.trim()||!a.source?.trim()||expectedAdjudications.some(x=>x.sourceId===a.sourceId))problems.push(`invalid/duplicate informational adjudication in ${ref.path}`);
      expectedAdjudications.push(a);
    }
    let valid=true;
    for(const f of r.findings){
      findingKeys.add(f.key);
      if(!safeId(f.key)||f.relation!=="new"||!["where","file","reads","claims","truth","replacement"].every(k=>typeof (f as unknown as Record<string,unknown>)[k]==="string" && String((f as unknown as Record<string,unknown>)[k]).trim()) || !Number.isSafeInteger(f.line)||f.line<1||!["substantive","wording","housekeeping"].includes(f.severity)||!f.review?.priorCompared||!f.review.reviewer?.trim()||!f.review.evidence?.trim()||!["correct","needs owner ruling"].includes(f.review.replacement)) {problems.push(`invalid verified finding in ${ref.path}`);valid=false;continue;}
      const fp=fingerprint(f);if(seenDefects.has(fp)){problems.push(`duplicate imported defect ${f.key}`);valid=false;}seenDefects.add(fp);
    }
    if(!valid)continue;
    for(const item of intakeItems(r,ref.path)){
      if(seenIds.has(item.id)){problems.push(`duplicate imported id ${item.id}`);continue;}seenIds.add(item.id);
      const a=after.items.find(i=>i.id===item.id);if(!a){problems.push(`imported record missing: ${item.id}`);continue;}
      if(before.items.some(i=>i.id===item.id)) {
        const identity=(i:Item)=>Object.fromEntries(Object.entries(i).filter(([k])=>!["parts","retiredParts","related"].includes(k)));
        if(JSON.stringify(identity(a))!==JSON.stringify(identity(item))) problems.push(`imported identity differs from source: ${item.id}`);
        else allowed.add(item.id);
        continue; // Existing part migrations and fix transitions are checked by ledgerRegressions.
      }
      const fields=(i:Item)=>({...i,parts:i.parts.map(p=>({key:p.key,scope:p.scope,waitsOn:p.waitsOn,canonical:p.canonical}))});
      if(JSON.stringify(fields(a))!==JSON.stringify(fields(item)) || JSON.stringify(a.parts[0]?.history[0])!==JSON.stringify(item.parts[0].history[0])) {problems.push(`imported record differs from source: ${item.id}`);continue;}
      if(!old.some(x=>x.path===ref.path) && before.items.some(i=>i.id===item.id)) {problems.push(`intake id already existed: ${item.id}`);continue;}
      allowed.add(item.id);
    }
  }
  for(const a of expectedAdjudications)if(findingKeys.has(a.sourceId))problems.push(`adjudicated source cannot also be imported as an open repair: ${a.sourceId}`);
  if(JSON.stringify(after.auditAdjudications??[])!==JSON.stringify(expectedAdjudications))problems.push("audit adjudications differ from checked intakes");
  return {problems,allowed};
}
