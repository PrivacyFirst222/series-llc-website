import {mkdirSync,writeFileSync} from 'node:fs';
const R=process.env.CHUNK2_WEBAPP!,E=process.env.CHUNK2_OUTPUT!,run=process.argv[2]||'formats';
if(!R||!E)throw Error('Explicit isolated output and code paths required');
const tmp=E+'/fixtures/'+run+'-'+Date.now();mkdirSync(tmp,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:tmp+'/db',DEV_STORAGE_DIR:tmp+'/files',DEV_MIRROR_DIR:tmp+'/mirror'});
globalThis.fetch=Object.assign(async()=>{throw Error('No network permitted')}, {
  preconnect:()=>{throw Error('No network permitted')},
});
const {getDb}=await import(R+'/server/db.ts');const db:import('./db').Db=await getDb();
const rows:{name:string;company:string;expected:string;owner:boolean}[]=[];
const punctuation=Array.from({length:94},(_,i)=>String.fromCharCode(i+33)).filter(c=>!/^[a-z0-9]$/i.test(c));
const separators=[' ',...punctuation,' – ',' — ',' ‐ ',' ‑ ',' · ',' / : ','\t','\n','　','：','；','、','。'];
const wrappers=[['(',')'],['[',']'],['{','}'],['<','>'],['"','"'],["'","'"],['`','`'],['«','»'],['‹','›'],['“','”'],['‘','’'],['「','」'],['『','』'],['【','】'],['〈','〉'],['《','》'],['〔','〕'],['（','）'],['［','］'],['｛','｝'],['＜','＞']];
const labels=['A','AN','THE','7','001','1','A-B','A B','A/B','A.B','A&B','A(B)','A()B','O’Neil',"O'Neil",'$A','!A','A!','ASP.S.en'];
for(const company of ['Fixture, LLC','ACME_%, LLC',"O’Neil & Sons, LLC",'The PS Company, LLC']) for(const label of labels){
 const expected=label.toLowerCase();
 for(const designation of ['PS','P.S.','PS.','P.S','Protected Series']){
  for(const sep of separators)rows.push({name:company+sep+designation+' '+label,company,expected,owner:true});
  for(const [open,close] of wrappers)for(const suffix of [open+designation+' '+label+close,open+designation+close+' '+label,label+' '+open+designation+close]){
   rows.push({name:company+' : '+suffix,company,expected,owner:true});rows.push({name:suffix,company,expected,owner:false});
  }
  rows.push({name:company+' - '+designation+' '+label,company,expected,owner:true});
 }
}
const failures:unknown[]=[];let total=0;
for(let offset=0;offset<rows.length;offset+=400){
 const batch=rows.slice(offset,offset+400);const actual=await db.query<{name:string;company:string;key:string;owner:boolean}>(`SELECT name,company,purchase_series_key(name,company) AS key,purchase_series_owner_end(name,company)>0 AS owner FROM jsonb_to_recordset($1::jsonb) AS q(name text,company text)`,[JSON.stringify(batch)]);
 for(let i=0;i<batch.length;i++){total++;if(actual[i].key!==batch[i].expected||actual[i].owner!==batch[i].owner)failures.push({expected:batch[i],actual:actual[i]});}
}
const result={total,passed:total-failures.length,failed:failures.length,failures,contract:'Independent literal expected labels. All ASCII punctuation as company separators; Unicode delimiters; balanced wrappers on designation/full identifier; letter/article/numeric and substantive-punctuation distinctions.'};
writeFileSync(E+'/'+run+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({total,passed:result.passed,failed:result.failed,examples:failures.slice(0,12)}));process.exit(failures.length?1:0);
