/** Usage: bun scripts/verify-clean-launch.ts approved-inventory.json receipt.json
 * READ ONLY: does not initialize a DB, list unrelated Dropbox namespaces,
 * delete files, dispatch email, run a cron, or grant launch permission. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {list,get} from '@vercel/blob';
import {verifyCleanLaunch,launchDigest,type LaunchInventory,type LaunchObject,type LaunchSnapshot} from '../server/clean-launch-verification';
const [inventoryPath,receiptPath]=process.argv.slice(2);
if(!inventoryPath||!receiptPath)throw Error('Provide the approved inventory and a new receipt pathname');
const expected=JSON.parse(readFileSync(inventoryPath,'utf8')) as LaunchInventory;
const required=['DATABASE_URL','BLOB_READ_WRITE_TOKEN','DROPBOX_APP_KEY','DROPBOX_APP_SECRET','DROPBOX_REFRESH_TOKEN'] as const;
for(const name of required)if(!process.env[name])throw Error('Missing required configuration: '+name);
if(process.env.E2E_OFFLINE==='1')throw Error('This preflight requires the explicitly inventoried hosted resources; use the fixture verifier for offline rehearsals');
const databaseURL=new URL(process.env.DATABASE_URL!),databaseHost=databaseURL.hostname;
const token=process.env.BLOB_READ_WRITE_TOKEN!,storeId=/^vercel_blob_rw_([^_]+)_/.exec(token)?.[1];
if(!storeId)throw Error('Unrecognized private object-store token format');
if(databaseHost!==expected.resources.databaseHost||storeId!==expected.resources.blobStoreId||process.env.DROPBOX_APP_KEY!==expected.resources.dropboxAppKey)throw Error('RESET_RESOURCE_MISMATCH: configured resource identities differ from approved inventory');
const sql=neon(process.env.DATABASE_URL!);
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
let accessToken='';
async function dropbox(path:string,body:unknown,content=false){
 const response=await fetch((content?'https://content.dropboxapi.com/2/':'https://api.dropboxapi.com/2/')+path,{method:'POST',headers:{Authorization:'Bearer '+accessToken,...content?{'Dropbox-API-Arg':JSON.stringify(body).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))}:{'Content-Type':'application/json'}},...content?{}:{body:JSON.stringify(body)},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Dropbox read refused at '+path+' with HTTP '+response.status);
 return response;
}
async function read():Promise<LaunchSnapshot>{
 const auth=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.DROPBOX_REFRESH_TOKEN!,client_id:process.env.DROPBOX_APP_KEY!,client_secret:process.env.DROPBOX_APP_SECRET!}),signal:AbortSignal.timeout(30000)});
 if(!auth.ok)throw Error('Dropbox authentication refused');accessToken=(await auth.json() as {access_token:string}).access_token;if(!accessToken)throw Error('Dropbox token missing');
 const account=await(await dropbox('users/get_current_account',null)).json() as {account_id:string;root_info:{root_namespace_id:string}};
 const resources={databaseHost,databaseName:'',blobStoreId:storeId!,dropboxAppKey:process.env.DROPBOX_APP_KEY!,dropboxAccountId:account.account_id,dropboxRoot:'namespace:'+account.root_info.root_namespace_id+';app-folder:/'};
 if(resources.dropboxAccountId!==expected.resources.dropboxAccountId||resources.dropboxRoot!==expected.resources.dropboxRoot)throw Error('RESET_RESOURCE_MISMATCH: Dropbox account/namespace differs from the approved app-folder inventory');
 // App-folder permission is independently evidenced in resourceApproval. These
 // requests use the app token's own root and never set another namespace root.
 const tableRows=await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename") as {tablename:string}[];
 const names=tableRows.map(r=>r.tablename),quote=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
 const allowedSeeds=new Set(['schema_migrations','launch_policy','library_documents','backup_progress']);
 const selects=names.flatMap(name=>["'"+name.replace(/'/g,"''")+"'",`(SELECT json_build_object('count',count(*)${allowedSeeds.has(name)?",'rows',coalesce(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::json)":''}) FROM public.${quote(name)} t)`]);
 const [snapshot]=await sql.query(`SELECT current_database() AS name,json_build_object(${selects.join(',')}) AS tables`) as {name:string;tables:Record<string,{count:number;rows?:unknown[]}>}[];
 resources.databaseName=snapshot.name;
 if(resources.databaseName!==expected.resources.databaseName)throw Error('RESET_RESOURCE_MISMATCH: database name differs from approved inventory');
 const tables=Object.fromEntries(Object.entries(snapshot.tables).map(([name,r])=>[name,{count:Number(r.count),sha256:launchDigest(r.rows??[])}]));
 const initialProgress=(snapshot.tables.backup_progress?.rows??[]) as {id:string;lease_until:unknown;cursor:unknown;error:unknown}[];
 if(initialProgress.some(r=>r.id!=='deletion-journal'||r.lease_until||r.cursor||r.error))throw Error('An old job or writer reservation remains');
 const migrations=(snapshot.tables.schema_migrations?.rows??[]) as {id:number;checksum:string}[];
 const policies=(snapshot.tables.launch_policy?.rows??[]) as {id:string;first_notice_cutoff:string}[];
 const noticeCutoff=policies.find(r=>r.id==='initial-launch')?.first_notice_cutoff??'';
 const blobs:LaunchObject[]=[],mirror:LaunchObject[]=[];
 let cursor:string|undefined;const seen=new Set<string>();
 do{
  const page=await list({token,cursor,limit:1000});
  for(const b of page.blobs){
   if(new URL(b.url).hostname!==storeId+'.private.blob.vercel-storage.com')throw Error('Object belongs to a different private store');
   if(!expected.seedObjects.blob.some(s=>s.path===b.pathname))throw Error('Unlisted object remains in the app store');
   const found=await get(b.url,{access:'private',token,useCache:false,abortSignal:AbortSignal.timeout(30000)});if(!found||found.statusCode!==200)throw Error('Seed object cannot be read');
   const bytes=Buffer.from(await new Response(found.stream).arrayBuffer());blobs.push({path:b.pathname,size:bytes.length,sha256:sha(bytes)});
  }
  if(!page.hasMore)break;
  if(!page.cursor||seen.has(page.cursor))throw Error('Object listing incomplete or cursor repeated');seen.add(page.cursor);cursor=page.cursor;
 }while(cursor!==undefined);
 let page=await(await dropbox('files/list_folder',{path:'',recursive:true,include_deleted:false,limit:2000})).json() as {entries:{'.tag':string;path_display:string}[];has_more:boolean;cursor:string};
 const mirrorCursors=new Set<string>();
 while(true){
  for(const item of page.entries){if(item['.tag']==='folder')continue;if(item['.tag']!=='file')throw Error('Unknown mirror entry type');
   if(!expected.seedObjects.mirror.some(s=>s.path===item.path_display))throw Error('Unlisted object remains in the app mirror');
   const bytes=Buffer.from(await(await dropbox('files/download',{path:item.path_display},true)).arrayBuffer());mirror.push({path:item.path_display,size:bytes.length,sha256:sha(bytes)});
  }
  if(!page.has_more)break;
  if(!page.cursor||mirrorCursors.has(page.cursor))throw Error('Mirror listing incomplete or cursor repeated');mirrorCursors.add(page.cursor);
  page=await(await dropbox('files/list_folder/continue',{cursor:page.cursor})).json() as typeof page;
 }
 return {resources,tables,migrations:migrations.map(m=>({id:Number(m.id),checksum:m.checksum})).sort((a,b)=>a.id-b.id),noticeCutoff:new Date(noticeCutoff).toISOString(),objects:{blob:blobs.sort((a,b)=>a.path.localeCompare(b.path)),mirror:mirror.sort((a,b)=>a.path.localeCompare(b.path))}};
}
try{const receipt=await verifyCleanLaunch(expected,{read});writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});console.log('Clean read-only preflight receipt written. Baseline backup and isolated restore remain required.');}
catch(error){console.error('Clean-launch preflight refused:',error instanceof Error?error.message:'read failed');process.exitCode=1;}
