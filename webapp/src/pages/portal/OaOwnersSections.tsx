// The owner-identity, spousal-pairing, and per-unit-field cards — the
// questionnaire sections that edit the members/couples state web. Split from
// OAQuestionnaire.tsx on 29 Aug 2026 so their contracts are explicit props
// instead of closures over an 880-line component. The pairing pickers own
// their local selection state; committing a pair goes through onPair.
import { useEffect, useState } from "react";
import { Heart, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuestionCard } from "./OaQuestionCard";
import { FORM_LABEL, type CoupleAnswer, type MemberAnswer, type SeriesAnswer, type Unit } from "./oaTypes";
import { api } from "@/lib/api";

export function OwnersCard({ owners, isMulti, ownerCountMismatch, patchMember, removeOwner, addOwner }: {
  owners: MemberAnswer[];
  isMulti: boolean;
  ownerCountMismatch: string | null;
  patchMember: (i: number, p: Partial<MemberAnswer>) => void;
  removeOwner: (i: number) => void;
  addOwner: () => void;
}) {
  // The same soft USPS check the wizard runs on Continue, run here when the
  // client leaves an address field (Adam, 1 Sep 2026) — the whole line is
  // what prints in Exhibit A, so a missing city or wrong ZIP prints too.
  // Advisory only: it suggests, it never blocks.
  const [addrWarnings, setAddrWarnings] = useState<Record<number, { message: string; suggestedLine?: string }>>({});
  const [checkedLines, setCheckedLines] = useState<Record<number, string>>({});
  const clearAddrState = () => {
    setAddrWarnings({});
    setCheckedLines({});
  };
  const checkAddress = async (i: number) => {
    const line = (owners[i]?.address ?? "").trim();
    if (!line || checkedLines[i] === line) return;
    setCheckedLines((prev) => ({ ...prev, [i]: line }));
    try {
      const r = await api.post<{
        status: string;
        normalized: { address1: string; city: string; state: string; zip: string } | null;
      }>("/api/address/verify", { line });
      const norm = (v: string) => v.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
      const suggested = r.normalized
        ? `${r.normalized.address1}, ${r.normalized.city}, ${r.normalized.state} ${r.normalized.zip}`
        : "";
      let warning: { message: string; suggestedLine?: string } | null = null;
      if (r.status === "unverified") {
        warning = {
          message:
            "The Postal Service doesn't recognize this address. Make sure it has the street, city, state, and ZIP — it prints in the agreement exactly as typed.",
        };
      } else if (r.status === "missing_unit") {
        warning = {
          message: "This building requires a suite or unit number — add it, or keep the address exactly as typed.",
        };
      } else if (r.status === "invalid_unit") {
        warning = {
          message:
            "The Postal Service doesn't recognize that suite or unit number at this building. Please check it, or keep the address exactly as typed.",
        };
      } else if (r.status === "verified" && suggested && norm(suggested) !== norm(line)) {
        warning = { message: `The Postal Service lists this address as: ${suggested}.`, suggestedLine: suggested };
      }
      setAddrWarnings((prev) => {
        const next = { ...prev };
        if (warning) next[i] = warning;
        else delete next[i];
        return next;
      });
    } catch {
      // Best-effort — a checker outage never surfaces here.
    }
  };
  const applySuggested = (i: number) => {
    const suggestedLine = addrWarnings[i]?.suggestedLine;
    if (!suggestedLine) return;
    patchMember(i, { address: suggestedLine });
    setCheckedLines((prev) => ({ ...prev, [i]: suggestedLine }));
    setAddrWarnings((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  };
  return (
    <QuestionCard title={isMulti ? "Owners" : "Owner"}>
              <p className="text-xs text-muted-foreground">
                Every name and address here is printed in Exhibit A and in the signature block. They
                start from what you gave us when the company was formed — change them if ownership
                has changed since.
              </p>
              {owners.map((m, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isMulti ? `Owner ${i + 1}` : "Sole owner"}
                    </span>
                    {owners.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove ${m.name?.trim() || `owner ${i + 1}`}`}
                        onClick={() => {
                          // Warnings are keyed by row index; a removal
                          // renumbers the rows, so they all reset.
                          clearAddrState();
                          removeOwner(i);
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <Input
                    aria-label={`Full legal name of owner ${i + 1}`}
                    placeholder="Full legal name"
                    value={m.name ?? ""}
                    onChange={(e) => patchMember(i, { name: e.target.value })}
                  />
                  <Input
                    aria-label={`Address of owner ${i + 1}`}
                    placeholder="Street address, city, state ZIP"
                    value={m.address ?? ""}
                    onChange={(e) => {
                      patchMember(i, { address: e.target.value });
                      setAddrWarnings((prev) => {
                        if (!(i in prev)) return prev;
                        const next = { ...prev };
                        delete next[i];
                        return next;
                      });
                    }}
                    onBlur={() => void checkAddress(i)}
                  />
                  {addrWarnings[i] ? (
                    <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
                      {addrWarnings[i].message}
                      {addrWarnings[i].suggestedLine ? (
                        <div className="mt-2">
                          <Button type="button" size="sm" className="rounded-full" onClick={() => applySuggested(i)}>
                            Use this address
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {isMulti ? (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addOwner}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add owner
                </Button>
              ) : null}
              {ownerCountMismatch ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {ownerCountMismatch}
                </p>
              ) : null}
            </QuestionCard>
  );
}

export function SpousePairingCard({ owners, couples, unpaired, onPair, onUnpair }: {
  owners: MemberAnswer[];
  couples: CoupleAnswer[];
  unpaired: { i: number; name: string }[];
  onPair: (a: number, b: number, form: "TBE" | "JTWROS") => void;
  onUnpair: (ci: number) => void;
}) {
  const [pairA, setPairA] = useState<number | "">("");
  const [pairB, setPairB] = useState<number | "">("");
  const [pairForm, setPairForm] = useState<"TBE" | "JTWROS">("TBE");
  // A selection goes stale when its owner is deleted or renumbered before the
  // pair is committed: the browser blanks the visible option but the numeric
  // index survives in state, and clicking Pair saved a couple referencing a
  // nonexistent owner (Codex OA-PAIR-001). Whenever the unpaired list
  // changes, any selection it no longer contains is cleared.
  useEffect(() => {
    if (pairA !== "" && !unpaired.some((m) => m.i === pairA)) setPairA("");
    if (pairB !== "" && !unpaired.some((m) => m.i === pairB)) setPairB("");
  }, [unpaired, pairA, pairB]);
  const pairValid =
    pairA !== "" && pairB !== "" && pairA !== pairB &&
    unpaired.some((m) => m.i === pairA) && unpaired.some((m) => m.i === pairB);
  return (
    <QuestionCard title="Do any owners hold their interest together as spouses?" learnMore="spousal">
                    <p className="text-xs text-muted-foreground">
                      Married couples can hold one combined interest together — as tenants by the
                      entirety (Florida's strongest form for spouses) or as joint tenants with
                      right of survivorship. The couple owns equal, undivided shares of a single
                      interest and votes as one unit.
                    </p>
                    {couples.map((c, ci) => (
                      <div key={ci} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Heart className="h-4 w-4 shrink-0 text-trust" />
                          <span>
                            {owners[c.a]?.name} &amp; {owners[c.b]?.name}
                            <span className="ml-2 text-xs text-muted-foreground">{FORM_LABEL[c.form]}</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove pairing"
                          onClick={() => onUnpair(ci)}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {unpaired.length >= 2 ? (
                      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Select
                            value={pairA === "" ? "" : String(pairA)}
                            onValueChange={(v) => setPairA(Number(v))}
                          >
                            <SelectTrigger aria-label="First spouse" className="h-9 w-auto min-w-[11rem]">
                              <SelectValue placeholder="Select spouse…" />
                            </SelectTrigger>
                            <SelectContent>
                              {unpaired.map((m) => (
                                <SelectItem key={m.i} value={String(m.i)} disabled={pairB === m.i}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground">and</span>
                          <Select
                            value={pairB === "" ? "" : String(pairB)}
                            onValueChange={(v) => setPairB(Number(v))}
                          >
                            <SelectTrigger aria-label="Second spouse" className="h-9 w-auto min-w-[11rem]">
                              <SelectValue placeholder="Select spouse…" />
                            </SelectTrigger>
                            <SelectContent>
                              {unpaired.map((m) => (
                                <SelectItem key={m.i} value={String(m.i)} disabled={pairA === m.i}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name="pairForm"
                              checked={pairForm === "TBE"}
                              onChange={() => setPairForm("TBE")}
                              className="accent-trust"
                            />
                            Tenants by the entirety
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name="pairForm"
                              checked={pairForm === "JTWROS"}
                              onChange={() => setPairForm("JTWROS")}
                              className="accent-trust"
                            />
                            JTWROS
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={!pairValid}
                            onClick={() => {
                              // Belt over the effect's braces: never commit a
                              // pair whose indexes are not two distinct,
                              // currently-unpaired owners.
                              if (!pairValid) return;
                              if (typeof pairA !== "number" || typeof pairB !== "number") return;
                              onPair(pairA, pairB, pairForm);
                              setPairA("");
                              setPairB("");
                            }}
                          >
                            Pair as spouses
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </QuestionCard>
  );
}

export function UnitFieldCards({ units, isMulti, owners, seedSeries, series, contributionToCompany, sElection,
  unitContribution, setUnitContribution, unitTod, setUnitTod, patchSeries, setContributionToCompany, ownerLabel }: {
  units: Unit[];
  isMulti: boolean;
  owners: MemberAnswer[];
  seedSeries: { name: string }[];
  series: SeriesAnswer[] | undefined;
  contributionToCompany: string | undefined;
  sElection: boolean | undefined;
  unitContribution: (u: Unit) => string | undefined;
  setUnitContribution: (u: Unit, v: string) => void;
  unitTod: (u: Unit) => string | undefined;
  setUnitTod: (u: Unit, v: string) => void;
  patchSeries: (i: number, p: Partial<SeriesAnswer>) => void;
  setContributionToCompany: (v: string) => void;
  ownerLabel: (m: MemberAnswer | undefined, i: number) => string;
}) {
  return (
    <>
      <QuestionCard title="Initial contributions" learnMore="contributions">
              <div className="space-y-2">
                <label className="text-sm">
                  Contribution to the company{isMulti ? " (per owner below)" : ""}
                </label>
                {isMulti ? (
                  units.map((u) => (
                    <div key={u.kind === "couple" ? `c${u.ci}` : `m${u.index}`} className="flex items-center gap-3">
                      <span className="w-1/2 truncate text-sm">{u.label}</span>
                      <Input
                        aria-label={`Contribution to the company by ${u.label}`}
                        placeholder='e.g., "$1,000 cash"'
                        value={unitContribution(u) ?? ""}
                        onChange={(e) => setUnitContribution(u, e.target.value)}
                      />
                    </div>
                  ))
                ) : (
                  <Input
                    aria-label="Contribution to the company"
                    placeholder='e.g., "$1,000 cash"'
                    value={contributionToCompany ?? ""}
                    onChange={(e) => setContributionToCompany(e.target.value)}
                  />
                )}
                {seedSeries.map((sr, i) => (
                  <div key={sr.name} className="flex items-center gap-3">
                    <span className="w-1/2 truncate text-sm">{sr.name}</span>
                    <Input
                      aria-label={`Contribution to ${sr.name}`}
                      placeholder="Contribution to this series (optional)"
                      value={series?.[i]?.contribution ?? ""}
                      onChange={(e) => patchSeries(i, { contribution: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard title="Purpose of each series (optional)">
              {seedSeries.map((sr, i) => (
                <div key={sr.name} className="flex items-center gap-3">
                  <span className="w-1/2 truncate text-sm">{sr.name}</span>
                  <Input
                    aria-label={`Purpose of ${sr.name}`}
                    placeholder='e.g., "own and lease 123 Main Street"'
                    value={series?.[i]?.purpose ?? ""}
                    onChange={(e) => patchSeries(i, { purpose: e.target.value })}
                  />
                </div>
              ))}
            </QuestionCard>

            <QuestionCard title="Transfer-on-death designation (optional)" learnMore="tod">
              {sElection === true ? (
                <p className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                  Because of the S election, a beneficiary must be an eligible S corporation
                  shareholder — generally an individual (or certain trusts). A designation in favor
                  of an ineligible beneficiary has no effect while the election is in place.
                </p>
              ) : null}
              {(isMulti ? units : [{ kind: "member", index: 0, label: ownerLabel(owners[0], 0) } as Unit]).map((u) => (
                <div key={u.kind === "couple" ? `c${u.ci}` : `m${u.index}`} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="w-1/2 truncate text-sm">{u.label}</span>
                    <Input
                      aria-label={`Transfer-on-death beneficiary for ${u.label}`}
                      placeholder="Beneficiary name (or leave blank)"
                      value={unitTod(u) ?? ""}
                      onChange={(e) => setUnitTod(u, e.target.value)}
                    />
                  </div>
                  {u.kind === "couple" ? (
                    <p className="pl-[50%] text-xs text-muted-foreground">
                      Takes effect at the death of the last surviving spouse.
                    </p>
                  ) : null}
                </div>
              ))}
            </QuestionCard>
    </>
  );
}
