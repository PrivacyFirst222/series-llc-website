import { hasFirstAndLast } from './personName';

/** Identity and signer move together when a manager row is edited or removed. */
export interface AgreementManager {
  name?: string;
  isEntity?: boolean;
  signerName?: string;
  signerTitle?: string;
}
export function agreementManagers(seed: { managementStructure: string; managerNames: string[]; managerEntities?: boolean[] }, answers?: { managers?: AgreementManager[]; managerSigners?: { name?: string; title?: string }[] } | null): AgreementManager[] {
  if (seed.managementStructure === 'MEMBER_MANAGED') return [];
  // An explicitly emptied list must be validated, never replaced by the seed.
  return answers?.managers ?? seed.managerNames.map((name, i) => ({ name, isEntity: !!seed.managerEntities?.[i], signerName: answers?.managerSigners?.[i]?.name, signerTitle: answers?.managerSigners?.[i]?.title }));
}
export function managerProblem(managers: AgreementManager[]): string | null {
  if (!managers.length) return 'A manager-managed company needs at least one manager.';
  const names = new Set<string>();
  for (const m of managers) {
    const name = (m.name ?? '').trim();
    if (!name || (!m.isEntity && !hasFirstAndLast(name))) return 'Every manager needs a full legal name. Individuals need a first and last name.';
    if (names.has(name.toLowerCase())) return `List ${name} only once as a manager.`;
    names.add(name.toLowerCase());
    if (m.isEntity && (!hasFirstAndLast(m.signerName) || !(m.signerTitle ?? '').trim())) return `Name the person who signs for ${name} — first and last name — and their title.`;
  }
  return null;
}
