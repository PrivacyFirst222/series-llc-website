/** Synthetic first-fix/replacement lifecycles. No real decisions or ledger writes. */
import {ledgerRegressions,frozenHashOf,git,type Ledger,type BatchFile,type Fix,type HistoryEntry} from './ledger-lib';
export function batch35Controls(){
 const base=git(['rev-parse','HEAD']).trim(),at='2026-09-22T12:00:00.000Z';
 const before:Ledger={version:2,builtFrom:[],rulings:[],batches:[],items:[{id:'fixture35',tag:'housekeeping',area:'test',housekeeping:true,source:'synthetic',text:'synthetic',verdict:'open',waitsOn:[],parts:[{key:'all',scope:'test',status:'open',waitsOn:[],history:[{at,event:'recorded'}]}]}]};
 const work=(id:string,replaces?:Fix):BatchFile=>({id,revision:1,title:'Synthetic',model:'fixture',base,items:[{id:'fixture35',part:'all',scope:'test',assertions:[{kind:'present',file:'fixture.txt',text:id}],...(replaces?{replaces}:{})}],files:[],requiredChecks:[]});
 const first=work('first'),fix:Fix={batch:'first',revision:1,commit:'',doneBy:'fixture',assertions:first.items[0].assertions},next=work('next',fix);
 const files=new Map<string,string>();
 const after=structuredClone(before);
 for(const b of [first,next]){const text=JSON.stringify(b);files.set(`docs/audit/batches/${b.id}/batch.json`,text);files.set(`docs/audit/batches/${b.id}/revisions/r1.json`,text);after.batches.push({id:b.id,revision:1,frozenHash:frozenHashOf(b),status:'implemented',model:b.model,base,history:['authorized','implemented'].map(event=>({at,event}))});}
 const event=(event:string,batch:string):HistoryEntry=>({at,event,batch,revision:1});
 const p=after.items[0].parts[0];p.status='implemented';p.batch='next';p.fix={...fix,batch:'next',assertions:next.items[0].assertions};p.supersessions=[{prior:fix,priorStatus:'implemented',batch:'next',revision:1,hash:frozenHashOf(next)}];
 p.history.push(event('assigned','first'),event('implemented','first'),event('superseded by approved replacement','next'),event('assigned','next'),event('implemented','next'));
 const rows:{name:string;ok:boolean;problems:string[]}[]=[];
 const check=(name:string,b:Ledger,a:Ledger,ok:boolean,changed=files,strict=false)=>{const problems=ledgerRegressions(b,a,{read:path=>changed.get(path)??null,external:'skip',strict});rows.push({name,ok:ok?problems.length===0:problems.some(s=>/replacement|snapshot|work order|frozen|event/i.test(s)),problems});};
 check('initial open to implemented to replacement',before,after,true);
 const assigned=structuredClone(before);assigned.batches.push({...after.batches[0],status:'authorized',history:[{at,event:'authorized'}]});Object.assign(assigned.items[0].parts[0],{status:'assigned',batch:'first'});assigned.items[0].parts[0].history.push(event('assigned','first'));check('initial assigned to implemented to replacement',assigned,after,true);
 for(const ev of ['assigned','implemented','superseded by approved replacement']){const bad=structuredClone(after);const i=bad.items[0].parts[0].history.findIndex(h=>h.event===ev);bad.items[0].parts[0].history.splice(i,1);check('missing '+ev,before,bad,false);}
 for(const ev of ['assigned','implemented']){const bad=structuredClone(after);bad.items[0].parts[0].history.find(h=>h.event===ev)!.batch='forged';check('forged '+ev,before,bad,false);}
 for(const ev of ['assigned','implemented']){const bad=structuredClone(after);const i=bad.items[0].parts[0].history.findIndex(h=>h.event===ev&&h.batch==='next');bad.items[0].parts[0].history.splice(i,1);check('missing replacement '+ev,before,bad,false);}
 const reordered=structuredClone(after);[reordered.items[0].parts[0].history[1],reordered.items[0].parts[0].history[2]]=[reordered.items[0].parts[0].history[2],reordered.items[0].parts[0].history[1]];check('implementation before assignment',before,reordered,false);
 const archive=structuredClone(after);archive.items[0].parts[0].supersessions![0].prior.assertions=[];check('forged archived assertions',before,archive,false);
 const absent=new Map(files);absent.delete('docs/audit/batches/first/revisions/r1.json');check('missing predecessor snapshot',before,after,false,absent);
 const changed=new Map(files);changed.set('docs/audit/batches/first/revisions/r1.json',JSON.stringify({...first,model:'forged'}));check('altered predecessor snapshot',before,after,false,changed);
 check('replacement is not records-only',before,after,false,files,true);
 const retried=structuredClone(after),rejected=work('cancelled');files.set('docs/audit/batches/cancelled/batch.json',JSON.stringify(rejected));files.set('docs/audit/batches/cancelled/revisions/r1.json',JSON.stringify(rejected));retried.batches.unshift({id:'cancelled',revision:1,frozenHash:frozenHashOf(rejected),status:'rejected',model:'fixture',base,history:['authorized','rejected by Adam'].map(event=>({at,event}))});retried.items[0].parts[0].history.splice(1,0,event('assigned','cancelled'),event('rejected r1','cancelled'));check('cancelled initial assignment then first fix and replacement',before,retried,true);
 const missingReject=structuredClone(retried);missingReject.items[0].parts[0].history=missingReject.items[0].parts[0].history.filter(h=>h.event!=='rejected r1');check('missing cancellation event',before,missingReject,false);
 const released=structuredClone(after),releaseFiles=new Map(files);const releasedFix={...fix,commit:base};
 released.batches[0].status='released';released.batches[0].history.push({at,event:'accepted by Adam'},{at,event:'released'});released.batches[0].release={git:{at,remoteMain:base,commit:base,packageId:'synthetic'},deployment:null,documents:null};
 const replacementWork=work('next',releasedFix);released.batches[1].frozenHash=frozenHashOf(replacementWork);releaseFiles.set('docs/audit/batches/next/batch.json',JSON.stringify(replacementWork));releaseFiles.set('docs/audit/batches/next/revisions/r1.json',JSON.stringify(replacementWork));
 released.items[0].parts[0].supersessions=[{prior:releasedFix,priorStatus:'released',batch:'next',revision:1,hash:frozenHashOf(replacementWork)}];released.items[0].parts[0].history.splice(3,0,event('accepted by Adam','first'),event('released','first'));
 check('first fix released then replaced in one range',before,released,true,releaseFiles);
 return rows;
}
if(import.meta.main){const rows=batch35Controls();console.log(JSON.stringify(rows,null,2));process.exitCode=rows.every(r=>r.ok)?0:1;}
