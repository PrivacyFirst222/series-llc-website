// The Initial contributions card as a list of assets (Adam, 12 Sep 2026):
// each asset with an agreed value, who contributed it — all owners equally,
// or by share — and where the company allocates it; cash split among the
// series by amount. The server computes Exhibit A from the same list and
// refuses the same errors shown here.
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuestionCard } from "./OaQuestionCard";
import type { AssetAnswer, Unit } from "./oaTypes";
import { assetProblems } from "./oaAssets";

const withCommas = (n: number | undefined): string => (n === undefined || Number.isNaN(n) ? "" : Math.round(n).toLocaleString("en-US"));
const dollarsFrom = (typed: string): number | undefined => {
  const digits = typed.replace(/[^\d]/g, "");
  return digits ? Number(digits) : undefined;
};
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;


export function OaAssetsCard({ units, isMulti, seedSeries, assets, setAssets }: {
  units: Unit[];
  isMulti: boolean;
  seedSeries: { name: string }[];
  assets: AssetAnswer[];
  setAssets: (next: AssetAnswer[]) => void;
}) {
  const unitCount = isMulti ? units.length : 1;
  const patchAsset = (i: number, p: Partial<AssetAnswer>) => setAssets(assets.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const removeAsset = (i: number) => setAssets(assets.filter((_, k) => k !== i));
  const addAsset = () => setAssets([...assets, { description: "", kind: "other", contributedBy: { mode: "equal" } }]);
  const problems = assetProblems(assets, unitCount, seedSeries.length);
  const problemFor = (i: number) => problems.filter((p) => p.startsWith(`Asset ${i + 1}:`)).map((p) => p.replace(/^Asset \d+: /, ""));
  return (
    <QuestionCard title="Initial contributions" learnMore="contributions">
      <div className="space-y-4">
        <div className="space-y-2 text-sm text-muted-foreground" data-testid="contribution-explanation">
          <p>
            List everything the owners are putting into the company: cash, real property, vehicles,
            equipment, contracts. Give each asset an agreed value, say who contributed it, and say
            where the company allocates it.
          </p>
          <p>
            Example: two owners transfer three rental properties and $50,000 together. Property 1
            goes to Series 1, Property 2 to Series 2, Property 3 to Series 3; $10,000 goes to Series
            1, $15,000 to Series 2, and $25,000 to Series 3.
          </p>
          <p>
            Describe each asset so a stranger could identify it: a property by its address, or by
            reference to a schedule or attachment you keep with the agreement. To put part of a
            property in one series and part in another, list each part as its own asset, such as
            &ldquo;one-third interest in 123 Main Street.&rdquo;
          </p>
        </div>

        {assets.map((asset, i) => {
          const errs = problemFor(i);
          const shares = Array.from({ length: unitCount }, (_, k) => asset.contributedBy?.shares?.[k]);
          const shareTotal = shares.reduce<number>((a, b) => a + (b ?? 0), 0);
          const cashAllocated = seedSeries.reduce((a, _, k) => a + (asset.cashAllocations?.[k] ?? 0), 0);
          const cashRest = Math.max(0, (asset.value ?? 0) - cashAllocated);
          return (
            <div key={i} className="space-y-3 rounded-xl border border-border p-4" data-testid="asset-row">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Asset {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" className="rounded-full" aria-label={`Remove asset ${i + 1}`} onClick={() => removeAsset(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                aria-label={`Description of asset ${i + 1}`}
                placeholder='e.g., "123 Main Street, Orlando" or "Cash"'
                value={asset.description ?? ""}
                onChange={(e) => patchAsset(i, { description: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name={`asset-kind-${i}`} checked={asset.kind !== "cash"} onChange={() => patchAsset(i, { kind: "other", cashAllocations: undefined })} className="accent-trust" />
                  Property or other asset
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={`asset-kind-${i}`} checked={asset.kind === "cash"} onChange={() => patchAsset(i, { kind: "cash", allocatedTo: undefined })} className="accent-trust" />
                  Cash
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-1/3 shrink-0">Agreed value $</span>
                <Input
                  inputMode="numeric"
                  aria-label={`Agreed value of asset ${i + 1}`}
                  value={withCommas(asset.value)}
                  onChange={(e) => patchAsset(i, { value: dollarsFrom(e.target.value) })}
                  className="w-40"
                />
              </div>

              {unitCount > 1 ? (
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Contributed by</div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`asset-by-${i}`} checked={asset.contributedBy?.mode !== "shares"} onChange={() => patchAsset(i, { contributedBy: { mode: "equal" } })} className="accent-trust" />
                      All owners equally
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`asset-by-${i}`} checked={asset.contributedBy?.mode === "shares"} onChange={() => patchAsset(i, { contributedBy: { mode: "shares", shares: asset.contributedBy?.shares ?? [] } })} className="accent-trust" />
                      By share
                    </label>
                  </div>
                  {asset.contributedBy?.mode === "shares" ? (
                    <div className="space-y-1">
                      {units.map((u, k) => (
                        <div key={u.kind === "couple" ? `c${u.ci}` : `m${u.index}`} className="flex items-center gap-2">
                          <span className="w-1/2 truncate">{u.label}</span>
                          <Input
                            inputMode="decimal"
                            aria-label={`Share of asset ${i + 1} contributed by ${u.label}`}
                            value={shares[k] === undefined ? "" : String(shares[k])}
                            onChange={(e) => {
                              const next = [...Array.from({ length: unitCount }, (_, j) => asset.contributedBy?.shares?.[j] ?? 0)];
                              next[k] = e.target.value === "" ? 0 : Number(e.target.value);
                              patchAsset(i, { contributedBy: { mode: "shares", shares: next } });
                            }}
                            className="w-24"
                          />
                          <span>%</span>
                        </div>
                      ))}
                      <p className={`text-xs ${Math.abs(shareTotal - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`} data-testid={`asset-${i}-share-total`}>
                        Total: {Number(shareTotal.toFixed(2))}%{Math.abs(shareTotal - 100) > 0.01 ? " — shares must total 100" : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2 text-sm">
                <div className="font-medium">Allocated to</div>
                {asset.kind === "cash" ? (
                  <div className="space-y-1">
                    {seedSeries.map((sr, k) => (
                      <div key={sr.name} className="flex items-center gap-2">
                        <span className="w-1/2 truncate">{sr.name}</span>
                        <span>$</span>
                        <Input
                          inputMode="numeric"
                          aria-label={`Amount of asset ${i + 1} allocated to ${sr.name}`}
                          value={withCommas(asset.cashAllocations?.[k])}
                          onChange={(e) => {
                            const next = seedSeries.map((_, j) => asset.cashAllocations?.[j] ?? 0);
                            next[k] = dollarsFrom(e.target.value) ?? 0;
                            patchAsset(i, { cashAllocations: next });
                          }}
                          className="w-40"
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground" data-testid={`asset-${i}-retained`}>
                      Retained by the company: {money(cashRest)}
                    </p>
                  </div>
                ) : (
                  <Select
                    value={asset.allocatedTo === undefined ? "" : String(asset.allocatedTo)}
                    onValueChange={(v) => patchAsset(i, { allocatedTo: v === "company" ? "company" : Number(v) })}
                  >
                    <SelectTrigger aria-label={`Where asset ${i + 1} is allocated`} className="w-full">
                      <SelectValue placeholder="Choose a series or the company" />
                    </SelectTrigger>
                    <SelectContent>
                      {seedSeries.map((sr, k) => (
                        <SelectItem key={sr.name} value={String(k)}>{sr.name}</SelectItem>
                      ))}
                      <SelectItem value="company">The company itself</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              {errs.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" data-testid={`asset-${i}-problems`}>
                  {errs.map((e) => <li key={e}>{e}</li>)}
                </ul>
              ) : null}
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addAsset} data-testid="add-asset">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add asset
        </Button>
      </div>
    </QuestionCard>
  );
}
