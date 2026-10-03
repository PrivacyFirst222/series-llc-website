/** Approved R08-R12: real routes/database, synthetic provider and disposable storage. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { easternDateIso } from './datetime';
type Row = { id: string; result: string; failure_code?: string; detail?: unknown };
export async function remainingAccountChecks(check: (label:string,ok:boolean,detail?:unknown)=>void) {
  const dir=mkdtempSync(join(tmpdir(),'chunk1-remaining-'));
  try {
    const child=Bun.spawn([process.execPath,import.meta.filename,'--child'],{cwd:join(import.meta.dir,'..'),env:{PATH:process.env.PATH??'',TMPDIR:tmpdir(),E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'storage'),ADMIN_PASSWORD:'offline-only',PUBLIC_BASE_URL:'http://localhost:8000'},stdout:'pipe',stderr:'pipe'});
    const deadline=setTimeout(()=>child.kill(),120000);
    try {
    const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
    const lines=stdout.split('\n').filter(l=>l.startsWith('ACCOUNT_ASSERTION:'));
    for(const line of lines){const r=JSON.parse(line.slice(18)) as Row;check(r.id,r.result==='pass',r.detail);}
    if(exit||!lines.length)throw new Error(`Account checks exit ${exit}\n${stdout}\n${stderr}`);
    }finally{clearTimeout(deadline);}
  }finally{rmSync(dir,{recursive:true,force:true});}
}
async function fixture(){
 if(process.env.E2E_OFFLINE!=='1'||!process.env.DEV_PG_DIR?.startsWith(tmpdir())||process.env.VERCEL)throw Error('Offline isolated child required');
 let provider:()=>Promise<Response>=async()=>Response.json({id:'fixture-accepted'});let external=0;
 globalThis.fetch=Object.assign(async(input:RequestInfo|URL)=>{if(String(input)!=='https://api.resend.com/emails'){external++;throw Error('External fetch refused');}return provider();},{preconnect:()=>{throw Error('No preconnect');}}) as typeof fetch;
 const {app}=await import('./app');const {getDb}=await import('./db');const {env}=await import('./env');const {newToken,hashPassword}=await import('./crypto');const {sendMail}=await import('./email');const {putFile}=await import('./storage');const {einDetailsSchema,sElectionDetailsSchema}=await import('./routes-portal');
 if(env.DATABASE_URL||env.RESEND_API_KEY||env.BLOB_READ_WRITE_TOKEN||!env.OFFLINE)throw Error('External configuration present');
 // In-memory provider key selects the send branch; fetch above never opens a socket.
 env.RESEND_API_KEY='synthetic-provider-no-network';const db=await getDb();const original=db.query.bind(db);const rows:Row[]=[];let ip=0;
 const check=(id:string,ok:boolean,detail?:unknown)=>{const r={id,result:ok?'pass':'fail',...(!ok?{failure_code:id.split('.')[0]+'_DEFECT'}:{}),detail};rows.push(r);console.log('ACCOUNT_ASSERTION:'+JSON.stringify(r));};
 const run=async(id:string,fn:()=>Promise<void>)=>{try{await fn();}catch(e){check(id+'.harness',false,String(e));}finally{db.query=original;provider=async()=>Response.json({id:'fixture-accepted'});}};
 const req=async(path:string,body?:unknown,cookie='',method=body===undefined?'GET':'POST')=>{const r=await app.request('/api'+path,{method,headers:{'content-type':'application/json',cookie,'x-forwarded-for':`192.0.2.${++ip}`},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return{status:r.status,data,headers:r.headers};};
 const password='Fixture-old-password-123';
 const client=async()=>{const id=crypto.randomUUID(),email=id+'@example.test',t=newToken();await db.query('INSERT INTO clients(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[id,email,'Fixture Person',await hashPassword(password)]);await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[t.tokenHash,id]);return{id,email,cookie:'fpsllc_session='+t.token};};
 const admin=newToken();await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')",[admin.tokenHash]);const adminCookie='fpsllc_admin='+admin.token;
 const mailRows=async(to:string)=>db.query<{ok:boolean;error:string|null;provider_id:string|null}>('SELECT ok,error,provider_id FROM email_log WHERE to_address=$1 ORDER BY sent_at',[to]);
 await run('SESSION',async()=>{
  const c=await client();let hit=false;db.query=async<T>(sql:string,params:unknown[]=[])=>{if(sql.startsWith('DELETE FROM sessions')){hit=true;throw Error('synthetic session deletion failure');}return original<T>(sql,params);};
  const failed=await req('/auth/logout',{},c.cookie);db.query=original;
  check('SESSION.failure-retains-session',hit&&failed.status===500&&(await req('/auth/me',undefined,c.cookie)).status===200);
  const ended=await req('/auth/logout',{},c.cookie);check('SESSION.success-revokes-session',ended.status===200&&(await req('/auth/me',undefined,c.cookie)).status===401);
 });
 await run('R08b',async()=>{
  const to=crypto.randomUUID()+'@example.test';await sendMail({to,subject:'control',html:'fixture'});check('R08b.normal',(await mailRows(to))[0]?.ok===true);
  provider=async()=>{throw new TypeError('synthetic network failure');};let thrown=false;try{await sendMail({to,subject:'failure',html:'fixture'});}catch{thrown=true;}
  let logged=await mailRows(to);check('R08b.failure',thrown&&logged.length===2&&logged[1].ok===false&&!!logged[1].error,logged);
  provider=async()=>{throw new DOMException('synthetic timeout','TimeoutError');};try{await sendMail({to,subject:'timeout',html:'fixture'});}catch{/* expected */}
  logged=await mailRows(to);check('R08b.downstream',logged.length===3&&logged.filter(r=>r.ok).length===1&&logged[2]?.ok===false,logged);
  for(const failure of ['reject','no-id','bad-json','broken-error-body']){
   provider=async()=>failure==='reject'?new Response('fixture refused',{status:503}):failure==='no-id'?Response.json({}):failure==='bad-json'?new Response('not-json'):new Response(new ReadableStream({start(controller){controller.error(new Error('synthetic response stream failure'));}}),{status:503});
   let refused=false;const before=(await mailRows(to)).length;try{await sendMail({to,subject:failure,html:'fixture'});}catch{refused=true;}
   const after=await mailRows(to);check('R08b.'+failure,refused&&after.length===before+1&&after.at(-1)?.ok===false,after.at(-1));
  }

 });
 await run('R09',async()=>{
  const c=await client();const good=await req('/auth/forgot',{email:c.email});check('R09.normal',good.status===200&&(await mailRows(c.email)).some(r=>r.ok));
  provider=async()=>{throw Error('synthetic provider down');};const known=await req('/auth/forgot',{email:c.email});const unknown=await req('/auth/forgot',{email:'unknown-'+crypto.randomUUID()+'@example.test'});
  check('R09.failure',known.status===200&&JSON.stringify(known.data)===JSON.stringify(unknown.data),{known,unknown});
  check('R09.downstream',(await mailRows(c.email)).some(r=>r.ok===false));
  const attempts:number[]=[];for(let n=0;n<6;n++){const response=await app.request('/api/auth/forgot',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'198.51.100.123'},body:JSON.stringify({email:'nobody@example.test'})});attempts.push(response.status);}
  check('R09.rate-limit',attempts.slice(0,5).every(s=>s===200)&&attempts[5]===429,attempts);

 });
 await run('R08a',async()=>{
  for(const action of ['password','office-email','portal-email']){
   const c=await client();let entered!:()=>void,release!:()=>void;const began=new Promise<void>(r=>entered=r),held=new Promise<void>(r=>release=r);let sends=0;
   provider=async()=>{sends++;entered();await held;return Response.json({id:'held-accepted'});};
   const next='next-'+c.email;let path:string,body:unknown,cookie=c.cookie;
   if(action==='password'){path='/portal/account/password';body={currentPassword:password,newPassword:'New-fixture-password-123'};}
   else if(action==='office-email'){path=`/admin/clients/${c.id}/email`;body={newEmail:next};cookie=adminCookie;}
   else{const t=newToken();await db.query('UPDATE clients SET pending_email=$1 WHERE id=$2',[next,c.id]);await db.query("INSERT INTO auth_tokens(token_hash,client_id,purpose,payload,expires_at) VALUES($1,$2,'verify_email',$3,now()+interval '1 hour')",[t.tokenHash,c.id,next]);path='/auth/verify-email';body={token:t.token};cookie='';}
   let returned=false;const response=req(path,body,cookie).then(r=>{returned=true;return r;});await began;await Bun.sleep(25);check('R08a.failure-'+action,!returned,{returned,sends});release();const result=await response;
   check('R08a.normal-'+action,result.status===200&&sends===(action==='password'?1:2),result);
   const state=await db.query<{email:string;auth_version:string}>('SELECT email,auth_version FROM clients WHERE id=$1',[c.id]);check('R08a.state-'+action,Number(state[0].auth_version)>0&&state[0].email===(action==='password'?c.email:next));
  }
  const c=await client();provider=async()=>{throw Error('synthetic send failure after commit');};const r=await req('/portal/account/password',{currentPassword:password,newPassword:'New-fixture-password-123'},c.cookie);
  check('R08a.downstream',r.status===200&&(await mailRows(c.email)).some(m=>m.ok===false),r);
 });
 await run('R10',async()=>{
  const c=await client(),other=await client();const file=await putFile('fixture.pdf',new TextEncoder().encode('%PDF-1.4\nfixture\n%%EOF').buffer,'application/pdf');const id=crypto.randomUUID();await db.query("INSERT INTO documents(id,client_id,kind,title,storage_key) VALUES($1,$2,'package','Fixture',$3)",[id,c.id,file.storageKey]);
  const valid=await req(`/portal/documents/${id}/download`,undefined,c.cookie);check('R10.normal',valid.status===200&&String(valid.data).startsWith('%PDF'));
  const bad=await req('/portal/documents/not-a-uuid/download',undefined,c.cookie);check('R10.failure',bad.status===404&&bad.data?.error?.code==='NOT_FOUND',bad);
  const otherResult=await req(`/portal/documents/${id}/download`,undefined,other.cookie);check('R10.downstream',otherResult.status===404&&(await req(`/portal/documents/${id}/download`,undefined,c.cookie)).status===200);
 });
 await run('R11',async()=>{
  for(const actor of ['office','portal']){
   const c=await client(),competitor=await client();const next='taken-'+c.email;let fired=false;
   let body:unknown={newEmail:next},path=`/admin/clients/${c.id}/email`,cookie=adminCookie;
   if(actor==='portal'){const t=newToken();await original('UPDATE clients SET pending_email=$1 WHERE id=$2',[next,c.id]);await original("INSERT INTO auth_tokens(token_hash,client_id,purpose,payload,expires_at) VALUES($1,$2,'verify_email',$3,now()+interval '1 hour')",[t.tokenHash,c.id,next]);body={token:t.token};path='/auth/verify-email';cookie='';}
   db.query=async<T>(sql:string,params:unknown[]=[])=>{if(!fired&&sql.includes('WITH changed AS (UPDATE clients SET email=$1')&&params[0]===next){fired=true;await original('UPDATE clients SET email=$1 WHERE id=$2',[next,competitor.id]);}return original<T>(sql,params);};
   const conflict=await req(path,body,cookie);db.query=original;
   check('R11.failure-'+actor,fired&&conflict.status===400&&conflict.data?.error?.code==='EMAIL_TAKEN',conflict);
   const state=await db.query<{email:string;auth_version:string}>('SELECT email,auth_version FROM clients WHERE id=$1',[c.id]);check('R11.state-'+actor,state[0].email===c.email&&Number(state[0].auth_version)===0);
   const fresh='retry-'+c.email;const again=actor==='office'?await req(path,{newEmail:fresh},cookie):await req('/portal/account/email',{newEmail:fresh,currentPassword:password},c.cookie);
   check('R11.normal-'+actor,again.status===200,again);
   if(actor==='portal'){
    const [notice]=await db.query<{html:string}>('SELECT html FROM email_log WHERE to_address=$1 ORDER BY sent_at DESC LIMIT 1',[fresh]);const token=notice?.html.match(/verify-email\?token=([^"<\s]+)/)?.[1];if(!token)throw Error('Fresh confirmation link absent');
    const confirmed=await req('/auth/verify-email',{token});const [account]=await db.query<{email:string;pending_email:string|null}>('SELECT email,pending_email FROM clients WHERE id=$1',[c.id]);check('R11.retry-confirmation',confirmed.status===200&&account.email===fresh&&account.pending_email===null,confirmed);
   }

  }
  check('R11.downstream',(await db.query<{n:number}>("SELECT count(*)::int n FROM clients WHERE email LIKE 'taken-%'")).at(0)?.n===2);
 });
 await run('R12',async()=>{
  const c=await client(),co=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Fixture',$3,'basic','Existing LLC','{}',0,0,0,'formed',now(),now())",[co,c.id,c.email]);
  const ein={responsibleFirst:'Test',responsibleLast:'Person',tin:'123456789',phone:'3055550123',county:'Miami-Dade',activity:'Other',activityFollowUp:'Other',activityDetail:'Holding investments',activityOtherDetail:'Holding investments',employeesExpected:false,certified:true};
  if(!einDetailsSchema.safeParse(ein).success)throw Error(JSON.stringify(einDetailsSchema.safeParse(ein)));
  const service=async(name:string,company:string|null,type='ein')=>{const id=crypto.randomUUID();await db.query("INSERT INTO service_orders(id,client_id,type,status,llc_name,details,amount_cents,formation_order_id,paid_at) VALUES($1,$2,$3,'awaiting_info',$4,'{}',5000,$5,now())",[id,c.id,type,name,company]);return id;};
  const missing=await service('Unrelated LLC',null);const refused=await req(`/portal/services/${missing}/ein-details`,ein,c.cookie);check('R12.failure',refused.status===400&&refused.data?.error?.code==='COMPANY_REQUIRED',refused);
  const [untouched]=await db.query<{status:string;ein_secret:string|null}>('SELECT status,ein_secret FROM service_orders WHERE id=$1',[missing]);check('R12.downstream',untouched.status==='awaiting_info'&&untouched.ein_secret===null);
  const legacy=await service('Existing LLC',null);const accepted=await req(`/portal/services/${legacy}/ein-details`,ein,c.cookie);const [linked]=await db.query<{formation_order_id:string}>('SELECT formation_order_id FROM service_orders WHERE id=$1',[legacy]);check('R12.normal',accepted.status===200&&linked.formation_order_id===co,{accepted,linked});
  const se=await service('Unrelated LLC',null,'s-election');const seBody={ein:'123456789',formationDate:easternDateIso(),officerName:'Test Person',officerTitle:'Manager',phone:'3055550123',shareholders:[{name:'Test Person',address:'1 Test St',percentage:100,ssn:'123456789'}],timingAcknowledged:true,eligibilityAcknowledged:true,certified:true};
  if(!sElectionDetailsSchema.safeParse(seBody).success)throw Error(JSON.stringify(sElectionDetailsSchema.safeParse(seBody)));
  const seRefused=await req(`/portal/services/${se}/s-election-details`,seBody,c.cookie);check('R12.s-election-failure',seRefused.status===400&&seRefused.data?.error?.code==='COMPANY_REQUIRED',seRefused);
  for(const type of ['ein','s-election']){
   const path=(id:string)=>`/portal/services/${id}/${type==='ein'?'ein-details':'s-election-details'}`;const body=type==='ein'?ein:seBody;
   const foreign=await client(),otherCo=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Fixture',$3,'basic','Foreign LLC','{}',0,0,0,'formed',now(),now())",[otherCo,foreign.id,foreign.email]);
   const cross=await service('Foreign LLC',otherCo,type);const no=await req(path(cross),body,c.cookie);check('R12.foreign-'+type,no.status===400&&no.data?.error?.code==='COMPANY_REQUIRED',no);
   const unformedCo=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Fixture',$3,'basic','Waiting LLC','{}',0,0,0,'paid',now())",[unformedCo,c.id,c.email]);
   const waiting=await service('Waiting LLC',unformedCo,type);const notFormed=await req(path(waiting),body,c.cookie);check('R12.unformed-'+type,notFormed.status===400&&notFormed.data?.error?.code==='NOT_FORMED',notFormed);
   const assigned=await service('Existing LLC',co,type);const yes=await req(path(assigned),body,c.cookie);check('R12.assigned-'+type,yes.status===200,yes);
  }
  const duplicate=crypto.randomUUID();await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at,formed_at) VALUES($1,$2,'Fixture',$3,'basic','Existing LLC','{}',0,0,0,'formed',now(),now())",[duplicate,c.id,c.email]);
  for(const type of ['ein','s-election']){const ambiguous=await service('Existing LLC',null,type);const r=await req(`/portal/services/${ambiguous}/${type==='ein'?'ein-details':'s-election-details'}`,type==='ein'?ein:seBody,c.cookie);check('R12.ambiguous-'+type,r.status===400&&r.data?.error?.code==='COMPANY_REQUIRED',r);}

 });
 check('ISOLATION.no-external-traffic',external===0);if(rows.some(r=>r.result!=='pass'))process.exitCode=1;
}
if(import.meta.main){if(process.argv.includes('--child'))await fixture();else{const assertions:Row[]=[];try{await remainingAccountChecks((id,ok,detail)=>assertions.push({id,result:ok?'pass':'fail',...(!ok?{failure_code:id.split('.')[0]+'_DEFECT'}:{}),detail}));}catch(e){assertions.push({id:'fixture.complete',result:'fail',detail:String(e)});}console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions}));if(assertions.some(a=>a.result!=='pass'))process.exitCode=1;}}
