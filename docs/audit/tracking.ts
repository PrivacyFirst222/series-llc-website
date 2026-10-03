/** Append-only evidence. No command here records an owner decision or changes a fix. */
import {readFileSync, writeFileSync, appendFileSync} from "node:fs";
import {join} from "node:path";
import {ROOT, HOME, loadLedger, saveLedger, ledgerRegressions, readTree, renderTrackingImplementation, resolvePackage, sha256, now, standingAcceptance, packageProblems, combinedProblems, git, gitOk, type CombinedReleaseReceipt} from "./ledger-lib";
import {renderList} from "./ledger-print";
import {checkRange} from "./release-check";
import {DROPBOX} from "./publish-docs";

async function main() {
  const [command, id, ...args] = process.argv.slice(2);
  const before = loadLedger(), after = structuredClone(before);
  if (command === "implementation") {
    const receipt = renderTrackingImplementation(id);
    after.implementations = [...(after.implementations ?? []), receipt];
  } else if (command === "retain") {
    const part = args[0] ?? "all";
    const ruling = after.rulings.filter(r => r.item === id && (!r.part || r.part === part) && (r.kind ?? "ruling") === "ruling").at(-1);
    if (!ruling) throw Error("No recorded ruling for this item/part");
    after.dispositions = [...(after.dispositions ?? []), {item:id,part,disposition:"owner-retained",ruling}];
  } else if (command === "combined") {
    const found = resolvePackage({packageId:id});
    if ("error" in found) throw Error(found.error);
    const {pkg} = found;
    const acc = standingAcceptance(pkg.commit).acc;
    if (!acc || acc.packageId !== id) throw Error("No standing acceptance names this exact package");
    const bad = [...packageProblems(found), ...combinedProblems(pkg)];
    const range = checkRange(pkg.base,pkg.commit);
    if (!range.ok) bad.push(...range.why);
    if (bad.length) throw Error(bad.join("\n"));
    if (!pkg.combined) throw Error("No combined manifest");
    if (args.length !== 2 || args[0] !== "--deployment" || !/^dpl_[a-zA-Z0-9]+$/.test(args[1])) throw Error("Expected --deployment dpl_ID");
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) throw Error("VERCEL_PROJECT_ID is required to identify the production project");
    if (!token) throw Error("VERCEL_TOKEN is required for a fresh read of deployment identity; no release recorded");
    const url = new URL(`https://api.vercel.com/v13/deployments/${args[1]}`);
    url.searchParams.set("withGitRepoInfo","true");
    if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId",process.env.VERCEL_TEAM_ID);
    const response = await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`Deployment verification failed: HTTP ${response.status}`);
    const deployment = await response.json() as {id:string;url:string;readyState:string;target:string;projectId:string;aliasAssigned:boolean;alias?:string[];gitSource?:{sha?:string};meta?:{githubCommitSha?:string;gitCommitSha?:string}};
    const commit = deployment.gitSource?.sha ?? deployment.meta?.githubCommitSha ?? deployment.meta?.gitCommitSha;
    if (deployment.projectId !== projectId || deployment.aliasAssigned !== true || !deployment.alias?.length || deployment.alias.some(a=>typeof a!=="string"||!a) || deployment.id !== args[1] || commit !== pkg.commit || deployment.readyState !== "READY" || deployment.target !== "production" || !deployment.url) throw Error("Deployment is not READY production for the accepted commit");
    const remoteMain = git(["ls-remote","origin","refs/heads/main"]).trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(remoteMain) || !gitOk(["merge-base","--is-ancestor",pkg.commit,remoteMain])) throw Error("Remote main does not contain the accepted commit (fetch its identity first if unavailable locally)");
    for (const doc of pkg.docs) if (sha256(readFileSync(join(DROPBOX,doc.path.replace(/^docs\/word\//,"")))) !== doc.sha) throw Error(`Published document mismatch: ${doc.path}`);
    const receipt:CombinedReleaseReceipt = {at:now(),commit:pkg.commit,packageId:id,packageSha:sha256(readFileSync(join(found.dir,"package.json"))),manifest:pkg.combined,remoteMain,deployment:{id:deployment.id,url:deployment.url,commit:pkg.commit,state:"READY",target:"production",projectId,aliases:deployment.alias!,observedAt:now()},documents:pkg.docs};
    appendFileSync(join(HOME,"publications.jsonl"),JSON.stringify(receipt)+"\n");
    after.combinedReleases = [...(after.combinedReleases ?? []),receipt];
  } else throw Error("usage: tracking.ts implementation <packageId> | retain <item> [part] | combined <packageId> --deployment dpl_ID");
  const errors = ledgerRegressions(before,after,{read:readTree});
  if (errors.length) throw Error(errors.join("\n"));
  saveLedger(after);
  writeFileSync(join(ROOT,"docs/audit/findings-open.md"),renderList(after));
  console.log(`tracking: recorded ${command}; original fixes and acceptance history unchanged`);
}
if (import.meta.main) main().catch(e => {console.error(`tracking: REFUSED — ${e.message}`);process.exitCode=1;});
