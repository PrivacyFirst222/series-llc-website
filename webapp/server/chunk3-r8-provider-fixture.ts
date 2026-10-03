/** Strict in-process provider contract. No SDK/fetch call escapes this fixture. */
import {mock} from 'bun:test';
import {mkdirSync,readFileSync,writeFileSync,existsSync,unlinkSync,readdirSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import type {env as environment} from './env';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function installR8Providers(root:string,mirror:string,env:typeof environment){
 const origin='https://fixture.private.blob.vercel-storage.com',calls:{op:string;path:string;bytes?:number}[]=[];
 const pathOnly=(value:string)=>{const path=value.startsWith('https:')?new URL(value).pathname.slice(1):value;if(value.startsWith('https:')&&new URL(value).origin!==origin)throw Error('Foreign provider namespace');if(!path||path.startsWith('/')||path.includes('://')||path.split('/').some(p=>p==='..'||p==='.'))throw Error('Invalid provider pathname '+value);return path;};
 const read=(path:string)=>existsSync(path)?readFileSync(path):null;
 const write=(path:string,b:Buffer)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,b);};
 mock.module('@vercel/blob',()=>({
  put:async(path:string,body:Uint8Array,options:{allowOverwrite?:boolean;access?:string;addRandomSuffix?:boolean;abortSignal?:AbortSignal})=>{
   options.abortSignal?.throwIfAborted();if(path.startsWith('https:')||options.access!=='private'||options.addRandomSuffix!==false)throw Error('Invalid hosted upload contract');const target=join(root,pathOnly(path));
   if(existsSync(target)&&!options.allowOverwrite)throw Error('Object exists');const data=Buffer.from(body);write(target,data);calls.push({op:'blob-put',path,bytes:data.length});return {url:origin+'/'+path,pathname:path};
  },
  get:async(key:string,options:{abortSignal?:AbortSignal;useCache?:boolean})=>{options.abortSignal?.throwIfAborted();if(options.useCache!==false)throw Error('Recovery read must bypass cache');const p=pathOnly(key),bytes=read(join(root,p));calls.push({op:'blob-get',path:p,bytes:bytes?.length??0});return bytes?{statusCode:200,stream:new Blob([new Uint8Array(bytes)]).stream()}:null;},
  del:async(key:string)=>{const path=pathOnly(key);try{unlinkSync(join(root,path));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}calls.push({op:'blob-delete',path});},
  list:async(options:{prefix?:string;cursor?:string;limit?:number})=>{const all=existsSync(root)?readdirSync(root,{recursive:true}).filter(p=>statSync(join(root,String(p))).isFile()).map(String).filter(p=>p.startsWith(options.prefix??'')).sort():[];const offset=Number(options.cursor??0),limit=Math.min(options.limit??1000,1000),selected=all.slice(offset,offset+limit);return {blobs:selected.map(path=>({url:origin+'/'+path,pathname:path,size:statSync(join(root,path)).size,uploadedAt:statSync(join(root,path)).mtime})),hasMore:offset+limit<all.length,cursor:String(offset+limit)};},
 }));
 env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_fixture_test-only';env.DROPBOX_APP_KEY='fixture';env.DROPBOX_APP_SECRET='fixture';env.DROPBOX_REFRESH_TOKEN='fixture';
 const fetch=async(url:string,init:RequestInit):Promise<Response|null>=>{
  init.signal?.throwIfAborted();if(url==='https://api.dropboxapi.com/oauth2/token')return Response.json({access_token:'fixture',expires_in:3600});
  if(!['https://content.dropboxapi.com/2/files/download','https://content.dropboxapi.com/2/files/upload','https://api.dropboxapi.com/2/files/delete_v2'].includes(url))return null;
  const headers=new Headers(init.headers);if(headers.get('Authorization')!=='Bearer fixture')throw Error('Untracked provider authorization');
  const arg=url.endsWith('delete_v2')?JSON.parse(String(init.body)):JSON.parse(headers.get('Dropbox-API-Arg')??'null');
  if(!arg||typeof arg.path!=='string'||!arg.path.startsWith('/')||arg.path.split('/').some((p:string)=>p==='..'||p==='.'))throw Error('Invalid mirror path');
  const target=mirror+arg.path,before=read(target);
  if(url.endsWith('download')){calls.push({op:'mirror-read',path:arg.path,bytes:before?.length??0});return before?new Response(new Uint8Array(before),{headers:{'dropbox-api-result':JSON.stringify({rev:sha(before),path_display:arg.path}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))}}):new Response('path/not_found',{status:409});}
  if(url.endsWith('delete_v2')){if(before)unlinkSync(target);calls.push({op:'mirror-delete',path:arg.path});return before?Response.json({metadata:{path_display:arg.path}}):new Response('path/not_found',{status:409});}
  const mode=arg.mode;if(mode!== 'overwrite'&&mode?.['.tag']!=='add'&&mode?.['.tag']!=='update')throw Error('Unrecognized mirror upload mode');
  if(mode?.['.tag']==='add'&&before||mode?.['.tag']==='update'&&(!before||sha(before)!==mode.update))return new Response('path/conflict',{status:409});
  if(mode!=='overwrite'&&(arg.autorename!==false||arg.strict_conflict!==true))throw Error('CAS must not rename');
  const data=Buffer.from(init.body as Uint8Array);write(target,data);calls.push({op:'mirror-'+(typeof mode==='string'?mode:mode['.tag']),path:arg.path,bytes:data.length});return Response.json({rev:sha(data),path_display:arg.path});
 };
 return {calls,fetch,origin};
}
