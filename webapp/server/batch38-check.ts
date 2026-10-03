import {fileURLToPath} from 'node:url';
export async function batch38Checks(report:(label:string,ok:boolean,detail?:unknown)=>void){
 const results:{path:string;code:number;rows:{ok:boolean}[];error?:string;ok:boolean}[]=[];
 for(const [exe,path,prefix] of [['python3','../../docs/batch38-word-check.py','B38WORD:'],[process.execPath,'./batch38.test.ts','B38TEST:'],[process.execPath,'../scripts/batch38-renewal-check.ts','B38RENEWAL:']]){
  const p=Bun.spawn([exe,fileURLToPath(new URL(path,import.meta.url))],{stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);const line=out.split('\n').find(l=>l.startsWith(prefix));const rows=line?JSON.parse(line.slice(prefix.length)):[];results.push({path,code,rows,error:code?err:undefined,ok:code===0&&rows.length>0&&rows.every((r:{ok:boolean})=>r.ok===true)});
 }
 report('batch38 verification controls',results.every(r=>r.ok),results);
}
if(import.meta.main)await batch38Checks((label,ok,detail)=>{console.log(JSON.stringify({label,ok,detail}));process.exitCode=ok?0:1;});
