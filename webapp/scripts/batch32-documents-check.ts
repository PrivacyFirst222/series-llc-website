/** Batch32: render-2553-address-split, render-manual-double-page-numbers,
 * render-capital-equal-couple-wording, render-wrap-line-starts-with-punctuation. */
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { buildSElectionPackage } from '../server/s-election';
import { renderManualPdf } from '../server/manual-pdf';
import { stampExistingPdf, wrapSegs, drawnWidth, renderMarkdownPdf } from '../server/pdf-render';
import { computeCapital } from '../server/oa-capital';

let failed=0,total=0;
function check(label:string,ok:boolean,detail?:unknown){total++;if(!ok)failed++;console.log('CHECK_RESULT '+JSON.stringify({suite:'batch32-documents',label,ok,detail,commit:process.env.CHECK_COMMIT??'',run:process.env.CHECK_RUN_ID??''}));}
async function extract(bytes:Uint8Array, name:string){
 const out=process.env.BATCH32_EVIDENCE;
 if(out){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${name}.pdf`,bytes);}
 const p=Bun.spawn(['pdftotext','-layout','-','-'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});p.stdin.write(bytes);p.stdin.end();
 const [text,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err);
 if(out)writeFileSync(`${out}/${name}.txt`,text);return text;
}
async function routeProof(){
 const {app}=await import('../server/app'),{getDb}=await import('../server/db'),{newToken}=await import('../server/crypto');
 globalThis.fetch=(async()=>{throw Error('Unexpected external request in Batch32 fixture');}) as typeof fetch;
 const proof=await(await app.request('/api/dev/env-summary')).json();
 if(!proof.data?.offline||Object.values(proof.data.externals).some(Boolean))throw Error('Offline proof failed');
 console.log('OFFLINE_PROOF '+JSON.stringify(proof));
 const db=await getDb(),token=newToken(),id=crypto.randomUUID();
 await db.query("INSERT INTO clients(id,email,name)VALUES($1,'batch32@example.test','Document Fixture')",[id]);
 await db.query("INSERT INTO sessions(token_hash,client_id,expires_at)VALUES($1,$2,now()+interval '1 day')",[token.tokenHash,id]);
 const request=()=>app.request('/api/portal/library/owners-manual/download',{headers:{Cookie:`fpsllc_session=${token.token}`}});
 const response=await request();if(!response.ok)throw Error('Download failed '+response.status);
 const text=await extract(new Uint8Array(await response.arrayBuffer()),'portal-manual');
 const numbers=text.match(/Page\s+\d+\s+of\s+\d+/g)??[];
 check('actual portal download: one consecutive body-relative page number per body page',numbers.length>20&&numbers.every((v,i)=>v===`Page ${i+1} of ${numbers.length}`)&&!text.split('\f').slice(0,2).some(p=>/Page\s+\d+\s+of/.test(p)),numbers);
 check('actual portal download retains copyright',text.includes('Copyright FLORIDA PROTECTED SERIES, LLC - PS 1'));
 const {putFile}=await import('../server/storage');const custom=await PDFDocument.create();const page=custom.addPage();const f=await custom.embedFont(StandardFonts.Helvetica);page.drawText('Office replacement - page iv',{font:f,x:72,y:100});const bytes=await custom.save();
 const stored=await putFile('replacement.pdf',new Uint8Array(bytes).buffer,'application/pdf');
 await db.query("UPDATE library_documents SET storage_key=$1,meta=$2 WHERE key='owners-manual'",[stored.storageKey,JSON.stringify({pinned:true})]);
 const replacement=await request(),copy=await extract(new Uint8Array(await replacement.arrayBuffer()),'portal-uploaded-manual');
 check('uploaded Manual preserved and licensed without added pagination',copy.includes('Office replacement - page iv')&&copy.includes('Copyright FLORIDA')&&!/Page \d+ of/.test(copy));
 console.log(`${total-failed}/${total} Batch32 route checks passed`);
}
if(process.argv.includes('--route-child')){await routeProof();process.exit(failed?1:0);}
const temp=mkdtempSync('/tmp/batch32-documents-');
try{
 const child=Bun.spawn(['bun',import.meta.filename,'--route-child'],{env:{...process.env,E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:temp+'/db',DEV_STORAGE_DIR:temp+'/storage',DEV_MIRROR_DIR:temp+'/mirror'},stdout:'pipe',stderr:'pipe'});
 const[out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);console.log(out);if(code)throw Error('Offline route checks failed: '+err);
}finally{rmSync(temp,{recursive:true,force:true});}

const input={llcName:'Address Fixture LLC',principalAddress:'100 Ocean Drive, Suite 400, Miami, FL, 33139',ein:'123456789',dateIncorporated:'2026-01-01',effectiveDate:'2026-01-01',officerName:'Alex Owner',officerTitle:'President',phone:'3055550123',shareholders:[{name:'Alex Owner',address:'100 Ocean Drive, Miami, FL 33139',percentage:100,dateAcquired:'2026-01-01',ssn:'123456789'}]};
for(const [name,details] of Object.entries({legacy:input,structured:{...input,principalAddress:'obsolete address',principalAddressParts:{address1:'100 Ocean Drive',address2:'Suite 400',city:'Miami',state:'FL',zip:'33139'}}})){
 const text=await extract(await buildSElectionPackage(details),`address-${name}`);
 const lines=text.split('\n').map(l=>l.trim());
 check(`render-2553-address-split ${name}: both form and letter retain correct address lines`,lines.filter(l=>l.startsWith('100 Ocean Drive, Suite 400')&&!l.includes('Miami')).length===2&&lines.filter(l=>l.startsWith('Miami, FL 33139')).length===2,lines.filter(l=>/Ocean|Miami|33139/.test(l)));
}
const md=readFileSync(new URL('../../docs/owners-manual.md',import.meta.url),'utf8');const manual=await renderManualPdf(md);
const original=await extract(manual.pdf,'manual-original');
const stamped=await extract(await stampExistingPdf({bytes:manual.pdf,title:'Manual',watermark:{name:'Test Owner',email:'owner@example.test'},preservePageNumbers:true}),'manual-stamped');
check('render-manual-double-page-numbers: exactly the original body numbering',JSON.stringify(original.match(/Page\s+\d+\s+of\s+\d+/g))===JSON.stringify(stamped.match(/Page\s+\d+\s+of\s+\d+/g))&& !/Page\s+\d+\s+of/.test(stamped.split('\f').slice(0,2).join('')), {before:original.match(/Page\s+\d+\s+of\s+\d+/g),after:stamped.match(/Page\s+\d+\s+of\s+\d+/g)});
check('manual copyright retained on every page',stamped.split('Copyright FLORIDA PROTECTED SERIES, LLC - PS 1').length-1===manual.pages);
const assets=[{description:'Cash',kind:'cash' as const,value:600,contributedBy:{mode:'equal' as const},cashAllocations:[]}];
const names=['Sam Ortiz and Riley Ortiz','Casey Member'];
const capital=computeCapital(assets,names,[],[true,false]);
check('render-capital-equal-couple-wording: two ownership units, not three people',capital.assetRows[0].by==='Sam Ortiz and Riley Ortiz (jointly: 1/2); Casey Member (1/2).'&&capital.memberContributions.join('|')==='$300|$300',capital);
const thirds=computeCapital(assets,[...names,'Third Member'],[],[true,false,false]);
check('exact thirds and unchanged values',thirds.assetRows[0].by==='Sam Ortiz and Riley Ortiz (jointly: 1/3); Casey Member (1/3); Third Member (1/3).'&&thirds.memberContributions.join('|')==='$200|$200|$200',thirds.assetRows[0]);
await extract(await renderMarkdownPdf({markdown:'# Contributions\n\n| Asset | Value | Contributed by |\n|---|---|---|\n| Cash | $600 | '+capital.assetRows[0].by+' |',watermark:null,title:'Contributions'}),'capital');
const doc=await PDFDocument.create();const fonts={regular:await doc.embedFont(StandardFonts.TimesRoman),bold:await doc.embedFont(StandardFonts.TimesRomanBold),italic:await doc.embedFont(StandardFonts.TimesRomanItalic),boldItalic:await doc.embedFont(StandardFonts.TimesRomanBoldItalic)};
const segs=[{text:'Before ',bold:false,italic:false},{text:'Company',bold:true,italic:false},{text:', after.',bold:false,italic:false}];
const width=drawnWidth(fonts.regular,'Before ',11)+drawnWidth(fonts.bold,'Company',11)+1;
const lines=wrapSegs(fonts,segs,width,11);const textLines=lines.map(l=>l.map(s=>s.text).join(''));
check('render-wrap-line-starts-with-punctuation: styled word and comma move together',!textLines.some(l=>/^\s*[,.;:!?)]/.test(l))&&textLines.some(l=>l.startsWith('Company,')),textLines);
check('wrapped text within margin with no lost text',lines.every(l=>l.reduce((w,s)=>w+drawnWidth(s.bold?fonts.bold:fonts.regular,s.text.trimEnd(),11),0)<=width+0.01)&&textLines.join(' ').replace(/\s+/g,' ').trim()==='Before Company, after.',textLines);
console.log(`${total-failed}/${total} Batch32 document checks passed`);process.exit(failed?1:0);
