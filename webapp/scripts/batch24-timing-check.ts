/** B1-N04: real helper and generated PDF output; no services or database. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { form2553Deadline, evaluate2553Timing } from '../src/lib/form2553Timing';
import { buildSElectionPackage } from '../server/s-election';
const notice='The deadline is two months and 15 days from the date the LLC is formed. The exact deadline date may differ based on holidays and weekends, so you should not put off filing it.';
export async function batch24TimingCheck(check:(ok:boolean,label:string,detail?:unknown)=>void, output=process.env.BATCH24_EVIDENCE) {
 const emit=(name:string,ok:boolean,detail?:unknown)=>check(ok,'batch24 '+name,detail);
 const cases:[string,string,string][]=[
 ['2026-01-01','2026-03-16','Sunday rollover'],['2026-01-07','2026-03-23','Saturday rollover'],
 ['2026-02-02','2026-04-17','DC Emancipation Day'],['2026-04-19','2026-07-06','Saturday holiday observed Friday'],
 ['2026-06-24','2026-09-08','Labor Day'],['2026-10-11','2026-12-28','Christmas Friday'],
 ['2026-10-18','2027-01-04','New Year Friday'],['2027-10-17','2028-01-03','next-year New Year observed December31'],
 ['2026-11-30','2027-02-16','weekend then Washington birthday'],['2027-02-02','2027-04-19','Emancipation Friday'],
 ['2028-02-03','2028-04-18','Sunday Emancipation observed Monday'],['2028-11-05','2029-01-19','Saturday inauguration has no Friday substitute'],
 ['2024-11-06','2025-01-21','inauguration and MLK'],['2026-03-01','2026-05-15','ordinary weekday unchanged'],
 ['2026-01-31','2026-04-14','month-end arithmetic'],['2027-12-31','2028-03-15','leap-year arithmetic']];
 for(const [formation,want,label] of cases){const got=form2553Deadline(formation);emit(label,got===want,{formation,got,want});}
 for(const [today,want] of [['2026-03-11','ok'],['2026-03-12','insufficient'],['2026-03-16','insufficient'],['2026-03-17','late']] as const){const got=evaluate2553Timing({formationDate:'2026-01-01',today});emit('five-day preparation guard '+today,got.status===want,{got:got.status,want});}
 const timely=evaluate2553Timing({formationDate:'2026-01-01',today:'2026-03-16',minDays:0});emit('rolled deadline day still timely',timely.status==='ok'&&timely.daysRemaining===0,timely);
 emit('formation ordering retained',evaluate2553Timing({formationDate:'2026-01-02',effectiveDate:'2026-01-01',today:'2026-01-03'}).status==='invalid');
 let invalidDate=false;try{form2553Deadline('2026-02-30');}catch{invalidDate=true;}emit('invalid calendar input rejected',invalidDate);
 for(const today of ['2026-01-02','2026-03-16','2026-03-17']){const t=evaluate2553Timing({formationDate:'2026-01-01',today});const visible=t.message+' '+(t.acknowledgment||'');emit('general timing wording '+today,t.message.includes(notice)&&!visible.includes(t.deadlineDisplay!)&&!visible.includes(t.deadline!),{message:t.message,acknowledgment:t.acknowledgment});}
 const accepted=evaluate2553Timing({formationDate:'2026-01-01',today:'2026-01-02'});emit('filing responsibility acknowledgment retained',!!accepted.acknowledgment?.includes('does not file it for me')&&!!accepted.acknowledgment.includes('two months and 15 days'));
 const details={llcName:'Batch Twenty Four LLC',principalAddress:'1 Main Street, Miami, FL 33131',ein:'881234567',dateIncorporated:'2026-01-01',effectiveDate:'2026-01-01',officerName:'Alice Owner',officerTitle:'Manager',phone:'3055550100',shareholders:[{name:'Alice Owner',address:'1 Main Street, Miami, FL 33131',percentage:100,dateAcquired:'2026-01-01',ssn:'123456789'}]};
 let noEin=false;try{await buildSElectionPackage({...details,ein:''});}catch(e){noEin=String(e).includes('issued EIN');}emit('issued EIN required unchanged',noEin);
 for(const recordCopy of [false,true]){const bytes=await buildSElectionPackage({...details,recordCopy,shareholders:details.shareholders.map(s=>({...s,ssn:recordCopy?'6789':s.ssn}))});const proc=Bun.spawn(['pdftotext','-layout','-','-'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});proc.stdin.write(bytes);proc.stdin.end();const [raw,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);if(code)throw Error('PDF extraction failed: '+err);const text=raw.replace(/\s+/g,' '),name=recordCopy?'record-copy':'filing-package';emit(name+' approved general deadline',text.includes(notice),{text});emit(name+' no calculated deadline',!text.includes('March 15, 2026')&&!text.includes('March 16, 2026')&&!text.includes('DEADLINE:'),{text});emit(name+' real form identity retained',text.includes('88-1234567')&&text.includes('01/01/2026')&&text.includes('Election by a Small Business Corporation'));if(recordCopy)emit('record copy warning retained',text.includes('An election filed with incomplete Social Security numbers is invalid.')&&text.includes('DO NOT FILE THIS COPY'));if(output){mkdirSync(output,{recursive:true});writeFileSync(resolve(output,name+'.pdf'),bytes);writeFileSync(resolve(output,name+'.txt'),raw);}}
}
if(import.meta.main){let failed=0,total=0;await batch24TimingCheck((ok,label,detail)=>{total++;if(!ok)failed++;console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));});console.log(`${total-failed}/${total} Batch24 timing checks passed`);process.exit(failed?1:0);}
