/** Parties from one stored generated agreement, never from questionnaire edits. */
export interface AgreementSource {
  id: string;
  company: string;
  sElection: boolean;
  number: number;
  effectiveDate: string;
  effectiveDateIso: string | null;
  members: { name: string; signatories?: string[]; jointHolding?: string; entitySigner?: { name: string; title: string } }[];
  managers: { name: string; signer?: { name: string; title: string } }[];
}
