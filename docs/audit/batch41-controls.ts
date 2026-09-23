/** Synthetic owner records only. Real approvals are never written by this check. */
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import type {Ledger, Item, RulingRecord} from './ledger-lib';
const home=mkdtempSync(join(tmpdir(),'batch41-owner-'));
process.env.FPSLLC_HOME=home;
const lib=await import('./ledger-lib');
const {renderList}=await import('./ledger-print');
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const item=(id:string):Item=>({id,tag:'wording',area:'Agreements and guidance',housekeeping:false,source:'synthetic fixture',text:'Synthetic wording',verdict:'open',waitsOn:[],parts:[{key:'all',scope:'synthetic',status:'open',waitsOn:[],history:[]}]});
const record:RulingRecord={kind:'ruling',item:'fixture',text:'Retain exactly.\nIncluding the second line.',at:'2026-09-23T12:00:00Z',source:'simulated owner'};
writeFileSync(join(home,'rulings.jsonl'),JSON.stringify(record)+'\n');
const l:Ledger={version:2,builtFrom:[],items:[item('fixture')],rulings:[{date:'2026-09-23',kind:'ruling',item:'fixture',text:record.text!}],batches:[]};
const canonical=lib.rulingLine(record), read=(p:string)=>p==='docs/audit/rulings.md'?canonical+'\n':null;
// Before-fix mode uses the real old comparison's observed result; an absent
// new helper is not itself the asserted failure.
const candidate=lib as typeof lib & {rulingCompletenessProblems?:(l:Ledger,r:typeof read,records:RulingRecord[])=>string[]};
const completeness=(v:Ledger,r=read)=>candidate.rulingCompletenessProblems
 ? candidate.rulingCompletenessProblems(v,r,[record]) : lib.ledgerRegressions(v,v,{read:r,external:'skip'});
