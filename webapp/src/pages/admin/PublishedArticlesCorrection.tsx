import {ContinueOfficeReplacement} from './OfficeRecoveryPanel';
import {useId,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
export interface ArticlesCorrectionState {
 retiringOperation?:string|null;restoreReviewRequired?:boolean;
 documentId:string; revision:string; pendingOperation:string|null; pendingNumber:string|null; noticeId:string|null; noticeStatus:string|null;
}
export function PublishedArticlesCorrection({orderId,number,state,weSigned}:{orderId:string;number:string;state:ArticlesCorrectionState;weSigned:boolean}){
 const id=useId(),qc=useQueryClient();
 const [open,setOpen]=useState(false),[value,setValue]=useState(state.pendingNumber??number),[file,setFile]=useState<File|null>(null),[correctPending,setCorrectPending]=useState(false);
 const [reviewRestored,setReviewRestored]=useState(false);
 const [message,setMessage]=useState('');
 const refresh=()=>Promise.all([qc.invalidateQueries({queryKey:['admin','order',orderId]}),qc.invalidateQueries({queryKey:['admin','orders']})]);
 const save=useMutation({mutationFn:async()=>{
  if(!file)throw Error('Choose the corrected Articles PDF.');
  const form=new FormData();form.set('articles',file);form.set('documentNumber',value.trim());form.set('documentId',state.documentId);form.set('revision',state.revision);
  if(reviewRestored)form.set('reviewRestoredOriginal','true');
  if(correctPending&&state.pendingOperation)form.set('replaceAttempt',state.pendingOperation);
  const response=await fetch(`/api/admin/orders/${orderId}/correct-articles`,{method:'POST',credentials:'include',body:form});
  const result=await response.json();if(!response.ok)throw Error(result.error?.message??'The correction could not be saved. Retry with the same PDF.');
  return result.data as {notified:boolean};
 },onSuccess:async result=>{setMessage(result.notified?'Corrected documents saved. The email provider accepted the notice.':'Corrected documents saved. The notice was not confirmed; retry it below.');setOpen(false);await refresh();},onError:async()=>{await refresh();}});
 const notice=useMutation({mutationFn:async()=>{
  const response=await fetch(`/api/admin/documents/${state.noticeId}/resend-notice`,{method:'POST',credentials:'include'});
  const result=await response.json();if(!response.ok||!result.data?.notified)throw Error(result.error?.message??'The notice was not confirmed. Please retry.');
 },onSuccess:async()=>{setMessage('The email provider accepted the correction notice.');await refresh();}});
 return <section className="rounded-lg border border-border p-3 space-y-3" aria-label="Correct formation documents">
  <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={()=>setOpen(!open)} aria-expanded={open}>Correct Articles and document number</Button>
  {state.retiringOperation?<ContinueOfficeReplacement operationId={state.retiringOperation} onContinued={text=>{setMessage(text);refresh();}}/>:null}
  {open?<form className="space-y-3" onSubmit={e=>{e.preventDefault();setMessage('');save.mutate();}}>
   <p className="text-sm text-muted-foreground">{weSigned?'Save corrected Articles with a matching Statement of Authorized Representative.':'Save corrected Articles and their Florida document number.'} Previous documents remain in the filing history. The client receives one correction notice.</p>
   <label className="block text-sm" htmlFor={`${id}-number`}>Correct Florida document number</label>
   <input id={`${id}-number`} className="w-full rounded border p-2" required pattern="L[0-9]{11}" value={value} onChange={e=>setValue(e.target.value)} disabled={save.isPending}/>
   <label className="block text-sm" htmlFor={`${id}-pdf`}>Corrected Articles PDF</label>
   <input id={`${id}-pdf`} type="file" accept="application/pdf" required onChange={e=>setFile(e.target.files?.[0]??null)} disabled={save.isPending}/>
   {state.pendingOperation?<label className="flex gap-2 text-sm"><input type="checkbox" checked={correctPending} onChange={e=>setCorrectPending(e.target.checked)} disabled={save.isPending}/>Correct pending upload with different information</label>:null}
   {state.restoreReviewRequired?<label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewRestored} onChange={e=>setReviewRestored(e.target.checked)}/>I reviewed this restored correction and am attaching the original PDF with the saved document number.</label>:null}
   <Button type="submit" disabled={save.isPending}>{save.isPending?'Saving corrected documents…':'Save corrected formation documents'}</Button>
  </form>:null}
  {save.error?<p role="alert" className="text-sm text-destructive">{save.error.message}</p>:null}
  {message?<p role="status" className="text-sm">{message}</p>:null}
  {state.noticeId&&state.noticeStatus!=='sent'?<Button type="button" size="sm" variant="outline" disabled={notice.isPending} onClick={()=>notice.mutate()}>{notice.isPending?'Retrying notice…':'Retry correction notice'}</Button>:null}
  {notice.error?<p role="alert" className="text-sm text-destructive">{notice.error.message}</p>:null}
 </section>;
}
