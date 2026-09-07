// The S corporation election details form — split from ServicesCard.tsx on
// 29 Aug 2026 (the one mechanical seam in that file; the main card is a
// single stateful component and stays whole).
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { PlusCircle, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { AddressAutocomplete } from "@/components/forms/florida-llc/AddressAutocomplete";

import type { ServiceOrder, ShareholderRow } from "./ServicesCard";
import { formatPhone, isoToTypedDate, typedDateToIso, formatTypedDate } from "./typedDate";
import { JOINT_KINDS, isJoint, type JointKind } from "@/lib/jointOwner";
import { ELIGIBILITY_ACKNOWLEDGMENT, evaluate2553Timing, type TimingResult } from "@/lib/form2553Timing";


const EMPTY_ROW: ShareholderRow = { name: "", address: "", percentage: "", dateAcquired: "", atFormation: true, ssn: "", joint: "", name2: "", ssn2: "", address2: "", sameAddress: true };


/** The certification a client gives before we build the form. They sign the
 *  finished Form 2553 under penalties of perjury and mail it themselves — we
 *  prepare it from what they supply and file nothing. */
const CERTIFICATION =
  "I am authorized to provide this information on behalf of the company. I understand it will be " +
  "used to prepare IRS Form 2553, that I must sign that form under penalties of perjury before " +
  "filing it with the IRS, and that knowingly giving false information to the IRS may result in " +
  "civil penalties and criminal prosecution. Having examined the information I am submitting, I " +
  "declare that it is true, correct, and complete to the best of my knowledge and belief. I " +
  "understand MyFloridaSeriesLLC prepares the form from what I supply, does not verify it, does " +
  "not file it, and does not give legal or tax advice.";

const OTHER = "__other__";

/** Form SS-4 is signed under penalties of perjury too, and we prepare it from
 *  what the client gives us. */
export const EIN_CERTIFICATION =
  "I am authorized to provide this information on behalf of the company. I understand it will be " +
  "used to apply for a federal Employer Identification Number on IRS Form SS-4, which is signed " +
  "under penalties of perjury, and that knowingly giving false information to the IRS may result " +
  "in civil penalties and criminal prosecution. I declare that the information I am submitting is " +
  "true, correct, and complete to the best of my knowledge and belief.";

/** Everything typed into the form, held by the parent so that closing the
 *  dialog loses nothing (Adam, 6 Sep 2026: "If you accidentally tap outside
 *  the form, it closes and you lose all your information"). Page memory
 *  only — never storage: the rows carry Social Security numbers. */
export interface SElectionDraft {
  ein: string;
  einPending: boolean;
  effectiveDate: string;
  officerName: string;
  officerOther: boolean;
  officerTitle: string;
  phone: string;
  rows: ShareholderRow[];
  certified: boolean;
  timingAcknowledged: boolean;
  eligibilityAcknowledged: boolean;
  formationDateTyped: string;
}

export function SElectionDetailsForm({
  order,
  members,
  clientName,
  priorFormationDate,
  todayEastern,
  draft,
  onDraftChange,
  onDone,
}: {
  order: ServiceOrder;
  members: { name: string; address: string }[];
  /** The signed-in client's own name — the usual signing officer. */
  clientName?: string;
  /** A date already on the order (an earlier build, or the office's
   *  correction) — the box starts from it. */
  priorFormationDate?: string;
  /** Florida's date, from our server — the gate never uses the device clock. */
  todayEastern?: string;
  draft?: SElectionDraft;
  onDraftChange?: (d: SElectionDraft) => void;
  onDone: () => void;
}) {
  // The signing officer is chosen from the people we already know — the
  // client and the company's owners — with "Someone else…" revealing a box
  // (Adam, 6 Sep 2026). The first known person is the default.
  const knownSigners = Array.from(
    new Set([clientName?.trim() ?? "", ...members.map((m) => m.name.trim())].filter(Boolean)),
  );
  const prior = order.details;
  // The client reads this off their filed Articles, one card above the form
  // (Adam, 6 Sep 2026). Everything about the deadline runs from it.
  const [formationDateTyped, setFormationDateTyped] = useState(draft?.formationDateTyped ?? isoToTypedDate(priorFormationDate));
  const formationDate = typedDateToIso(formationDateTyped) || undefined;
  const [ein, setEin] = useState(draft?.ein ?? prior.ein ?? "");
  const [einPending, setEinPending] = useState(draft ? draft.einPending : Boolean(prior.einPending));
  const [effectiveDate, setEffectiveDate] = useState(draft?.effectiveDate ?? isoToTypedDate(prior.effectiveDate));
  const [officerName, setOfficerName] = useState(draft?.officerName ?? prior.officerName ?? knownSigners[0] ?? "");
  // "Someone else…" stays selected while the typed name is not a known one.
  const [officerOther, setOfficerOther] = useState(
    draft ? draft.officerOther : Boolean(prior.officerName) && !knownSigners.includes(prior.officerName ?? ""),
  );
  const [officerTitle, setOfficerTitle] = useState(draft?.officerTitle ?? prior.officerTitle ?? "Manager");
  const [phone, setPhone] = useState(formatPhone(draft?.phone ?? prior.phone ?? ""));
  const [rows, setRows] = useState<ShareholderRow[]>(
    draft?.rows ??
    (prior.shareholders?.length
      ? prior.shareholders.map((s) => ({
          name: s.name,
          address: s.address,
          percentage: String(s.percentage),
          dateAcquired: isoToTypedDate(s.dateAcquired),
          atFormation: !s.dateAcquired || s.dateAcquired === prior.dateIncorporated,
          ssn: "",
          ssnLast4: s.ssnLast4,
          verified: true,
          joint: s.joint ?? "",
          name2: s.name2 ?? "",
          ssn2: "",
          ssnLast4Second: s.ssnLast4Second,
          address2: s.address2 ?? "",
          sameAddress: !s.address2,
          verified2: true,
        }))
      : [{ ...EMPTY_ROW }]),
  );
  const [certified, setCertified] = useState(draft?.certified ?? false);
  const [timingAcknowledged, setTimingAcknowledged] = useState(draft?.timingAcknowledged ?? false);
  const [eligibilityAcknowledged, setEligibilityAcknowledged] = useState(draft?.eligibilityAcknowledged ?? false);
  useEffect(() => {
    onDraftChange?.({ ein, einPending, effectiveDate, officerName, officerOther, officerTitle, phone, rows, certified, timingAcknowledged, eligibilityAcknowledged, formationDateTyped });
    // onDraftChange is a stable setter from the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ein, einPending, effectiveDate, officerName, officerOther, officerTitle, phone, rows, certified, timingAcknowledged, eligibilityAcknowledged, formationDateTyped]);

  // The Form 2553 timing gate (Adam, 6 Sep 2026): run on load and again
  // whenever the effective date changes. Late, too close, or an effective
  // date before the Articles blocks the form; "ok" shows the deadline and a
  // required acknowledgment. Our server runs the same gate on submission.
  const typedEffective = typedDateToIso(effectiveDate);
  let timing: TimingResult | null = null;
  if (formationDate && todayEastern && typedEffective !== null) {
    try {
      timing = evaluate2553Timing({ formationDate, effectiveDate: typedEffective || undefined, today: todayEastern });
    } catch {
      timing = null;
    }
  }
  // Beyond the IRS's window to elect at all: "at any time during the tax
  // year preceding the tax year it is to take effect."
  const premature = Boolean(typedEffective && todayEastern && Number(typedEffective.slice(0, 4)) > Number(todayEastern.slice(0, 4)) + 1);
  const acquiredTooEarly = rows.some((r) => !r.atFormation && formationDate && (typedDateToIso(r.dateAcquired) ?? "") !== "" && (typedDateToIso(r.dateAcquired) as string) < formationDate);
  const formationDateBad = formationDateTyped.trim() !== "" && typedDateToIso(formationDateTyped) === null;
  useEffect(() => {
    // A changed effective date changes the deadline: the acknowledgment
    // names it, so it must be given again.
    setTimingAcknowledged(false);
  }, [timing?.deadline]);
  const [formError, setFormError] = useState("");

  const patchRow = (i: number, p: Partial<ShareholderRow>) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...p } : r)));

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ documentId: string }>(`/api/portal/services/${order.id}/s-election-details`, {
        formationDate,
        ein,
        einPending,
        effectiveDate: typedDateToIso(effectiveDate) ?? "",
        officerName,
        officerTitle,
        phone: phone.replace(/\D/g, ""),
        certified,
        timingAcknowledged,
        eligibilityAcknowledged,
        shareholders: rows.map((r) => ({
          name: r.name,
          address: r.address,
          percentage: Number(r.percentage),
          dateAcquired: r.atFormation ? "" : (typedDateToIso(r.dateAcquired) ?? ""),
          ssn: r.ssn,
          joint: r.joint ?? "",
          name2: isJoint(r.joint) ? (r.name2 ?? "") : "",
          ssn2: isJoint(r.joint) ? (r.ssn2 ?? "") : "",
          address2: isJoint(r.joint) && r.sameAddress === false ? (r.address2 ?? "") : "",
        })),
      }),
    onSuccess: onDone,
    onError: (e) => setFormError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const pctTotal = rows.reduce((a, r) => a + (Number(r.percentage) || 0), 0);

  // Everything still standing between the client and the build, in the
  // form's own words (Adam, 6 Sep 2026: "there is no error message or other
  // method of telling the user exactly what is blocking"). The button stays
  // off while this list has anything on it.
  const stillNeeded: string[] = [];
  if (!formationDate) stillNeeded.push(formationDateBad ? "Enter the date the Division filed your Articles as MM/DD/YYYY" : "Enter the date the Division filed your Articles");
  if (!einPending && !/^\d{9}$/.test(ein.replace(/\D/g, ""))) stillNeeded.push("Enter the 9-digit EIN, or tick that you're obtaining ours");
  if (effectiveDate.trim() !== "" && typedDateToIso(effectiveDate) === null) stillNeeded.push("Enter the election effective date as MM/DD/YYYY, or leave it blank");
  if (formationDate && timing && timing.status !== "ok") stillNeeded.push("Resolve the deadline notice above — the election can't be built as dated");
  if (premature) stillNeeded.push("Choose an effective date no later than next year");
  if (acquiredTooEarly) stillNeeded.push("No owner can acquire an interest before the date on your Articles");
  if (!officerName.trim()) stillNeeded.push(officerOther ? "Enter the signing officer's full legal name" : "Choose the signing officer");
  if (!officerTitle.trim()) stillNeeded.push("Enter the officer's title");
  rows.forEach((r, i) => {
    const who = `Owner ${i + 1}`;
    if (!r.name.trim()) stillNeeded.push(`${who}: choose or enter the name`);
    if (isJoint(r.joint) && !(r.name2 ?? "").trim()) stillNeeded.push(`${who}: choose or enter the co-owner's name`);
    if (!r.address.trim()) stillNeeded.push(`${who}: enter the home address`);
    if (isJoint(r.joint) && r.sameAddress === false && !(r.address2 ?? "").trim()) stillNeeded.push(`${who}: enter the co-owner's home address, or tick "Same address"`);
    if (!(Number(r.percentage) > 0)) stillNeeded.push(`${who}: enter the ownership percentage`);
    if (r.atFormation === false && (r.dateAcquired.trim() === "" || typedDateToIso(r.dateAcquired) === null)) stillNeeded.push(`${who}: enter the date acquired as MM/DD/YYYY, or tick "Acquired at formation"`);
    if (!r.ssn && !r.ssnLast4) stillNeeded.push(`${who}: enter the SSN${r.name.trim() ? ` for ${r.name.trim()}` : ""}`);
    else if (r.ssn && r.ssn.replace(/\D/g, "").length !== 9) stillNeeded.push(`${who}: the SSN needs 9 digits`);
    if (isJoint(r.joint)) {
      if (!r.ssn2 && !r.ssnLast4Second) stillNeeded.push(`${who}: enter the SSN${(r.name2 ?? "").trim() ? ` for ${(r.name2 ?? "").trim()}` : " for the co-owner"}`);
      else if (r.ssn2 && r.ssn2.replace(/\D/g, "").length !== 9) stillNeeded.push(`${who}: the co-owner's SSN needs 9 digits`);
    }
  });
  if (Math.abs(pctTotal - 100) > 0.01) stillNeeded.push(`Ownership adds up to ${pctTotal}%, not 100%`);
  if (formationDate && timing?.status === "ok" && !timingAcknowledged) stillNeeded.push("Tick the deadline acknowledgment");
  if (!eligibilityAcknowledged) stillNeeded.push("Tick the shareholder eligibility acknowledgment");
  if (!certified) stillNeeded.push("Tick the certification");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError("");
        if (!formationDate) {
          setFormError("Enter the date the Division filed your Articles as MM/DD/YYYY — it's on your Articles of Organization, in your documents above.");
          return;
        }
        if (typedDateToIso(effectiveDate) === null) {
          setFormError("Enter the election effective date as MM/DD/YYYY, or leave it blank.");
          return;
        }
        if (rows.some((r) => !r.atFormation && typedDateToIso(r.dateAcquired) === null)) {
          setFormError("Enter each owner's date acquired as MM/DD/YYYY, or leave it blank.");
          return;
        }
        submit.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium">Date the Division filed your Articles</label>
          <Input
            value={formationDateTyped}
            onChange={(e) => setFormationDateTyped(formatTypedDate(e.target.value))}
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Date the Division filed your Articles"
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">
            It's on your Articles of Organization, in your documents above. Your Form 2553 deadline
            runs from this date.
          </p>
          {formationDateBad ? (
            <p className="text-xs text-destructive">Enter the date as MM/DD/YYYY.</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">EIN (9 digits)</label>
          <Input
            value={ein}
            onChange={(e) => setEin(e.target.value)}
            placeholder="XX-XXXXXXX"
            autoComplete="off"
            disabled={einPending}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={einPending}
              onChange={(e) => { setEinPending(e.target.checked); if (e.target.checked) setEin(""); }}
              className="h-3.5 w-3.5 accent-trust"
            />
            You're obtaining our EIN — use it when issued
          </label>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Election effective date</label>
          <Input
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(formatTypedDate(e.target.value))}
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Election effective date"
          />
          <p className="text-xs text-muted-foreground">
            Usually your formation date. Leave blank and we'll use the date on your filed Articles.
          </p>
        </div>
        {premature ? (
          <p className="text-sm font-medium text-destructive sm:col-span-2" data-testid="timing-premature">
            An election effective {effectiveDate} can't be made yet — the IRS accepts it only during the
            tax year before it takes effect.
          </p>
        ) : null}
        {acquiredTooEarly ? (
          <p className="text-sm font-medium text-destructive sm:col-span-2">
            An owner's date acquired is earlier than the date on your filed Articles.
          </p>
        ) : null}
        {timing ? (
          <div
            className={
              timing.status === "ok"
                ? "rounded-xl border border-trust/40 bg-trust/5 p-3 text-sm sm:col-span-2"
                : "rounded-xl border-2 border-destructive bg-destructive/5 p-3 text-sm sm:col-span-2"
            }
            data-testid={`timing-${timing.status}`}
          >
            <p className={timing.status === "ok" ? "font-medium" : "font-medium text-destructive"}>{timing.message}</p>
            {timing.status === "ok" && timing.acknowledgment ? (
              <label className="mt-2 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={timingAcknowledged}
                  onChange={(e) => setTimingAcknowledged(e.target.checked)}
                  aria-label="Deadline acknowledgment"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-trust"
                />
                <span className="text-xs leading-relaxed">{timing.acknowledgment}</span>
              </label>
            ) : null}
          </div>
        ) : null}
        {/* The officer's name and title share a line (Adam, 6 Sep 2026);
            the phone sits alone beneath them. */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Signing officer</label>
          <Select
            value={officerOther ? OTHER : officerName}
            onValueChange={(v) => {
              if (v === OTHER) {
                setOfficerOther(true);
                setOfficerName("");
                return;
              }
              setOfficerOther(false);
              setOfficerName(v);
            }}
          >
            <SelectTrigger aria-label="Signing officer">
              <SelectValue placeholder="Choose who signs…" />
            </SelectTrigger>
            <SelectContent>
              {knownSigners.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Someone else…</SelectItem>
            </SelectContent>
          </Select>
          {officerOther ? (
            <Input
              value={officerName}
              onChange={(e) => setOfficerName(e.target.value)}
              placeholder="Full legal name"
              aria-label="Signing officer's full legal name"
              autoComplete="off"
            />
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Officer title</label>
          <Input value={officerTitle} onChange={(e) => setOfficerTitle(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium">Phone for IRS questions</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onPaste={(e) => { e.preventDefault(); setPhone(formatPhone(e.clipboardData.getData("text"))); }}
            inputMode="tel"
            placeholder="(   )    -    "
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-2">
        {/* Who may be a shareholder — the IRS's tests, in Adam's words, and
            the liability line (6 Sep 2026). Required before building. */}
        <label className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-amber-900">
          <input
            type="checkbox"
            checked={eligibilityAcknowledged}
            onChange={(e) => setEligibilityAcknowledged(e.target.checked)}
            aria-label="Shareholder eligibility acknowledgment"
            className="mt-0.5 h-4 w-4 shrink-0 accent-trust"
          />
          <span className="text-xs leading-relaxed">{ELIGIBILITY_ACKNOWLEDGMENT}</span>
        </label>
        <p className="text-sm font-medium">Owners (every owner must be listed and will sign the form)</p>
        {rows.map((r, i) => {
          const ownerLabel = r.name.trim() || `Owner ${i + 1}`;
          const coLabel = (r.name2 ?? "").trim() || "co-owner";
          const ssnBox = (who: "first" | "second") => (
            <Input
              type="password"
              inputMode="numeric"
              placeholder={
                who === "first"
                  ? r.ssnLast4 ? `SSN on file •••-••-${r.ssnLast4}` : isJoint(r.joint) ? `SSN — ${ownerLabel}` : "SSN •••-••-••••"
                  : r.ssnLast4Second ? `SSN on file •••-••-${r.ssnLast4Second}` : `SSN — ${coLabel}`
              }
              title={
                who === "first"
                  ? r.ssnLast4 ? "Leave blank to keep the number already on file" : `${ownerLabel}'s Social Security number`
                  : r.ssnLast4Second ? "Leave blank to keep the number already on file" : `${coLabel}'s Social Security number`
              }
              aria-label={who === "first" ? (isJoint(r.joint) ? `SSN — ${ownerLabel}` : "SSN") : `SSN — ${coLabel}`}
              value={who === "first" ? r.ssn : (r.ssn2 ?? "")}
              onChange={(e) => patchRow(i, who === "first" ? { ssn: e.target.value } : { ssn2: e.target.value })}
              className="w-48"
              autoComplete="off"
            />
          );
          const nameChooser = (who: "first" | "second") => {
            const current = who === "first" ? r.name : (r.name2 ?? "");
            const others = who === "first" ? members : members.filter((m) => m.name !== r.name);
            return (
              <div className="space-y-1.5">
                <Select
                  value={members.some((m) => m.name === current) ? current : current === "" ? "" : OTHER}
                  onValueChange={(v) => {
                    if (who === "first") {
                      if (v === OTHER) {
                        patchRow(i, { name: " ", verified: false, ssnLast4: undefined });
                        return;
                      }
                      const m = members.find((mm) => mm.name === v);
                      patchRow(i, { name: v, address: m?.address ?? r.address, verified: Boolean(m?.address), ssnLast4: undefined });
                    } else {
                      patchRow(i, { name2: v === OTHER ? " " : v, ssnLast4Second: undefined });
                    }
                  }}
                >
                  <SelectTrigger aria-label={who === "first" ? "Owner" : "Co-owner"}>
                    <SelectValue placeholder={who === "first" ? "Select an owner…" : "Select the co-owner…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other — enter a name</SelectItem>
                  </SelectContent>
                </Select>
                {current !== "" && !members.some((m) => m.name === current) ? (
                  <Input
                    placeholder={who === "first" ? "Owner's full legal name" : "Co-owner's full legal name"}
                    aria-label={who === "first" ? "Owner's full legal name" : "Co-owner's full legal name"}
                    value={current.trim() === "" ? "" : current}
                    onChange={(e) => patchRow(i, who === "first" ? { name: e.target.value, ssnLast4: undefined } : { name2: e.target.value, ssnLast4Second: undefined })}
                    autoComplete="off"
                  />
                ) : null}
              </div>
            );
          };
          const addressBox = (who: "first" | "second") => {
            const value = who === "first" ? r.address : (r.address2 ?? "");
            const verified = who === "first" ? r.verified : r.verified2;
            return (
              <div className="space-y-1">
                <AddressAutocomplete
                  value={value}
                  placeholder={who === "first" ? "Home address" : "Co-owner's home address"}
                  onChangeText={(text) => patchRow(i, who === "first" ? { address: text, verified: false } : { address2: text, verified2: false })}
                  onSelect={(sug) => {
                    const full = `${sug.address1}, ${sug.city} ${sug.state} ${sug.zip}`;
                    patchRow(i, who === "first" ? { address: full, verified: true } : { address2: full, verified2: true });
                  }}
                />
                {value ? (
                  verified ? (
                    <p className="flex items-center gap-1 text-xs text-trust">
                      <CheckCircle2 className="h-3 w-3" /> Verified address
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Pick the address from the list so the IRS gets a deliverable address.
                    </p>
                  )
                ) : null}
              </div>
            );
          };
          return (
            /* One clearly headed card per owner (Adam, 7 Sep 2026: "place a
               clear demarcation between owners"). The joint choice sits to
               the right of the name; a co-owner gets their own block with
               their own name, address and number. */
            <div key={i} className="overflow-hidden rounded-xl border-2 border-foreground/60" data-testid="owner-card">
              <div className="flex items-center justify-between bg-foreground px-3 py-1.5 text-background">
                <span className="text-xs font-semibold uppercase tracking-wider" data-testid="owner-heading">Owner {i + 1}</span>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Remove owner"
                    onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}
                    className="flex items-center gap-1 text-xs text-background/80 hover:text-background"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" data-testid="owner-name-line">
                  {nameChooser("first")}
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">How held</span>
                    <Select
                      value={r.joint ?? ""}
                      onValueChange={(v) => patchRow(i, { joint: v as JointKind, ...(v === "" ? { name2: "", ssn2: "", address2: "", sameAddress: true } : {}) })}
                    >
                      <SelectTrigger aria-label="How the interest is held" className="w-full sm:w-72">
                        <SelectValue placeholder="Owned individually" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOINT_KINDS.map((k) => (
                          <SelectItem key={k.value || "solo"} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {addressBox("first")}
                {isJoint(r.joint) ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">{ssnBox("first")}</div>
                    <div className="ml-2 space-y-2 border-l-4 border-trust/60 pl-3" data-testid="co-owner-block">
                      <p className="text-xs font-semibold uppercase tracking-wider text-trust">Co-owner</p>
                      {nameChooser("second")}
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          aria-label="Same address"
                          checked={r.sameAddress !== false}
                          onChange={(e) => patchRow(i, { sameAddress: e.target.checked, ...(e.target.checked ? { address2: "", verified2: false } : {}) })}
                          className="h-4 w-4 accent-trust"
                        />
                        Same address as {ownerLabel}
                      </label>
                      {r.sameAddress === false ? addressBox("second") : null}
                      <div className="flex flex-wrap items-center gap-2">{ssnBox("second")}</div>
                    </div>
                  </>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">{isJoint(r.joint) ? "Combined ownership" : "Ownership"}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} max={100} step="0.01" placeholder="%"
                      aria-label={isJoint(r.joint) ? "Combined ownership percentage" : "Ownership percentage"}
                      value={r.percentage}
                      onChange={(e) => patchRow(i, { percentage: e.target.value })}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      aria-label="Acquired at formation"
                      checked={r.atFormation !== false}
                      onChange={(e) => patchRow(i, { atFormation: e.target.checked })}
                      className="h-4 w-4 accent-trust"
                    />
                    Acquired at formation
                  </label>
                  {r.atFormation === false ? (
                    <Input
                      title="Date the interest was acquired"
                      aria-label="Date the interest was acquired"
                      placeholder="Acquired MM/DD/YYYY"
                      inputMode="numeric"
                      autoComplete="off"
                      value={r.dateAcquired}
                      onChange={(e) => patchRow(i, { dateAcquired: formatTypedDate(e.target.value) })}
                      className="w-44"
                    />
                  ) : null}
                  {!isJoint(r.joint) ? ssnBox("first") : null}
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          {rows.length < 7 ? (
            <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Add owner
            </Button>
          ) : <span />}
          <p className={`text-xs font-medium ${Math.abs(pctTotal - 100) < 0.01 ? "text-trust" : "text-destructive"}`}>
            Total: {pctTotal}%
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Spouses or co-owners who hold an interest jointly (tenants by the entirety or joint
          tenants with right of survivorship): pick the joint kind on that owner's row and add
          the co-owner. The form lists both names and both Social Security numbers on one line
          with their combined percentage, and the instruction sheet directs <em>both</em> to
          sign that row's consent line.
        </p>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 p-3">
        <input
          type="checkbox"
          checked={certified}
          onChange={(e) => setCertified(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-trust"
        />
        <span className="text-xs leading-relaxed">{CERTIFICATION}</span>
      </label>

      {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
      {stillNeeded.length > 0 ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="still-needed">
          <p className="font-medium">Still needed before we can build your package:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {stillNeeded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          We build your package immediately — you'll be able to download it here.
        </p>
        <Button
          type="submit"
          disabled={submit.isPending || stillNeeded.length > 0}
          className="rounded-full"
        >
          {submit.isPending ? "Building your package…" : "Certify and build my package"}
        </Button>
      </DialogFooter>
    </form>
  );
}

