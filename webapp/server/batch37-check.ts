import {fileURLToPath} from 'node:url';
export async function batch37Checks(report:(label:string,ok:boolean,detail?:unknown)=>void){
 const results:{path:string;code:number;rows:unknown;error?:string;ok:boolean}[]=[];
 for(const [command,path,prefix] of [[process.execPath,'./batch37.test.ts','B37UNIT:'],[process.execPath,'../scripts/batch37-walk.ts','B37:'],['python3','../../docs/batch37-word-check.py','B37WORD:']]){
  const child=Bun.spawn([command,fileURLToPath(new URL(path,import.meta.url))],{stdout:'pipe',stderr:'pipe'});
  const [out,error,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  const line=out.split('\n').find(x=>x.startsWith(prefix));const parsed=line?JSON.parse(line.slice(prefix.length)):null;
  const rows=Array.isArray(parsed)?parsed:parsed?.rows;
  results.push({path,code,rows,error:code?error:undefined,ok:code===0&&rows?.length>0&&rows.every((r:{ok:boolean})=>r.ok)});
 }
 report('batch37 approved corrections',results.every(r=>r.ok),results);
}
if(import.meta.main)await batch37Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));process.exitCode=ok?0:1;});
