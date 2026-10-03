/** Read-only reproduction: proposed file text is supplied in memory. No ledger,
 * source, approval record or hook is changed by this probe. */
import {loadLedger,readTree,productFiles,replayStatic} from '../../../ledger-lib';
const ledger=loadLedger(),files=productFiles();
const baseline=replayStatic(ledger,readTree,files);
if(baseline.length)throw new Error('Baseline already fails: '+baseline.join('\n'));
const examples=[
 {name:'Policy update dates',file:'webapp/src/content/terms.md',change:(s:string)=>s.replace('Last updated: **September 20, 2026**','Last updated: **September 21, 2026**'),item:'5'},
 {name:'S-election insertion failure handling',file:'webapp/server/routes-portal.ts',change:(s:string)=>s.replace('  merged.documentId = docRows[0].id;','  if (!docRows.length) throw new Error("Replacement document was not recorded");\n  merged.documentId = docRows[0].id;'),item:'N1.15'},
];
for(const test of examples){
 const source=readTree(test.file)!;const changed=test.change(source);if(source===changed)throw new Error('Probe did not change the intended text');
 const failures=replayStatic(ledger,f=>f===test.file?changed:readTree(f),files);
 if(!failures.some(f=>f.startsWith(`item ${test.item}:`)))throw new Error('Expected exact assertion refusal was absent');
 const item=ledger.items.find(i=>i.id===test.item)!;
 console.log(JSON.stringify({probe:test.name,baselinePassed:true,refusals:failures,parts:item.parts.map(p=>({key:p.key,status:p.status,batch:p.batch})),replacementEligibility:'accept.ts and batch.ts require status released; these parts remain implemented. No approval command was invoked.'}));
}
