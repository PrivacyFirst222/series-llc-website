import {exactAssertions,controlsExpected,wordExpected,billingExpected,recoveryExpected} from '../expected-assertions';
const sets={controls:controlsExpected,word:wordExpected,...billingExpected,...recoveryExpected},assertions=[];
for(const [name,expected] of Object.entries(sets)){
 const rows=expected.map(label=>({label,ok:true}));
 for(const [mutation,candidate,accepted] of [
 ['complete',rows,true],['remove-one',rows.slice(1),false],['one-only',rows.slice(0,1),false],
 ['duplicate',[...rows,rows[0]],false],['unexpected',[...rows,{label:'unexpected assertion',ok:true}],false],
 ['false-result',rows.map((r,i)=>({...r,ok:i!==0})),false],
 ] as const){const ok=exactAssertions([...candidate],expected)===accepted;assertions.push({id:'P10-'+name+'-'+mutation,result:ok?'pass':'fail',...(!ok?{failure_code:'P10-exact-set'}:{})});}
}
console.log('REVIEW_ASSERTIONS:'+JSON.stringify({assertions}));process.exitCode=assertions.every(r=>r.result==='pass')?0:1;
