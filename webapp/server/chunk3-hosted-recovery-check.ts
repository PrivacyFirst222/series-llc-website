/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated SQL and provider fault-injection fixtures. */
import {mkdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const E=process.env.CHECK_OUTPUT_DIR||mkdtempSync(tmpdir()+'/chunk3-corrections-'),R=process.env.AUDIT_ROOT||resolve(import.meta.dir,'..'),run='check',temp=E+'/fixtures/office-'+run+'-'+Date.now();mkdirSync(temp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/files',DEV_MIRROR_DIR:temp+'/mirror',ADMIN_PASSWORD:'fixture'});
const {app}=await import(R+'/server/app.ts'),{env}=await import(R+'/server/env.ts'),{getDb}=await import(R+'/server/db.ts'),{newToken}=await import(R+'/server/crypto.ts');
const db:any=await getDb(),rawQuery=db.query.bind(db),proof=(await(await app.request('/api/dev/env-summary')).json()).data;
if(!proof.offline||Object.values(proof.externals).some(Boolean))throw Error('Offline isolation failed');
const rows:any[]=[],mail:any[]=[],outside:string[]=[];let mailMode='ok';
globalThis.fetch=(async(input:any,init:any={})=>{const url=String(input);if(url!=='https://api.resend.com/emails'){outside.push(url);throw Error('NETWORK REFUSED '+url)}const m=JSON.parse(init.body);if(mailMode==='fail')return new Response('Fixture outage',{status:503});mail.push(m);if(mailMode==='lost')throw Error('Fixture accepted but response lost');return Response.json({id:'mail-'+mail.length})}) as typeof fetch;env.RESEND_API_KEY='fixture';
function check(id:string,ok:boolean,observed:any={}){rows.push({id,result:ok?'pass':'fail',observed});console.log('CASE:'+JSON.stringify(rows.at(-1)));writeFileSync(E+'/office-'+run+'.json',JSON.stringify({proof,temp,rows},null,2));}
async function test(id:string,fn:()=>Promise<void>){try{await rawQuery('DELETE FROM rate_limits');await fn()}catch(e){check(id,false,{harnessError:String(e),stack:(e as Error).stack})}finally{db.query=rawQuery;mailMode='ok'}}
const admin=newToken(),user=newToken(),other=newToken(),client=crypto.randomUUID(),client2=crypto.randomUUID();
await db.query("INSERT INTO clients(id,name,email) VALUES($1,'Current Client','current@example.test'),($2,'Other Client','other@example.test')",[client,client2]);
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);for(const [t,c]of[[user,client],[other,client2]])await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[t.tokenHash,c]);
const cookies={admin:'fpsllc_admin='+admin.token,client:'fpsllc_session='+user.token,other:'fpsllc_session='+other.token,none:''};
async function req(path:string,body?:any,actor:keyof typeof cookies='admin',method?:string){const multipart=body instanceof FormData;const r=await app.request('/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Cookie:cookies[actor],...(!multipart?{'content-type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});const bytes=new Uint8Array(await r.arrayBuffer());let data:any;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{data={bytes:bytes.length,head:new TextDecoder().decode(bytes.slice(0,8))}}return{status:r.status,body:data,bytes,headers:Object.fromEntries(r.headers)}}
const {PDFDocument}=await import(R+'/node_modules/@cantoo/pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([300,300]);const pdfBytes=await pdf.save();
function form(fields:any={},files:string[]=['file'],bytes:Uint8Array=pdfBytes){const f=new FormData();for(const[k,v]of Object.entries(fields))f.set(k,String(v));for(const k of files)f.set(k,new File([new Uint8Array(bytes)],k+'.pdf',{type:'application/pdf'}));return f}
async function company(opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Historical Client','old@example.test',$3,$4,$5,49900,12500,62400,$6,$7,$8)`,[id,opts.client||client,opts.package||'NEW',opts.name||'Office Audit LLC',JSON.stringify({filingPath:opts.package||'NEW',series:opts.series||[],optionalDocuments:opts.certs?{certificateOfStatus:true,certifiedCopy:true}:{},registeredAgent:{choice:'SELF'},...(opts.payload||{})}),opts.status||'paid',opts.unpaid?null:new Date().toISOString(),opts.status==='formed'?new Date().toISOString():null]);return id}
async function service(type:string,co:string|null,opts:any={}){const id=crypto.randomUUID();await db.query(`INSERT INTO service_orders(id,client_id,formation_order_id,type,status,llc_name,amount_cents,details,paid_at,ein_secret) VALUES($1,$2,$3,$4,$5,'Office Audit LLC',5000,$6,$7,$8)`,[id,client,co,type,opts.status||'in_progress',JSON.stringify(opts.details||{}),opts.unpaid?null:new Date().toISOString(),opts.secret||null]);return id}
const sr=async(id:string)=>(await db.query('SELECT * FROM service_orders WHERE id=$1',[id]))[0];
const docs=async(co:string)=>await db.query('SELECT * FROM documents WHERE order_id=$1 ORDER BY created_at,id',[co]);

// Provider-shaped storage, still entirely in-process. Observe exact SDK arguments.
const {mock}=await import('bun:test');
const objects=new Map<string,Buffer>(),calls:any[]=[];
const origin='https://fixture.private.blob.vercel-storage.com/';
mock.module(Bun.resolveSync('@vercel/blob',R),()=>({
 put:async(path:string,body:any)=>{calls.push({op:'put',path});const url=origin+path;objects.set(url,Buffer.from(body));return{url,pathname:path}},
 get:async(key:string)=>{calls.push({op:'get',key});const url=key.startsWith('https:')?key:origin+key;const bytes=objects.get(url);return bytes?{statusCode:200,stream:new Blob([new Uint8Array(bytes)]).stream()}:null},
 del:async(key:string)=>{objects.delete(key.startsWith('https:')?key:origin+key)},
 list:async({prefix}:any)=>({blobs:[...objects.keys()].filter(x=>x.slice(origin.length).startsWith(prefix)).map(url=>({url})),hasMore:false}),
}));
// The fake token carries the same store identity as the strict returned URL.
// No credential is loaded and every SDK call remains intercepted in process.
env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_fixture_test-only';
for(const kind of ['ein','ein-series','series','certificate-of-status','certified-copy'])for(const damage of ['missing','corrupt'])await test('provider-key-recovery-'+kind+'-'+damage,async()=>{
 const co=await company({status:'formed'}),id=await service(kind==='ein-series'?'ein':kind,co,{details:{seriesName:'Audit, PS Hosted',...(kind==='ein-series'?{target:'series'}:{})}});let fired=false;
 db.query=async(sql:string,args:any[])=>{if(!fired&&sql.includes("UPDATE service_orders SET status='fulfilled',fulfilled_at=COALESCE")){fired=true;throw Error('Crash after publication')}return rawQuery(sql,args)};
 const f=()=>form({ein:'881234560',notify:false});const first=await req('admin/services/'+id+'/fulfill',f());db.query=rawQuery;
 const d=(await docs(co)).find((d:any)=>!d.deleted_at);if(!d)throw Error('Fixture failed to publish original');
 const original=objects.get(d.storage_key);if(damage==='missing')objects.delete(d.storage_key);else objects.set(d.storage_key,Buffer.from('corrupt hosted bytes'));const start=calls.length;
 const wrongPdf=await PDFDocument.create();wrongPdf.addPage([421,420]);const wrong=await req('admin/services/'+id+'/fulfill',form({ein:'881234560',notify:false},['file'],await wrongPdf.save()));const retry=await req('admin/services/'+id+'/fulfill',f());const repeated=await req('admin/services/'+id+'/fulfill',f());const dl=await req('portal/documents/'+d.id+'/download',undefined,'client');
 check('provider-key-recovery-'+kind+'-'+damage,fired&&first.status===500&&wrong.status===409&&retry.status===200&&repeated.status===200&&(await docs(co)).length===1&&dl.status===200&&Buffer.from(dl.bytes).equals(Buffer.from(pdfBytes)),{first:first.status,retry:retry.status,body:retry.body,download:dl.status,key:d.storage_key,hadOriginal:!!original,calls:calls.slice(start),service:(await sr(id)).status});

 if(kind==='ein'||kind==='ein-series'||kind==='certificate-of-status'||kind==='certified-copy'){
  const actor=kind.startsWith('ein')?'client':'admin';const removed=await req((actor==='client'?'portal':'admin')+'/documents/'+d.id,undefined,actor,'DELETE');const attempt=await req('admin/services/'+id+'/fulfill',f());const after=await req('portal/documents/'+d.id+'/download',undefined,'client');
  check('provider-deleted-'+kind+'-'+damage,removed.status===200&&after.status===404&&!objects.has(d.storage_key),{removed:removed.status,attempt:attempt.status,download:after.status,object:objects.has(d.storage_key)});
 }
});

for(const lostSlot of ['articles','statement'])for(const damage of ['missing','corrupt'])await test('provider-articles-'+lostSlot+'-'+damage,async()=>{
 const co=await company({status:'filed',payload:{certifications:{articlesSignedBy:'SERVICE'}}});let fired=false;
 db.query=async(sql:string,args:any[])=>{if(!fired&&sql.includes("WITH operation AS (SELECT * FROM office_operations")&&sql.includes("jsonb_to_recordset")){fired=true;throw Error('Crash before Articles pair commit')}return rawQuery(sql,args)};
 const f=()=>form({documentNumber:'L26000123456'},['articles']);const first=await req('admin/orders/'+co+'/articles',f());db.query=rawQuery;
 const [op]=await rawQuery("SELECT * FROM office_operations WHERE kind='articles' AND target_id=$1",[co]);
 if(!op?.files[lostSlot])throw Error('No saved slot '+lostSlot+': '+JSON.stringify(first.body));
 if(damage==='missing')objects.delete(op.files[lostSlot].key);else objects.set(op.files[lostSlot].key,Buffer.from('broken'));const start=calls.length;const retry=await req('admin/orders/'+co+'/articles',f());const dd=await docs(co);
 check('provider-articles-'+lostSlot+'-'+damage,fired&&first.status===500&&retry.status===200&&dd.some((d:any)=>d.kind==='articles')&&dd.some((d:any)=>d.kind==='statement'),{first:first.status,retry:retry.status,body:retry.body,files:dd.map((d:any)=>d.kind),calls:calls.slice(start)});
});
check('provider-fixture-no-network',outside.length===0,{outside});
writeFileSync(E+'/office-'+run+'.json',JSON.stringify({proof,temp,rows,providerFixture:true},null,2));process.exit(rows.some(r=>r.result==='fail')?1:0);
