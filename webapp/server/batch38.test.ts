import {readFileSync,writeFileSync,mkdtempSync,rmSync,cpSync,symlinkSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dir,'../..'),web=join(root,'webapp');
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const attempt=async(label:string,f:()=>Promise<void>)=>{try{await f();}catch(e){check(label,false,String(e));}};
await attempt('contribution provenance',async()=>{
 const {inputsFor,contributedCells}=await import('./provenance');
 for(const [version,mode] of [['single','equal'],['multi','equal'],['multi','shares'],['multi','joint']] as const){const input=inputsFor(version,mode);if(!input.assets)throw Error("Contribution fixture missing assets");for(const asset of input.assets){const row=`| ${asset.description} | ${asset.value} | ${asset.by} | ${asset.to} |`;check(`real contribution cell ${version}/${mode}`,contributedCells(row,input.assets).includes('| [ASSET BY] |'),row);check(`altered contribution refused ${version}/${mode}`,!contributedCells(row.replace(asset.by,'Wrong Contributor (1/7)'),input.assets).includes('| [ASSET BY] |'));} }
});
await attempt('retained evidence mutations',async()=>{
 const {captureSource,verifySource}=await import('../../docs/audit/evidence');const dir=mkdtempSync(join(tmpdir(),'b38-source-'));try{
  const path=join(dir,'snapshot'),sha=captureSource(root,path,'b38-'+crypto.randomUUID());check('source snapshot validates',verifySource(path,sha).length===0);
  const m=JSON.parse(readFileSync(join(path,'manifest.json'),'utf8')),f=join(path,'files',m.files[0].path),original=readFileSync(f);
  writeFileSync(f,Buffer.concat([original,Buffer.from('\nchanged')]));check('edited check source rejected',verifySource(path,sha).length>0);
  writeFileSync(f,original);unlinkSync(f);check('missing check source rejected',verifySource(path,sha).length>0);writeFileSync(f,original);
  writeFileSync(join(path,'manifest.json'),'{}');check('replaced manifest rejected',verifySource(path,sha).length>0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
await attempt('fresh build after source change',async()=>{
 const {freshSite}=await import('../scripts/fresh-site');const dir=mkdtempSync(join(tmpdir(),'b38-site-'));try{symlinkSync(join(web,'node_modules'),join(dir,'node_modules'));writeFileSync(join(dir,'package.json'),'{"type":"module"}');writeFileSync(join(dir,'index.html'),'<div>OLD BUILD MARKER</div>');await freshSite(dir);writeFileSync(join(dir,'index.html'),'<div>NEW SOURCE MARKER</div>');await freshSite(dir);const html=readFileSync(join(dir,'dist/index.html'),'utf8');check('stale build replaced from current source',html.includes('NEW SOURCE MARKER')&&!html.includes('OLD BUILD MARKER'));
 const {chromium}=await import('playwright');const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response(html,{headers:{'Content-Type':'text/html'}});}}),browser=await chromium.launch();try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);const displayed=await page.locator('body').innerText();check('browser sees changed source, not stale build',displayed.includes('NEW SOURCE MARKER')&&!displayed.includes('OLD BUILD MARKER'));}finally{await browser.close();server.stop(true);}
 const source=readFileSync(join(web,'scripts/behavioral.ts'),'utf8');check('standalone walk always invokes fresh build',source.includes('await freshSite(process.cwd())')&&!source.includes('using existing dist/'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
// Real route test in a disposable source copy: no edit to the working tree.
await attempt('required module import failure',async()=>{
 const outer=mkdtempSync(join(tmpdir(),'b38-missing-module-')),dir=join(outer,'webapp');mkdirSync(dir);try{
  cpSync(join(root,'docs'),join(outer,'docs'),{recursive:true});
  cpSync(join(web,'server'),join(dir,'server'),{recursive:true});cpSync(join(web,'src'),join(dir,'src'),{recursive:true});symlinkSync(join(web,'node_modules'),join(dir,'node_modules'));writeFileSync(join(dir,'package.json'),'{"type":"module"}');cpSync(join(web,'tsconfig.app.json'),join(dir,'tsconfig.json'));
  const path=join(dir,'server/batch28-check.ts'),source=readFileSync(path,'utf8');const needle="storageModule=await import('./s-election-package-storage')";if(!source.includes(needle))throw Error('Mutation target missing');writeFileSync(path,source.replace(needle,"storageModule=await import('./missing-required-storage-probe')"));
  const p=Bun.spawn([process.execPath,'server/batch28-check.ts'],{cwd:dir,env:{...process.env,BATCH28_BASELINE_COMMIT:''},stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  check('current candidate refuses failed required-module import',code!==0&&(out+err).includes('Required current package-storage module could not load'),{code,detail:(out+err).slice(-1500)});
 }finally{rmSync(outer,{recursive:true,force:true});}
});
check('conservative inactive-name label retained',readFileSync(join(web,'server/e2e.ts'),'utf8').includes('recently inactive entity is held under the service’s conservative name-availability rule'));
console.log('B38TEST:'+JSON.stringify(rows));process.exit(rows.every(r=>r.ok)?0:1);
