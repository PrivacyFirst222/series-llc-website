// The S corporation election details form — split from ServicesCard.tsx on
// 29 Aug 2026 (the one mechanical seam in that file; the main card is a
// single stateful component and stays whole).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PlusCircle, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { AddressAutocomplete } from "@/components/forms/florida-llc/AddressAutocomplete";

import type { ServiceOrder, ShareholderRow } from "./ServicesCard";

const EMPTY_ROW: ShareholderRow = { name: "", address: "", percentage: "", dateAcquired: "", ssn: "" };

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

export function SElectionDetailsForm({
  order,
  members,
  onDone,
}: {
  order: ServiceOrder;
  members: { name: string; address: string }[];
  onDone: () => void;
}) {
  const prior = order.details;
  const [ein, setEin] = useState(prior.ein ?? "");
  const [einPending, setEinPending] = useState(Boolean(prior.einPending));
  const [dateIncorporated, setDateIncorporated] = useState(prior.dateIncorporated ?? "");
  const [effectiveDate, setEffectiveDate] = useState(prior.effectiveDate ?? "");
  const [officerName, setOfficerName] = useState(prior.officerName ?? "");
  const [officerTitle, setOfficerTitle] = useState(prior.officerTitle ?? "Manager");
  const [phone, setPhone] = useState(prior.phone ?? "");
  const [rows, setRows] = useState<ShareholderRow[]>(
    prior.shareholders?.length
      ? prior.shareholders.map((s) => ({
          name: s.name,
          address: s.address,
          percentage: String(s.percentage),
          dateAcquired: s.dateAcquired,
          ssn: "",
          ssnLast4: s.ssnLast4,
          verified: true,
        }))
      : [{ ...EMPTY_ROW }],
  );
  const [certified, setCertified] = useState(false);
  const [formError, setFormError] = useState("");

  const patchRow = (i: number, p: Partial<ShareholderRow>) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...p } : r)));

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ documentId: string }>(`/api/portal/services/${order.id}/s-election-details`, {
        ein,
        einPending,
        dateIncorporated,
        effectiveDate: effectiveDate || dateIncorporated,
        officerName,
        officerTitle,
        phone,
        certified,
        shareholders: rows.map((r) => ({
          name: r.name,
          address: r.address,
          percentage: Number(r.percentage),
          dateAcquired: r.dateAcquired || dateIncorporated,
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
          <label className="text-sm font-medium">Date the LLC was formed</label>
          <Input type="date" value={dateIncorporated} onChange={(e) => setDateIncorporated(e.target.value)} />
          <p className="text-xs text-muted-foreground">From your filed Articles of Organization.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Election effective date</label>
          <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">Usually the formation date. Leave blank to use it.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Phone for IRS questions</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Signing officer</label>
          <Input value={officerName} onChange={(e) => setOfficerName(e.target.value)} placeholder="Full legal name" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Officer title</label>
          <Input value={officerTitle} onChange={(e) => setOfficerTitle(e.target.value)} autoComplete="off" />
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
              <Input
                type="date"
                title="Date the interest was acquired"
                value={r.dateAcquired}
                onChange={(e) => patchRow(i, { dateAcquired: e.target.value })}
                className="w-40"
              />
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

