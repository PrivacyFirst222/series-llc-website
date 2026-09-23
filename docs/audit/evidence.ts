/** Retained source evidence. Captures what ran, including test overlays on an old tree. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {join,dirname,relative,resolve} from 'node:path';
export const evidenceHash=(b:Buffer|string):string=>createHash('sha256').update(b).digest('hex');
export interface SourceEvidence {path:string;sha:string}
const safe=(p:string)=>!!p&&!p.startsWith('/')&&!p.includes('\\')&&p.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
export function captureSource(root:string,dir:string,run:string,expectedCommit?:string,extraChecks:string[]=[]):string {
 if(!run.trim()||run==='local')throw Error('Evidence needs a distinct run identity');
 if(existsSync(dir))throw Error('Source evidence is immutable: '+dir);
 const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:128*1024*1024});
 const commit=git(['rev-parse','HEAD']).trim();
 if(expectedCommit&&commit!==expectedCommit)throw Error('Evidence source commit does not match the claimed commit');
 const names=git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(p=>p&&(/^(webapp\/(src|server|scripts)\/.*\.(ts|tsx|json|md)|docs\/[^/]+\.(py|ts|json|md)|docs\/audit\/[^/]+\.ts|webapp\/(package\.json|bun\.lock|vite\.config\.ts|tsconfig[^/]*\.json))$/.test(p)));
 const files:{path:string;sha:string}[]=[];
 const put=(path:string,bytes:Buffer)=>{if(!safe(path))throw Error('Invalid evidence path');const target=join(dir,'files',path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);files.push({path,sha:evidenceHash(bytes)});};
 for(const name of [...new Set(names)].sort()){const path=join(root,name);if(!existsSync(path)||!lstatSync(path).isFile())throw Error('Missing/nonregular source '+name);put(name,readFileSync(path));}
 for(let i=0;i<extraChecks.length;i++)put('_checks/'+i+'/'+extraChecks[i].split('/').pop(),readFileSync(extraChecks[i]));
 if(!files.length)throw Error('No source captured');
 const manifest=JSON.stringify({schema:1,commit,run,dirty:git(['status','--porcelain','--untracked-files=no']).trim()!=='',files},null,2)+'\n';
 writeFileSync(join(dir,'manifest.json'),manifest);return evidenceHash(manifest);
}
export function verifySource(dir:string,expectedHash:string):string[]{
 const errors:string[]=[];
 try{
  const bytes=readFileSync(join(dir,'manifest.json'));if(evidenceHash(bytes)!==expectedHash)return ['source manifest hash mismatch'];
  const m=JSON.parse(bytes.toString());if(m.schema!==1||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(m.commit)||!m.run||m.run==='local'||!Array.isArray(m.files)||!m.files.length)return ['invalid source manifest'];
  const paths=new Set<string>();
  for(const f of m.files){if(!safe(f.path)||!/^([a-f0-9]{64})$/.test(f.sha)||paths.has(f.path)){errors.push('invalid/duplicate source entry');continue;}paths.add(f.path);const p=join(dir,'files',f.path);if(!lstatSync(p).isFile()||evidenceHash(readFileSync(p))!==f.sha)errors.push('source missing or changed: '+f.path);}
  const actual:string[]=[];const walk=(p:string)=>{for(const n of readdirSync(p)){const f=join(p,n),s=lstatSync(f);if(s.isDirectory())walk(f);else if(s.isFile())actual.push(relative(join(dir,'files'),f).split('\\').join('/'));else errors.push('nonregular evidence file');}};walk(join(dir,'files'));
  if(actual.length!==paths.size||actual.some(p=>!paths.has(p)))errors.push('source file set differs');
 }catch(e){errors.push('source evidence unreadable: '+String(e));}
 return errors;
}
export function packageSourceProblems(packageDir:string,entries:SourceEvidence[]):string[]{
 if(!Array.isArray(entries)||!entries.length)return ['missing source evidence'];
 return entries.flatMap(e=>!safe(e.path)||!/^([a-f0-9]{64})$/.test(e.sha)?['invalid source evidence reference']:verifySource(resolve(packageDir,e.path),e.sha));
}
