import {exactAssertions,controlsExpected,wordExpected} from '../../docs/audit/expected-assertions';
import {resolve} from 'node:path';
type Check=(label:string,ok:boolean,detail?:unknown)=>void;
async function run(command:string[],prefix:string,expected:readonly string[]){
 const child=Bun.spawn(command,{cwd:resolve(import.meta.dir,'../..'),stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const lines=stdout.split('\n').filter(s=>s.startsWith(prefix));
 let rows:{label:string;ok:boolean;detail?:unknown}[]=[];
 try{if(lines.length===1)rows=JSON.parse(lines[0].slice(prefix.length));}catch{/* malformed results fail closed */}
 return {ok:exit===0&&exactAssertions(rows,expected),rows,exit,stderr,raw:lines.length===1?undefined:stdout};
}
export async function batch41ControlsChecks(check:Check){
 const controls=await run(['bun','docs/audit/batch41-controls.ts'],'B41CONTROLS:',controlsExpected);
 check('batch41 ruling completeness and settled display',controls.ok,controls);
 const python=process.env.PYTHON??'python3';
 const docs=await run([python,'docs/batch41-word-check.py'],'B41DOCS:',wordExpected);
 check('batch41 Manual company filing and signature grouping',docs.ok,docs);
}
if(import.meta.main)await batch41ControlsChecks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail},null,2));if(!ok)process.exitCode=1;});
