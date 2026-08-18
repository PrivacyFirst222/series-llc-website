import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, FileText, Heart, HelpCircle, History, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, taxationLabel } from "@/lib/datetime";
import { LEARN_MORE } from "@/content/oaLearnMore";
import { OwnershipEditor, type OwnershipRow } from "./OwnershipEditor";
import { shareValue, type OwnershipMode, type OwnershipShare } from "@/lib/ownership";

interface OaSeed {
  llcName: string;
  filingPath: string;
  managementStructure: string;
  managerNames: string[];
  principalAddress: string;
  members: { name: string; address: string }[];
  series: { name: string; purpose: string }[];
}

interface OaGeneration {
  id: string;
  document_id: string | null;
  template_version: string;
  amended_restated: boolean;
  generation_number: number;
  version: string | null;
  created_at: string;
}

interface MemberAnswer {
  // Identity travels with the owner. Kept in a parallel array keyed by
  // position, deleting an owner would slide every share onto the wrong person.
  name?: string;
  address?: string;
  percentage?: number;
  numerator?: number;
  denominator?: number;
  contribution?: string;
  todBeneficiary?: string;
}
interface SeriesAnswer {
  purpose?: string;
  contribution?: string;

}
interface CoupleAnswer {
  a: number;
  b: number;
  form: "TBE" | "JTWROS";
  percentage?: number;
  numerator?: number;
  denominator?: number;
  contribution?: string;
  todBeneficiary?: string;
}
interface Answers {
  firstOrAmended?: "first" | "amended";
  sElection?: boolean;
  multiOwner?: boolean;
  effectiveDate?: string;
  authorized?: boolean;
  contributionToCompany?: string;
  members?: MemberAnswer[];
  series?: SeriesAnswer[];
  couples?: CoupleAnswer[];
  ownershipMode?: OwnershipMode;
  includeCapitalCalls?: boolean;
  capitalCallCap?: number;
  competition?: "A" | "B";
  includeShotgun?: boolean;
  borrowingThreshold?: number;
}

interface OaData {
  seed: OaSeed;
  version: string;
  multiOwner: boolean;
  memberManaged: boolean;
  blocked: boolean;
  templateVersion: string;
  answers: Answers;
  generations: OaGeneration[];
}

type Unit =
  | { kind: "couple"; ci: number; label: string; note: string; repIndex: number }
  | { kind: "member"; index: number; label: string };

