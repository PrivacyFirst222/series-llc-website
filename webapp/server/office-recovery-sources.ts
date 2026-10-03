import type {OfficeFile, OfficeOperation} from './office-operation';
import type {RecoveryJournal} from './backup-deletions';
import {createHash} from 'node:crypto';

export class OfficeRecoveryError extends Error {
 retryAfterMs?:number;
 constructor(message:string, public code:string, public status:409|503=409) { super(message); }
}
export const identityConflict=():never=>{throw new OfficeRecoveryError('The saved recovery identity is inconsistent. No files were changed.','RECOVERY_IDENTITY_CONFLICT');};
export interface OfficeIdentity {
 operationId:string; slot:string; clientId:string; orderId:string|null; serviceId?:string;
 file:OfficeFile; historical:boolean; published:boolean; sensitive:boolean;
 namespace:string; canonicalKey:string; recoveryPath:string;
}
export function storageIdentity(key:string):{namespace:string;canonicalKey:string} {
 if(key.startsWith('dev:'))return {namespace:'dev',canonicalKey:key.slice(4)};
 try { const u=new URL(key);if(u.protocol!=='https:'||u.search||u.hash||u.username||u.password) return identityConflict();return {namespace:u.origin,canonicalKey:u.pathname.slice(1)}; } catch { return identityConflict(); }
}
export function recoveryTuple(i:Omit<OfficeIdentity,'recoveryPath'>) {
 return ['office-recovery-v1',i.clientId,i.file.id,i.namespace,i.canonicalKey,i.file.sha,i.file.size,i.sensitive];
}
type Row=Record<string,unknown>;
export type OfficeTables=Record<string,Row[]>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Enumerate the actual persisted forms, including archived slot folders.
 * No names, current company folders, or observed bytes establish ownership. */
export function officeFileIdentities(tables:OfficeTables,options:{includeUnknown?:boolean}={}):Map<string,OfficeIdentity> {
 const result=new Map<string,OfficeIdentity>();
 for(const row of tables.office_operations??[]) {
  const op=row as unknown as OfficeOperation;
  let family=op.kind;
  const archived=/^(service|articles|articles-correction)-history:(.*)$/.exec(family);
  if(archived) { if(archived[2]!==op.id||op.phase!=='superseded')identityConflict();family=archived[1]; }
  if(!['service','articles','articles-correction'].includes(family))identityConflict();
  if(!uuid.test(op.id)||!['open','retiring','committed','done','superseded'].includes(op.phase))identityConflict();
  if(op.phase==='superseded'&&!archived)identityConflict();
  const previous=String(op.payload.previousPhase??'');
  if(archived&&!['open','committed','done'].includes(previous))identityConflict();
  const service=family==='service'?(tables.service_orders??[]).find(s=>s.id===op.target_id):undefined;
  const order=(tables.orders??[]).find(o=>o.id===(service?service.formation_order_id:op.target_id));
  const clientId=service?.client_id??order?.client_id;
  if(typeof clientId!=='string'||!uuid.test(clientId)||(family==='service'&&!service))identityConflict();
  if(service&&order&&order.client_id!==clientId)identityConflict();
  const published=['committed','done'].includes(archived?previous:op.phase);
  for(const [slot,file] of Object.entries(op.files??{})) {
   if((family==='service'&&slot!=='upload')||(family!=='service'&&!['articles','statement'].includes(slot)))identityConflict();
   if(!file||!uuid.test(file.id)||!Number.isSafeInteger(file.size)||file.size<0||!file.key)identityConflict();
   // Pre-repair originals without a digest retain their old assurance level.
   // They are never promoted to known originals by hashing today's contents.
   if(file.sha===undefined&&!options.includeUnknown)continue;
   if(file.sha!==undefined&&!/^[a-f0-9]{64}$/.test(file.sha))identityConflict();
   const refs=(tables.documents??[]).filter(d=>d.storage_key===file.key);
   if(refs.some(d=>d.client_id!==clientId||d.id!==file.id))identityConflict();
   if(family==='service'&&published&&op.result.documentId!==file.id)identityConflict();
   // The ordinary filing replacement route keeps the document id and changes
   // its key. The saved operation still owns the prior immutable revision.
   // Require that owning row; a matching id on another client is never proof.
   const owner=(tables.documents??[]).find(d=>d.id===file.id);
   if(family!=='service'&&published&&(!owner||owner.client_id!==clientId||owner.order_id!==op.target_id))identityConflict();
   const historical=published&&(family==='service'?!!archived&&!refs.some(d=>!d.deleted_at):refs.every(d=>!!(d.meta as Row)?.officeHistory));
   const base={operationId:op.id,slot,clientId:clientId as string,orderId:order?String(order.id):null,...(service?{serviceId:String(service.id)}:{}),file,historical,published,sensitive:!!file.meta?.sensitive||file.key.endsWith('.encrypted'),...storageIdentity(file.key)};
   const identity={...base,recoveryPath:'/OfficeRecovery/v1/'+createHash('sha256').update(JSON.stringify(recoveryTuple(base))).digest('hex')+'.backup'};
   const prior=result.get(file.key);
   if(prior&&JSON.stringify(recoveryTuple(prior))!==JSON.stringify(recoveryTuple(identity)))identityConflict();
   result.set(file.key,identity);
  }
 }
 return result;
}
export function collectOfficeRecoverySources(i:OfficeIdentity,journal:RecoveryJournal,documents:Row[]=[]):string[] {
 const registered=journal.copies?.filter(c=>c.storageKey===i.file.key)??[];
 for(const c of registered)if(c.documentId!==i.file.id||(c.serviceId!==undefined&&c.serviceId!==i.serviceId))identityConflict();
 const sources=[`/OfficeOperations/${i.operationId}/${i.slot}`,i.file.mirrorPath,
  ...documents.filter(d=>d.storage_key===i.file.key&&d.id===i.file.id&&d.client_id===i.clientId).map(d=>d.mirror_path),
  ...registered.flatMap(c=>[c.mirrorPath,...c.extraMirrorPaths??[]])];
 const paths=sources.filter((p):p is string=>p!==undefined&&p!==null);
 for(const p of paths)if(typeof p!=='string'||!p.startsWith('/')||p.split('/').some(s=>s==='..'||s==='.')||p.includes('\\'))identityConflict();
 const owned=new Set(paths.map(p=>p.normalize('NFC').toLowerCase()));
 for(const c of journal.copies??[])if(c.storageKey!==i.file.key&&[c.mirrorPath,...c.extraMirrorPaths??[]].some(p=>owned.has(p.normalize('NFC').toLowerCase())))identityConflict();
 return [...new Set(paths)];
}
export function officeIdentityDeleted(i:OfficeIdentity,journal:RecoveryJournal):boolean {
 return journal.records.some(r=>r.storageKey===i.file.key||(r.reason!=='superseded'&&(r.documentId===i.file.id||(!!i.serviceId&&r.serviceId===i.serviceId))));
}
