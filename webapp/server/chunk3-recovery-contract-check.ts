/** Permanent entry point. Each group runs in a fresh, offline process/store.
 * This suite is one evidence source; it does not replace browser, PostgreSQL,
 * frozen regression, negative-control, or hosted qualification evidence. */
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const recoveryModes=['pair','notices','history-pair','history-boundaries','gap-integrity','sources','alerts','alert-restore','filing-history','deletion-projection','manifest-origin','backup','reset','capacity-blocked','capacity-fallback','integrity','copy-boundaries','copy-races','notice-boundaries','history-races','ordinary-library','ordinary-legal-mail','ordinary-manual-upload','ordinary-order-summary','representation-boundaries','alias-boundaries','multiclient-history','snapshots','filing-neighbors','contract','contract-boundaries','edges','api','retire','retirement-boundaries','lineage','published-before-discard','claim-predecision','claim-restore','stale-review','history-reopen','completed-initial','history-correction-matrix','packages','restore','service-company-EIN','service-series-EIN','service-certificate-of-status','service-certified-copy','service-series-designation','deadlines','rotation','capacity','worker','throttle','checkpoint','copy-budget','final-boundaries','restored-boundaries','snapshot-boundaries','older-readers','scale','year'];
export const recoveryBrowserModes=['browser-pagination','browser-current','browser-two-tabs','browser-continue','browser-service-review','browser-articles-review','browser-attention','browser-history-boundaries','browser-history'];
type Row={id:string;result:string;observed?:unknown};
export function runRecoveryGroups(allowed:string[],build?:string){
 const root=resolve(import.meta.dir,'..'),requested=process.argv.slice(2),modes=requested.length?requested:allowed;
 if(modes.some(m=>!allowed.includes(m))||new Set(modes).size!==modes.length)throw Error('Unknown or repeated recovery group');
 const output=process.env.CHECK_OUTPUT_DIR?resolve(process.env.CHECK_OUTPUT_DIR):mkdtempSync(join(tmpdir(),'chunk3-recovery-contract-'));
 mkdirSync(output,{recursive:true});const identity:Record<string,string>={};
 const walk=(dir:string)=>{for(const name of readdirSync(dir)){const p=join(dir,name);if(statSync(p).isDirectory())walk(p);else identity[relative(root,p)]=createHash('sha256').update(readFileSync(p)).digest('hex');}};
 walk(join(root,'server'));walk(join(root,'src'));identity['package.json']=createHash('sha256').update(readFileSync(join(root,'package.json'))).digest('hex');
 writeFileSync(join(output,'candidate.json'),JSON.stringify(identity,null,2));
 const results:{mode:string;exit:number|null;assertions:number;failures:Row[];complete:boolean}[]=[];
 for(const mode of modes){
  const dest=join(output,mode);mkdirSync(dest,{recursive:false});
  const run=spawnSync(process.execPath,[join(root,'server/chunk3-r8-check.ts'),mode],{cwd:root,env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',CHECK_OUTPUT_DIR:dest,AUDIT_ROOT:root,...(build?{R8_BROWSER_BUILD:build}:{})},encoding:'utf8',maxBuffer:64*1024*1024});
  writeFileSync(join(dest,'stdout.log'),run.stdout??'');writeFileSync(join(dest,'stderr.log'),(run.stderr??'')+(run.error?String(run.error):''));
  const rows:Row[]=[];let malformed=false;
  for(const line of (run.stdout??'').split('\n'))if(line.startsWith('CASE:')){try{rows.push(JSON.parse(line.slice(5)) as Row);}catch{malformed=true;}}
  const failures=rows.filter(r=>r.result!=='pass');
  const complete=run.status===0&&!malformed&&rows.length>1&&failures.length===0&&rows.some(r=>r.id==='network-isolated'&&r.result==='pass');
  results.push({mode,exit:run.status,assertions:rows.length,failures,complete});
  writeFileSync(join(output,'results.json'),JSON.stringify({scope:'Selected permanent groups only; not whole-plan acceptance',selected:modes,allAvailable:allowed,results},null,2));
  console.log(JSON.stringify(results.at(-1)));
 }
 return results.every(r=>r.complete);
}
if(import.meta.main)process.exit(runRecoveryGroups(recoveryModes)?0:1);
