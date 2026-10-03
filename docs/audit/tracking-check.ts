/** Real commands in a disposable synthetic repository. Fixture commits bypass hooks;
 * no production network, decisions or database are touched. Package check rows here
 * are simulated inputs to gate tests, not claimed product test runs. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,symlinkSync,appendFileSync} from 'node:fs';
import {join,dirname} from 'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
import{ROOT}from'./ledger-lib';
const temp=mkdtempSync(join(tmpdir(),'tracking-check-')),repo=join(temp,'repo'),home=join(temp,'home');mkdirSync(repo);mkdirSync(home);
const env={...process.env,FPSLLC_HOME:home,FPSLLC_BATCH:'',FPSLLC_DROPBOX:join(temp,'dropbox'),GIT_AUTHOR_NAME:'tracking fixture',GIT_AUTHOR_EMAIL:'fixture@invalid.test',GIT_COMMITTER_NAME:'tracking fixture',GIT_COMMITTER_EMAIL:'fixture@invalid.test'};
const run=(args:string[],cwd=repo)=>{const p=spawnSync(args[0],args.slice(1),{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024});return{code:p.status,text:p.stdout+p.stderr};};
const must=(args:string[])=>{const r=run(args);if(r.code)throw Error(r.text);return r.text.trim();};
const put=(path:string,value:unknown)=>{mkdirSync(dirname(join(repo,path)),{recursive:true});writeFileSync(join(repo,path),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
try{
 must(['git','init','-q']);
 mkdirSync(join(repo,'webapp'),{recursive:true});
 symlinkSync(join(ROOT,'webapp/node_modules'),join(repo,'webapp/node_modules'));
 appendFileSync(join(repo,'.git/info/exclude'),'\n/webapp/node_modules\n');
 for(const file of ['ledger-lib.ts','ledger-print.ts','audit-import-lib.ts','audit-session-lib.ts','evidence.ts','tracking.ts','release-check.ts','publish-docs.ts']) {mkdirSync(join(repo,'docs/audit'),{recursive:true});copyFileSync(join(ROOT,'docs/audit',file),join(repo,'docs/audit',file));}
 // Runs inside the fixture so every shared helper resolves its own repository/home.
 put('probe.ts',String.raw`
import{readFileSync,writeFileSync,mkdirSync,appendFileSync}from'node:fs';import{join}from'node:path';import{spawnSync}from'node:child_process';
import{importProblems,intakeItems}from'./docs/audit/audit-import-lib';import * as L from './docs/audit/ledger-lib';import{renderList}from'./docs/audit/ledger-print';
const rows:{name:string;ok:boolean;detail:unknown}[]=[];
const test=(name:string,ok:boolean,detail:unknown)=>{rows.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+': '+JSON.stringify(detail));};
const sh=(...args:string[])=>{const p=spawnSync(args[0],args.slice(1),{encoding:'utf8',env:process.env});return{code:p.status,text:p.stdout+p.stderr};};
const g=(...args:string[])=>{const r=sh('git',...args);if(r.code)throw Error(r.text);return r.text.trim();};
const put=(p:string,v:unknown)=>{mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
const commit=()=>{g('add','-A');g('-c','core.hooksPath=/dev/null','commit','-qm','synthetic fixture');return g('rev-parse','HEAD');};
const at='2026-09-23T10:00:00.000Z';
const seedItem:any={id:'x',tag:'wording',area:'Client portal',source:'fixture',text:'fixture',verdict:'open',waitsOn:[],parts:[{key:'all',scope:'fixture',status:'open',waitsOn:[],history:[{at,event:'seed'}]}]};
const ruling={date:'2026-09-23',kind:'ruling',item:'x',text:'Leave as is.'};
// This disposable owner source and canonical line authenticate only the simulated ruling.
put(join(L.HOME,'rulings.jsonl'),JSON.stringify({kind:'ruling',item:ruling.item,text:ruling.text,at,source:'SIMULATED fixture'})+'\n');
put('docs/audit/rulings.md',L.rulingLine(ruling)+'\n');
const empty:any={version:2,builtFrom:[],dispositions:[],implementations:[],combinedReleases:[],auditAdjudications:[],items:[seedItem],rulings:[ruling],batches:[]};put('docs/audit/ledger.json',empty);put('docs/audit/findings-open.md',renderList(empty));put('fixture.txt','before');put('docs/word/Test.docx','synthetic document bytes');
const base=commit();
const assertion={kind:'present',file:'fixture.txt',text:'protected'};
const order:any={id:'x',revision:1,title:'fixture',model:'fixture',base,items:[{id:'x',part:'all',scope:'fixture',assertions:[assertion]}],files:[{path:'fixture.txt',mode:'code',why:'fixture'}],requiredChecks:[]};
const fix={batch:'x',revision:1,commit:'',doneBy:'fixture',assertions:[assertion]};
const ledger:any={...empty,rulings:[ruling],items:[{id:'x',tag:'wording',area:'Client portal',source:'fixture',text:'fixture',verdict:'open',waitsOn:[],parts:[{key:'all',scope:'fixture',status:'implemented',batch:'x',waitsOn:[],history:[{at,event:'seed'},{at,event:'assigned',batch:'x',revision:1},{at,event:'implemented',batch:'x',revision:1}],fix}]}],batches:[{id:'x',revision:1,frozenHash:L.frozenHashOf(order),status:'implemented',base,model:'fixture',history:[{at,event:'authorized'},{at,event:'implemented'}]}]};
put('fixture.txt','protected');put('docs/audit/batches/x/batch.json',order);put('docs/audit/batches/x/revisions/r1.json',order);put('docs/audit/ledger.json',ledger);put('docs/audit/findings-open.md',renderList(ledger));
const implemented=commit(),manifest=L.combinedManifest(base,implemented);
test('complete manifest identifies exact active part',manifest.batches.length===1&&manifest.batches[0].parts[0].state==='preserved',manifest);
const pid='fixture123',dir=join(L.REVIEWS,'fixture'),html='<html>fixture</html>';
let pkg:any={batch:'x',revision:1,base,commit:implemented,packageId:pid,diffSha:L.sha256(L.git(['diff','--no-renames',base,implemented])),createdAt:at,runId:'fixture',partial:null,required:[...L.MANDATORY_CHECKS],checks:L.MANDATORY_CHECKS.map(name=>({name,command:'SIMULATED fixture',exit:0,skipped:false,log:''})),docs:[{path:'docs/word/Test.docx',sha:L.sha256('synthetic document bytes')}],site:[{path:'index.html',sha:L.sha256(html)}],combined:manifest};
put(join(dir,'site/index.html'),html);put(join(dir,'package.json'),pkg);
test('complete simulated combined package passes',L.combinedProblems(pkg).length===0,L.combinedProblems(pkg));
for(const [name,mutate]of [
 ['omitted batch',(p:any)=>p.combined.batches=[]],['wrong work order hash',(p:any)=>p.combined.batches[0].workOrderSha='0'.repeat(64)],['wrong part',(p:any)=>p.combined.batches[0].parts[0].part='missing'],['missing required check',(p:any)=>p.checks=p.checks.filter((c:any)=>c.name!=='server')],['skipped check',(p:any)=>p.checks[0].skipped=true],['duplicate check',(p:any)=>p.checks.push(p.checks[0])],['wrong commit',(p:any)=>p.commit=base],['missing manifest',(p:any)=>delete p.combined]
]as const){const p=structuredClone(pkg);mutate(p);const errors=L.combinedProblems(p);test(name+' refused',errors.length>0,errors);}
const impl=sh('bun','docs/audit/tracking.ts','implementation',pid);test('real implementation command succeeds',impl.code===0,impl);
const recorded=L.loadLedger();test('implementation changes no Fix or lifecycle',JSON.stringify(recorded.items)===JSON.stringify(ledger.items)&&recorded.implementations?.length===1,recorded.implementations);
const again=sh('bun','docs/audit/tracking.ts','implementation',pid);test('duplicate implementation command refused',again.code!==0&&again.text.includes('duplicate implementation'),again);
const receipt=recorded.implementations![0];
for(const [name,mutate]of [['wrong implementation commit',(r:any)=>r.commit=base],['wrong implementation hash',(r:any)=>r.workOrderSha='0'.repeat(64)],['wrong package hash',(r:any)=>r.packageSha='0'.repeat(64)],['wrong revision',(r:any)=>r.revision=2]]as const){const l=structuredClone(ledger);l.implementations=[structuredClone(receipt)];mutate(l.implementations[0]);const errors=L.trackingRegressions(ledger,l);test(name+' refused',errors.length>0,errors);}
const removed=structuredClone(recorded);removed.implementations=[];test('receipt removal refused',L.trackingRegressions(recorded,removed).some(x=>x.includes('append-only')),L.trackingRegressions(recorded,removed));
const retained=structuredClone(ledger);retained.dispositions=[{item:'x',part:'all',disposition:'owner-retained',ruling}];
test('retained display keeps lifecycle separate',renderList(retained).includes('Owner retained the wording')&&renderList(retained).includes('Technical lifecycle: implemented'),renderList(retained));
test('new disposition cannot publish as records only',L.trackingRegressions(ledger,retained,{strict:true}).some(x=>x.includes('requires review')),L.trackingRegressions(ledger,retained,{strict:true}));
retained.dispositions[0].ruling={...ruling,text:'made up'};test('made-up ruling refused',L.trackingRegressions(ledger,retained).some(x=>x.includes('exact recorded ruling')),L.trackingRegressions(ledger,retained));
test('blank release commit is not printed',!renderList(ledger).includes('commit ,')&&renderList(ledger).includes('release commit not recorded'),renderList(ledger));
const noacc=sh('bun','docs/audit/tracking.ts','combined',pid,'--deployment','dpl_fixture');test('combined command refuses before network without acceptance',noacc.code!==0&&noacc.text.includes('No standing acceptance'),noacc);
const release:any={at,commit:implemented,packageId:pid,packageSha:L.sha256(readFileSync(join(dir,'package.json'))),manifest,remoteMain:implemented,deployment:{id:'dpl_fixture',url:'fixture.invalid',commit:implemented,state:'READY',target:'production',projectId:'prj_fixture',aliases:['fixture.invalid'],observedAt:at},documents:pkg.docs};
let proposed=structuredClone(ledger);proposed.combinedReleases=[release];
test('forged receipt without acceptance refused',L.trackingRegressions(ledger,proposed).some(x=>x.includes('standing acceptance')),L.trackingRegressions(ledger,proposed));
put(join(L.HOME,'acceptances.jsonl'),JSON.stringify({kind:'accept',batch:'x',revision:1,commit:implemented,packageId:pid,at,source:'SIMULATED fixture'})+'\n');
test('accepted but unobserved publication refused',L.trackingRegressions(ledger,proposed).some(x=>x.includes('verified publication observation')),L.trackingRegressions(ledger,proposed));
put(join(L.HOME,'publications.jsonl'),JSON.stringify(release)+'\n');
test('authenticated simulated publication receipt passes',L.trackingRegressions(ledger,proposed).length===0,L.trackingRegressions(ledger,proposed));
proposed.combinedReleases[0].deployment.commit=base;test('wrong deployed commit refused',L.trackingRegressions(ledger,proposed).some(x=>x.includes('deployment proof')),L.trackingRegressions(ledger,proposed));


const adjudication:any={sourceId:'legacy-null',verdict:'disputed',reason:'No NOT NULL guarantee; blanket removal unsupported.',replacementVerdict:'unsafe as a blanket cleanup',source:'cross-review fixture',codeRemovalApproved:false};
const finding:any={key:'new-tracking-gap',relation:'new',where:'fixture',file:'fixture.txt',line:1,reads:'protected',claims:'fixture',truth:'fixture',replacement:'fixture',severity:'housekeeping',review:{reviewer:'independent fixture',priorCompared:true,evidence:'fixture',replacement:'correct'}};
const intakePath='docs/audit/intakes/fixture.json';
const intake:any={schema:1,run:'fixture',commit:implemented,completedAt:at,manifestSha:'1'.repeat(64),auditSha:'2'.repeat(64),findings:[finding],adjudications:[adjudication]};
const intakeBefore:any={...empty,items:[],rulings:[]};
const intakeAfter=()=>({...intakeBefore,auditImports:[{path:intakePath,sha:L.sha256(JSON.stringify(intake))}],items:intakeItems(intake,intakePath),auditAdjudications:[adjudication]});
const intakeRead=(p:string)=>p===intakePath?JSON.stringify(intake):null;
const checked=intakeAfter();test('checked intake preserves informational adjudication',importProblems(intakeBefore,checked,intakeRead,false).problems.length===0,importProblems(intakeBefore,checked,intakeRead,false).problems);
const tampered=structuredClone(checked);tampered.auditAdjudications[0].reason='delete it';test('changed adjudication refused',importProblems(intakeBefore,tampered,intakeRead,false).problems.length>0,importProblems(intakeBefore,tampered,intakeRead,false).problems);
intake.findings[0].key='legacy-null';test('adjudicated source cannot become open repair',importProblems(intakeBefore,intakeAfter(),intakeRead,false).problems.some(x=>x.includes('cannot also')),importProblems(intakeBefore,intakeAfter(),intakeRead,false).problems);
intake.findings[0].key='new-tracking-gap';intake.adjudications[0].codeRemovalApproved=true;test('adjudication cannot approve code removal',importProblems(intakeBefore,intakeAfter(),intakeRead,false).problems.length>0,importProblems(intakeBefore,intakeAfter(),intakeRead,false).problems);
// Real Git push hook and real combined command. Only the Vercel API reply is mocked;
// the remote is a disposable local bare repository and publication bytes are real files.
put('docs/audit/ledger.json',recorded);put('docs/audit/findings-open.md',renderList(recorded));
const remote=join(L.HOME,'remote.git');g('init','--bare','-q',remote);g('remote','add','origin',remote);
g('push','--no-verify','-q','origin',base+':refs/heads/main');
put('.git/hooks/pre-push','#!/bin/sh\nexec bun docs/audit/release-check.ts --pre-push\n'.replaceAll('\\n','\n'));
sh('chmod','+x','.git/hooks/pre-push');
put(join(L.HOME,'acceptances.jsonl'),'');
const refusedPush=sh('git','push','origin',implemented+':refs/heads/main');test('real push hook refuses unaccepted package',refusedPush.code!==0&&refusedPush.text.includes('no acceptance'),refusedPush);
put(join(L.HOME,'acceptances.jsonl'),JSON.stringify({kind:'accept',batch:'x',revision:1,commit:implemented,packageId:pid,at,source:'SIMULATED fixture'})+'\n');
const acceptedPush=sh('git','push','origin',implemented+':refs/heads/main');test('real push hook permits complete accepted package',acceptedPush.code===0,acceptedPush);
put(join(L.HOME,'publications.jsonl'),'');
put('fake-vercel.ts', 'process.env.VERCEL_TOKEN="SIMULATED";process.env.VERCEL_PROJECT_ID="prj_fixture"; globalThis.fetch=async()=>new Response(JSON.stringify({id:"dpl_fixture",url:"fixture.invalid",readyState:"READY",target:"production",projectId:"prj_fixture",aliasAssigned:true,alias:["fixture.invalid"],meta:{githubCommitSha:'+JSON.stringify(implemented)+'}}),{status:200});');
const missingDoc=sh('bun','--preload','./fake-vercel.ts','docs/audit/tracking.ts','combined',pid,'--deployment','dpl_fixture');test('real combined command refuses missing published document',missingDoc.code!==0&&/ENOENT|No such/.test(missingDoc.text),missingDoc);
put(join(process.env.FPSLLC_DROPBOX!,'Test.docx'),'synthetic document bytes');
const published=sh('bun','--preload','./fake-vercel.ts','docs/audit/tracking.ts','combined',pid,'--deployment','dpl_fixture');test('real combined command verifies remote and document bytes with simulated Vercel reply',published.code===0,published);
const final=L.loadLedger();test('combined receipt does not invent historical acceptance or release lifecycle',final.combinedReleases?.length===1&&JSON.stringify(final.items)===JSON.stringify(recorded.items)&&JSON.stringify(final.batches)===JSON.stringify(recorded.batches),final.combinedReleases);
test('combined publication satisfies a release dependency',L.unmetWaits(final,{...final.items[0],waitsOn:['x']},final.items[0].parts[0]).length===0,L.unmetWaits(final,{...final.items[0],waitsOn:['x']},final.items[0].parts[0]));
const later=structuredClone(final);later.items[0].parts[0].fix!.assertions=[{kind:'present',file:'fixture.txt',text:'later fix'}];test('later replacement cannot inherit prior publication',!L.combinedPartPublished(later,'x',later.items[0].parts[0]),L.combinedPartPublished(later,'x',later.items[0].parts[0]));
console.log('Fixture setup: 2 local commits bypassed hooks; 1 remote setup push bypassed hook. Measured pushes use real hook. Vercel reply and owner acceptance simulated.');
console.log(JSON.stringify({passed:rows.filter(r=>r.ok).length,total:rows.length,fixtureOnly:true}));if(rows.some(r=>!r.ok))process.exit(1);
`);
 const result=run(['bun','probe.ts']);console.log(result.text);if(result.code!==0)throw Error('tracking probes failed');
}finally{rmSync(temp,{recursive:true,force:true});}
