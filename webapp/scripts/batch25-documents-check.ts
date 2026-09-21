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
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';

// Read actual PDF text/boxes with the project's existing Poppler dependency.
// Read actual stroked signature paths with the already-installed PDF library.
// No Python environment or additional package is needed in CI.
function xmlText(text:string):string {
 return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity:string)=>{
  if(entity.startsWith('#'))return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase()==='x'?2:1),entity[1].toLowerCase()==='x'?16:10));
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[entity.toLowerCase()];
 });
}
async function inspectPdf(bytes:Uint8Array):Promise<Page[]> {
 const proc=Bun.spawn(['pdftotext','-bbox','-','-'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 proc.stdin.write(bytes);proc.stdin.end();
 const [bbox,err,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 if(code)throw Error('PDF inspection failed: '+err);
 const doc=await PDFDocument.load(bytes), pages=[...bbox.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
 if(pages.length!==doc.getPageCount())throw Error('PDF inspection page count mismatch');
 return pages.map((match,index)=>{
  const page=doc.getPages()[index];
  const words=[...match[1].matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/word>/g)].map(m=>({x0:Number(m[1]),top:Number(m[2]),x1:Number(m[3]),bottom:Number(m[4]),text:xmlText(m[5])}));
  const contents=page.node.Contents(), refs=contents instanceof PDFArray?contents.asArray():contents?[contents]:[];
  const streams=refs.map(ref=>{const stream=doc.context.lookup(ref);if(!(stream instanceof PDFRawStream))throw Error('Unsupported PDF content stream');return new TextDecoder().decode(decodePDFRawStream(stream).decode());}).join('\n');
  if(page.getRotation().angle!==0)throw Error('Unsupported rotated PDF geometry');
  // Respect each graphics-state transform: table borders use translated/flipped
  // paths even though the signature rules themselves use page coordinates.
  type Matrix=[number,number,number,number,number,number];
  type Point={x:number;y:number};
  let matrix:Matrix=[1,0,0,1,0,0],point:Point|null=null;
  const stack:Matrix[]=[], pending:{from:Point;to:Point}[]=[],lines:{x0:number;top:number;x1:number;bottom:number}[]=[];
  const transformed=(x:number,y:number):Point=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  for(const raw of streams.split('\n')) {
   const tokens=raw.trim().split(/\s+/),op=tokens.pop(),v=tokens.map(Number);
   if(op==='q')stack.push([...matrix]);
   else if(op==='Q'){const restored=stack.pop();if(!restored)throw Error('Unbalanced PDF graphics state');matrix=restored;}
   else if(op==='cm'){
    if(v.length!==6||v.some(n=>!Number.isFinite(n)))throw Error('Invalid PDF transform');
    const [a,b,c,d,e,f]=matrix,[g,h,i,j,k,l]=v;
    matrix=[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
   }else if(op==='m')point=transformed(v[0],v[1]);
   else if(op==='l'){const next=transformed(v[0],v[1]);if(point)pending.push({from:point,to:next});point=next;}
   else if(op==='S'){
    for(const segment of pending)lines.push({x0:segment.from.x,top:page.getHeight()-segment.from.y,x1:segment.to.x,bottom:page.getHeight()-segment.to.y});
    pending.length=0;point=null;
   }else if(['n','f','f*','B','B*','b','b*'].includes(op??'')){pending.length=0;point=null;}
  }
  if(stack.length)throw Error('Unbalanced PDF graphics state');
  const rules=lines.filter(l=>Math.abs(l.top-l.bottom)<.1&&Math.abs(l.x1-324)<.1&&l.x1-l.x0>100);
  const signatures=rules.filter(l=>Math.abs(l.x0-72)<.1||words.some(w=>Math.abs(w.bottom-l.top)<5&&w.x0<l.x0&&w.text==='By:')).map(l=>({top:l.top,x0:l.x0,following:words.filter(w=>1<w.top-l.top&&w.top-l.top<21&&w.x0<400).map(w=>w.text)}));
  const ink=words.filter(w=>w.top<735&&w.text.trim());
  return {text:words.map(w=>w.text).join(' '),signatures,rules:rules.length,inBounds:ink.every(w=>71<=w.x0&&w.x1<=541&&w.bottom<=722)};
 });
}
type Page = {text:string;signatures:{top:number;x0:number;following:string[]}[];rules:number;inBounds:boolean};
const normal: NewSeriesInput = {companyName:'Audit Coastal Holdings, LLC',seriesName:'Audit Coastal Holdings, LLC - PS Bay Equipment',seriesNumber:'3',purpose:'Own and lease business equipment.',specialTerms:'Keep records of equipment maintenance.',contribution:'$20,000 cash',effectiveDate:'September 25, 2026',memberNames:['Casey Audit','Blair Audit'],managerNames:['Casey Audit','Blair Audit'],memberManaged:false};
const oa: OaInputs = {version:'multi',companyName:'[ALPHA], LLC',principalAddress:'1 Main Street',managerNames:['[MANAGEMENT], LLC'],managerEntitySigners:[{manager:'[MANAGEMENT], LLC',name:'Morgan [MANAGER]',title:'President [ACTING]'}],effectiveDate:'September 1, 2026',amendedRestated:false,priorAgreementDate:null,members:[{name:'[MEMBER], LLC',entitySigner:{name:'Alex [SIGNER]',title:'Member [AUTHORIZED]'},address:'1 Main Street',percentage:100,contribution:'',todBeneficiary:''}],series:[]};
const amendment = {number:1,agreementDate:'September 1, 2026',effectiveDate:'September 21, 2026',mode:'typed' as const,text:'Preserve [RESERVED], A | B, **literal stars**, <angle>, &amp;, $&.\nSecond paragraph stays separate.'};
const statement = {companyName:'[ALPHA], LLC',documentNumber:'L26000123456',signerName:'Alex [SIGNER]',signerTitle:'Manager [ACTING]',date:'September 21, 2026',memberManaged:true};

export async function batch25DocumentsCheck(check:(ok:boolean,label:string,detail?:unknown)=>void, output=process.env.BATCH25_DOCUMENTS_EVIDENCE) {
 const root=resolve(import.meta.dir,'..'), own=!output, dir=output?resolve(output):mkdtempSync(join(tmpdir(),'batch25-documents-'));mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'ordinary-consent-input.json'),JSON.stringify(normal,null,2)+'\n');
 const emit=(name:string,ok:boolean,detail?:unknown)=>check(ok,'batch25 documents '+name,detail);
 async function pdf(name:string,assembled:{markdown:string;title:string;encodedClientText?:boolean}):Promise<Page[]>{const bytes=await renderMarkdownPdf({...assembled,watermark:null});const path=join(dir,name+'.pdf');writeFileSync(path,bytes);writeFileSync(join(dir,name+'.md'),assembled.markdown);const pages=await inspectPdf(bytes);writeFileSync(join(dir,name+'.json'),JSON.stringify(pages)+'\n');return pages;}
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
