import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(process.argv[2]);
const dir=mkdtempSync(join(tmpdir(),'batch25-route-'));
process.env.E2E_OFFLINE='1';process.env.VERCEL='';process.env.DEV_PG_DIR=join(dir,'db');process.env.DEV_STORAGE_DIR=join(dir,'files');process.env.DEV_MIRROR_DIR=join(dir,'mirror');
const output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});
let failed=0;const check=(label:string,ok:boolean,detail?:unknown)=>{if(!ok)failed++;console.log(JSON.stringify({label,ok,detail}));};
try{
 const {app}=await import(join(root,'webapp/server/app.ts'));
 const proof=await(await app.request('/api/dev/env-summary')).json();if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline proof failed');
 globalThis.fetch=(async()=>{throw Error('Unexpected external network')})as typeof fetch;
 const {getDb}=await import(join(root,'webapp/server/db.ts')),{newToken}=await import(join(root,'webapp/server/crypto.ts'));
 const {PDFDocument}=await import(join(root,'webapp/node_modules/@cantoo/pdf-lib/cjs/index.js'));
 const db=await getDb(),client=crypto.randomUUID(),company=crypto.randomUUID(),admin=newToken(),session=newToken();
 await db.query("INSERT INTO clients(id,email,name)VALUES($1,'batch25@example.test','Client Probe')",[client]);
 await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at)VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);
 await db.query("INSERT INTO sessions(token_hash,client_id,expires_at)VALUES($1,$2,now()+interval '1 day')",[session.tokenHash,client]);
 const name='[ALPHA], LLC';const payload={filingPath:'NEW',llcName:{finalName:name},certifications:{articlesSignedBy:'SERVICE'},management:{structure:'MEMBER_MANAGED'},principalOfficeAddress:{address1:'100 Main Street',city:'Miami',state:'FL',zip:'33101'},members:{memberList:[{firstName:'Client',lastName:'Probe'}]},series:[],registeredAgent:{choice:'OWN'}};
 await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at)VALUES($1,$2,'Client Probe','batch25@example.test','NEW',$3,$4,0,0,0,'formed',now(),now())",[company,client,name,JSON.stringify(payload)]);
 const oa={version:'member-single',companyName:name,principalAddress:'100 Main Street, Miami FL 33101',managerNames:[],effectiveDate:'September 20, 2026',amendedRestated:false,priorAgreementDate:null,members:[{name:'Client [SIGNER] Probe',address:'100 Main Street, Miami FL 33101',percentage:100,contribution:'$100',todBeneficiary:''}],series:[]};
 await db.query("INSERT INTO oa_generations(client_id,order_id,template_version,inputs,generation_number)VALUES($1,$2,'fixture',$3,1)",[client,company,JSON.stringify(oa)]);
 const request=(path:string,method:string,body:unknown,asAdmin=false)=>app.request('/api'+path,{method,headers:{Cookie:asAdmin?`fpsllc_admin=${admin.token}`:`fpsllc_session=${session.token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const extract=async(id:string,stem:string)=>{const r=await request(`/portal/documents/${id}/download`,'GET',undefined);check(stem+' client download succeeds',r.status===200,{status:r.status});const bytes=new Uint8Array(await r.arrayBuffer());writeFileSync(join(output,stem+'.pdf'),bytes);const p=Bun.spawn(['pdftotext','-layout','-','-'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});p.stdin.write(bytes);p.stdin.end();const[text,err,exit]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(exit)throw Error(err);writeFileSync(join(output,stem+'.txt'),text);return text.replace(/\s+/g,' ');};
 const am=await request(`/portal/oa/amend?company=${company}`,'POST',{agreementDate:'2026-09-20',effectiveDate:'2026-09-21',mode:'typed',text:'First [RESERVED] paragraph.\nSecond paragraph.'});const aj=await am.json();check('actual amendment route accepts bracketed company and signer',am.status===200,{status:am.status,body:aj});if(aj.data?.documentId){const text=await extract(aj.data.documentId,'amendment');check('downloaded amendment preserves all original bracket text',text.includes(name)&&text.includes('Client [SIGNER] Probe')&&text.includes('First [RESERVED] paragraph.')&&!text.includes('&#91;'));}
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();const f=new FormData();f.set('articles',new File([bytes],'articles.pdf',{type:'application/pdf'}));f.set('psd',new File([bytes],'series.pdf',{type:'application/pdf'}));f.set('psdSeries','[]');f.set('documentNumber','L26000123456');const sr=await request(`/admin/orders/${company}/formation-documents`,'POST',f,true),sj=await sr.json();check('actual office upload creates Statement for bracketed company',sr.status===200,{status:sr.status,body:sj});const statements=await db.query("SELECT id FROM documents WHERE order_id=$1 AND kind='statement'",[company]);check('Statement stored for correct company',statements.length===1);if(statements.length){const text=await extract(statements[0].id,'statement');check('downloaded Statement preserves company literal without encoded leakage',text.includes(name)&&!text.includes('&#91;'));}
}finally{rmSync(dir,{recursive:true,force:true});}
if(failed)process.exitCode=1;
