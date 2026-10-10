import {officeUpload} from '@/lib/officeUpload';
import {UPLOAD_LIMIT_LABEL} from '@/lib/uploadLimits';
import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';

interface HistoryRow {historyId:string;expectedRevision:string;title:string;slot:string;status:string;clientName?:string;companyName?:string;orderId:string|null;serviceId?:string}
async function uploadOriginal(path:string,file:File|null){
 const data=new FormData();if(file)data.set('file',file);
 const r=await officeUpload(path,{method:'POST',credentials:'same-origin',body:data}),body=await r.json();
 if(!r.ok)throw Error(body.error?.message??'Recovery did not complete.');return body.data;
}
function HistoryOriginal({row,onChange}:{row:HistoryRow;onChange:()=>void}){
 const [file,setFile]=useState<File|null>(null),[ack,setAck]=useState(false),[message,setMessage]=useState('');
 const action=useMutation({mutationFn:async(kind:'check'|'recover'|'unrecoverable')=>{
  const base='/api/admin/backups/history-recovery/'+row.historyId;
  if(kind==='check'){
   const r=await api.post<{state:string}>(base+'/check',{});
   return r.state==='recoverable'?'A verified original is available. Choose Recover original.':'No verified original was found in registered controlled sources. Review this historical revision before recording it as unavailable.';
  }
  if(kind==='recover'){await uploadOriginal(base+'/original',file);return 'Historical original recovered. Current documents are unchanged.';}
  if(!ack)throw Error('Confirm the historical file and version before proceeding.');
  await api.post(base+'/unrecoverable',{expectedRevision:row.expectedRevision,acknowledge:true});
  return 'Historical original recorded as unavailable. Current documents are unchanged.';
 },onSuccess:text=>{setMessage(text);onChange();},onError:e=>setMessage(e.message)});
 return <article className="space-y-2 rounded border p-3" aria-label={row.title}>
  <p className="font-medium">{row.title}</p><p className="text-sm">{row.clientName} {row.companyName} · {row.status}</p>
  <p className="break-all text-xs">Historical revision: {row.historyId}</p>
  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate('check')}>Check original</Button>
  <Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate('recover')}>Recover original</Button></div>
  <label className="block text-sm">Exact historical original PDF<><input className="block w-full" type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0]??null)}/><span className="text-xs text-muted-foreground">{UPLOAD_LIMIT_LABEL}</span></></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I confirm this historical original is unavailable. Future backups will disclose that this version is missing.</label>
  <Button size="sm" variant="outline" disabled={!ack||action.isPending} onClick={()=>action.mutate('unrecoverable')}>Record original as unrecoverable</Button>
  {message?<p role={action.isError?'alert':'status'} className="text-sm">{message}</p>:null}
 </article>;
}
export function HistoryRecoveryPanel({orderId,historyId}:{orderId?:string;historyId?:string}){
 const [open,setOpen]=useState(!!historyId),[cursor,setCursor]=useState<string|undefined>(),qc=useQueryClient();
 const filters=new URLSearchParams({...cursor?{cursor}:{},...orderId?{orderId}:{},...historyId?{historyId}:{}});
 const query=useQuery({queryKey:['admin-history-recovery',cursor,orderId,historyId],queryFn:()=>api.get<{rows:HistoryRow[];nextCursor:string|null}>('/api/admin/backups/history-recovery?'+filters),enabled:open});
 const refresh=()=>{qc.invalidateQueries({queryKey:['admin-history-recovery']});qc.invalidateQueries({queryKey:['admin-backup-progress']});qc.invalidateQueries({queryKey:['admin-backup-attention']});};
 return <section className="space-y-3" aria-label="Historical document recovery">
  <Button variant="outline" onClick={()=>setOpen(!open)} aria-expanded={open}>Review historical files</Button>
  {open?<>
   <p className="text-sm">Only historical originals can be recorded as unavailable. Current documents must be recovered.</p>
   {query.isPending?<p role="status">Loading historical files…</p>:null}
   {query.error?<p role="alert">{query.error.message}</p>:null}
   {query.data?.rows.filter(r=>!orderId||r.orderId===orderId).map(row=><HistoryOriginal key={row.historyId} row={row} onChange={refresh}/>)}
   {query.data?.rows.length===0?<p>No historical files need review.</p>:null}
   <div className="flex gap-2">{cursor?<Button variant="outline" onClick={()=>setCursor(undefined)}>First page</Button>:null}{query.data?.nextCursor?<Button variant="outline" onClick={()=>setCursor(query.data!.nextCursor!)}>Next historical files</Button>:null}</div>
  </>:null}
 </section>;
}
export function OfficeRecoveryPanel({orderId}:{orderId:string}){
 const [open,setOpen]=useState(false),[slot,setSlot]=useState(''),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState('');
 const query=useQuery({queryKey:['admin-office-recovery',orderId],queryFn:()=>api.get<{operationId:string;slot:string;title:string;historical:boolean}[]>(`/api/admin/orders/${orderId}/office-recovery`),enabled:open});
 const repair=useMutation({mutationFn:async()=>{if(!slot)throw Error('Select the document to recover.');await uploadOriginal(`/api/admin/orders/${orderId}/office-recovery/${slot}`,file);},onSuccess:()=>setMessage('Original document recovered. Current filing information is unchanged.'),onError:e=>setMessage(e.message)});
 return <section className="space-y-3 rounded border p-3" aria-label="Document recovery">
  <Button variant="outline" size="sm" onClick={()=>setOpen(!open)} aria-expanded={open}>Recover saved original</Button>
  {open?<>
   <label className="block text-sm">Document<select className="block w-full rounded border p-2" value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Select a document</option>{query.data?.filter(d=>!d.historical).map(d=><option key={d.operationId+'/'+d.slot} value={d.operationId+'/'+d.slot}>{d.title}</option>)}</select></label>
   <label className="block text-sm">Original PDF (if you have it)<><input className="block w-full" type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0]??null)}/><span className="text-xs text-muted-foreground">{UPLOAD_LIMIT_LABEL}</span></></label>
   <Button disabled={repair.isPending} onClick={()=>repair.mutate()}>Recover original</Button>
   {query.error?<p role="alert">{query.error.message}</p>:null}
   <HistoryRecoveryPanel orderId={orderId}/>
  </>:null}
  {message?<p role={repair.isError?'alert':'status'} className="text-sm">{message}</p>:null}
 </section>;
}
interface Attention {problemId:string;reference:string;active:boolean;reason:string;mailState:string;error?:string;resolvedAt?:string}
export function ContinueOfficeReplacement({operationId,onContinued}:{operationId:string;onContinued:(message:string)=>void}){
 const [message,setMessage]=useState('');
 const resume=useMutation({mutationFn:()=>api.post(`/api/admin/office-operations/${operationId}/continue`,{}),onSuccess:()=>{const text='Replacement reserved. Attach the original replacement PDF or correct this pending attempt.';setMessage(text);onContinued(text);},onError:e=>setMessage(e.message)});
 return <section className="space-y-2"><p className="text-sm">The previous upload is being retired. Continue without the lost replacement PDF, then attach that original or correct the pending attempt.</p><Button disabled={resume.isPending} onClick={()=>resume.mutate()}>Continue without the lost replacement PDF</Button>{message?<p role={resume.isError?'alert':'status'}>{message}</p>:null}</section>;
}
export function BackupAttentionBanner(){
 const [search]=useSearchParams(),problemId=search.get('backupProblem');
 const [open,setOpen]=useState(!!problemId),[message,setMessage]=useState('');
 const q=useQuery({queryKey:['admin-backup-attention'],queryFn:()=>api.get<Attention[]>('/api/admin/backups/attention'),refetchInterval:30000});
 const retry=useMutation({mutationFn:(id:string)=>api.post<{state:string}>(`/api/admin/backups/attention/${id}/retry`,{}),onSuccess:r=>{setMessage(r.state==='accepted'||r.state==='already_sent'?'The email provider accepted the office notice.':'Notification status: '+r.state);q.refetch();},onError:e=>setMessage(e.message)});
 const active=q.data?.filter(r=>r.active)??[];
 const linked=q.data?.find(r=>r.problemId===problemId);
 if(!active.length&&!q.error&&!problemId)return null;
 return <aside className="my-3 space-y-2 rounded border border-amber-600 p-3" aria-label="Backup attention">
  <p role="status">{q.error?'Backup attention could not be checked.':`${active.length} backup issue${active.length===1?'':'s'} need office attention.`}</p>
  {q.error?<p role="alert">{q.error.message}</p>:null}
  {problemId&&q.isPending?<p role="status">Loading the linked backup issue…</p>:null}
  {problemId&&!q.isPending&&!q.error&&!linked?<p role="alert">This backup issue is not available in this recovery store.</p>:null}
  {linked&&!linked.active?<p role="status">This backup issue was resolved{linked.resolvedAt?' at '+linked.resolvedAt:''}. No further notification is required.</p>:null}
  {active.map(r=><div key={r.problemId}><p className="text-sm">{r.reason==='needs_staff_decision'?'Review a missing historical original.':'A required backup file or operation needs attention.'} Notification: {r.mailState.replace(/_/g,' ')}.</p>{r.error?<p className="text-sm">{r.error}</p>:null}{r.mailState!=='accepted'?<Button size="sm" variant="outline" disabled={retry.isPending} onClick={()=>retry.mutate(r.problemId)}>Retry notification</Button>:null}</div>)}
  <Button variant="outline" onClick={()=>setOpen(!open)}>Review backup issue</Button>
  {open?<HistoryRecoveryPanel key={linked?.reference??'all'} historyId={linked?.reason==='needs_staff_decision'?linked.reference:undefined}/>:null}{message?<p role={retry.isError?'alert':'status'}>{message}</p>:null}
 </aside>;
}
