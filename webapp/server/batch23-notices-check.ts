/** B5-RENEWAL-OLD-EMAIL: real jobs/routes and account changes in disposable storage.
 * --repo allows the same harness to target the unchanged pre-fix checkout.
 * Mail transport is captured in-process; every other network destination fails.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
type Check = (label: string, ok: boolean, detail?: unknown) => void;
const repoIndex = process.argv.indexOf("--repo");
const repo = repoIndex < 0 ? resolve(import.meta.dir,"../..") : resolve(process.argv[repoIndex+1]);
export async function batch23NoticesChecks(check: Check) {
 const dir=mkdtempSync(join(tmpdir(),"batch23-notices-"));
 try {
  const child=Bun.spawn([process.execPath,import.meta.filename,"--child","--repo",repo],{env:{...process.env,E2E_OFFLINE:"1",VERCEL:"",DEV_PG_DIR:join(dir,"pg"),DEV_STORAGE_DIR:join(dir,"files")},stdout:"pipe",stderr:"pipe"});
  const [out,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  if(process.env.BATCH23_NOTICES_EVIDENCE_DIR){mkdirSync(process.env.BATCH23_NOTICES_EVIDENCE_DIR,{recursive:true});writeFileSync(join(process.env.BATCH23_NOTICES_EVIDENCE_DIR,"fixture-stderr.log"),stderr);}
  const rows=out.split("\n").filter(s=>s.startsWith("BATCH23-NOTICES:")).map(s=>JSON.parse(s.slice(16)));
  for(const r of rows)check(r.label,r.ok,r.detail);
  if(exit||rows.length!==23)throw new Error(`Notice fixture failed (${exit}, ${rows.length} rows)\n${stderr}\n${out}`);
 } finally {rmSync(dir,{recursive:true,force:true});}
}
async function child() {
 const from=(name:string)=>import(pathToFileURL(join(repo,"webapp/server",name+".ts")).href);
 const {app}=await from("app"),{getDb}=await from("db"),{env}=await from("env"),{newToken,hashPassword}=await from("crypto"),{runRenewals,fulfillPaidRenewal,addDays}=await from("renewals"),{testHooks}=await from("shared");
 const {PDFDocument}=await import("@cantoo/pdf-lib");
 const proof=await(await app.request("/api/dev/env-summary")).json();
 if(!proof.data.offline||Object.values(proof.data.externals).some(Boolean))throw new Error("Offline proof missing");
 const report:Check=(label,ok,detail)=>console.log("BATCH23-NOTICES:"+JSON.stringify({label:`batch23 ${label}`,ok,detail}));
 const mails:{to:string[];subject:string;html:string;attachments?:{filename:string;content:string}[]}[]=[],outside:string[]=[];
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)!=="https://api.resend.com/emails"){outside.push(String(input));throw new Error("Unexpected network request");}mails.push(JSON.parse(String(init?.body)));return Response.json({id:"fixture-accepted"});}) as typeof fetch;
 env.RESEND_API_KEY="fixture-no-network";
 const db=await getDb(),password="NoticesFixture23!",admin=newToken();
 await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
 const req=(token:string,path:string,body:unknown)=>app.request("/api"+path,{method:"POST",headers:{Cookie:`${token===admin.token?"fpsllc_admin":"fpsllc_session"}=${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
 const today="2026-09-20",due="2026-11-19";
 const orderIds:string[]=[];
 async function makeOrder(client:string|null,old:string,kind:string,date=due) {
  const id=crypto.randomUUID();orderIds.push(id);
  const charge=["decline","receipt","resignation-receipt"].includes(kind),cancel=kind.startsWith("resignation");
  await db.query(`INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at,ra_appointment_date,ra_renewal_date,ra_cancellation_requested_at,card_status,square_customer_id,square_card_id,card_last4,ra_resignation_submitted)
  VALUES($1,$2,'Notice Client',$3,'NEW',$4,$5,49900,12500,62400,'formed',now(),now(),'2025-11-19',$6,$7,$8,$9,$10,'4242',$11)`,[id,client,old,`Notice ${kind} LLC`,JSON.stringify({registeredAgent:{choice:"SERVICE",renewalCardConsent:true}}),date,cancel?addDays(date,-31)+"T12:00:00Z":null,charge?"on_file":"none",charge?"dev-customer":null,charge?"dev-card":null,kind==="resignation-copy"?today:null]);
  let renewal:string|undefined;
  if(charge){renewal=crypto.randomUUID();await db.query("INSERT INTO ra_renewals(id,order_id,renewal_date,amount_cents,status,purpose,charge_due,notice_sent_at) VALUES($1,$2,$3,9900,'notice_sent',$4,$5,$6)",[renewal,id,date,cancel?"resignation":"renewal",cancel?date:addDays(date,-15),addDays(date,-60)+"T12:00:00Z"]);}
  return {id,renewal};
 }
 const oneMail=(mark:number,subject:string,email:string)=>{const found=mails.slice(mark).filter(m=>m.subject.includes(subject));return {ok:found.length===1&&found[0].to.length===1&&found[0].to[0]===email,found:found.map(m=>({to:m.to,subject:m.subject,attachmentBytes:m.attachments?.map(a=>Buffer.from(a.content,"base64").length)}))};};
 async function silence(id:string){await db.query("UPDATE orders SET ra_ended_date=$2 WHERE id=$1",[id,today]);}
 const pdf=await PDFDocument.create();pdf.addPage([300,300]);const bytes=await pdf.save();
 for(const mode of ["portal-confirmed","office-override"]){
  const id=crypto.randomUUID(),old=`${mode}-old@example.test`,current=`${mode}-current@example.test`,token=newToken();
  await db.query("INSERT INTO clients(id,email,name,password_hash) VALUES($1,$2,'Notice Client',$3)",[id,old,await hashPassword(password)]);
  await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[token.tokenHash,id]);
  const historical=await makeOrder(id,old,"pre-change-history");await silence(historical.id);
  const noticeKinds=["notice","resignation-due","decline","receipt","resignation-receipt","resignation-copy"];
  const prepared=new Map<string,Awaited<ReturnType<typeof makeOrder>>>();
  for(const kind of noticeKinds){const order=await makeOrder(id,old,kind,kind.startsWith("resignation")?today:due);prepared.set(kind,order);await silence(order.id);}
  if(mode==="portal-confirmed"){
   const response=await req(token.token,"/portal/account/email",{newEmail:current,currentPassword:password});
   const confirmation=mails.filter(m=>m.subject==="Confirm your new email address"&&m.to[0]===current).at(-1);if(!confirmation)throw new Error("Confirmation mail missing");
   const before=await makeOrder(id,old,"pending-change");const mark=mails.length;await runRenewals(today);const observed=oneMail(mark,"registered agent",old);
   report("pending account change still sends renewal to confirmed old address",response.status===200&&observed.ok,observed);await silence(before.id);
   const verification=confirmation.html.match(/verify-email\?token=([^"&]+)/)![1];const confirmed=await req(token.token,"/auth/verify-email",{token:verification});
   const [account]=await db.query("SELECT email,pending_email FROM clients WHERE id=$1",[id]);report("real client confirmation changes account email",confirmed.status===200&&account.email===current&&account.pending_email===null,{status:confirmed.status,account});
  }else{
   const changed=await req(admin.token,`/admin/clients/${id}/email`,{newEmail:current});const [account]=await db.query("SELECT email FROM clients WHERE id=$1",[id]);report("real office override changes account email",changed.status===200&&account.email===current,{status:changed.status,account});
  }
  for(const kind of noticeKinds){
   const order=prepared.get(kind)!;await db.query("UPDATE orders SET ra_ended_date=NULL WHERE id=$1",[order.id]);const mark=mails.length;let routeStatus:number|undefined;
   if(kind==="resignation-copy"){
    const data=new FormData();data.append("file",new File([Uint8Array.from(bytes).buffer],"resignation.pdf",{type:"application/pdf"}));const r=await app.request(`/api/admin/orders/${order.id}/agent-copy`,{method:"POST",headers:{Cookie:`fpsllc_admin=${admin.token}`},body:data});routeStatus=r.status;
   }else{if(kind==="decline")testHooks.declineNextRenewal="CARD_DECLINED";await runRenewals(kind==="decline"||kind==="receipt"?addDays(due,-15):today);}
   const expected={notice:"registered agent", "resignation-due":"resignation due", decline:"declined",receipt:"renewed", "resignation-receipt":"resignation payment", "resignation-copy":"Registered-agent resignation —"}[kind]!;
   const observed=oneMail(mark,expected,current);const [saved]=await db.query("SELECT contact_email,ra_resignation_emailed_at FROM orders WHERE id=$1",[order.id]);
   const portalNotice=kind!=="resignation-copy"||mails.slice(mark).some(m=>!m.attachments&&m.html.includes(env.PUBLIC_BASE_URL+"/portal")&&m.html.includes("Submission does not end the appointment immediately."));
   report(`${mode}: ${kind} uses current address`,observed.ok&&saved.contact_email===old&&portalNotice&&(routeStatus===undefined||routeStatus===200),{...observed,originalEmail:saved.contact_email,routeStatus,portalNotice});
   if(kind==="resignation-copy"){
    const retryMark=mails.length;const data=new FormData();data.append("reuse","true");const r=await app.request(`/api/admin/orders/${order.id}/agent-copy`,{method:"POST",headers:{Cookie:`fpsllc_admin=${admin.token}`},body:data});const retry=oneMail(retryMark,expected,current);report(`${mode}: resend existing resignation copy uses current address`,r.status===200&&retry.ok,{status:r.status,...retry});
   }
   await silence(order.id);
  }
  const history:{contact_email:string}[]=await db.query("SELECT contact_email FROM orders WHERE client_id=$1",[id]);report(`${mode}: every original order email remains historical`,history.length>0&&history.every(o=>o.contact_email===old),history);
 }
 const missing=await makeOrder(null,"unowned-old@example.test","missing-account");let mark=mails.length;await runRenewals(today);const [notice]=await db.query("SELECT status,notice_sent_at,notice_error,lock_until FROM ra_renewals WHERE order_id=$1",[missing.id]);report("missing current account refuses notice and retains retryable error",mails.length===mark&&notice?.status==="notice_pending"&&!notice.notice_sent_at&&!!notice.notice_error&&!notice.lock_until,notice);
 await db.query("UPDATE orders SET client_id=(SELECT id FROM clients WHERE email='office-override-current@example.test') WHERE id=$1",[missing.id]);mark=mails.length;await runRenewals(today);const recovered=oneMail(mark,"registered agent","office-override-current@example.test");const [retryState]=await db.query("SELECT status,notice_error,notice_sent_at FROM ra_renewals WHERE order_id=$1",[missing.id]);report("notice retries successfully after current account recipient is restored",recovered.ok&&retryState.status==="link_sent"&&retryState.notice_error===null&&!!retryState.notice_sent_at,{...recovered,retryState});await silence(missing.id);
 const paid=await makeOrder(null,"unowned-old@example.test","receipt");mark=mails.length;let fulfillmentError="";try{await fulfillPaidRenewal(paid.renewal,"dev-fixture-payment",undefined,true,true);}catch(e){fulfillmentError=String(e);}const [renewal]=await db.query("SELECT status FROM ra_renewals WHERE id=$1",[paid.renewal]);report("missing receipt address does not reverse confirmed payment",!fulfillmentError&&renewal.status==="charged"&&mails.length===mark,{fulfillmentError,renewal,mailCount:mails.length-mark});
 report("notice probes made no outside network requests",outside.length===0,outside);
}
if(import.meta.main){if(process.argv.includes("--child")){await child();process.exit(0);}let bad=0;await batch23NoticesChecks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)bad++;});process.exit(bad?1:0);}
