import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const current=resolve(process.argv[2]||resolve(import.meta.dir,'../../..')),prior=resolve(current,'../../approved-release-repairs-2026-09-23/repo'),mode=process.argv[3]||'parent',dir=process.argv[4]||mkdtempSync(join(tmpdir(),'repair-migration-'));
if(mode==='parent'){
 const assertions=[];
 for(const step of ['prior','upgrade','repeat']){
  const p=Bun.spawn([process.execPath,import.meta.filename,current,step,dir],{stdout:'pipe',stderr:'pipe'});
  const [out,err,exit]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  assertions.push({id:'migration18-'+step,result:exit===0?'pass':'fail',observed:{out,err,exit}});
 }
 console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions}));process.exitCode=assertions.every(r=>r.result==='pass')?0:1;
}else{
 Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:join(dir,'db'),DEV_STORAGE_DIR:join(dir,'files'),DEV_MIRROR_DIR:join(dir,'mirror')});
 const source=mode==='prior'?prior:current,{env}=await import(source+'/webapp/server/env');if(!env.OFFLINE||env.DATABASE_URL)throw Error('Isolation missing');console.log('ISOLATION:'+JSON.stringify({dir,offline:true}));
 const {getDb}=await import(source+'/webapp/server/db'),db=await getDb();
 if(mode==='prior')await db.query("INSERT INTO orders(contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,ra_payment_target) VALUES('Old','old@example.test','NEW','Legacy LLC','{}',0,0,0,gen_random_uuid())");
 else{
  const [o]=await db.query<any>('SELECT ra_payment_protocol,ra_payment_generation FROM orders');if(o.ra_payment_protocol!==0||o.ra_payment_generation!==null)throw Error('Legacy provenance invented');
  if(mode==='upgrade')await db.query("UPDATE launch_policy SET first_notice_cutoff='2026-09-24T00:00:00Z' WHERE id='initial-launch'");
  const [policy]=await db.query<any>("SELECT first_notice_cutoff='2026-09-24T00:00:00Z'::timestamptz AS preserved FROM launch_policy WHERE id='initial-launch'");if(!policy.preserved)throw Error('Immutable cutoff changed');
  console.log('Legacy reservation preserved; original cutoff preserved');
 }
 // PGlite may retain background handles after a migrated write. All SQL
 // promises above have completed; terminate this disposable child explicitly.
 process.exit(0);
}
