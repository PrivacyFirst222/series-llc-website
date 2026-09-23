import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
type Report=(label:string,ok:boolean,detail?:unknown)=>void;
export async function batch41RecoveryChecks(report:Report){
 const dir=mkdtempSync(join(tmpdir(),'batch41-recovery-')),details:unknown[]=[];
 const results:{group:string;name:string;ok:boolean;detail?:unknown}[]=[];
 try{
  for(const mode of ['source','restore','deleted','corrupt','pending','checkpoint','second']){
   const data=join(dir,mode);mkdirSync(data,{recursive:true});
   const env={...process.env,E2E_OFFLINE:'1',VERCEL:'',DATABASE_URL:'',BLOB_READ_WRITE_TOKEN:'',RESEND_API_KEY:'',SQUARE_ACCESS_TOKEN:'',DROPBOX_APP_KEY:'',DROPBOX_APP_SECRET:'',DROPBOX_REFRESH_TOKEN:'',DEV_PG_DIR:join(data,'db'),DEV_STORAGE_DIR:join(data,'blob'),DEV_MIRROR_DIR:join(data,'mirror'),B41_DIR:dir,DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({test:Buffer.alloc(32,19).toString('base64')}),DOCUMENT_ENCRYPTION_ACTIVE_KEY:'test'};
   const child=Bun.spawn([process.execPath,fileURLToPath(new URL('./batch41-recovery.test.ts',import.meta.url)),mode],{env,stdout:'pipe',stderr:'pipe'});
   const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
   writeFileSync(join(dir,mode+'.log'),out+'\n'+err);
   const line=out.split('\n').find(l=>l.startsWith('B41RECOVERY:')),parsed=line?JSON.parse(line.slice(12)):null;
   if(parsed)results.push(...parsed.results);details.push({mode,code,proof:parsed?.proof,results:parsed?.results,error:code?err:undefined});
   if(parsed&&code!==0)for(const group of ['B1','B2'])results.push({group,name:mode+' child exits successfully',ok:false,detail:{code,error:err}});
   if(!parsed){for(const group of ['B1','B2'])results.push({group,name:mode+' child completed',ok:false,detail:err});break;}
  }
  for(const group of ['B1','B2']){const rows=results.filter(r=>r.group===group);report(`batch41 ${group} ${group==='B1'?'filing revision recovery':'retained package recovery'}`,rows.length>0&&rows.every(r=>r.ok),{rows,phases:details,evidence:process.env.B41_KEEP_EVIDENCE?dir:undefined});}
 }finally{if(!process.env.B41_KEEP_EVIDENCE)rmSync(dir,{recursive:true,force:true});}
}
if(import.meta.main){let failures=0;await batch41RecoveryChecks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));if(!ok)failures++;});process.exitCode=failures?1:0;}
