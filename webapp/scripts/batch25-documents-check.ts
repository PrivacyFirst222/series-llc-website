/** B7-CLIENT-TEXT-AS-SLOT and B5-CONSENT-SIGNATURE-PAGINATION.
 * Actual generated PDF text and geometry, plus fault-injected real masters. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { assembleAmendment } from '../server/oa-amendment';
import { assembleStatement } from '../server/statement';
import { assembleNewSeries, type NewSeriesInput } from '../server/new-series';
import { renderMarkdownPdf } from '../server/pdf-render';
import { englishTextError } from '../src/lib/englishText';
import type { OaInputs } from '../server/oa';

const inspect = String.raw`import json,sys,pdfplumber
out=[]
with pdfplumber.open(sys.argv[1]) as pdf:
 for p in pdf.pages:
  text=p.extract_text() or ''
  words=p.extract_words()
  rules=[l for l in p.lines if abs(l['top']-l['bottom'])<.1 and abs(l['x1']-324)<.1 and l['x1']-l['x0']>100]
  sig=[]
  for l in rules:
   label=[w['text'] for w in words if abs(w['bottom']-l['top'])<5 and w['x0']<l['x0']]
   if abs(l['x0']-72)<.1 or 'By:' in label:
    following=[w for w in words if 1<w['top']-l['top']<21 and w['x0']<400]
    sig.append({'top':l['top'],'x0':l['x0'],'following':[w['text'] for w in following]})
  ink=[c for c in p.chars if c['top']<735 and not c['text'].isspace()]
  out.append({'text':text,'signatures':sig,'rules':len(rules),'inBounds':all(71<=c['x0'] and c['x1']<=541 and c['bottom']<=722 for c in ink)})
print(json.dumps(out))`;
type Page = {text:string;signatures:{top:number;x0:number;following:string[]}[];rules:number;inBounds:boolean};
const normal: NewSeriesInput = {companyName:'Audit Coastal Holdings, LLC',seriesName:'Audit Coastal Holdings, LLC - PS Bay Equipment',seriesNumber:'3',purpose:'Own and lease business equipment.',specialTerms:'Keep records of equipment maintenance.',contribution:'$20,000 cash',effectiveDate:'September 25, 2026',memberNames:['Casey Audit','Blair Audit'],managerNames:['Casey Audit','Blair Audit'],memberManaged:false};
const oa: OaInputs = {version:'multi',companyName:'[ALPHA], LLC',principalAddress:'1 Main Street',managerNames:['[MANAGEMENT], LLC'],managerEntitySigners:[{manager:'[MANAGEMENT], LLC',name:'Morgan [MANAGER]',title:'President [ACTING]'}],effectiveDate:'September 1, 2026',amendedRestated:false,priorAgreementDate:null,members:[{name:'[MEMBER], LLC',entitySigner:{name:'Alex [SIGNER]',title:'Member [AUTHORIZED]'},address:'1 Main Street',percentage:100,contribution:'',todBeneficiary:''}],series:[]};
const amendment = {number:1,agreementDate:'September 1, 2026',effectiveDate:'September 21, 2026',mode:'typed' as const,text:'Preserve [RESERVED], A | B, **literal stars**, <angle>, &amp;, $&.\nSecond paragraph stays separate.'};
const statement = {companyName:'[ALPHA], LLC',documentNumber:'L26000123456',signerName:'Alex [SIGNER]',signerTitle:'Manager [ACTING]',date:'September 21, 2026',memberManaged:true};

export async function batch25DocumentsCheck(check:(ok:boolean,label:string,detail?:unknown)=>void, output=process.env.BATCH25_DOCUMENTS_EVIDENCE) {
 const root=resolve(import.meta.dir,'..'), own=!output, dir=output?resolve(output):mkdtempSync(join(tmpdir(),'batch25-documents-'));mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'pdf_geometry.py'),inspect);writeFileSync(join(dir,'ordinary-consent-input.json'),JSON.stringify(normal,null,2)+'\n');
 const emit=(name:string,ok:boolean,detail?:unknown)=>check(ok,'batch25 documents '+name,detail);
 async function pdf(name:string,assembled:{markdown:string;title:string;encodedClientText?:boolean}):Promise<Page[]>{const bytes=await renderMarkdownPdf({...assembled,watermark:null});const path=join(dir,name+'.pdf');writeFileSync(path,bytes);writeFileSync(join(dir,name+'.md'),assembled.markdown);const proc=Bun.spawn(['python3',join(dir,'pdf_geometry.py'),path],{stdout:'pipe',stderr:'pipe'});const [text,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);if(code)throw Error('PDF inspection failed: '+err);writeFileSync(join(dir,name+'.json'),text+'\n');return JSON.parse(text);}
 async function attempt(label:string,fn:()=>Promise<void>){try{await fn();}catch(e){const labels:Record<string,string[]>={'amendment accepted bracket values render':['amendment accepted bracket values render','amendment typed punctuation literal','amendment typed paragraphs preserved','amendment title decoded','amendment no encoded entities leak'],'statement accepted bracket values render':['statement accepted bracket values render','statement title decoded','statement no encoded entities leak']};for(const name of labels[label]??[label])emit(name,false,String(e));}}
 try {
  emit('bracketed names satisfy existing alphabet policy',englishTextError(oa.companyName)===null&&englishTextError(statement.signerName)===null);
  await attempt('amendment accepted bracket values render',async()=>{const a=assembleAmendment(oa,amendment),pages=await pdf('amendment-brackets',a),text=pages.map(p=>p.text).join(' ').replace(/\s+/g,' ');emit('amendment accepted bracket values render',['[ALPHA], LLC','[MEMBER], LLC','Alex [SIGNER]','[MANAGEMENT], LLC','Morgan [MANAGER]','President [ACTING]'].every(t=>text.includes(t)),{text});emit('amendment typed punctuation literal',text.includes('Preserve [RESERVED], A | B, **literal stars**, <angle>, &amp;, $&.'),{text});emit('amendment typed paragraphs preserved',a.markdown.includes('\n\nSecond paragraph stays separate.'));emit('amendment title decoded',a.title.endsWith('[ALPHA], LLC'));emit('amendment no encoded entities leak',!text.includes('&#91;')&&!text.includes('&#124;'));});
  await attempt('statement accepted bracket values render',async()=>{const a=assembleStatement(statement),pages=await pdf('statement-brackets',a),text=pages.map(p=>p.text).join(' ').replace(/\s+/g,' ');emit('statement accepted bracket values render',['[ALPHA], LLC','Alex [SIGNER]','Manager [ACTING]'].every(t=>text.includes(t)),{text});emit('statement title decoded',a.title.endsWith('[ALPHA], LLC'));emit('statement no encoded entities leak',!text.includes('&#91;'));});
  for(const mode of ['typed','attached'] as const) await attempt('amendment '+mode+' ordinary control',async()=>{const a=assembleAmendment({...oa,companyName:'Ordinary Company LLC',managerNames:[],managerEntitySigners:[],version:'member-single',members:[{...oa.members[0],name:'Ordinary Owner',entitySigner:undefined}]},{...amendment,mode});const pages=await pdf('amendment-'+mode,a),text=pages.map(p=>p.text).join(' ');emit('amendment '+mode+' ordinary control',text.includes('Ordinary Company LLC')&&(mode==='typed'?text.includes('Second paragraph stays separate.'):text.includes('Exhibit A attached to this Amendment')));});
  for(const marker of ['[COMPANY NAME]','[SIGNER NAME]','[[indent]]','[[pagebreak]]','Form document','&#91;FAKE&#93;','By: __________']) await attempt('literal client marker '+marker,async()=>{
   const input={...oa,version:'member-single' as const,managerNames:[],managerEntitySigners:[],companyName:marker+', LLC',members:[{...oa.members[0],name:marker,entitySigner:undefined}]};
   const a=assembleAmendment(input,{...amendment,text:marker+'\n# Literal heading\n| Literal | bars |'}),ap=await pdf('literal-amendment-'+marker.replace(/[^a-z0-9]/gi,'_'),a),at=ap.map(p=>p.text).join(' ').replace(/\s+/g,' ');
   const sp=await pdf('literal-statement-'+marker.replace(/[^a-z0-9]/gi,'_'),assembleStatement({...statement,companyName:marker+', LLC',signerName:marker,signerTitle:marker})),st=sp.map(p=>p.text).join(' ').replace(/\s+/g,' ');
   emit('literal client marker '+marker,at.includes(marker)&&at.includes('# Literal heading')&&at.includes('| Literal | bars |')&&st.includes(marker)&&ap.length===2&&sp.length===1,{at,st,amendmentPages:ap.length,statementPages:sp.length});
  });
  for(const blank of [' ','\n\r','\t\n']) {
   let a='',b='',c='';try{assembleAmendment(oa,{...amendment,text:blank});}catch(e){a=String(e);}try{assembleAmendment(oa,{...amendment,agreementDate:blank});}catch(e){b=String(e);}try{assembleStatement({...statement,signerName:blank});}catch(e){c=String(e);}
   emit('raw blank required fields rejected '+JSON.stringify(blank),a.includes('typed changes are empty')&&b.includes('effective date is required')&&c.includes('signerName is required'),{a,b,c});
  }
  // A real master with a planted unknown slot must still refuse, rather than
  // weakening the post-interpolation guard to make bracket clients succeed.
  // Materialize every fault module before the first dynamic import. Bun 1.3.14
  // can fail to resolve a second file created later in the same fresh directory,
  // even when that file exists. Keep the real master faults and checks unchanged.
  const faultModules: {kind:string;modulePath:string}[]=[];
  for(const kind of ['oa-amendment','statement']) {const built=await Bun.build({entrypoints:[join(root,'server',kind+'.ts')],target:'bun',plugins:[{name:'fault-injected-master',setup(b){b.onLoad({filter:/\.md$/},args=>({contents:readFileSync(args.path,'utf8')+(args.path.endsWith(kind==='statement'?'templates-statement-of-authorized-representative.md':'templates-oa-amendment.md')?'\n[UNFILLED SLOT]\n':''),loader:'text'}));}}]});if(!built.success)throw Error('Fault fixture could not build: '+built.logs.join('\n'));const modulePath=join(dir,kind+'-fault.mjs');await Bun.write(modulePath,built.outputs[0]);faultModules.push({kind,modulePath});}
  for(const {kind,modulePath} of faultModules) {const faulty=await import(modulePath);let reason='';try{if(kind==='statement')faulty.assembleStatement(statement);else faulty.assembleAmendment(oa,amendment);}catch(e){reason=String(e);}emit(kind+' genuine unresolved master slot refused',/unfilled|left unfilled/.test(reason)&&reason.includes('UNFILLED SLOT'),reason);}
  for(const [name,input] of [ ['ordinary-consent',normal], ['long-person-consent',{...normal,memberNames:['Casey '+('Longname '.repeat(22))+'Audit', 'Blair Audit']}], ['entity-consent',{...normal,memberNames:['Casey Family Holdings Company LLC','Blair Audit'],entitySigners:[{entity:'Casey Family Holdings Company LLC',name:'Casey '+('Longname '.repeat(18))+'Audit',title:'President '+('Executive '.repeat(15))+'Officer'}]}]] as [string,NewSeriesInput][]) await attempt(name+' signature units',async()=>{const pages=await pdf(name,assembleNewSeries(input)),sigs=pages.flatMap(p=>p.signatures);emit(name+' every signature rule has its printed signer below on same page',sigs.length===4&&sigs.every(s=>s.following.length>0),{pages:pages.map(p=>({signatures:p.signatures,text:p.text}))});emit(name+' signature ink stays within margins',pages.every(p=>p.inBounds),pages.map(p=>({inBounds:p.inBounds,text:p.text})));emit(name+' all member signature dates retained',pages.reduce((n,p)=>n+(p.text.match(/Date:/g)?.length??0),0)===2);if(name==='ordinary-consent'){emit('ordinary consent has no added blank signature page',pages.length<=4&&pages.every(p=>p.text.replace(/Page \d+ of \d+|\[INTENTIONALLY LEFT BLANK\]/g,'').trim().length>0));emit('ordinary consent members remain with signature dates',pages.filter(p=>p.text.includes('Date:')).every(p=>p.text.includes('Casey Audit')||p.text.includes('Blair Audit')));}});
  const padded=Array.from({length:28},(_,i)=>'Filler '+i).join('\n');
  for(const [name,block] of [['person','_____________________________\n'+('Long '.repeat(30))+'Signer\nDate: _____________________________'],['entity','Holding '+('Company '.repeat(20))+'LLC\n\nBy: _____________________________\n[[indent]]'+('Long '.repeat(25))+'Signer\n[[indent]]'+('Long '.repeat(25))+'Title\nDate: _____________________________'],['token','_____________________________\n'+'A'.repeat(250)+'\nDate: _____________________________']])await attempt(name+' near-boundary block',async()=>{const pages=await pdf('boundary-'+name,{markdown:padded+'\n'+block,title:'Boundary signature fixture'});const p=pages.filter(p=>p.signatures.length);emit(name+' near-boundary complete block together',p.length===1&&p[0].text.includes('Date:')&&p[0].signatures.every(s=>s.following.length>0),pages);emit(name+' near-boundary fits margins',pages.every(p=>p.inBounds),pages);});
  let oversized='';try{await renderMarkdownPdf({markdown:'_____________________________\n'+('Longname '.repeat(2000))+'Signer\nDate: _____________________________',title:'Oversized signature',watermark:null});}catch(e){oversized=String(e);}emit('oversized unit refuses without clipping or pagination loop',/signature.*too tall|signature.*fit/i.test(oversized),oversized);
  emit('portal amendment renderer forwards encoding flag',/encodedClientText:\s*assembled\.encodedClientText/.test(readFileSync(join(root,'server/routes-portal.ts'),'utf8').split('const assembled = assembleAmendment')[1]?.split('} catch')[0] ?? ''));
  emit('office Statement renderer forwards encoding flag',/renderMarkdownPdf\(\{\s*markdown,\s*encodedClientText,/.test(readFileSync(join(root,'server/routes-admin.ts'),'utf8')));
 } finally {if(own)rmSync(dir,{recursive:true,force:true});}
}
if(import.meta.main){let total=0,failed=0;await batch25DocumentsCheck((ok,label,detail)=>{total++;if(!ok)failed++;console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));});console.log(`${total-failed}/${total} Batch25 document checks passed`);process.exit(failed?1:0);}