try {
 check('complete authentic ledger and canonical text pass',completeness(l).length===0,completeness(l));
 const missing=structuredClone(l);missing.rulings=[];
 check('authentic ruling missing from ledger is refused',completeness(missing).some(x=>x.includes('missing')),completeness(missing));
 check('authentic ruling missing from canonical text is refused',completeness(l,()=>null).some(x=>x.includes('canonical')),completeness(l,()=>null));
 const changed=structuredClone(l);changed.rulings[0].text='Retain exactly.';
 check('truncated authentic text is refused',completeness(changed).some(x=>x.includes('exact text')),completeness(changed));
 const wrong=structuredClone(l);wrong.rulings[0].part='other';
 check('wrong part cannot satisfy exact owner ruling',completeness(wrong).length>0,completeness(wrong));
 const partRecord:RulingRecord={...record,part:'all'};
 const partLedger=structuredClone(l);partLedger.rulings[0].part='all';
 const migrated=lib.migrationProjection(partLedger,[{id:'synthetic-split',title:'Synthetic authorized shape',date:'2026-09-23',items:{fixture:{retire:['all'],split:[{key:'one',scope:'one'},{key:'two',scope:'two'}]}}}]);
 const partRead=()=>lib.rulingLine(partRecord)+'\n';
 check('authorized retired part preserves authentic ruling completeness',!!candidate.rulingCompletenessProblems && candidate.rulingCompletenessProblems(migrated,partRead,[partRecord]).length===0 && JSON.stringify(partLedger.rulings)===JSON.stringify(migrated.rulings));
 const unknownRecord={...partRecord,part:'unknown'};
 const unknownLedger=structuredClone(partLedger);unknownLedger.rulings[0].part='unknown';
 check('unknown part remains refused even with matching ruling text',!!candidate.rulingCompletenessProblems && candidate.rulingCompletenessProblems(unknownLedger,()=>lib.rulingLine(unknownRecord)+'\n',[unknownRecord]).some(x=>x.includes('no matching')));
 check('old removal protection remains',lib.ledgerRegressions(l,missing,{read}).some(x=>x.includes('rulings were rewritten')));
 const forged=structuredClone(l);forged.rulings.push({date:'2026-09-23',item:'fixture',text:'Unrecorded fake choice'});
 check('old forged addition protection remains',lib.ledgerRegressions(l,forged,{read}).some(x=>x.includes('no record from Adam')));
 const display=structuredClone(l);display.dispositions=[];display.items[0].waitsOn=['ruling:fixture'];
 display.items.push(item('unsettled'));display.items[1].waitsOn=['ruling:unsettled'];
 const before=JSON.stringify(display),rendered=renderList(display);
 const section=(text:string,id:string)=>text.split(`- **${id}.`)[1]?.split('\n- **')[0]??'';
 check('settled item no longer displays a ruling wait',!section(rendered,'fixture').includes("waits on Adam's ruling"),section(rendered,'fixture'));
 check('unsettled item still displays its ruling wait',section(rendered,'unsettled').includes("waits on Adam's ruling"));
 const partwise=structuredClone(display);partwise.items[0].waitsOn=[];
 partwise.items[0].parts=[{key:'one',scope:'one',status:'open',waitsOn:['ruling:fixture'],history:[]},{key:'two',scope:'two',status:'open',waitsOn:['ruling:fixture'],history:[]}];
 partwise.rulings[0].part='one';const partRender=renderList(partwise);
 check('settled part wait omitted while sibling remains',partRender.includes('Part "one" — open: one\n')&&partRender.includes('Part "two" — open: two (waits on ruling:fixture)'),partRender);
 check('renderer preserves immutable waits and history',JSON.stringify(display)===before);
 const historical=structuredClone(display);delete historical.dispositions;
 check('historical renderer remains explicit about archived waits',section(renderList(historical),'fixture').includes("waits on Adam's ruling"));
 const historicalCommit='761af015e05507c19ec5a458af0cf839637ce8da';
 const history=Bun.spawn(['bun',resolve(import.meta.dir,'guard.ts'),'--against',`${historicalCommit}..${historicalCommit}`],{cwd:resolve(import.meta.dir,'../..'),stdout:'pipe',stderr:'pipe'});
 const [historyOut,historyError,historyExit]=await Promise.all([new Response(history.stdout).text(),new Response(history.stderr).text(),history.exited]);
 check('actual pre41 tracked snapshot passes explicit historical comparison',historyExit===0,{exit:historyExit,stdout:historyOut,stderr:historyError});
 const real=JSON.parse(readFileSync(resolve(import.meta.dir,'ledger.json'),'utf8')) as Ledger;
 const wanted=['8','15','22','34','38','139','N2.14','232','236','N2.02'];
 check('all ten authentic retained choices recorded',wanted.every(id=>real.dispositions?.some(d=>d.item===id&&d.disposition==='owner-retained'&&real.rulings.some(r=>JSON.stringify(r)===JSON.stringify(d.ruling)))),wanted.filter(id=>!real.dispositions?.some(d=>d.item===id)));
 const current=renderList(real);
 check('all ten display owner retained wording',wanted.every(id=>section(current,id).includes('Owner retained the wording')));
 for(const [batch,group] of [['38','b'],['39','c']]) {
  const text=readFileSync(resolve(import.meta.dir,'batches',batch,'batch.md'),'utf8');
  check(`Batch${batch} exact approval and provenance`,text.includes(`after “Load group ${group}”, Adam said “Go. Approve all”`)&&text.includes('was not acceptance of an exact release package')&&text.includes('original conversation was not independently recovered'));
 }
 const d=readFileSync(resolve(import.meta.dir,'batches/40/batch.md'),'utf8');
 check('GroupD exact supplied decision and no fabricated acceptance',d.includes('We technically don’t even have to send it be cause')&&d.includes('> Item 1 is also approved')&&d.includes('was not acceptance of an exact release package'));
 console.log('B41CONTROLS:'+JSON.stringify(rows));
 process.exitCode=rows.every(r=>r.ok)?0:1;
}finally{rmSync(home,{recursive:true,force:true});}
