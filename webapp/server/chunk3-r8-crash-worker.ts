/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated SIGKILL boundary worker. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')),R=resolve(import.meta.dir,'..');
Object.assign(process.env,{E2E_OFFLINE:'1',VERCEL:'',DEV_STORAGE_DIR:spec.files,DEV_MIRROR_DIR:spec.mirror,ADMIN_PASSWORD:'fixture'});
const {mock,spyOn}=await import('bun:test'),{Client}=await import(process.env.R8_PG_MODULE!);const pg=new Client({connectionString:'postgres://adam@127.0.0.1:55483/'+spec.database});await pg.connect();mock.module(Bun.resolveSync('@neondatabase/serverless',R),()=>({neon:()=>({query:async(q:string,p:any[]=[]) => (await pg.query(q,p)).rows})}));
const {env}=await import('./env');env.DATABASE_URL='postgres://adam@127.0.0.1:55483/'+spec.database;
const {app}=await import('./app'),{getDb}=await import('./db'),{newToken}=await import('./crypto'),storage=await import('./storage');const db=await getDb();
const providers=process.env.R8_PROVIDER==='strict'?(await import('./chunk3-r8-provider-fixture')).installR8Providers(spec.files,spec.mirror,env):null;
globalThis.fetch=(async(input:any,init:any)=>{const r=await providers?.fetch(String(input),init);if(r)return r;throw Error('Network refused '+String(input));}) as typeof fetch;
const admin=newToken();await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')",[admin.tokenHash]);
const read=storage.readObject,put=storage.putObject,record=async()=>{const raw=await read(spec.intent);writeFileSync(spec.output,raw!);console.log('KILL:'+spec.boundary);process.kill(process.pid,'SIGKILL');await new Promise(()=>{});};
spyOn(storage,'readObject').mockImplementation(async(key:string)=>{const raw=await read(key);if(spec.boundary==='intent-readback'&&key===spec.intent&&raw)await record();return raw;});
spyOn(storage,'putObject').mockImplementation(async(key:string,bytes:Buffer,overwrite?:boolean)=>{const result=await put(key,bytes,overwrite);if((spec.boundary==='archive'&&key===spec.archive)||(spec.boundary==='install'&&key==='backup-jobs/current.json'))await record();return result;});
const r=await app.request('/api/admin/backups/restart-after-history-change',{method:'POST',headers:{Cookie:'fpsllc_admin='+admin.token,'Content-Type':'application/json'},body:JSON.stringify(spec.body)});console.log('Unexpected completion',r.status,await r.text());await pg.end();process.exit(2);
