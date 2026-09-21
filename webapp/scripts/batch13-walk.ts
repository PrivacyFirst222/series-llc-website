import { chromium, type Browser } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { ssnProblem } from '../src/lib/ssn';
import { form2553Deadline } from '../src/lib/form2553Timing';
type Check = (ok:boolean,label:string,detail?:unknown)=>void;
const source=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function routes() {
 const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto');
 const {agentFixture}=await import('../server/batch06-check'),{buildPayload}=await import('../src/components/forms/florida-llc/buildPayload');
 const {buildSElectionPackage}=await import('../server/s-election');
 const proof=await (await app.request('/api/dev/env-summary')).json();if(!proof.data.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Not isolated');
 const db=await getDb(),client=crypto.randomUUID(),co=crypto.randomUUID(),other=crypto.randomUUID(),token=newToken(),admin=newToken();
 await db.query("INSERT INTO clients(id,email,name) VALUES($1,$2,'Thirteen Owner')",[client,client+'@example.test']);
 await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,false,now()+interval '1 day')",[token.tokenHash,client]);
 await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
 const payload=buildPayload(agentFixture());
 for(const [id,path] of [[co,'CONVERT'],[other,'NEW']])await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Thirteen Owner','thirteen@example.test',$3,'Thirteen LLC',$4,0,0,0,'paid',now())",[id,client,path,JSON.stringify({...payload,filingPath:path})]);
 const service=async(type:string,company=co,details:unknown={})=>{const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,details,amount_cents,paid_at) VALUES($1,$2,$3,$4,'awaiting_info','Thirteen LLC',$5,5000,now())",[id,client,company,type,JSON.stringify(details)]);return id;};
 const req=async(path:string,body?:unknown)=>{const r=await app.request('/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:`fpsllc_session=${token.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const einBody={responsibleFirst:'Thirteen',responsibleLast:'Owner',tin:'123456789',phone:'3055550100',county:'Miami-Dade',activity:'Real Estate',activityFollowUp:'Other',activityOtherDetail:'Rental property',employeesExpected:false,certified:true};
 const ein=await service('ein',co,{target:'company'}),unformedEin=await service('ein',other,{target:'company'});
 const existing=await req('/portal/services/'+ein+'/ein-details',einBody),unformed=await req('/portal/services/'+unformedEin+'/ein-details',einBody);
 const sel=await service('s-election'),otherSel=await service('s-election',other);
 await db.query('UPDATE orders SET formed_at=now() WHERE id=$1',[other]);
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 const body={formationDate:today,ein:'',einPending:true,effectiveDate:'',officerName:'Thirteen Owner',officerTitle:'Manager',phone:'3055550100',certified:true,timingAcknowledged:true,eligibilityAcknowledged:true,shareholders:[{name:'Thirteen Owner',address:'1 Main Street, Miami, FL 33131',percentage:100,dateAcquired:'',ssn:'123456789'}]};
 // A paid series EIN cannot authorize the parent-company checkbox.
 await db.query("UPDATE service_orders SET details='{"+'"target":"series"'+"}'::jsonb WHERE id=$1",[unformedEin]);
 const forged=await req('/portal/services/'+otherSel+'/s-election-details',body);
 await db.query('UPDATE orders SET formed_at=now() WHERE id=$1',[co]);
 const pending=await req('/portal/services/'+sel+'/s-election-details',body);
 const saved=await db.query<{status:string;ein_secret:string;details:Record<string,unknown>}>('SELECT status,ein_secret,details FROM service_orders WHERE id=$1',[sel]);
 const invalid=[];for(const number of ['123001234','123450000'])for(const joint of [false,true])invalid.push(await req('/portal/services/'+sel+'/s-election-details',{...body,shareholders:[{...body.shareholders[0],ssn:joint?'123456789':number,...(joint?{joint:'tbe',name2:'Second Owner',ssn2:number}:{})}]}));
 const fd=new FormData();fd.append('ein','881234567');const {PDFDocument}=await import('@cantoo/pdf-lib');const letter=await PDFDocument.create();letter.addPage();fd.append('file',new File([await letter.save()],'letter.pdf',{type:'application/pdf'}));
 const done=await app.request('/api/admin/services/'+ein+'/fulfill',{method:'POST',headers:{Cookie:`fpsllc_admin=${admin.token}`},body:fd});const issued={status:done.status,body:await done.json()};
 const after=await req('/portal/services?company='+co),completed=after.body.data?.orders?.find((x:{id:string})=>x.id===sel);
 let noEinRefused=false;try{await buildSElectionPackage({llcName:'Test LLC',principalAddress:'1 Main St, Miami, FL 33131',ein:'',dateIncorporated:today,effectiveDate:today,officerName:'Thirteen Owner',officerTitle:'Manager',phone:'3055550100',shareholders:[{...body.shareholders[0],dateAcquired:today}]});}catch{noEinRefused=true;}
 if(process.env.SHOT_DIR&&completed?.documentId){mkdirSync(process.env.SHOT_DIR,{recursive:true});const pdf=await app.request('/api/portal/documents/'+completed.documentId+'/download',{headers:{Cookie:`fpsllc_session=${token.token}`}});writeFileSync(join(process.env.SHOT_DIR,'issued-ein-package.pdf'),new Uint8Array(await pdf.arrayBuffer()));}
 console.log('B13:'+JSON.stringify({existing,unformed,forged,pending,saved:{status:saved[0].status,encrypted:!!saved[0].ein_secret&&!saved[0].ein_secret.includes('123456789'),documentId:saved[0].details.documentId},invalid,issued,completed,noEinRefused}));
}
export async function batch13Walk(browser:Browser,web:string,check:Check){
 const emit=(name:string,ok:boolean,detail?:unknown)=>check(ok,'batch13 '+name,detail);
 const dir=mkdtempSync(join(tmpdir(),'batch13-'));let rt:Awaited<ReturnType<typeof JSON.parse>>;
 try{const p=Bun.spawn(['bun',import.meta.filename,'--routes'],{cwd:process.cwd(),env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:dir},stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);const line=out.split('\n').find(l=>l.startsWith('B13:'));if(code||!line)throw Error(`Fixture ${code}: ${err}\n${out}`);rt=JSON.parse(line.slice(4));}finally{rmSync(dir,{recursive:true,force:true});}
 const timing=source('src/lib/form2553Timing.ts'),optional=source('src/components/forms/florida-llc/sections/StepOptionalDocs.tsx'),mail=source('server/email.ts'),pdf=source('server/s-election.ts'),orderPdf=source('server/order-summary.ts');
 emit('formation deadline wording', [optional,mail,timing].every(t=>t.includes('officially formed with the Florida Division'))&&form2553Deadline('2026-01-07')==='2026-03-23'&&form2553Deadline('2026-10-01')==='2026-12-15', {formula:form2553Deadline('2026-10-01')});
 emit('fax or mail consistently',optional.includes('fax or mail')&&mail.includes('faxing or mailing')&&source('src/pages/portal/OrdersInProgress.tsx').includes('fax or mail'));
 emit('existing LLC can submit EIN details',rt.existing.status===200&&rt.unformed.status===400&&rt.unformed.body.error?.code==='NOT_FORMED',{existing:rt.existing,unformed:rt.unformed});
 emit('SSN impossible groups rejected',['123001234','123450000','000121234','666121234','900121234'].every(n=>!!ssnProblem(n))&&!ssnProblem('123456789')&&rt.invalid.every((r:{status:number;body:{error?:{message:string}}})=>r.status===400&&!!r.body.error?.message.includes('Social Security')),rt.invalid);
 emit('record copy deadline neutral tense',pdf.includes('${FORM2553_DEADLINE_NOTICE} If the deadline has passed, discuss late-election relief with your tax professional.')&&!pdf.includes('The IRS deadline for this election was')&&pdf.includes('**An election filed with incomplete Social Security numbers is invalid.**'));
 emit('issued EIN required for filing package',rt.noEinRefused&&rt.pending.status===200&&!rt.pending.body.data.documentId&&rt.saved.encrypted&&rt.issued.status===200&&!!rt.completed?.documentId&&rt.completed.details.ein==='881234567',{pending:rt.pending,saved:rt.saved,issued:rt.issued,refused:rt.noEinRefused});
 emit('office EIN labels agree',(orderPdf.match(/line\("Federal EIN service"/g)||[]).length===2&&!orderPdf.includes('line("Federal EIN",'));
 const p=await browser.newPage();p.setDefaultTimeout(5000);let hired=false;
 await guardedRoute(p,'**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const send=(data:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
 if(path==='/api/auth/me')return send({name:'Thirteen Owner',email:'thirteen@example.test'});
 if(path==='/api/portal/companies')return send([{orderId:'c13',llcName:'Thirteen LLC',formed:true,registeredAgentChoice:'SELF'}]);
 if(path==='/api/portal/documents')return send([]);
 if(path==='/api/portal/services')return send({llcName:'Thirteen LLC',dev:true,members:[{name:'Thirteen Owner',address:'1 Main St'}],llcFormed:true,einCompanyOrdered:hired,companyEin:null,todayEastern:'2026-09-20',sElection:{eligible:false,reason:'already_ordered'},series:[],pricing:{},orders:[{id:'s13',type:'s-election',status:'awaiting_info',llc_name:'Thirteen LLC',details:{},amount_cents:9500}]});
 return send([]);});
 try{await p.goto(web+'/portal?company=c13');await p.getByRole('button',{name:'Provide details securely'}).click();let dialog=p.getByRole('dialog');const before=await dialog.innerText();const absent=await p.getByRole('checkbox',{name:/obtaining.*EIN/}).count()===0;hired=true;await p.reload();await p.getByRole('button',{name:'Provide details securely'}).click();dialog=p.getByRole('dialog');const after=await dialog.innerText();const pendingBox=p.getByRole('checkbox',{name:/obtaining.*EIN/});const shown=await pendingBox.count()===1;if(shown)await pendingBox.check();const pendingText=await dialog.innerText();emit('pending EIN requires our paid company service',absent&&shown&&after.includes('We’re obtaining your EIN')&&rt.forged.status===400,{absent,shown,forged:rt.forged});emit('package location and pending status',before.includes('We build your package immediately — it appears in Your documents, ready to download.')&&pendingText.includes('We save your answers securely. Once we have your issued EIN, we prepare the package and place it in Your documents.')&&await p.getByRole('button',{name:'Certify and save my details',exact:true}).count()===1,{before,pendingText});if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await p.screenshot({path:join(process.env.SHOT_DIR,'s-election-details.png'),fullPage:true});}}
 catch(e){emit('pending EIN requires our paid company service',false,String(e));emit('package location and pending status',false,String(e));}finally{await p.close();}
 const admin=source('src/pages/admin/ServiceOrdersSection.tsx'),server=source('server/routes-admin.ts');emit('office EIN hint matches applicable package',admin.includes('Enter the 9-digit EIN from the IRS confirmation letter.')&&admin.includes('viewing.details.target !== "series" && detailQuery.data?.sElectionPaid ?')&&admin.includes('If this company’s S-election answers are on file')&&!admin.includes('From the letter. It goes on')&&server.includes('Enter the 9-digit EIN from the IRS confirmation letter.')&&!server.includes("Enter the 9-digit EIN from the letter — it goes on"));
}
if(import.meta.main){if(process.argv.includes('--routes')){await routes();process.exit(0);}const s=await startIsolatedStack({cwd:process.cwd()}),b=await chromium.launch({headless:true});await isolateBrowser(b);let failures=0;try{await batch13Walk(b,s.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failures++;});}finally{await b.close();s.stop();}process.exit(failures?1:0);}
