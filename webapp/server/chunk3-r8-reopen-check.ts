/* eslint-disable @typescript-eslint/no-explicit-any -- Persisted multi-process fault fixture. */
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:spec.temp+'/db',DEV_STORAGE_DIR:spec.temp+'/files',DEV_MIRROR_DIR:spec.temp+'/mirror'});
const {app}=await import('./app'),{env}=await import('./env'),{getDb}=await import('./db'),{newToken}=await import('./crypto'),{hashBytes}=await import('./dropbox');
const {readRecoveryJournal}=await import('./backup-deletions'),{officeRecoveryTables}=await import('./office-file-recovery'),{officeFileIdentities,collectOfficeRecoverySources}=await import('./office-recovery-sources'),{runDbBackup}=await import('./backup');
const db=await getDb(),provider=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(spec.temp+'/files',spec.temp+'/mirror',env):null,mail:any[]=[],outside:string[]=[],rows:any[]=[];
env.RESEND_API_KEY='fixture';globalThis.fetch=(async(input:any,init:any)=>{const r=await provider?.fetch(String(input),init);if(r)return r;if(String(input)!=='https://api.resend.com/emails'){outside.push(String(input));throw Error('Unexpected network');}mail.push(init.body);return Response.json({id:'mail-'+mail.length});})as typeof fetch;
const check=(id:string,ok:boolean,observed:any)=>{rows.push({id,result:ok?'pass':'fail',observed});console.log('CASE:'+JSON.stringify(rows.at(-1)));};
const admin=newToken(),client=newToken();await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[client.tokenHash,spec.client]);
const req=async(path:string,body?:any)=>{const r=await app.request('/api/'+path,{method:body?'POST':'GET',headers:{Cookie:'fpsllc_admin='+admin.token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()};};
const before=await readRecoveryJournal(),tables=await officeRecoveryTables(db),identities=officeFileIdentities(tables);
for(const old of spec.old){
 const op=tables.office_operations.find(o=>o.id===old.operationId),identity=identities.get(old.key);if(!identity)throw Error('Persisted identity missing');
 const paths=collectOfficeRecoverySources(identity,before,tables.documents);rmSync(spec.temp+'/files/'+old.key.replace(/^https:\/\/fixture\.private\.blob\.vercel-storage\.com\//,'').replace(/^dev:/,''),{force:true});for(const p of paths)rmSync(spec.temp+'/mirror'+p,{force:true});
 const list=await req('admin/backups/history-recovery'),row=list.body.data.rows.find((r:any)=>r.operationId===old.operationId&&r.slot===old.slot);if(!row)throw Error('Persisted archive not enumerated');
 const acknowledged=await req('admin/backups/history-recovery/'+row.historyId+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});
 check('HG-UPGRADE-'+old.slot,op?.kind===old.expectedKind&&op?.phase==='superseded'&&acknowledged.status===200,{kind:op?.kind,expectedKind:old.expectedKind,phase:op?.phase,acknowledged,checkedCopies:paths.length+1});
}
const backup=await runDbBackup({dispatchAttention:false}),after=await readRecoveryJournal(),downloads:{key:string;status:number;sha:string;expected:string;equal:boolean}[]=[];
for(const f of spec.current){const r=await app.request('/api/portal/documents/'+f.id+'/download',{headers:{Cookie:'fpsllc_session='+client.token}}),bytes=Buffer.from(await r.arrayBuffer());downloads.push({key:f.key,status:r.status,sha:hashBytes(bytes),expected:f.sha,equal:r.status===200&&hashBytes(bytes)===f.sha});}
const {readObject}=await import('./storage'),{gunzipSync}=await import('node:zlib'),dump=backup.key&&backup.pending===0?JSON.parse(gunzipSync((await readObject('backups/'+backup.key))!).toString()):null;
check('HG-UPGRADE',backup.status==='complete_with_history_gaps'&&dump?.historyGaps.length===2&&spec.old.every((o:any)=>dump.historyGaps.some((g:any)=>g.storageKey===o.key))&&after.records.length===before.records.length&&downloads.every(d=>d.equal)&&mail.length===0&&outside.length===0,{status:backup.status,gaps:dump?.historyGaps.map((g:any)=>g.storageKey),retirementsBefore:before.records.length,retirementsAfter:after.records.length,downloads,mail:mail.length,outside});
writeFileSync(spec.output,JSON.stringify({rows},null,2));process.exit(rows.some(r=>r.result!=='pass')?1:0);
