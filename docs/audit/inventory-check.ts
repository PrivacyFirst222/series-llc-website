/** B2-04: actual inventory commands include customized widgets; old receipts stay exact.
 * Fixture commits bypass hooks only in a temporary repository, never the repair checkout.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT } from "./ledger-lib";
import { buildInventory } from "./inventory";
import { manifestFor } from "./audit-session";
import { hash } from "./audit-session-lib";
const rows: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean) => { rows.push({name,ok}); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const inv = buildInventory();
for (const name of ["input", "textarea"]) check(`B2-04 working inventory includes customized ${name}`, inv.files.some(f=>f.path===`webapp/src/components/ui/${name}.tsx`));
const old = manifestFor("history-fixture", "4a344e22e0d0239481f3182d6528bf84d960ed0d", 7, "2026-09-20T00:00:00Z");
check("historical manifest unchanged byte for byte", hash(JSON.stringify(old)) === "ce6efbf6a7f4fd37409cbe77b4fe74c6e35b8eb1c13829281fe24bf2ba8064fe");
const temp=mkdtempSync(join(tmpdir(),"inventory-check-"));
const env={...process.env,FPSLLC_BATCH:"",GIT_AUTHOR_NAME:"inventory fixture",GIT_AUTHOR_EMAIL:"fixture@example.invalid",GIT_COMMITTER_NAME:"inventory fixture",GIT_COMMITTER_EMAIL:"fixture@example.invalid"};
const run=(...args:string[])=>execFileSync(args[0],args.slice(1),{cwd:temp,env,encoding:"utf8",stdio:["ignore","pipe","pipe"],maxBuffer:64*1024*1024}).trim();
try {
  mkdirSync(join(temp,"docs/audit"),{recursive:true});mkdirSync(join(temp,"webapp/src/components/ui"),{recursive:true});mkdirSync(join(temp,"webapp/server"),{recursive:true});
  for(const f of ["inventory.ts","audit-session.ts","audit-session-lib.ts","ledger-lib.ts","evidence.ts","audit-import-lib.ts"])
    copyFileSync(join(ROOT,"docs/audit",f),join(temp,"docs/audit",f));
  writeFileSync(join(temp,"docs/audit/future-control.py"),"# Mandatory audit control fixture\n");
  const policy={version:2,uiWidgets:"include-all"};
  writeFileSync(join(temp,"docs/audit/inventory-policy.json"),JSON.stringify(policy));
  writeFileSync(join(temp,"docs/audit/ledger.json"),JSON.stringify({version:2,items:[],batches:[],rulings:[],builtFrom:[]}));
  writeFileSync(join(temp,"docs/audit/rulings.md"),"# Fixture\n");writeFileSync(join(temp,"webapp/vercel.json"),"{}\n");
  for(const name of ["input","textarea","future-custom-widget"])writeFileSync(join(temp,`webapp/src/components/ui/${name}.tsx`),`export const message = "English alphabet required: ${name}";\n`);
  run("git","init","-q");run("git","add",".");run("git","-c","core.hooksPath=/dev/null","commit","-qm","synthetic inventory fixture");
  const manifest=JSON.parse(run("bun","-e",'import {manifestFor} from "./docs/audit/audit-session"; console.log(JSON.stringify(manifestFor("fixture","HEAD",1)));'));
  const disk=JSON.parse(run("bun","-e",'import {buildInventory} from "./docs/audit/inventory";console.log(JSON.stringify(buildInventory()));'));
  for(const name of ["input","textarea","future-custom-widget"]){const p=`webapp/src/components/ui/${name}.tsx`;
    check(`future frozen manifest includes ${name}`,manifest.files.some((f:{path:string})=>f.path===p));
    check(`future disk inventory includes ${name}`,disk.files.some((f:{path:string})=>f.path===p));
    check(`widget ${name} is never mislabeled stock`,!manifest.excluded.some((f:{path:string})=>f.path===p)&&!disk.excluded.some((f:{path:string})=>f.path===p));
  }
  check("future audit reads the inventory policy",manifest.files.some((f:{path:string})=>f.path==="docs/audit/inventory-policy.json"));
  check("future audit reads Python control tests",manifest.files.some((f:{path:string})=>f.path==="docs/audit/future-control.py"));
  const refused = (name:string, message:string) => {
    run("git","add","-A");run("git","-c","core.hooksPath=/dev/null","commit","-qm",name);
    const r=spawnSync("bun",["-e",'import {manifestFor} from "./docs/audit/audit-session";manifestFor("fixture","HEAD",1);'],{cwd:temp,env,encoding:"utf8"});
    check(name,r.status!==0&&r.stderr.includes(message));
  };
  writeFileSync(join(temp,"docs/audit/inventory-policy.json"),JSON.stringify({version:2,uiWidgets:"exclude-all"}));
  refused("invalid policy cannot hide widgets","unsupported inventory policy");
  rmSync(join(temp,"docs/audit/inventory-policy.json"));
  refused("missing future policy cannot reactivate legacy exclusion","missing its required inventory policy");

} finally {rmSync(temp,{recursive:true,force:true});}
console.log(`${rows.filter(r=>r.ok).length}/${rows.length} inventory checks passed`);
if(rows.some(r=>!r.ok))process.exitCode=1;
