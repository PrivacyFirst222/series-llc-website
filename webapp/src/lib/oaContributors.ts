/** Contributor identities survive owner edits; positions are only a display order. */
export interface ContributorOwner { id?: string; name?: string }
export interface ContributorCouple { a: number; b: number }
export interface ContributorAllocation {
  mode?: "equal" | "shares";
  shares?: number[];
  unitIds?: string[];
  needsReview?: boolean;
}
export function contributorUnits(owners: ContributorOwner[], couples: ContributorCouple[]) {
  const emitted = new Set<number>();
  return owners.flatMap((owner, i) => {
    const ci = couples.findIndex(c => c.a === i || c.b === i);
    if (ci < 0) return [{ id: owner.id ?? `legacy:${i}`, label: owner.name ?? `Owner ${i + 1}` }];
    if (emitted.has(ci)) return [];
    emitted.add(ci);
    const c = couples[ci];
    return [{ id: [owners[c.a]?.id ?? `legacy:${c.a}`, owners[c.b]?.id ?? `legacy:${c.b}`].sort().join("+"), label: `${owners[c.a]?.name ?? ""} and ${owners[c.b]?.name ?? ""}` }];
  });
}
export function reconcileContributors<T extends { contributedBy?: ContributorAllocation }>(assets: T[], before: string[], after: string[]): T[] {
  return assets.map(asset => {
    const by = asset.contributedBy ?? { mode: "equal" as const };
    const ids = by.unitIds ?? before;
    if (ids.length === after.length && ids.every((id, i) => id === after[i])) {
      return { ...asset, contributedBy: { ...by, unitIds: after } };
    }
    const oldShares = ids.map((_, i) => by.mode === "shares" ? by.shares?.[i] ?? 0 : 100 / ids.length);
    // An unchanged unit retains its own allocation. A new/merged/split unit
    // needs the client's decision; never give it the share at its new index.
    const shares = after.map(id => { const i = ids.indexOf(id); return i < 0 ? 0 : oldShares[i]; });
    return { ...asset, contributedBy: { mode: "shares" as const, shares, unitIds: after, needsReview: true } };
  });
}
export const CONTRIBUTOR_REVIEW = "The owner list changed. Confirm who contributed each asset before generating the agreement.";
