/** N1/N2 regression tests. All owner decisions, published fixes and check
 * results here are SIMULATED in disposable clones. Only filesystem remotes
 * are used. --against runs the causal reproductions on the old controls. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'ledger-lifecycle-'));
const repo = join(temp, 'repo'), home = join(temp, 'owner');
const rows: { name: string; ok: boolean; observed: unknown }[] = [];
const env = { ...process.env, FPSLLC_HOME: home, FPSLLC_DROPBOX: join(temp, 'dropbox'), FPSLLC_BATCH: '', E2E_OFFLINE: '1', CLAUDE_PROJECT_DIR: repo,
  GIT_AUTHOR_NAME: 'lifecycle fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'lifecycle fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const sh = (args: string[], more: Record<string,string> = {}) => { const p = spawnSync(args[0],args.slice(1),{ cwd:repo,env:{...env,...more},encoding:'utf8',maxBuffer:128*1024*1024 }); return { code:p.status,output:`${p.stdout??''}${p.stderr??''}` }; };
const must = (r: ReturnType<typeof sh>) => { if(r.code!==0) throw Error(r.output); return r.output.trim(); };
const git = (...a:string[]) => must(sh(['git',...a]));
const run = (...a:string[]) => sh(['bun','run',...a]);
const put = (p:string,v:unknown) => { mkdirSync(dirname(p),{recursive:true});writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n'); };
const json = (p:string) => JSON.parse(readFileSync(p,'utf8'));
const hash = (s:string) => createHash('sha256').update(s).digest('hex');
const stable = (x:any):any => Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const freeze = (x:unknown) => hash(JSON.stringify(stable(x)));
const record = (name:string,ok:boolean,observed:unknown) => { rows.push({name,ok,observed});console.log(`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(observed)}`); };
const pass = (name:string,r:ReturnType<typeof sh>) => {record(name,r.code===0,r); if(r.code!==0) throw Error(`positive control failed: ${name}`);};
const refuse = (name:string,r:ReturnType<typeof sh>,reason:RegExp) => record(name,r.code!==0&&reason.test(r.output),r);
const commit = () => {git('add','-A');git('commit','--no-verify','-qm','simulated lifecycle fixture');return git('rev-parse','HEAD');};
const jsonLines = () => readFileSync(join(home,'rulings.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const lp=join(repo,'docs/audit/ledger.json');
const save = (l:unknown) => {put(lp,l);must(run('docs/audit/ledger-print.ts','list'));};
const guard = (id:string) => sh(['bun','run','docs/audit/guard.ts'],{FPSLLC_BATCH:id});
const packageFor = (id:string,base:string,commitId:string) => {
 const b=json(join(repo,`docs/audit/batches/${id}/batch.json`));
 const names=['typecheck','lint','unit','facts','guard','documents','server','walk','assertions','dropbox-unchanged','checkout-unchanged','ledger-controls'];
 const packageId='abcdef123456',dir=join(home,'reviews',`${id}-${commitId}`),html='<html>simulated package</html>';
 put(join(dir,'site/index.html'),html);put(join(dir,'package.json'),{batch:id,revision:b.revision,base,commit:commitId,packageId,partial:null,runId:'SIMULATED',createdAt:new Date().toISOString(),required:names,checks:names.map(name=>({name,exit:0,skipped:false,command:'SIMULATED',log:''})),site:[{path:'index.html',sha:hash(html)}],docs:[],diffSha:hash(execFileSync('git',['diff','--no-renames',base,commitId],{cwd:repo,encoding:'utf8'}))});
 return packageId;
};
try {
 execFileSync('git',['clone','--quiet','--no-hardlinks',root,repo]);git('remote','remove','origin');git('config','core.hooksPath','.githooks');
 const ai=process.argv.indexOf('--against');
 if(ai>=0) git('checkout','--detach',process.argv[ai+1]);
 else for(const p of execFileSync('git',['ls-files','-m','-o','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean)) if(existsSync(join(root,p))) {mkdirSync(dirname(join(repo,p)),{recursive:true});copyFileSync(join(root,p),join(repo,p));}
 symlinkSync(join(root,'webapp/node_modules'),join(repo,'webapp/node_modules'));
 const source=git('rev-parse','HEAD');console.log(`Controls: ${source}; fixture commits bypass hooks; simulated approvals/checks only; local remotes only.`);
 // N1: reproduce using the actual mandatory command with real item 17 assigned.
 const real=json(lp);const seventeen=real.items.find((i:any)=>i.id==='17')?.parts.find((p:any)=>p.key==='amend-title');
 if(seventeen){seventeen.status='assigned';seventeen.batch='future-real-batch';} save(real);commit();
 const n1=run('docs/audit/repair-check.ts','--fixtures-only');
 record('N1: mandatory tests survive real item 17 being assigned',n1.code===0,n1);
 // A ledger without any real audit item is a second independence check.
 if(ai<0){save({...real,items:[],rulings:[]});commit();pass('N1: mandatory tests survive no real audit items',run('docs/audit/repair-check.ts','--fixtures-only'));}
 const file='webapp/src/pages/LedgerFixture.tsx';put(join(repo,file),'// old fixture\n// companion fixture\n');
 const oldAssertion={kind:'present',file,text:'old fixture'}, runtimeAssertion={kind:'check',suite:'server',label:'simulated prior behavior'}, companion={kind:'present',file,text:'companion fixture'};
 const fix={batch:'past',revision:1,commit:source,doneBy:'fixture',assertions:[oldAssertion,runtimeAssertion]};
 const oldBatch={id:'past',revision:1,title:'simulated released batch',model:'fixture',base:source,items:[{id:'9001',part:'all',scope:'fixture',assertions:[oldAssertion,runtimeAssertion]},{id:'9002',part:'all',scope:'companion',assertions:[companion]}],files:[{path:file,mode:'code',why:'fixture'}],requiredChecks:[]};
 put(join(repo,'docs/audit/batches/past/batch.json'),oldBatch);put(join(repo,'docs/audit/batches/past/revisions/r1.json'),oldBatch);
 const entry=(id:string,f:any)=>({id,tag:'SYNTHETIC',area:'Public pages, Terms and Privacy',housekeeping:true,source:'disposable fixture',text:'Synthetic fixture, not an audit finding.',verdict:'open',waitsOn:[],parts:[{key:'all',scope:'fixture',status:'released',batch:'past',waitsOn:[],fix:f,history:[{at:'2026-01-01T00:00:00Z',event:'released',batch:'past',revision:1}]}]});
 const seed={version:2,builtFrom:['synthetic lifecycle fixture'],items:[entry('9001',fix),entry('9002',{...fix,assertions:[companion]})],rulings:[],batches:[{id:'past',revision:1,base:source,model:'fixture',frozenHash:freeze(oldBatch),status:'released',history:['authorized','implemented','accepted by Adam','released'].map(event=>({at:'2026-01-01T00:00:00Z',event})),release:{git:{at:'2026-01-01T00:00:00Z',remoteMain:source,commit:source,packageId:'simulated-old'},deployment:null,documents:null}}]};
 save(seed);const base=commit();
 const replacement={id:'replacement',revision:1,title:'replace the old fixture',model:'fixture',base,items:[{id:'9001',part:'all',scope:'approved replacement',replaces:fix,assertions:[{kind:'present',file,text:'new fixture'}]}],files:[{path:file,mode:'code',why:'fixture'}],requiredChecks:[]};
 const bp=join(repo,'docs/audit/batches/replacement/batch.json');put(bp,replacement);
 if(ai>=0){
  // Exact external evidence is seeded, so refusal is the old lifecycle rule,
  // not an unavailable new command or a missing helper.
  put(join(home,'rulings.jsonl'),JSON.stringify({kind:'replacement',batch:'replacement',revision:1,hash:freeze(replacement),at:new Date().toISOString(),source:'SIMULATED'})+'\n');
  const r=run('docs/audit/batch.ts','authorize','replacement');
  record('N2: owner-approved released fix can enter its replacement batch',r.code===0,r);
 }else{
  refuse('N2: no owner approval refuses',run('docs/audit/batch.ts','authorize','replacement'),/replacement|approval|record/i);
  must(run('docs/audit/accept.ts','ruling','9001','Unrelated ordinary ruling.'));
  refuse('N2: ordinary ruling does not approve replacement',run('docs/audit/batch.ts','authorize','replacement'),/replacement|approval|record/i);
  refuse('N2: free-form supersedes flag is not authority',run('docs/audit/batch.ts','ruling','9001','Unrelated ordinary ruling.','--supersedes','anything'),/supersedes|replacement/i);
  refuse('N2: wrong revision cannot be approved',run('docs/audit/accept.ts','approve-replacement','replacement','--revision','2'),/revision|work order/i);
  pass('N2: exact work order can be approved' ,run('docs/audit/accept.ts','approve-replacement','replacement','--revision','1'));
  const exactRecords=readFileSync(join(home,'rulings.jsonl'),'utf8');
  for(const key of ['batch','revision','hash']) {
    const records=exactRecords.trim().split('\n').map(line=>JSON.parse(line));const rec=records.find(x=>x.kind==='replacement');rec[key]=key==='revision'?2:'unrelated';put(join(home,'rulings.jsonl'),records.map(x=>JSON.stringify(x)).join('\n')+'\n');
    refuse(`N2: wrong approval ${key} refuses`,run('docs/audit/batch.ts','authorize','replacement'),/replacement|approval|record/i);
  }
  put(join(home,'rulings.jsonl'),exactRecords);
  const conditional=spawnSync('bash',['.claude/hooks/accept-prompt.sh'],{cwd:repo,env,input:JSON.stringify({prompt:'Approve replacement replacement, revision 1 only if every check passes'}),encoding:'utf8'});
  record('N2: conditional chat approval records nothing',readFileSync(join(home,'rulings.jsonl'),'utf8')===exactRecords,conditional.stdout);
  put(join(home,'rulings.jsonl'),'');
  const hook=spawnSync('bash',['.claude/hooks/accept-prompt.sh'],{cwd:repo,env,input:JSON.stringify({prompt:'Approve replacement replacement, revision 1'}),encoding:'utf8'});
  record('N2: exact whole-message hook binds work order',jsonLines().some(x=>x.kind==='replacement'&&x.hash===freeze(replacement)),hook.stdout);
  put(bp,{...replacement,title:'altered after approval'});refuse('N2: changed work order refuses',run('docs/audit/batch.ts','authorize','replacement'),/approval|record|hash/i);put(bp,replacement);
  pass('N2: owner-approved released fix can enter its replacement batch',run('docs/audit/batch.ts','authorize','replacement'));
  pass('N2: assigned replacement keeps prior static assertions',guard('replacement'));
  put(join(repo,file),'// premature change\n// companion fixture\n');refuse('N2: removing old wording before implementation refuses',guard('replacement'),/fixed wording/);put(join(repo,file),'// old fixture\n// companion fixture\n');
  const resultFile=join(temp,'simulated-results.jsonl');
  put(resultFile,JSON.stringify({suite:'server',label:'simulated prior behavior',ok:false,commit:source,run:'SIMULATED'})+'\n');
  refuse('N2: assigned replacement retains prior runtime assertion',run('webapp/scripts/audit-assert.ts','--commit',source,'--run','SIMULATED','--results',resultFile),/ran and FAILED/);
  put(resultFile,JSON.stringify({suite:'server',label:'simulated prior behavior',ok:true,commit:source,run:'SIMULATED'})+'\n');
  pass('N2: prior runtime assertion positive control',run('webapp/scripts/audit-assert.ts','--commit',source,'--run','SIMULATED','--results',resultFile));
  const assigned=commit();
  refuse('N2: replacement assignment is not records-only publication',run('docs/audit/release-check.ts','--range',base,assigned),/acceptance|accepted|supersess|replacement/i);
  put(join(repo,file),'// new fixture\n// companion fixture\n');pass('N2: implement replacement',run('docs/audit/batch.ts','implemented','replacement'));pass('N2: implemented replacement passes guard',guard('replacement'));
  pass('N2: implemented replacement uses new runtime assertion set',run('webapp/scripts/audit-assert.ts','--commit',source,'--run','SIMULATED'));
  const good=json(lp);const archived=good.items[0].parts[0].supersessions;
  record('N2: exact old fix and history retained',JSON.stringify(archived?.[0]?.prior)===JSON.stringify(fix)&&JSON.stringify(good.items[0].parts[0].history[0])===JSON.stringify(seed.items[0].parts[0].history[0]),archived);
  put(join(repo,file),'// new fixture\n');refuse('N2: unrelated completed fix still enforced',guard('replacement'),/companion fixture/);put(join(repo,file),'// new fixture\n// companion fixture\n');
  const wrongFix=structuredClone(good);wrongFix.items[0].parts[0].fix.assertions=[{kind:'present',file,text:'companion fixture'}];save(wrongFix);refuse('N2: implemented assertions cannot diverge from approved work order',guard('replacement'),/frozen assertions|recorded fix/);save(good);
  const tamper=structuredClone(good);tamper.items[0].parts[0].supersessions[0].prior.assertions=[];save(tamper);refuse('N2: archived fix cannot be edited',guard('replacement'),/supersess|archive|prior|replacement/i);save(good);
  const ownerText=readFileSync(join(home,'rulings.jsonl'),'utf8');put(join(home,'rulings.jsonl'),'');refuse('N2: missing approval still refuses after assignment commit',guard('replacement'),/replacement|approval|record/i);put(join(home,'rulings.jsonl'),ownerText);
  const implemented=commit();packageFor('replacement',base,implemented);
  refuse('N2: implemented replacement cannot publish before acceptance',run('docs/audit/release-check.ts','--range',base,implemented),/acceptance|accepted/i);
  pass('N2: review package accepted in simulated owner home',run('docs/audit/accept.ts','accept','replacement','1',implemented));
  pass('N2: accepted replacement passes release gate',run('docs/audit/release-check.ts','--range',base,implemented));
  const remote=join(temp,'remote.git');execFileSync('git',['init','--quiet','--bare',remote]);git('remote','add','origin',remote);git('push','--quiet','--no-verify','origin',`${base}:refs/heads/main`);
  pass('N2: actual push through hook to local remote',sh(['git','push','origin','HEAD:refs/heads/main']));
  pass('N2: record replacement release',run('docs/audit/batch.ts','released','replacement',implemented));
  const released=commit();pass('N2: release bookkeeping is publishable',run('docs/audit/release-check.ts','--range',implemented,released));
  pass('N2: multi-commit CI comparison',run('docs/audit/guard.ts','--against',`${base}..${released}`));
  const releasedLedger=json(lp),newFix=releasedLedger.items[0].parts[0].fix;
  record('N2: original batch stays byte-identical',JSON.stringify(releasedLedger.batches[0])===JSON.stringify(seed.batches[0]),releasedLedger.batches[0]);
  // Rejected attempts restore the most recent released fix, not the oldest.
  for(const state of ['assigned','implemented']){
   const id=`reject-${state}`,start=git('rev-parse','HEAD');const b={...replacement,id,base:start,items:[{...replacement.items[0],replaces:newFix,assertions:[{kind:'present',file,text:'third fixture'}]}]};put(join(repo,`docs/audit/batches/${id}/batch.json`),b);
   pass(`N2: approve ${state} attempt`,run('docs/audit/accept.ts','approve-replacement',id,'--revision','1'));pass(`N2: authorize ${state} attempt`,run('docs/audit/batch.ts','authorize',id));
   if(state==='implemented'){put(join(repo,file),'// third fixture\n// companion fixture\n');must(run('docs/audit/batch.ts','implemented',id));}
   const attempt=commit();pass(`N2: owner rejects ${state} attempt`,run('docs/audit/accept.ts','reject',id,'--revision','1','--reason','simulated rejection'));pass(`N2: restore after ${state} rejection`,run('docs/audit/batch.ts','reject',id));
   put(join(repo,file),'// new fixture\n// companion fixture\n');pass(`N2: restored prior assertions after ${state} rejection`,guard(''));
   const restored=json(lp).items[0].parts[0];record(`N2: ${state} rejection retains exact released fix`,restored.status==='released'&&JSON.stringify(restored.fix)===JSON.stringify(newFix),restored);
   const end=commit();pass(`N2: CI sees valid ${state} rejection`,run('docs/audit/guard.ts','--against',`${attempt}..${end}`));
   pass(`N2: cancelled ${state} attempt across all its commits`,run('docs/audit/guard.ts','--against',`${start}..${end}`));
   pass(`N2: cancelled ${state} attempt records preserve live protections`,run('docs/audit/release-check.ts','--range',start,end));
  }
  pass('N2: comparison spans release bookkeeping and later cancellations',run('docs/audit/guard.ts','--against',`${implemented}..HEAD`));
  pass('N2: complete lifecycle and two cancellations across commits',run('docs/audit/guard.ts','--against',`${base}..HEAD`));
 }
}catch(e){record('harness setup/runtime (not a reproduced defect)',false,String(e));}
finally{const oi=process.argv.indexOf('--out');if(oi>=0)put(process.argv[oi+1],{rows});console.log(`${rows.filter(r=>r.ok).length}/${rows.length} lifecycle cases passed`);rmSync(temp,{recursive:true,force:true});}
process.exit(rows.every(r=>r.ok)?0:1);
