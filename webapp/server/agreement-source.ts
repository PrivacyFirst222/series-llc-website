import { z } from 'zod';
import { getDb } from './db';
import type { OaInputs } from './oa';
import type { AgreementSource } from '../src/lib/agreementSource';

export const AGREEMENT_UNAVAILABLE = 'Choose an available operating agreement for this company. An outside agreement or an older copy not associated with this company cannot be used by this form.';
const person = z.string().trim().min(1);
const signer = z.object({ name: person, title: person });
const parties = z.object({
  companyName: person,
  version: z.enum(['single','single-s','multi','s','member','member-s','member-single','member-single-s']),
  members: z.array(z.object({ name: person, signatories: z.array(person).min(1).optional(), jointHolding: person.optional(), entitySigner: signer.optional() }).passthrough()).min(1),
  managerNames: z.array(person),
  managerEntitySigners: z.array(z.object({ manager: person, name: person, title: person })).optional(),
}).passthrough().refine(x => x.version.startsWith('member') || x.managerNames.length > 0);
/** Legacy rows without a company or complete stored parties are not guessed. */
export async function agreementSources(client: string, company: string) {
  const db = await getDb();
  const rows = await db.query<{ id: string; inputs: unknown; generation_number: number }>(
    'SELECT id, inputs, generation_number FROM oa_generations WHERE client_id=$1 AND order_id=$2 ORDER BY created_at DESC', [client, company]);
  return rows.flatMap(row => {
    let raw: unknown;
    try { raw = typeof row.inputs === 'string' ? JSON.parse(row.inputs) : row.inputs; } catch { return []; }
    if (!parties.safeParse(raw).success) return [];
    const inputs = raw as OaInputs;
    const source: Omit<AgreementSource, 'effectiveDateIso'> = {
      id: row.id, company, sElection: inputs.version === 's' || inputs.version.endsWith('-s'), number: Number(row.generation_number ?? inputs.generationNumber ?? 0),
      effectiveDate: inputs.effectiveDate ?? '',
      members: inputs.members.map(m => ({name:m.name, signatories:m.signatories, jointHolding:m.jointHolding, entitySigner:m.entitySigner})),
      managers: inputs.version.startsWith('member') ? [] : inputs.managerNames.map(name => {
        const s = inputs.managerEntitySigners?.find(x => x.manager === name);
        return {name, ...(s ? {signer:{name:s.name,title:s.title}} : {})};
      }),
    };
    return [{source, inputs}];
  });
}
