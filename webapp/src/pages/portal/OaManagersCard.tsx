import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AgreementManager } from '@/lib/oaManagers';
import { QuestionCard } from './OaQuestionCard';

export function OaManagersCard({ managers, onChange }: { managers: AgreementManager[]; onChange: (rows: AgreementManager[]) => void }) {
  const patch = (i: number, change: Partial<AgreementManager>) => onChange(managers.map((m, n) => n === i ? { ...m, ...change } : m));
  return <QuestionCard title="Managers">
    <p className="text-xs text-muted-foreground">List the managers who will be named in this operating agreement. Preparing this agreement does not update the company's state filing records.</p>
    {managers.map((m, i) => <div key={i} className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Manager {i + 1}</span><Button type="button" variant="ghost" size="sm" onClick={() => onChange(managers.filter((_, n) => n !== i))} aria-label={`Remove manager ${i + 1}`}>Remove</Button></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!m.isEntity} onChange={e => patch(i, { isEntity: e.target.checked, signerName: '', signerTitle: '' })} />This manager is a company or trust</label>
      <Input aria-label={`Manager ${i + 1} full legal name`} value={m.name ?? ''} maxLength={200} placeholder={m.isEntity ? 'Full legal entity name' : 'First and last name'} onChange={e => patch(i, { name: e.target.value })} />
      {m.isEntity ? <div className="grid gap-2 sm:grid-cols-2">
        <p className="text-sm sm:col-span-2">Who signs for {m.name || `manager ${i + 1}`}?</p>
        <Input aria-label={`Who signs for ${m.name || `manager ${i + 1}`}`} value={m.signerName ?? ''} maxLength={200} placeholder="Signer — first and last name" onChange={e => patch(i, { signerName: e.target.value })} />
        <Input aria-label={`Title of the signer for ${m.name || `manager ${i + 1}`}`} value={m.signerTitle ?? ''} maxLength={120} placeholder="Signer's title" onChange={e => patch(i, { signerTitle: e.target.value })} />
      </div> : null}
    </div>)}
    <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={managers.length >= 20} onClick={() => onChange([...managers, { name: '' }])}>Add manager</Button>
  </QuestionCard>;
}
