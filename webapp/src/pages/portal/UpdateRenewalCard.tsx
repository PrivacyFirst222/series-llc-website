import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import {api,ApiError} from '@/lib/api';
import {RA_CARD_CONSENT} from '@/lib/agentBilling';
interface Card {attach:(s:string)=>Promise<void>;destroy:()=>Promise<void>;tokenize:(d:object)=>Promise<{status:string;token?:string;errors?:{message:string}[]}>}
interface Square {payments:(a:string,l:string)=>{card:()=>Promise<Card>}}
interface Config {applicationId:string;locationId:string;sandbox:boolean;dev:boolean;pendingAttemptId:string|null}
function CardForm({company,onSaved}:{company:string;onSaved:()=>void}){
 const endpoint=`/api/portal/companies/${company}/renewal-card`;
 const q=useQuery({queryKey:['renewal-card-config',company],queryFn:()=>api.get<Config>(endpoint),retry:false,staleTime:0});
 const card=useRef<Card|null>(null),attempt=useRef<{id:string;source?:string}|null>(null);
 const [consent,setConsent]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[fixture,setFixture]=useState('credit');
 const d=q.data;
 useEffect(()=>{if(!d||d.dev||d.pendingAttemptId)return;let active=true,owned:Card|null=null;
  const load=async()=>{
   if(!(window as Window&{Square?:Square}).Square)await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=d.sandbox?'https://sandbox.web.squarecdn.com/v1/square.js':'https://web.squarecdn.com/v1/square.js';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Secure card entry could not load. Close and reopen to retry.'));document.head.appendChild(script);});
   const square=(window as Window&{Square?:Square}).Square;if(!square)throw new Error('Secure card entry is unavailable.');
   owned=await square.payments(d.applicationId,d.locationId).card();if(!active){await owned.destroy();return;}await owned.attach('#square-renewal-card');card.current=owned;setReady(true);
  };void load().catch(e=>{if(active)setError(e.message)});return()=>{active=false;card.current=null;if(owned)void owned.destroy();};
 },[d]);
 const save=useMutation({mutationFn:async()=>{
  setError('');if(!consent||!d)throw new Error('Confirm card storage and renewal consent.');
  if(!attempt.current){
   if(d.pendingAttemptId)attempt.current={id:d.pendingAttemptId};
   else {let source=`offline-${fixture}`;if(!d.dev){if(!card.current)throw new Error('Secure card entry is not ready.');const r=await card.current.tokenize({intent:'STORE',customerInitiated:true,sellerKeyedIn:false});if(r.status!=='OK'||!r.token)throw new Error(r.errors?.map(e=>e.message).join(' ')||'Check the card details.');source=r.token;}attempt.current={id:crypto.randomUUID(),source};}
  }
  return api.post(endpoint,{attemptId:attempt.current.id,source:attempt.current.source,consent:true});
 },onSuccess:onSaved,onError:async(e:Error)=>{setError(e.message);if(e instanceof ApiError && (e.data as {code?:string})?.code==='CARD_REFUSED'){attempt.current=null;await q.refetch();}}});
 return <div className="space-y-4"><p className="text-sm">Save a credit or non-prepaid debit card for this company's registered-agent renewals. Updating the card does not charge it or change your renewal date.</p>
 {q.isPending?<p>Loading secure card entry…</p>:q.isError?<p role="alert">Could not load card setup. <Button variant="outline" onClick={()=>void q.refetch()}>Retry</Button></p>:d?.pendingAttemptId?<p>A previous update needs confirmation. Retry it before entering another card.</p>:d?.dev?<label>Offline test card<select aria-label="Offline test card" value={fixture} onChange={e=>setFixture(e.target.value)}><option value="credit">Credit card</option><option value="prepaid">Prepaid card</option><option value="decline">Declined card</option></select></label>:<div id="square-renewal-card"/>}
 <label className="flex items-start gap-3 text-sm"><Checkbox aria-label="Agree to save renewal card" checked={consent} onCheckedChange={v=>setConsent(v===true)}/><span>{RA_CARD_CONSENT}</span></label>
 {error?<p role="alert" className="text-destructive">{error}</p>:null}
 <Button disabled={!d||!consent||(!d.dev&&!d.pendingAttemptId&&!ready)||save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Saving card…':d?.pendingAttemptId||attempt.current?'Retry card update':'Save renewal card'}</Button>
 </div>;
}
export function UpdateRenewalCard({company}:{company:string}){
 const [open,setOpen]=useState(false),[saved,setSaved]=useState(false),qc=useQueryClient();
 return <><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="mt-3" size="sm" variant="outline">Update renewal card</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Update renewal card</DialogTitle><DialogDescription>The card applies to the selected company only.</DialogDescription></DialogHeader>{open?<CardForm key={company} company={company} onSaved={()=>{setOpen(false);setSaved(true);void qc.invalidateQueries({queryKey:['portal-companies']});void qc.invalidateQueries({queryKey:['renewal-card-config',company]});}}/>:null}</DialogContent></Dialog>{saved?<p role="status" className="mt-2 text-sm">Renewal card saved. No payment was charged.</p>:null}</>;
}