const FORM_LABEL: Record<"TBE" | "JTWROS", string> = {
  TBE: "tenants by the entirety",
  JTWROS: "joint tenants with right of survivorship",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function LearnMore({ id }: { id: keyof typeof LEARN_MORE }) {
  const [open, setOpen] = useState(false);
  const screen = LEARN_MORE[id];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-trust underline underline-offset-2"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Learn More
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{screen.title}</DialogTitle>
          </DialogHeader>
          {screen.body}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionCard({
  title,
  learnMore,
  children,
}: {
  title: string;
  learnMore?: keyof typeof LEARN_MORE;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {learnMore ? <LearnMore id={learnMore} /> : null}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export default function OAQuestionnaire() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [a, setA] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  // Three questions decide which of the eight forms this is. They come first,
  // on their own screen, so the rest of the page is only ever the questions
  // that form actually has.
  const [stage, setStage] = useState<"start" | "details">("start");
  const [pairA, setPairA] = useState<number | "">("");
  const [pairB, setPairB] = useState<number | "">("");
  const [pairForm, setPairForm] = useState<"TBE" | "JTWROS">("TBE");

  const meQuery = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<{ email: string }>("/api/auth/me"),
    retry: false,
  });
  const oaQuery = useQuery({
    queryKey: ["portal-oa"],
    queryFn: () => api.get<OaData>("/api/portal/oa"),
    enabled: meQuery.isSuccess,
    retry: false,
  });

  const data = oaQuery.data;

  useEffect(() => {
    if (data && !loaded) {
      const saved = data.answers ?? {};
      setA({
        firstOrAmended:
          saved.firstOrAmended ??
          (data.seed.filingPath === "CONVERT" || data.generations.length > 0 ? "amended" : "first"),
        sElection: saved.sElection ?? false,
        effectiveDate: saved.effectiveDate ?? todayIso(),
        authorized: saved.authorized ?? false,
        contributionToCompany: saved.contributionToCompany ?? "",
        multiOwner: saved.multiOwner ?? data.multiOwner,
        // Once the client has edited the owners, the draft IS the list — it may
        // be longer or shorter than the one captured at formation.
        members: saved.members?.some((m) => (m?.name ?? "").trim() !== "")
          ? saved.members
          : data.seed.members.map((m, i) => ({
              ...(saved.members?.[i] ?? {}),
              name: m.name,
              address: m.address,
            })),
        series: data.seed.series.map((_, i) => saved.series?.[i] ?? {}),
        couples: saved.couples ?? [],
        ownershipMode: saved.ownershipMode ?? "percent",
        includeCapitalCalls: saved.includeCapitalCalls,
        capitalCallCap: saved.capitalCallCap,
        competition: saved.competition,
        includeShotgun: saved.includeShotgun,
        borrowingThreshold: saved.borrowingThreshold,
      });
      setLoaded(true);
    }
  }, [data, loaded]);

  const save = useMutation({
    mutationFn: (answers: Answers) => api.put("/api/portal/oa/answers", answers),
  });

  const generate = useMutation({
    mutationFn: (answers: Answers) =>
      api.post<{ documentId: string; title: string }>("/api/portal/oa/generate", answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-oa"] });
      queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const patch = (p: Partial<Answers>) => {
    setA((prev) => {
      const next = { ...prev, ...p };
      save.mutate(next);
      return next;
    });
  };
  const patchMember = (i: number, p: Partial<MemberAnswer>) => {
    const members = [...(a.members ?? [])];
    members[i] = { ...members[i], ...p };
    patch({ members });
  };
  const patchSeries = (i: number, p: Partial<SeriesAnswer>) => {
    const series = [...(a.series ?? [])];
    series[i] = { ...series[i], ...p };
    patch({ series });
  };
  const patchCouple = (ci: number, p: Partial<CoupleAnswer>) => {
    const couples = [...(a.couples ?? [])];
    couples[ci] = { ...couples[ci], ...p };
    patch({ couples });
  };

  const addOwner = () => patch({ members: [...(a.members ?? []), { name: "", address: "" }] });
  // Deleting an owner renumbers everyone after them. A spousal pairing holds
  // positions, not names, so the indexes have to move with the list or the
  // pairing quietly re-marries two different people.
  const removeOwner = (i: number) => {
    const members = (a.members ?? []).filter((_, k) => k !== i);
    const nextCouples = (a.couples ?? [])
      .filter((c) => c.a !== i && c.b !== i)
      .map((c) => ({ ...c, a: c.a > i ? c.a - 1 : c.a, b: c.b > i ? c.b - 1 : c.b }));
    patch({ members, couples: nextCouples });
  };

  const couples = a.couples ?? [];
  const pairedIdx = useMemo(() => new Set(couples.flatMap((c) => [c.a, c.b])), [couples]);

  const owners = useMemo(() => a.members ?? [], [a.members]);
  // A just-added owner has no name yet. Falling back to "" leaves a blank row in
  // the ownership table and a blank line in the spouse pickers, so the client
  // cannot tell which owner a field belongs to.
  const ownerLabel = (m: MemberAnswer | undefined, i: number) => m?.name?.trim() || `Owner ${i + 1}`;

  const units: Unit[] = useMemo(() => {
    const out: Unit[] = [];
    const emitted = new Set<number>();
    owners.forEach((m, i) => {
      const ci = couples.findIndex((c) => c.a === i || c.b === i);
      if (ci >= 0) {
        if (emitted.has(ci)) return;
        emitted.add(ci);
        const c = couples[ci];
        out.push({
          kind: "couple",
          ci,
          label: `${ownerLabel(owners[c.a], c.a)} & ${ownerLabel(owners[c.b], c.b)}`,
          note: FORM_LABEL[c.form],
          repIndex: c.a,
        });
      } else {
        out.push({ kind: "member", index: i, label: ownerLabel(m, i) });
      }
    });
    return out;
  }, [owners, couples]);

  // The ownership question is hidden when the owners are a single unit — a
  // couple holding jointly, or one member — so nothing would otherwise record
  // their 100%. Write it once the units resolve.
  useEffect(() => {
    if (!loaded || units.length !== 1) return;
    const u = units[0];
    const current = u.kind === "couple" ? couples[u.ci]?.percentage : a.members?.[u.index]?.percentage;
    if (current === 100) return;
    if (u.kind === "couple") patchCouple(u.ci, { percentage: 100 });
    else patchMember(u.index, { percentage: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, units.length]);


  if (meQuery.isError) {
    navigate("/portal/login");
    return null;
  }
  if (oaQuery.isError) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">
          We couldn't find a formed LLC on your account yet. If you just completed checkout, your
          documents are being prepared — check back shortly or email support@myfloridaseriesllc.com.
        </p>
      </section>
    );
  }
  if (!data || !loaded) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading your agreement questionnaire…</p>
      </section>
    );
  }

  // The fact, not a string that encodes it. Deriving this from the version
  // string was safe only while the seed computed a three-valued lookalike;
  // the moment it returned the real eight-valued version, "member-single"
  // would have read as multi-owner and shown a sole owner the whole
  // multi-member block.
  const isMulti = a.multiOwner ?? data.multiOwner;
  // s. 5.4 exists in every form EXCEPT the member-managed single-owner ones,
  // where the owner manages and a gate would be the owner consenting to
  // themselves. Sole owners on the manager-managed forms were never shown this
  // and received $25,000 by default — the number deciding when their Manager
  // needs written consent to borrow, chosen by nobody.
  const hasApprovalGate = !(data.memberManaged && !isMulti);
  const unpaired = owners
    .map((m, i) => ({ name: ownerLabel(m, i), i }))
    .filter((x) => !pairedIdx.has(x.i));

  // The answer and the list can disagree, and neither one silently wins: we
  // cannot know which the client meant, so we say so and refuse to generate.
  const ownerCountMismatch =
    isMulti === (owners.length > 1)
      ? ""
      : isMulti
        ? "You answered that the LLC has more than one owner. Add the other owners here."
        : "You answered that the LLC has one owner, but more than one is listed. Remove the others here.";
  const incompleteOwner = owners.some((o) => !(o.name ?? "").trim() || !(o.address ?? "").trim());

  // Answering "more than one owner" with one name on file would otherwise dead-end
  // — there would be nowhere to type the second owner.
  const goToDetails = () => {
    if (a.multiOwner === true && owners.length < 2) {
      patch({ members: [...owners, { name: "", address: "" }] });
    }
    setStage("details");
  };

  const unitShare = (u: Unit): OwnershipShare => {
    const src = u.kind === "couple" ? couples[u.ci] : a.members?.[u.index];
    return { percentage: src?.percentage, numerator: src?.numerator, denominator: src?.denominator };
  };
  const setUnitShare = (u: Unit, share: OwnershipShare) => {
    if (u.kind === "couple") patchCouple(u.ci, share);
    else patchMember(u.index, share);
  };
  const unitKey = (u: Unit) => (u.kind === "couple" ? `c${u.ci}` : `m${u.index}`);
  const unitByKey = (key: string) =>
    units.find((u) => unitKey(u) === key) ?? units[0];
  const unitContribution = (u: Unit) =>
    u.kind === "couple" ? couples[u.ci]?.contribution : a.members?.[u.index]?.contribution;
  const setUnitContribution = (u: Unit, v: string) => {
    if (u.kind === "couple") patchCouple(u.ci, { contribution: v });
    else patchMember(u.index, { contribution: v });
  };
  const unitTod = (u: Unit) =>
    u.kind === "couple" ? couples[u.ci]?.todBeneficiary : a.members?.[u.index]?.todBeneficiary;
  const setUnitTod = (u: Unit, v: string) => {
    if (u.kind === "couple") patchCouple(u.ci, { todBeneficiary: v });
    else patchMember(u.index, { todBeneficiary: v });
  };

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-3xl">
        <Link to="/portal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to portal
        </Link>
        <span className="eyebrow mt-6 block">Operating agreement</span>
        <h1 className="display mt-2 text-3xl">{data.seed.llcName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Answer these questions and we'll generate your operating agreement as a PDF, built on the
          current master edition ({data.templateVersion}). Your answers save automatically — you can
          return anytime, and regenerate whenever anything changes.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          {data.memberManaged ? (
            <>
              Your company is <strong className="text-foreground">member-managed</strong>, so your
              agreement is built on our member-managed form: the owners manage the company
              themselves, decisions are made by majority of ownership, and there is no manager.
            </>
          ) : (
            <>
              Your company is <strong className="text-foreground">manager-managed</strong>, so your
              agreement is built on our manager-managed form: {data.seed.managerNames.length > 0 ? data.seed.managerNames.join(", ") : "your Manager"} runs
              the company day to day. We take this from your formation record — there's nothing to
              choose here.
            </>
          )}
        </div>
        {stage === "start" ? (
          <div className="mt-8 space-y-5">
            <p className="text-sm text-muted-foreground">
              Three questions decide which agreement you get. Everything after this is only the
              questions that agreement actually asks.
            </p>

            <QuestionCard title="Will there be more than one LLC owner?">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="multiOwner"
                  checked={a.multiOwner === false}
                  onChange={() => patch({ multiOwner: false })}
                  className="mt-0.5 accent-trust"
                />
                <span>One owner</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="multiOwner"
                  checked={a.multiOwner === true}
                  onChange={() => patch({ multiOwner: true })}
                  className="mt-0.5 accent-trust"
                />
                <span>More than one owner</span>
              </label>
              <p className="text-xs text-muted-foreground">
                You'll list the owners by name on the next screen. Owners are never filed with the
                State, so this can differ from what you told us when the company was formed.
              </p>
            </QuestionCard>

            <QuestionCard
              title="Is the LLC taxed as an S corporation, or will it be making an S election?"
              learnMore="sElection"
            >
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sElection"
                  checked={a.sElection !== true}
                  onChange={() => patch({ sElection: false })}
                  className="mt-0.5 accent-trust"
                />
                <span>No — use the standard agreement</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sElection"
                  checked={a.sElection === true}
                  onChange={() => patch({ sElection: true })}
                  className="mt-0.5 accent-trust"
                />
                <span>Yes — build the agreement on our S corporation form</span>
              </label>
              {a.sElection === true ? (
                <p className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                  The S corporation form keeps the election safe: every owner shares in the company
                  and in <em>every</em> protected series identically, in proportion to their
                  ownership percentages, and all distributions are strictly pro rata. Only choose
                  this if you have made — or your tax professional is making — the election with
                  the IRS.
                </p>
              ) : null}
            </QuestionCard>

            <QuestionCard
              title="Is this the LLC's first operating agreement, or an amendment to a previous one?"
              learnMore="firstOrAmended"
            >
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="firstOrAmended"
                  checked={a.firstOrAmended === "first"}
                  onChange={() => patch({ firstOrAmended: "first" })}
                  className="mt-0.5 accent-trust"
                />
                <span>This is the company's first operating agreement</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="firstOrAmended"
                  checked={a.firstOrAmended === "amended"}
                  onChange={() => patch({ firstOrAmended: "amended" })}
                  className="mt-0.5 accent-trust"
                />
                <span>I'm amending and restating an existing operating agreement</span>
              </label>
            </QuestionCard>

            <Button className="w-full rounded-full" size="lg" onClick={goToDetails}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <button
              type="button"
              onClick={() => setStage("start")}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Change those three answers
            </button>

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
                        onClick={() => removeOwner(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Full legal name"
                    value={m.name ?? ""}
                    onChange={(e) => patchMember(i, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Street address, city, state ZIP"
                    value={m.address ?? ""}
                    onChange={(e) => patchMember(i, { address: e.target.value })}
                  />
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

            {isMulti ? (
              <>
                {owners.length >= 2 ? (
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
                          onClick={() => patch({ couples: couples.filter((_, i) => i !== ci) })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {unpaired.length >= 2 ? (
                      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <select
                            value={pairA}
                            onChange={(e) => setPairA(e.target.value === "" ? "" : Number(e.target.value))}
                            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          >
                            <option value="">Select spouse…</option>
                            {unpaired.map((m) => (
                              <option key={m.i} value={m.i} disabled={pairB === m.i}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-muted-foreground">and</span>
                          <select
                            value={pairB}
                            onChange={(e) => setPairB(e.target.value === "" ? "" : Number(e.target.value))}
                            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                          >
                            <option value="">Select spouse…</option>
                            {unpaired.map((m) => (
                              <option key={m.i} value={m.i} disabled={pairA === m.i}>
                                {m.name}
                              </option>
                            ))}
                          </select>
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
                            disabled={pairA === "" || pairB === "" || pairA === pairB}
                            onClick={() => {
                              if (pairA === "" || pairB === "") return;
                              patch({ couples: [...couples, { a: pairA, b: pairB, form: pairForm }] });
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
                ) : null}

                {units.length > 1 ? (
                  <QuestionCard title="Ownership">
                    <p className="text-xs text-muted-foreground">
                      These control voting power, profit shares, and distributions at the company
                      level. A spousal pair holds one combined share. Use fractions when the split
                      won't divide evenly — three equal owners are 1/3 each, which no percentage
                      can express exactly.
                    </p>
                    <OwnershipEditor
                      mode={a.ownershipMode ?? "percent"}
                      rows={units.map((u) => ({
                        key: unitKey(u),
                        label: u.label,
                        note: u.kind === "couple" ? u.note : undefined,
                        share: unitShare(u),
                      }))}
                      onModeChange={(mode) => patch({ ownershipMode: mode })}
                      onShareChange={(key, share) => setUnitShare(unitByKey(key), share)}
                      onEqualize={(mode, shares) => {
                        const members = [...(a.members ?? [])];
                        const nextCouples = [...couples];
                        units.forEach((u, i) => {
                          if (u.kind === "couple") nextCouples[u.ci] = { ...nextCouples[u.ci], ...shares[i] };
                          else members[u.index] = { ...members[u.index], ...shares[i] };
                        });
                        patch({ ownershipMode: mode, members, couples: nextCouples });
                      }}
                    />
                  </QuestionCard>
                ) : null}

                <QuestionCard title="Additional capital calls" learnMore="capitalCalls">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="capcalls"
                      checked={a.includeCapitalCalls === true}
                      onChange={() => patch({ includeCapitalCalls: true })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Include — a majority can require contributions, up to an annual cap</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="capcalls"
                      checked={a.includeCapitalCalls === false}
                      onChange={() => patch({ includeCapitalCalls: false })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Omit — no owner can ever be required to contribute more</span>
                  </label>
                  {a.includeCapitalCalls ? (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-sm">Annual per-owner cap: $</span>
                      <Input
                        type="number"
                        min={0}
                        value={a.capitalCallCap ?? ""}
                        onChange={(e) =>
                          patch({ capitalCallCap: e.target.value === "" ? undefined : Number(e.target.value) })
                        }
                        className="w-32"
                      />
                    </div>
                  ) : null}
                </QuestionCard>

                <QuestionCard title="Competition between owners and the company" learnMore="competition">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="competition"
                      checked={a.competition === "A"}
                      onChange={() => patch({ competition: "A" })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Alternative A — owners may not compete while they're members</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="competition"
                      checked={a.competition === "B"}
                      onChange={() => patch({ competition: "B" })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Alternative B — owners may freely compete and invest elsewhere</span>
                  </label>
                </QuestionCard>

                <QuestionCard title='Deadlock "buy-sell" provision' learnMore="shotgun">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="shotgun"
                      checked={a.includeShotgun === true}
                      onChange={() => patch({ includeShotgun: true })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Include — a built-in exit if the owners deadlock</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="shotgun"
                      checked={a.includeShotgun === false}
                      onChange={() => patch({ includeShotgun: false })}
                      className="mt-0.5 accent-trust"
                    />
                    <span>Omit — no built-in deadlock mechanism</span>
                  </label>
                </QuestionCard>

                {data.seed.series.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-secondary/30 p-5 text-sm text-muted-foreground">
                    Each protected series is owned by the company itself, not by the owners
                    directly, so every owner shares in every series through their ownership of the
                    company. That keeps the series out of separate tax returns and there is nothing
                    to choose here.
                  </div>
                ) : null}
              </>
            ) : null}

            {hasApprovalGate ? (
              <QuestionCard title="Manager's borrowing limit" learnMore="threshold">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Debt above $</span>
                  <Input
                    type="number"
                    min={0}
                    value={a.borrowingThreshold ?? ""}
                    onChange={(e) =>
                      patch({ borrowingThreshold: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    className="w-32"
                  />
                  <span className="text-sm">
                    requires {isMulti ? "an owner vote" : "your written consent"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Above this amount your Manager cannot borrow, or guarantee anyone's debt, without
                  your written consent (Section 5.4). There is no default — choose the number.
                </p>
              </QuestionCard>
            ) : null}

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
                        placeholder='e.g., "$1,000 cash"'
                        value={unitContribution(u) ?? ""}
                        onChange={(e) => setUnitContribution(u, e.target.value)}
                      />
                    </div>
                  ))
                ) : (
                  <Input
                    placeholder='e.g., "$1,000 cash"'
                    value={a.contributionToCompany ?? ""}
                    onChange={(e) => patch({ contributionToCompany: e.target.value })}
                  />
                )}
                {data.seed.series.map((sr, i) => (
                  <div key={sr.name} className="flex items-center gap-3">
                    <span className="w-1/2 truncate text-sm">{sr.name}</span>
                    <Input
                      placeholder="Contribution to this series (optional)"
                      value={a.series?.[i]?.contribution ?? ""}
                      onChange={(e) => patchSeries(i, { contribution: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard title="Purpose of each series (optional)">
              {data.seed.series.map((sr, i) => (
                <div key={sr.name} className="flex items-center gap-3">
                  <span className="w-1/2 truncate text-sm">{sr.name}</span>
                  <Input
                    placeholder='e.g., "own and lease 123 Main Street"'
                    value={a.series?.[i]?.purpose ?? ""}
                    onChange={(e) => patchSeries(i, { purpose: e.target.value })}
                  />
                </div>
              ))}
            </QuestionCard>

            <QuestionCard title="Transfer-on-death designation (optional)" learnMore="tod">
              {a.sElection === true ? (
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

            <QuestionCard title="Effective date" learnMore="effectiveDate">
              <Input
                type="date"
                value={a.effectiveDate ?? ""}
                onChange={(e) => patch({ effectiveDate: e.target.value })}
                className="w-48"
              />
            </QuestionCard>

            <div className="rounded-2xl border border-border bg-card p-5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={a.authorized === true}
                  onChange={(e) => patch({ authorized: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-trust"
                />
                <span>
                  I am authorized to provide this information for the company
                  {isMulti ? " and its members" : ""}.
                </span>
              </label>
              {ownerCountMismatch ? (
                <p className="mt-3 text-sm text-destructive">{ownerCountMismatch}</p>
              ) : null}
              {incompleteOwner ? (
                <p className="mt-3 text-sm text-destructive">
                  Every owner needs a full legal name and an address — both are printed in Exhibit A
                  and the signature block.
                </p>
              ) : null}
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
              <Button
                className="mt-4 w-full rounded-full"
                size="lg"
                disabled={generate.isPending || a.authorized !== true || ownerCountMismatch !== "" || incompleteOwner}
                onClick={() => generate.mutate(a)}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generate.isPending
                  ? "Generating your agreement…"
                  : a.firstOrAmended === "amended"
                    ? "Generate Amended & Restated Operating Agreement (PDF)"
                    : "Generate Operating Agreement (PDF)"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                The finished PDF appears in your portal documents, ready to download, print, and
                sign. This is document assembly from your answers — not legal advice.
              </p>
            </div>

            {data.generations.length > 0 ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-trust" />
                  <h3 className="font-display text-base font-semibold">Your agreements</h3>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {data.generations.map((g, gi) => {
                    // The API returns newest first, so index 0 is the live one
                    // and the sequence number counts up from the oldest.
                    const isCurrent = gi === 0;
                    // The number is stored with the generation, not derived from
                    // position — deleting a draft must not renumber the others.
                    const seq = g.generation_number;
                    return (
                      <li key={g.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-sm">
                          <span className={isCurrent ? "font-medium" : "text-muted-foreground"}>
                            {g.amended_restated ? "Amended & Restated" : "Operating Agreement"} (No. {seq})
                          </span>
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isCurrent ? "bg-trust/10 text-trust" : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {isCurrent ? "Current" : "Superseded"}
                          </span>
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {taxationLabel(g.version ?? "")}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatDateTime(g.created_at)} · {g.template_version}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {g.document_id ? (
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                              <a href={`/api/portal/documents/${g.document_id}/download`}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                Download
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
