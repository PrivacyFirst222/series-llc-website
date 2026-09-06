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
import { isoToTypedDate, typedDateToIso } from "./typedDate";

const EMPTY_ROW: ShareholderRow = { name: "", address: "", percentage: "", dateAcquired: "", atFormation: true, ssn: "" };


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
}

export function SElectionDetailsForm({
  order,
  members,
  clientName,
  draft,
  onDraftChange,
  onDone,
}: {
  order: ServiceOrder;
  members: { name: string; address: string }[];
  /** The signed-in client's own name — the usual signing officer. */
  clientName?: string;
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
  const [ein, setEin] = useState(draft?.ein ?? prior.ein ?? "");
  const [einPending, setEinPending] = useState(draft ? draft.einPending : Boolean(prior.einPending));
  const [effectiveDate, setEffectiveDate] = useState(draft?.effectiveDate ?? isoToTypedDate(prior.effectiveDate));
  const [officerName, setOfficerName] = useState(draft?.officerName ?? prior.officerName ?? knownSigners[0] ?? "");
  // "Someone else…" stays selected while the typed name is not a known one.
  const [officerOther, setOfficerOther] = useState(
    draft ? draft.officerOther : Boolean(prior.officerName) && !knownSigners.includes(prior.officerName ?? ""),
  );
  const [officerTitle, setOfficerTitle] = useState(draft?.officerTitle ?? prior.officerTitle ?? "Manager");
  const [phone, setPhone] = useState(draft?.phone ?? prior.phone ?? "");
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
        }))
      : [{ ...EMPTY_ROW }]),
  );
  const [certified, setCertified] = useState(draft?.certified ?? false);
  useEffect(() => {
    onDraftChange?.({ ein, einPending, effectiveDate, officerName, officerOther, officerTitle, phone, rows, certified });
    // onDraftChange is a stable setter from the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ein, einPending, effectiveDate, officerName, officerOther, officerTitle, phone, rows, certified]);
  const [formError, setFormError] = useState("");

  const patchRow = (i: number, p: Partial<ShareholderRow>) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...p } : r)));

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ documentId: string }>(`/api/portal/services/${order.id}/s-election-details`, {
        ein,
        einPending,
        effectiveDate: typedDateToIso(effectiveDate) ?? "",
        officerName,
        officerTitle,
        phone,
        certified,
        shareholders: rows.map((r) => ({
          name: r.name,
          address: r.address,
          percentage: Number(r.percentage),
          dateAcquired: r.atFormation ? "" : (typedDateToIso(r.dateAcquired) ?? ""),
          ssn: r.ssn,
        })),
      }),
    onSuccess: onDone,
    onError: (e) => setFormError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const pctTotal = rows.reduce((a, r) => a + (Number(r.percentage) || 0), 0);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError("");
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
            onChange={(e) => setEffectiveDate(e.target.value)}
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Usually your formation date. Leave blank and we'll use the date on your filed Articles.
          </p>
        </div>
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
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Owners (every owner must be listed and will sign the form)</p>
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {/* Owners are usually the members on the formation record —
                  choosing one fills in the address we already verified. */}
              <div className="space-y-1.5">
                <Select
                  value={members.some((m) => m.name === r.name) ? r.name : r.name === "" ? "" : OTHER}
                  onValueChange={(v) => {
                    if (v === OTHER) {
                      patchRow(i, { name: " ", address: r.address, verified: false });
                      return;
                    }
                    const m = members.find((mm) => mm.name === v);
                    patchRow(i, { name: v, address: m?.address ?? r.address, verified: Boolean(m?.address) });
                  }}
                >
                  <SelectTrigger aria-label="Owner">
                    <SelectValue placeholder="Select an owner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other — enter a name</SelectItem>
                  </SelectContent>
                </Select>
                {r.name !== "" && !members.some((m) => m.name === r.name) ? (
                  <Input
                    placeholder="Owner's full legal name"
                    value={r.name.trim() === "" ? "" : r.name}
                    onChange={(e) => patchRow(i, { name: e.target.value })}
                    autoComplete="off"
                  />
                ) : null}
              </div>
              <div className="space-y-1">
                <AddressAutocomplete
                  value={r.address}
                  placeholder="Home address"
                  onChangeText={(text) => patchRow(i, { address: text, verified: false })}
                  onSelect={(s) =>
                    patchRow(i, {
                      address: `${s.address1}, ${s.city} ${s.state} ${s.zip}`,
                      verified: true,
                    })
                  }
                />
                {r.address ? (
                  r.verified ? (
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={0} max={100} step="0.01" placeholder="%"
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
                  onChange={(e) => patchRow(i, { dateAcquired: e.target.value })}
                  className="w-44"
                />
              ) : null}
              <Input
                type="password"
                inputMode="numeric"
                placeholder={r.ssnLast4 ? `SSN on file •••-••-${r.ssnLast4}` : "SSN •••-••-••••"}
                title={r.ssnLast4 ? "Leave blank to keep the number already on file" : "Social Security number"}
                value={r.ssn}
                onChange={(e) => patchRow(i, { ssn: e.target.value })}
                className="w-44"
                autoComplete="off"
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove owner"
                  onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
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
          Spouses who own an interest together (tenants by the entirety or joint tenants):
          enter one row with both names — e.g., "Sam Lee and Alex Lee, as tenants by the
          entirety" — their combined percentage, and either spouse's SSN. The instruction
          sheet will direct <em>both</em> spouses to sign that row's consent line.
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
      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          We build your package immediately — you'll be able to download it here.
        </p>
        <Button type="submit" disabled={submit.isPending || !certified} className="rounded-full">
          {submit.isPending ? "Building your package…" : "Certify and build my package"}
        </Button>
      </DialogFooter>
    </form>
  );
}

