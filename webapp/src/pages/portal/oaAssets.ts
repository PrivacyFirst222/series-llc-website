// The asset list's problems, as the questionnaire shows them and as the
// server refuses them (Adam, 12 Sep 2026). Kept apart from the card so the
// component file exports only components.
import type { AssetAnswer } from "./oaTypes";

export function assetProblems(assets: AssetAnswer[], unitCount: number, seriesCount: number): string[] {
  const out: string[] = [];
  assets.forEach((asset, ai) => {
    const label = `Asset ${ai + 1}`;
    if (!(asset.description ?? "").trim()) out.push(`${label}: describe the asset.`);
    if (!(typeof asset.value === "number" && asset.value > 0)) out.push(`${label}: give an agreed value in dollars.`);
    if (unitCount > 1 && asset.contributedBy?.mode === "shares") {
      const shares = Array.from({ length: unitCount }, (_, i) => asset.contributedBy?.shares?.[i] ?? 0);
      if (Math.abs(shares.reduce((a, b) => a + b, 0) - 100) > 0.01) out.push(`${label}: the shares must total 100.`);
    }
    if (asset.kind === "cash") {
      const allocated = Array.from({ length: seriesCount }, (_, i) => asset.cashAllocations?.[i] ?? 0).reduce((a, b) => a + b, 0);
      if (allocated > (asset.value ?? 0) + 0.005) out.push(`${label}: the amounts allocated to the series exceed the cash contributed.`);
    } else if (asset.allocatedTo === undefined || (typeof asset.allocatedTo === "number" && (asset.allocatedTo < 0 || asset.allocatedTo >= seriesCount))) {
      out.push(`${label}: say where the company allocates it.`);
    }
  });
  return out;
}
