/**
 * Capital contributions as a list of assets (Adam, 12 Sep 2026): each asset
 * has an agreed value, says who contributed it — all owners equally, or by
 * share — and says where the Company allocates it: a series, or the Company
 * itself; cash may be split among the series by amount. Everything Exhibit A
 * and the Series Exhibits print about capital is computed here, once.
 */
export interface AssetAnswer {
  description?: string;
  kind?: "cash" | "other";
  /** Agreed value in dollars. */
  value?: number;
  contributedBy?: { mode?: "equal" | "shares"; shares?: number[] };
  /** For an asset other than cash: a series index, or the Company. */
  allocatedTo?: "company" | number;
  /** For cash: dollars allocated to each series, by series index. */
  cashAllocations?: number[];
}

export interface CapitalResult {
  errors: string[];
  /** What each ownership unit contributed, in the units' order. */
  memberContributions: string[];
  /** Exhibit A's contributed-assets rows. */
  assetRows: { description: string; value: string; by: string; to: string }[];
  /** Exhibit A's allocation rows, one per series. */
  seriesRows: { name: string; items: string; total: string }[];
  retainedItems: string;
  retained: string;
  /** The Series Exhibit cell for each series. */
  seriesCells: string[];
  /** The single-member form's one-line allocation list. */
  singleAllocationList: string;
  totalContributed: number;
}

export const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join("") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function computeCapital(assets: AssetAnswer[] | undefined, unitNames: string[], seriesNames: string[]): CapitalResult {
  const list = assets ?? [];
  const errors: string[] = [];
  const units = Math.max(1, unitNames.length);
  const perUnit = new Array(units).fill(0) as number[];
  const perSeriesItems: string[][] = seriesNames.map(() => []);
  const perSeriesTotal = seriesNames.map(() => 0);
  const retainedList: string[] = [];
  let retainedTotal = 0;
  let totalContributed = 0;
  const assetRows: CapitalResult["assetRows"] = [];

  list.forEach((asset, ai) => {
    const label = `Asset ${ai + 1}`;
    const description = (asset.description ?? "").trim();
    if (!description) errors.push(`${label}: describe the asset.`);
    const value = num(asset.value);
    if (value === null || value <= 0) errors.push(`${label}: give an agreed value in dollars.`);
    const v = value !== null && value > 0 ? value : 0;
    // Who contributed it.
    let shares: number[];
    if (units === 1) {
      shares = [100];
    } else if (asset.contributedBy?.mode === "shares") {
      shares = unitNames.map((_, i) => num(asset.contributedBy?.shares?.[i]) ?? 0);
      const sum = shares.reduce((a, b) => a + b, 0);
      if (shares.some((s) => s < 0 || s > 100) || Math.abs(sum - 100) > 0.01) errors.push(`${label}: the shares must total 100.`);
    } else {
      shares = unitNames.map(() => 100 / units);
    }
    shares.forEach((s, i) => { perUnit[i] += (v * s) / 100; });
    totalContributed += v;
    const by =
      units === 1
        ? unitNames[0] ?? ""
        : asset.contributedBy?.mode === "shares"
          ? joinNames(unitNames.map((n, i) => ({ n, s: shares[i] })).filter((x) => x.s > 0).map((x) => `${x.n} (${Number(x.s.toFixed(2))}%)`))
          : `${joinNames(unitNames)}, equally`;
    // Where the Company allocated it.
    let to = "";
    if (asset.kind === "cash") {
      const amounts = seriesNames.map((_, i) => num(asset.cashAllocations?.[i]) ?? 0);
      if (amounts.some((x) => x < 0)) errors.push(`${label}: an amount cannot be negative.`);
      const allocated = amounts.reduce((a, b) => a + b, 0);
      if (allocated > v + 0.005) errors.push(`${label}: the amounts allocated to the series exceed the cash contributed.`);
      const parts: string[] = [];
      amounts.forEach((amt, i) => {
        if (amt > 0) {
          parts.push(`${seriesNames[i]}: ${money(amt)}`);
          perSeriesItems[i].push(`${description} (${money(amt)})`);
          perSeriesTotal[i] += amt;
        }
      });
      const rest = Math.max(0, v - allocated);
      if (rest > 0) {
        parts.push(`the Company: ${money(rest)}`);
        retainedList.push(`${description} (${money(rest)})`);
        retainedTotal += rest;
      }
      to = parts.length > 0 ? parts.join("; ") : "the Company";
    } else {
      const dest = asset.allocatedTo;
      if (dest === "company") {
        to = "the Company";
        retainedList.push(`${description} (${money(v)})`);
        retainedTotal += v;
      } else if (typeof dest === "number" && Number.isInteger(dest) && dest >= 0 && dest < seriesNames.length) {
        to = seriesNames[dest];
        perSeriesItems[dest].push(`${description} (${money(v)})`);
        perSeriesTotal[dest] += v;
      } else {
        errors.push(`${label}: say where the Company allocates it.`);
      }
    }
    assetRows.push({ description, value: money(v), by, to });
  });

  const seriesRows = seriesNames.map((name, i) => ({
    name,
    items: perSeriesItems[i].length > 0 ? perSeriesItems[i].join("; ") : "None",
    total: money(perSeriesTotal[i]),
  }));
  const withItems = seriesRows.filter((r) => r.items !== "None");
  return {
    errors,
    memberContributions: perUnit.map((v) => money(v)),
    assetRows,
    seriesRows,
    retainedItems: retainedList.length > 0 ? retainedList.join("; ") : "None",
    retained: money(retainedTotal),
    seriesCells: seriesRows.map((r) => r.items),
    singleAllocationList: withItems.length > 0 ? withItems.map((r) => `${r.name}: ${r.items}`).join("; ") : "None",
    totalContributed,
  };
}
