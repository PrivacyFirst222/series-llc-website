import {captureSource,verifySource} from "../../docs/audit/evidence";
import {randomUUID} from "node:crypto";
import {appendFileSync} from "node:fs";
/** Optional Batch34: exact retained inputs, real assembler and PDF pagination. */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import type {OaInputs} from '../server/oa';
import type {NewSeriesInput} from '../server/new-series';

import {execFileSync} from 'node:child_process';
globalThis.fetch=async()=>{throw Error('Batch34 prohibits external access');};
const source=process.env.BATCH34_SOURCE??resolve(import.meta.dir,'..');
const {assembleOa}=await import(source+'/server/oa.ts'),{assembleNewSeries}=await import(source+'/server/new-series.ts'),{renderMarkdownPdf}=await import(source+'/server/pdf-render.ts');
const actualCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(process.env.CHECK_COMMIT&&process.env.CHECK_COMMIT!==actualCommit)throw Error('Batch34 claimed commit differs from source');
const run=process.env.CHECK_RUN_ID||'batch34-'+randomUUID();
const owned=!process.env.BATCH34_EVIDENCE,dir=process.env.BATCH34_EVIDENCE?resolve(process.env.BATCH34_EVIDENCE):mkdtempSync(join(tmpdir(),'batch34-'));mkdirSync(dir,{recursive:true});
const sourceDir=join(dir,'source'),sourceSha=captureSource(dirname(source),sourceDir,run,actualCommit,[import.meta.filename,...readdirSync(join(import.meta.dir,'fixtures/batch34')).filter(n=>n.endsWith('.json')).sort().map(n=>join(import.meta.dir,'fixtures/batch34',n))]);
writeFileSync(join(dir,'identity.json'),JSON.stringify({commit:actualCommit,run,sourceSha},null,2));
let failed=0,total=0;
const check=(ok:boolean,label:string,detail?:unknown)=>{total++;if(!ok)failed++;const row={suite:'batch34',label,ok,commit:actualCommit,run,sourceSha,...(!ok?{detail}:{})};console.log('CHECK_RESULT '+JSON.stringify(row));appendFileSync(join(dir,'results.jsonl'),JSON.stringify(row)+'\n');};
async function pdf(key:string,a:{markdown:string;title:string;encodedClientText?:boolean}){
 const path=join(dir,key+'.pdf');writeFileSync(path,await renderMarkdownPdf({...a,watermark:null}));writeFileSync(join(dir,key+'.md'),a.markdown);
 const raw=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});writeFileSync(join(dir,key+'.txt'),raw);
 return raw.split('\f').filter(s=>s.trim()).map(s=>s.replace(/\s+/g,' ').trim());
}
try{
 for(const key of ['pdf-1-ordinary','pdf-1-professional','pdf-4-ordinary','pdf-4-professional','pdf-6-professional']){
  const input=JSON.parse(readFileSync(new URL('./fixtures/batch34/'+key+'.json',import.meta.url),'utf8'))as OaInputs;
  const pages=await pdf(key,assembleOa(input));const close=pages.find(p=>p.includes('If no beneficiary is designated, or a designation fails'));
  check(!!close&&close.includes('Transfer on Death designations')&&close.includes('Designating Member')&&close.includes(input.members.at(-1)!.name),`Exhibit A closing section stays together: ${key}`,close);
  check(pages.filter(p=>p.startsWith('SERIES EXHIBIT PS-')).length===input.series.length,`series exhibits keep separate starts: ${key}`);
 }
 const normal:NewSeriesInput={companyName:'Audit Coastal Holdings, LLC',seriesName:'Audit Coastal Holdings, LLC - PS Bay Equipment',seriesNumber:'3',purpose:'Own and lease business equipment.',specialTerms:'Keep records of equipment maintenance.',contribution:'$20,000 cash',effectiveDate:'September 25, 2026',memberNames:['Casey Audit','Blair Audit'],managerNames:['Casey Audit','Blair Audit'],memberManaged:false};
 for(const [key,input]of [['ordinary-consent',normal],['entity-consent',{...normal,memberNames:['Casey Family Holdings Company LLC','Blair Audit'],entitySigners:[{entity:'Casey Family Holdings Company LLC',name:'Casey '+('Longname '.repeat(18))+'Audit',title:'President '+('Executive '.repeat(15))+'Officer'}]}]]as[string,NewSeriesInput][]){
  const pages=await pdf(key,assembleNewSeries(input));const heading=pages.find(p=>/\bMEMBERS?:/.test(p));
  check(!!heading&&heading.includes(key==='ordinary-consent'?'Casey Audit':'Casey Family Holdings Company LLC')&&heading.includes('Date:'),`consent heading stays with first signature: ${key}`,pages);
  check(pages.filter(p=>p.includes('Date:')).length<=2&&pages.join(' ').match(/Date:/g)?.length===2,`consent signature dates preserved: ${key}`);
 }
 // A large closing table must paginate normally rather than overflow or loop.
 const long=JSON.parse(readFileSync(new URL('./fixtures/batch34/pdf-1-ordinary.json',import.meta.url),'utf8'))as OaInputs;
 long.members=Array.from({length:40},(_,i)=>({...long.members[0],name:`Owner Number ${i}`,percentage:2.5,todBeneficiary:`Beneficiary Number ${i}`}));
 const lp=await pdf('long-exhibit',assembleOa(long));check(lp.join(' ').includes('Owner Number 39')&&lp.join(' ').includes('Beneficiary Number 39'),'oversized Exhibit A retains final owner and beneficiary');
 check(verifySource(sourceDir,sourceSha).length===0,'retained check source matches its manifest');
}finally{if(owned)rmSync(dir,{recursive:true,force:true});}
console.log(`${total-failed}/${total} Batch34 checks passed`);if(failed)process.exit(1);
