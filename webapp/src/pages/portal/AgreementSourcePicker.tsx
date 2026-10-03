import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AgreementSource } from '@/lib/agreementSource';
export function AgreementSourcePicker({company,value,onChange}: {company?:string|null;value:string;onChange:(source:AgreementSource|null)=>void}) {
  const query = useQuery({queryKey:['agreement-sources',company ?? null], queryFn:()=>api.get<AgreementSource[]>(`/api/portal/oa/sources${company ? `?company=${encodeURIComponent(company)}` : ''}`), retry:false});
  const rows = query.data ?? [];
  const chosen = rows.find(s=>s.id===value);
  useEffect(() => {
    if (value && (query.isError || (query.isSuccess && !chosen))) onChange(null);
  }, [value, query.isError, query.isSuccess, chosen, onChange]);
  return <div className="space-y-3">
    {query.isError ? <p role="alert">We could not load the agreements. <button type="button" className="underline" onClick={()=>query.refetch()}>Try again</button></p> : query.isPending ? <p>Loading agreements…</p> : <>
      <label className="block text-sm font-medium" htmlFor="document-agreement-source">Operating agreement supplying the names</label>
      <select id="document-agreement-source" className="w-full rounded-md border border-input bg-background p-2" value={chosen?.id ?? ''} onChange={e=>onChange(rows.find(s=>s.id===e.target.value) ?? null)}>
        <option value="">Choose an agreement</option>
        {rows.map(s=><option key={s.id} value={s.id}>Agreement No. {s.number}{s.effectiveDate ? ` — ${s.effectiveDate}` : ''}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">If the required agreement is not listed, this form cannot use it. Outside agreements and older copies not associated with this company cannot be selected. Generating a newer draft does not automatically replace an agreement you previously adopted.</p>
      {chosen ? <div className="rounded-md border p-3 text-sm" data-testid="agreement-parties">
        <p className="font-medium">Members</p><ul>{chosen.members.map((m,i)=><li key={i}>{m.name}{m.jointHolding ? ` — ${m.jointHolding}` : ''}{m.entitySigner ? ` — signed by ${m.entitySigner.name}, ${m.entitySigner.title}` : m.signatories?.length ? ` — signers: ${m.signatories.join('; ')}` : ''}</li>)}</ul>
        <p className="mt-2 font-medium">Managers</p>{chosen.managers.length ? <ul>{chosen.managers.map((m,i)=><li key={i}>{m.name}{m.signer ? ` — signed by ${m.signer.name}, ${m.signer.title}` : ''}</li>)}</ul> : <p>Member-managed</p>}
      </div> : null}
    </>}
  </div>;
}
