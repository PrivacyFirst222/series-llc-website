/* eslint-disable @typescript-eslint/no-explicit-any -- Preserved-reader compatibility fixture. */
import {readFileSync,mkdirSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')),root=spec.target;mkdirSync(root,{recursive:true});
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_PG_DIR:root+'/db',DEV_STORAGE_DIR:root+'/files',DEV_MIRROR_DIR:spec.mirror});
const old=process.env.R8_BEFORE_ROOT||'/Users/adam/Documents/FLPSLLC Website Review/chunk-3-r8-implementation-2026-09-27/before/webapp';
const {getDb}=await import(old+'/server/db.ts'),{restoreBackup}=await import(old+'/server/restore.ts'),{env}=await import(old+'/server/env.ts');
const db=await getDb(),raw=db.query.bind(db),writes:string[]=[];let mail=0;env.RESEND_API_KEY='fixture';globalThis.fetch=(async()=>{mail++;throw Error('External requests forbidden');}) as unknown as typeof fetch;
db.query=async(sql:string,params:any[])=>{if(/^\s*(INSERT|UPDATE|DELETE|WITH)/i.test(sql))writes.push(sql);return raw(sql,params);};
let error='';try{await restoreBackup(db,spec.dump);}catch(e){error=String(e);}const files=existsSync(root+'/files')?readdirSync(root+'/files',{recursive:true}):[];
const pass=error.includes('This restore requires a verified backup with a complete file manifest')&&writes.length===0&&files.length===0&&mail===0;
const result={id:spec.id,result:pass?'pass':'fail',error,writes,files,mail,reader:old};writeFileSync(spec.output,JSON.stringify(result,null,2));console.log('CASE:'+JSON.stringify(result));process.exit(pass?0:1);
