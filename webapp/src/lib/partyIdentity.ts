/** Explicit Individual/Entity selection wins over hidden values from an earlier choice.
 * Legacy rows without a discriminator retain their original fallback behavior. */
export interface PartyIdentity {
  memberType?: string; personOrEntity?: string;
  firstName?: string; lastName?: string; suffix?: string;
  fullName?: string; fullLegalName?: string;
  entityName?: string; businessEntityName?: string;
}
export function selectedParty<T extends PartyIdentity>(party: T): T {
  const kind = party.memberType ?? party.personOrEntity;
  if (kind === "ENTITY") return { ...party, firstName: "", lastName: "", suffix: "", fullName: "", fullLegalName: "" };
  if (kind === "INDIVIDUAL") return { ...party, entityName: "", businessEntityName: "" };
  return { ...party };
}
