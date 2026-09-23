/** Optional Batch34: exact retained inputs, real assembler and PDF pagination. */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import type {OaInputs} from '../server/oa';
import type {NewSeriesInput} from '../server/new-series';

import {execFileSync} from 'node:child_process';
globalThis.fetch=async()=>{throw Error('Batch34 prohibits external access');};
const source=process.env.BATCH34_SOURCE??resolve(import.meta.dir,'..');
const {assembleOa}=await import(source+'/server/oa.ts'),{assembleNewSeries}=await import(source+'/server/new-series.ts'),{renderMarkdownPdf}=await import(source+'/server/pdf-render.ts');
let failed=0,total=0;
const check=(ok:boolean,label:string,detail?:unknown)=>{total++;if(!ok)failed++;console.log('CHECK_RESULT '+JSON.stringify({suite:'batch34',label,ok,commit:process.env.CHECK_COMMIT??'local',run:process.env.CHECK_RUN_ID??'local',...(!ok?{detail}:{})}));};
const owned=!process.env.BATCH34_EVIDENCE,dir=process.env.BATCH34_EVIDENCE?resolve(process.env.BATCH34_EVIDENCE):mkdtempSync(join(tmpdir(),'batch34-'));mkdirSync(dir,{recursive:true});
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
}finally{if(owned)rmSync(dir,{recursive:true,force:true});}
console.log(`${total-failed}/${total} Batch34 checks passed`);if(failed)process.exit(1);
