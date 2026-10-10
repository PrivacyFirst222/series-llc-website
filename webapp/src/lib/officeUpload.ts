import {put} from '@vercel/blob/client';
import {MAX_UPLOAD_BYTES,UPLOAD_LIMIT_LABEL} from './uploadLimits';

interface Grant {id:string;field:string;path:string;key:string;iv:string;token:string|null}
interface Ticket {id:string;state?:string;files?:Grant[]}
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function data(response:Response,receiptKey:string):Promise<Ticket>{
 const body=await response.json();
 if(!response.ok){
  if(body.error?.code==='UPLOAD_EXPIRED')sessionStorage.removeItem(receiptKey);
  throw new Error(body.error?.message??'The upload could not be authorized.');
 }
 return body.data;
}
/** The business request contains a receipt only. Plaintext never reaches Blob. */
export async function officeUpload(route:string,options:RequestInit):Promise<Response>{
 if(!(options.body instanceof FormData))return fetch(route,options);
 const entries=[...options.body.entries()] as unknown as [string,string|File][],files=entries.filter((pair):pair is [string,File]=>pair[1] instanceof File&&pair[1].size>0);
 if(!files.length)return fetch(route,options);
 const fields=entries.filter((pair):pair is [string,string]=>typeof pair[1]==='string');
 const metadata:{field:string;name:string;size:number;sha:string}[]=[];
 for(const [field,file] of files){
  if(file.size>MAX_UPLOAD_BYTES)throw new Error(`${file.name} is too large (${UPLOAD_LIMIT_LABEL}).`);
  metadata.push({field,name:file.name,size:file.size,sha:hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))});
 }
 const description=JSON.stringify({route,fields,files:metadata});
 const receiptKey='office-upload:'+hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(description)));
 const credentials=options.credentials??'same-origin',signal=options.signal;
 const prior=sessionStorage.getItem(receiptKey);
 const ticket=await data(await fetch(prior?`/api/admin/uploads/${encodeURIComponent(prior)}`:'/api/admin/uploads',prior?{credentials,signal}:{method:'POST',credentials,signal,headers:{'content-type':'application/vnd.fpsllc-upload+json'},body:description}),receiptKey);
 // A failed browser persistence write stops before any business submission.
 sessionStorage.setItem(receiptKey,ticket.id);
 if(ticket.state!=='complete'){
  if(ticket.files?.length!==files.length)throw new Error('The upload authorization does not match these files.');
  for(let i=0;i<files.length;i++){
   const grant=ticket.files[i],file=files[i][1];
   if(grant.field!==files[i][0])throw new Error('The upload authorization does not match this field.');
   if(!grant.token)continue; // An expired token can still finalize an existing object.
   const key=await crypto.subtle.importKey('raw',decode(grant.key),'AES-GCM',false,['encrypt']);
   const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:decode(grant.iv),additionalData:new TextEncoder().encode(grant.id),tagLength:128},key,await file.arrayBuffer());
   try{await put(grant.path,new Blob([ciphertext],{type:'application/octet-stream'}),{access:'private',token:grant.token,contentType:'application/octet-stream',abortSignal:signal??undefined});}
   catch(error){
    if(signal?.aborted)throw error;
    // Lost upload acknowledgments and no-overwrite conflicts are reconciled by
    // the server against this exact path, length, authenticated bytes and hash.
   }
  }
 }
 const headers=new Headers(options.headers);headers.set('content-type','application/json');headers.set('x-office-upload',ticket.id);
 const response=await fetch(route,{...options,headers,body:JSON.stringify({uploadId:ticket.id})});
 if(response.ok)sessionStorage.removeItem(receiptKey);
 return response;
}
