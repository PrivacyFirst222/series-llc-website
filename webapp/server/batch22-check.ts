/** Batch 22: real portal routes, disposable database/storage, mocked mail transport only. */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

type Check = (label: string, ok: boolean, detail?: unknown) => void;
export async function batch22Checks(check: Check) {
  const dir = mkdtempSync(join(tmpdir(), "batch22-"));
  try {
    const child = Bun.spawn(["bun", import.meta.filename, "--child"], { cwd: process.cwd(), env: { ...process.env, E2E_OFFLINE: "1", VERCEL: "", DEV_PG_DIR: join(dir, "pg"), DEV_STORAGE_DIR: join(dir, "files"), BATCH22_DIR: dir }, stdout: "pipe", stderr: "pipe" });
    const [out, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const rows = out.split("\n").filter(s => s.startsWith("BATCH22:")).map(s => JSON.parse(s.slice(8)));
    if (process.env.BATCH22_EVIDENCE_DIR) { mkdirSync(process.env.BATCH22_EVIDENCE_DIR, {recursive:true}); writeFileSync(join(process.env.BATCH22_EVIDENCE_DIR,"fixture-stderr.log"),stderr); }
    for (const row of rows) check(row.label, row.ok, row.detail);
    if (exit || rows.length !== 33) throw new Error(`Batch 22 fixture failed (${exit}, ${rows.length} rows)\n${stderr}\n${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function child() {
  const { app } = await import("./app"), { getDb } = await import("./db"), { env } = await import("./env");
  const { newToken, hashPassword } = await import("./crypto");
  const { oaAnswersSchema } = await import("./routes-portal");
  const { contributorUnits } = await import("../src/lib/oaContributors");
  const report: Check = (label, ok, detail) => console.log("BATCH22:" + JSON.stringify({ label: `batch22 ${label}`, ok, detail }));
  const proof = await (await app.request("/api/dev/env-summary")).json();
  if (!proof.data.offline || Object.values(proof.data.externals).some(Boolean)) throw new Error("Offline environment not proved");
  let mailMode = "ok", releaseMail: (() => void) | undefined, sawMail: (() => void) | undefined;
  const mails: {to: string[]; subject: string; html: string}[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "https://api.resend.com/emails") throw new Error(`Unexpected network destination: ${input}`);
    const mail = JSON.parse(String(init?.body)); mails.push(mail);
    if (mail.subject === "Confirm your new email address") {
      sawMail?.();
      if (mailMode === "hold") await new Promise<void>(resolve => { releaseMail = resolve; });
      if (mailMode === "confirm-fail") return new Response("fixture refusal", { status: 503 });
      if (mailMode === "unconfirmed") return Response.json({});
    }
    if (mail.subject === "A change to your portal email was requested" && mailMode === "notice-fail") return new Response("fixture refusal", {status:503});
    return Response.json({id:"fixture-accepted"});
  }) as typeof fetch;
  env.RESEND_API_KEY = "fixture-only-no-network";
  const db = await getDb(), client = crypto.randomUUID(), other = crypto.randomUUID(), password = "Batch22Password!";
  await db.query("INSERT INTO clients(id,email,name,password_hash) VALUES($1,'batch22@example.test','Batch Client',$3),($2,'other22@example.test','Other Client',$3)", [client, other, await hashPassword(password)]);
  const token = newToken(); await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[token.tokenHash,client]);
  const req = (path: string, method = "GET", body?: unknown) => app.request("/api" + path, {method,headers:{Cookie:`fpsllc_session=${token.token}`,"Content-Type":"application/json"},body:body === undefined ? undefined : JSON.stringify(body)});
  const company = crypto.randomUUID(), latest = crypto.randomUUID(), foreign = crypto.randomUUID(), unpaid = crypto.randomUUID();
  const payload = (name: string, structure = "MEMBER_MANAGED") => ({filingPath:"NEW",llcName:{finalName:name},principalOfficeAddress:{address1:"100 Main Street",city:"Miami",state:"FL",zip:"33101"},management:{structure,managersOrAuthorizedRepresentatives:[{role:"MGR",firstName:"Managing",lastName:"Person"}]},members:{memberList:[{firstName:"First",lastName:"Owner",address1:"100 Main Street",city:"Miami",state:"FL",zip:"33101"}]},series:[],registeredAgent:{choice:"SERVICE"}});
  for (const [id,owner,name,paid] of [[company,client,"Selected Company LLC",true],[latest,client,"Latest Company LLC",true],[foreign,other,"Foreign Company LLC",true],[unpaid,client,"Unpaid Company LLC",false]] as const) {
    await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Batch Client','batch22@example.test','NEW',$3,$4,0,0,0,'formed',CASE WHEN $5 THEN now() ELSE NULL END,now())",[id,owner,name,JSON.stringify(payload(name)),paid]);
  }
  await db.query("UPDATE orders SET paid_at=now()+interval '1 minute' WHERE id=$1",[latest]);
  const owners = Array.from({length:100},(_,i)=>({id:crypto.randomUUID(),name:`Owner ${String(i+1).padStart(3,"0")} Person`,address:`${i+1} Main Street, Miami FL 33101`,percentage:1}));
  const answers = {firstOrAmended:"first",effectiveDate:"2026-09-20",authorized:true,multiOwner:true,ownershipMode:"percent",members:owners,series:[],includeCapitalCalls:false,competition:"B",includeShotgun:false,borrowingThreshold:50000,assets:[{description:"Initial cash",kind:"cash",value:10000,contributedBy:{mode:"shares",shares:owners.map(()=>1),unitIds:owners.map(o=>o.id)},cashAllocations:[]} ]};
  const validOne = {...answers,members:[{...owners[0],percentage:100}],multiOwner:false,assets:[]};
  // Every explicit company entry point: compare persisted business state before/after.
  const paths = [
    ["GET","/portal/oa",undefined],["PUT","/portal/oa/answers",validOne],["POST","/portal/oa/generate",validOne],
    ["POST","/portal/series/consent",{seriesName:"Latest Company LLC - PS 1",seriesNumber:"1",effectiveDate:"2026-09-20"}],
    ["POST","/portal/oa/amend",{agreementDate:"2026-09-20",effectiveDate:"2026-09-20",mode:"typed",text:"Fixture amendment"}],
    ["GET","/portal/services",undefined],["POST","/portal/services/s-election",{}],["POST","/portal/services/series",{suffix:"PS 9"}],
    ["POST","/portal/services/certificate",{kind:"certificate-of-status"}],["POST","/portal/services/ein",{target:"company"}],
    ["POST","/portal/registered-agent/cancel",{}],
  ] as const;
  const state = async () => JSON.stringify(await Promise.all(["clients","orders","service_orders","documents","oa_generations","oa_profiles"].map(table=>db.query(`SELECT * FROM ${table} ORDER BY 1`))));
  for (const [method,path,body] of paths) {
    let ok = true; const details: unknown[] = [];
    for (const id of [crypto.randomUUID(),foreign,unpaid,"","bad-id"," "]) {
      const before = await state();
      const bodyCompany = path === "/portal/series/consent" || path === "/portal/registered-agent/cancel";
      const response = await req(bodyCompany ? path : `${path}?company=${encodeURIComponent(id)}`,method,bodyCompany ? {...body,company:id} : body);
      const data = await response.json(), unchanged = before === await state();
      const refused = response.status === 400 && data.error?.code === "COMPANY_NOT_FOUND";
      ok &&= refused && unchanged; details.push({id:id===foreign?"foreign":id===unpaid?"unpaid":id,status:response.status,code:data.error?.code,unchanged});
    }
    report(`B6-01 ${method} ${path} rejects all six invalid company selections before writes`,ok,details);
  }
  for (const path of ["/portal/series/consent","/portal/registered-agent/cancel"]) {
    let ok=true;
    for(const company of [null,123,{}]){const before=await state();const r=await req(path,"POST",{company,seriesName:"Latest Company LLC - PS 1",seriesNumber:"1",effectiveDate:"2026-09-20"});ok&&=r.status===400&&before===await state();}
    report(`B6-01 ${path} rejects explicitly null or wrong-type company`,ok);
  }
  const own = await (await req(`/portal/oa?company=${company}`)).json(), defaulted = await (await req("/portal/oa")).json();
  report("B6-01 owned company and omitted default remain distinct",own.data?.seed.orderId===company&&defaulted.data?.seed.orderId===latest);
  const saved = await req(`/portal/oa/answers?company=${company}`,"PUT",answers);
  const reload = await (await req(`/portal/oa?company=${company}`)).json();
  report("B3-05 100 owners and 100 contribution shares save and reload exactly",saved.status===200&&isDeepStrictEqual(reload.data?.answers,oaAnswersSchema.safeParse(answers).success?oaAnswersSchema.parse(answers):answers),{status:saved.status,members:reload.data?.answers.members?.length});
  for (const field of ["members","shares","unitIds"]) {
    const tooMany = structuredClone(answers);
    if(field==="members")tooMany.members.push({...owners[0],id:crypto.randomUUID()});
    if(field==="shares")tooMany.assets[0].contributedBy.shares.push(0);
    if(field==="unitIds")tooMany.assets[0].contributedBy.unitIds.push(crypto.randomUUID());
    const before=await state(),r=await req(`/portal/oa/answers?company=${company}`,"PUT",tooMany);
    report(`B3-05 101 ${field} refused without overwriting saved draft`,r.status===400&&before===await state(),{status:r.status});
  }
  for (const [structure,sElection,version] of [["MEMBER_MANAGED",false,"member"],["MEMBER_MANAGED",true,"member-s"],["MANAGER_MANAGED",false,"multi"],["MANAGER_MANAGED",true,"s"]] as const) {
    await db.query("UPDATE orders SET payload=$1 WHERE id=$2",[JSON.stringify(payload("Selected Company LLC",structure)),company]);
    const r = await req(`/portal/oa/generate?company=${company}`,"POST",{...answers,sElection}),data=await r.json();let printed=false,contributions=false;
    if(r.status===200){const pdf=await req(`/portal/documents/${data.data.documentId}/download`),file=join(process.env.BATCH22_DIR!,version+".pdf");writeFileSync(file,new Uint8Array(await pdf.arrayBuffer()));const text=execFileSync("pdftotext",["-layout",file,"-"],{encoding:"utf8"});printed=owners.every(o=>text.includes(o.name));if(process.env.BATCH22_EVIDENCE_DIR){mkdirSync(process.env.BATCH22_EVIDENCE_DIR,{recursive:true});copyFileSync(file,join(process.env.BATCH22_EVIDENCE_DIR,version+".pdf"));writeFileSync(join(process.env.BATCH22_EVIDENCE_DIR,version+".txt"),text);}const rows=await db.query<{inputs:{members:{contribution:string}[]}}>("SELECT inputs FROM oa_generations WHERE id=$1",[data.data.generationId]);contributions=rows[0].inputs.members.length===100&&rows[0].inputs.members.every(m=>m.contribution==="$100");}
    report(`B3-05 ${version} actual generated PDF retains all 100 owners and contributions`,r.status===200&&data.data?.version===version&&printed&&contributions,{status:r.status,printed,contributions,error:data.error});
  }
  const couples=Array.from({length:50},(_,i)=>({a:i*2,b:i*2+1,form:"TBE",percentage:2}));
  const paired={...answers,couples,assets:[{...answers.assets[0],contributedBy:{mode:"shares",shares:couples.map(()=>2),unitIds:contributorUnits(owners,couples).map(u=>u.id)}}]};
  const pairedSave=await req(`/portal/oa/answers?company=${company}`,"PUT",paired),pairedGen=await req(`/portal/oa/generate?company=${company}`,"POST",paired),pairData=await pairedGen.json();
  const pairRows=pairData.data?.generationId?await db.query<{inputs:{members:{signatories:string[];contribution:string}[]}}>("SELECT inputs FROM oa_generations WHERE id=$1",[pairData.data.generationId]):[];
  report("B3-05 100 owners in 50 couples save and generate every ownership unit",pairedSave.status===200&&pairedGen.status===200&&pairRows[0]?.inputs.members.length===50&&pairRows[0]?.inputs.members.every(m=>m.signatories.length===2&&m.contribution==="$200"),{save:pairedSave.status,generate:pairedGen.status,error:pairData.error});
  // Mail response must reflect provider acceptance, with no live HTTP allowed.
  const email = (address:string) => req("/portal/account/email","POST",{newEmail:address,currentPassword:password});
  const account = async()=> (await db.query<{email:string;pending_email:string|null}>("SELECT email,pending_email FROM clients WHERE id=$1",[client]))[0];
  mailMode="ok";await email("pending22@example.test");
  const pendingBefore=await account(),tokensBefore=await db.query("SELECT * FROM auth_tokens WHERE client_id=$1 ORDER BY token_hash",[client]);
  mailMode="confirm-fail";const failed=await email("failed22@example.test"),failure=await failed.json();
  report("B3-03 confirmation refusal returns truthful retry and preserves earlier pending request",failed.status===503&&failure.error?.message==="We could not send the confirmation link. Please try again."&&JSON.stringify(await account())===JSON.stringify(pendingBefore)&&JSON.stringify(await db.query("SELECT * FROM auth_tokens WHERE client_id=$1 ORDER BY token_hash",[client]))===JSON.stringify(tokensBefore),{status:failed.status,response:failure,account:await account()});
  mailMode="unconfirmed";const noId=await email("no-id22@example.test");report("B3-03 provider response without acceptance identifier is refused",noId.status===503,{status:noId.status});
  mailMode="hold";let finished=false;const started=new Promise<void>(resolve=>{sawMail=resolve;});const held=Promise.resolve(email("held22@example.test")).then(r=>{finished=true;return r;});await started;await new Promise(resolve=>setTimeout(resolve,30));report("B3-03 response waits for provider acceptance",!finished);releaseMail!();await held;sawMail=undefined;
  mailMode="notice-fail";const warned=await email("warning22@example.test"),warning=await warned.json();report("B3-03 old-address notice failure is separate from sent confirmation",warned.status===200&&warning.data?.oldAddressNoticeSent===false&&(await account()).email==="batch22@example.test",{status:warned.status,response:warning});
  mailMode="ok";const retried=await email("warning22@example.test"),retry=await retried.json();report("B3-03 retry confirms both sends without changing sign-in",retried.status===200&&retry.data?.oldAddressNoticeSent===true&&(await account()).email==="batch22@example.test",{status:retried.status,response:retry});
  for(const sameAddress of [false,true]) {
    await db.query("DELETE FROM rate_limits WHERE key=$1",[`acct:${client}`]);
    mailMode="hold";const firstStarted=new Promise<void>(resolve=>{sawMail=resolve;});
    const older=email(sameAddress?"warning22@example.test":"older22@example.test");await firstStarted;
    const releaseOlder=releaseMail!;sawMail=undefined;mailMode="ok";
    const newer=await email("warning22@example.test");const newestMail=mails.filter(m=>m.subject==="Confirm your new email address").at(-1)!;
    releaseOlder();const stale=await older;
    const newestToken=newestMail.html.match(/verify-email\?token=([^"&]+)/)![1];
    const {hashToken}=await import("./crypto");const [stored]=await db.query<{used_at:unknown}>("SELECT used_at FROM auth_tokens WHERE token_hash=$1",[hashToken(newestToken)]);
    report(`B3-03 older in-flight ${sameAddress?"same-address":"different-address"} request cannot replace newer successful request`,newer.status===200&&stale.status===409&&(await account()).pending_email==="warning22@example.test"&&stored?.used_at===null,{newer:newer.status,older:stale.status,latestTokenActive:stored?.used_at===null});
  }
  mailMode="hold";
  const simultaneousFirstStarted=new Promise<void>(resolve=>{sawMail=resolve;});const simultaneousFirst=email("warning22@example.test");await simultaneousFirstStarted;const releaseFirst=releaseMail!;
  const simultaneousSecondStarted=new Promise<void>(resolve=>{sawMail=resolve;});const simultaneousSecond=email("warning22@example.test");await simultaneousSecondStarted;const releaseSecond=releaseMail!;
  sawMail=undefined;mailMode="ok";releaseFirst();releaseSecond();
  const simultaneous=await Promise.all([simultaneousFirst,simultaneousSecond]);
  report("B3-03 overlapping same-address activation admits only one change",simultaneous.filter(r=>r.status===200).length===1&&simultaneous.filter(r=>r.status===409).length===1,{statuses:simultaneous.map(r=>r.status)});
  await email("warning22@example.test");
  const confirmation=mails.filter(m=>m.subject==="Confirm your new email address").at(-1)!;const tokenValue=confirmation.html.match(/verify-email\?token=([^"&]+)/)![1];
  const verified=await req("/auth/verify-email","POST",{token:tokenValue});report("B3-03 only confirmed link changes sign-in",verified.status===200&&(await account()).email==="warning22@example.test",{status:verified.status});
  mailMode="hold";const startedReset=new Promise<void>(resolve=>{sawMail=resolve;});const resetPending=email("cancelled22@example.test");await startedReset;
  await req("/portal/account/password","POST",{currentPassword:password,newPassword:"ChangedBatch22Password!"});releaseMail!();const cancelled=await resetPending;
  report("B3-03 password change during send cannot resurrect pending email",cancelled.status===409&&(await account()).pending_email===null,{status:cancelled.status,account:await account()});
}
if (import.meta.main) {
  if(process.argv.includes("--child")){await child();process.exit(0);}
  let failed=0;await batch22Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)failed++;});process.exit(failed?1:0);
}
