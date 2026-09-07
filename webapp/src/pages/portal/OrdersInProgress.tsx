// Orders the client has paid for and we have not yet delivered — placed
// near the top of the portal, beneath the documents, so nothing waiting on
// the client is far down the page (Adam, 6 Sep 2026: "Where they are
// presently placed is too far down the page and could get missed"). Order
// services is for ordering; a fulfilled order is a document and lives with
// the documents. The detail dialogs an order can need live here too, and
// a fulfilled S election or series document reaches them through
// `external`.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Lock, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { SElectionDetailsForm, EIN_CERTIFICATION, type SElectionDraft } from "./SElectionDetailsForm";
import { STATUS_LABEL, clientMustAct, money, summaryOf } from "./services.helpers";
import { clearDraft, loadDrafts, saveDraft } from "./drafts";
import type { ServiceOrder, ServicesData } from "./ServicesCard";

export interface ExternalOrderRequest {
  kind: "edit-s-election" | "consent";
  orderId: string;
  /** Changes on every request so the same order can be reopened. */
  nonce: number;
}

export function OrdersInProgress({
  company,
  external,
  onExternalHandled,
}: {
  company?: string | null;
  external: ExternalOrderRequest | null;
  onExternalHandled: () => void;
}) {
  const cq = company ? `?company=${company}` : "";
  const queryClient = useQueryClient();
  const [detailsFor, setDetailsFor] = useState<ServiceOrder | null>(null);
  // Before the LLC is formed, the detail buttons explain instead of collect.
  const [formedGateFor, setFormedGateFor] = useState<"ein" | "s-election" | null>(null);
  const [einEmployees, setEinEmployees] = useState(false);
  const [einExcise, setEinExcise] = useState(false);
  const [einCertified, setEinCertified] = useState(false);
  const [error, setError] = useState<string>("");
  // What the client has typed into either secure form, per order, kept in
  // page memory so that closing the dialog loses nothing (Adam, 6 Sep 2026).
  // Never written to storage — these carry Social Security numbers.
  // Adam (6 Sep 2026): "The form should retain all information except for
  // SS#s." Drafts also go to the browser's storage per order, with every
  // Social Security number (and the EIN form's taxpayer number) stripped
  // before they are written, so a reload or a closed tab brings everything
  // else back. Cleared when the package is built and on sign-out.
  const [selDrafts, setSelDrafts] = useState<Record<string, SElectionDraft>>(() => loadDrafts<SElectionDraft>("sel"));
  const [einDrafts, setEinDrafts] = useState<Record<string, Record<string, string>>>(() => loadDrafts<Record<string, string>>("ein"));
  const einFormRef = useRef<HTMLFormElement>(null);
  const snapshotEinDraft = () => {
    const form = einFormRef.current;
    if (!form || !detailsFor) return;
    const out: Record<string, string> = {};
    new FormData(form).forEach((v, k) => { out[k] = String(v); });
    setEinDrafts((prev) => ({ ...prev, [detailsFor.id]: out }));
    saveDraft("ein", detailsFor.id, { ...out, tin: "" });
  };

  // The client's own name, for the signing-officer choices — same key as
  // the dashboard, so no extra request.
  const meQuery = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<{ name: string }>("/api/auth/me"),
    retry: false,
  });

  const servicesQuery = useQuery({
    queryKey: ["portal-services", company ?? null],
    queryFn: () => api.get<ServicesData>(`/api/portal/services${cq}`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal-services"] });

  const submitDetails = useMutation({
    mutationFn: (args: { id: string; payload: Record<string, unknown> }) =>
      api.post(`/api/portal/services/${args.id}/ein-details`, { ...args.payload, certified: true }),
    onSuccess: (_res, args) => {
      setEinDrafts((prev) => { const next = { ...prev }; delete next[args.id]; return next; });
      clearDraft("ein", args.id);
      setEinCertified(false); setEinEmployees(false); setEinExcise(false);
      setDetailsFor(null);
      refresh();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const simulate = useMutation({
    mutationFn: (id: string) => api.post("/api/dev/simulate-payment", { orderId: id }),
    onSuccess: refresh,
  });

  // s. 605.2201(1) and Section 3.1 require the consent of all members before a
  // series is established, and the designation filed with the state is signed
  // by the company — so nothing on the public record shows the members agreed.
  // This is the only document that does, and it carries the Series Exhibit
  // Section 3.1 requires adopted at or before the filing.
  const [consentFor, setConsentFor] = useState<ServiceOrder | null>(null);
  const makeConsent = useMutation({
    mutationFn: (body: { seriesName: string; seriesNumber: string; purpose: string; effectiveDate: string }) =>
      api.post<{ documentId: string; title: string }>("/api/portal/series/consent", body),
    onSuccess: (res) => {
      setConsentFor(null);
      // The document card reads a separate query; without this the client
      // downloads the file and the portal still says nothing is here.
      queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      window.location.href = `/api/portal/documents/${res.documentId}/download`;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const data = servicesQuery.data;

  // A fulfilled S election's "Edit answers" and a filed series' "Consent &
  // Series Exhibit" sit on the document rows above; they open the dialogs here.
  useEffect(() => {
    if (!external || !data) return;
    const o = data.orders.find((x) => x.id === external.orderId);
    if (o) {
      setError("");
      if (external.kind === "consent") setConsentFor(o);
      else setDetailsFor(o);
    }
    onExternalHandled();
    // onExternalHandled is a stable setter from the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, data]);

  if (!data) return null;
  const open = data.orders.filter((o) => o.status !== "fulfilled" && o.status !== "cancelled");

  return (
    <>
      {open.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card" data-testid="orders-in-progress">
          <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
            <ClipboardList className="h-4 w-4 text-trust" />
            <h2 className="font-display text-lg">Orders in progress</h2>
          </div>
      {open.length > 0 ? (
        <ul>
          {/* Separators are drawn per row, not with divide-y: that utility's
              child selector outranks a row's own border-2 and left the second
              outlined row with a 1px edge (caught by the behavioral gate). */}
          {open.map((o, i) => (
            <li
              key={o.id}
              data-needs-action={clientMustAct(o, data.llcFormed) ? "true" : undefined}
              className={
                clientMustAct(o, data.llcFormed)
                  ? "m-2 flex flex-col gap-2 rounded-xl border-2 border-destructive px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  : `flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between${i > 0 ? " border-t border-border" : ""}`
              }
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{summaryOf(o)}</div>
                <div className="text-xs text-muted-foreground">
                  {money(o.amount_cents)} ·{" "}
                  <span className={o.status === "awaiting_info" ? "font-medium text-amber-700" : ""}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.type === "s-election" && o.status === "in_progress" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    We're preparing your Form 2553 package from your filed Articles — you'll get an
                    email the moment it's ready to download.
                  </p>
                ) : null}

              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {o.type === "series" && o.status !== "pending_payment" && o.status !== "cancelled" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => { setError(""); setConsentFor(o); }}
                  >
                    <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                    Consent &amp; Series Exhibit
                  </Button>
                ) : null}
                {o.status === "awaiting_info" ? (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      if (!data.llcFormed && (o.type === "ein" || o.type === "s-election")) {
                        setFormedGateFor(o.type);
                        return;
                      }
                      setDetailsFor(o);
                      setError("");
                    }}
                  >
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                    Provide details securely
                  </Button>
                ) : null}
                {data.dev && o.status === "pending_payment" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => simulate.mutate(o.id)}
                    disabled={simulate.isPending}
                  >
                    Dev: simulate payment
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

        </div>
      ) : null}

      {/* Secure S election details dialog */}
      <Dialog
        open={detailsFor !== null && detailsFor.type === "s-election"}
        onOpenChange={(v) => { if (!v) setDetailsFor(null); }}
      >
        {/* An outside tap does nothing — only the X or Escape closes it, and
            what was typed survives the close. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>S corporation election details</DialogTitle>
            <DialogDescription>
              We use this to complete IRS Form 2553 for {detailsFor?.llc_name}. You sign the
              finished form and mail it to the IRS yourself — we file nothing. This form is
              transmitted over your secure portal session; Social Security numbers are encrypted,
              and both they and the completed package are deleted from our systems two weeks after
              you build it, so download and keep your copy.
            </DialogDescription>
          </DialogHeader>
          {detailsFor ? (
            <SElectionDetailsForm
              order={detailsFor}
              members={data.members ?? []}
              clientName={meQuery.data?.name}
              priorFormationDate={detailsFor.details.dateIncorporated}
              todayEastern={data.todayEastern}
              draft={selDrafts[detailsFor.id]}
              onDraftChange={(d) => {
                setSelDrafts((prev) => ({ ...prev, [detailsFor.id]: d }));
                saveDraft("sel", detailsFor.id, { ...d, rows: d.rows.map((r) => ({ ...r, ssn: "" })) });
              }}
              onDone={() => {
                setSelDrafts((prev) => { const next = { ...prev }; delete next[detailsFor.id]; return next; });
                clearDraft("sel", detailsFor.id);
                setDetailsFor(null); refresh(); queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Consent + Series Exhibit for a series established after formation */}
      <Dialog open={consentFor !== null} onOpenChange={(v) => { if (!v) { setConsentFor(null); setError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consent &amp; Series Exhibit</DialogTitle>
            <DialogDescription>
              Florida lets the company establish a protected series only with the consent of
              <strong> all members</strong> (s. 605.2201(1)), and Section 3.1 of your agreement
              requires it. The designation filed with the state is signed by the company, so
              nothing on the public record shows the members agreed — this is the document that
              does. It comes with the Series Exhibit your agreement requires adopted at or before
              the filing.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              makeConsent.mutate({
                seriesName: String(fd.get("seriesName") ?? ""),
                seriesNumber: String(fd.get("seriesNumber") ?? ""),
                purpose: String(fd.get("purpose") ?? ""),
                effectiveDate: String(fd.get("effectiveDate") ?? ""),
              });
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Protected series name</label>
              <Input name="seriesName" defaultValue={consentFor?.details.seriesName ?? ""} required />
              <p className="text-xs text-muted-foreground">Exactly as filed with the Department.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Exhibit identifier</label>
                <Input
                  name="seriesNumber"
                  defaultValue={(consentFor?.details.seriesName ?? "").replace(/.*\bP\.?S\.?\s*/i, "").trim()}
                  required
                />
                <p className="text-xs text-muted-foreground">Appears as “Series Exhibit PS-___”.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Effective date</label>
                <Input
                  name="effectiveDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Purpose of this series</label>
              <Input
                name="purpose"
                defaultValue={consentFor?.details.purpose ?? ""}
                placeholder="e.g. to acquire, own, and lease 101 Palm Street"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for any lawful business.
              </p>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Every member signs it; keep it with your company records.
              </p>
              <Button type="submit" disabled={makeConsent.isPending} className="rounded-full">
                {makeConsent.isPending ? "Preparing…" : "Prepare the documents"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Formed-first gate: the IRS processes don't exist for an unformed LLC */}
      <Dialog open={formedGateFor !== null} onOpenChange={(v) => { if (!v) setFormedGateFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your LLC must be formed first.</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-left">
                {formedGateFor === "ein" ? (
                  <p>
                    An EIN can be obtained only for a company that exists. The IRS application is
                    built on your filed Articles of Organization. We're preparing your filing now.
                    You'll get an email when your LLC is formed. You'll be able to complete the EIN
                    application form at that time.
                  </p>
                ) : (
                  <p>
                    An S corporation election can be made only for a company that exists and that
                    has been assigned an EIN. IRS Form 2553 is built on your filed Articles, and
                    your formation date is what starts the IRS's election window. You'll get an
                    email when your LLC is formed. You'll be able to complete the S election form
                    at that time.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Secure EIN details dialog — collects everything the IRS application
          asks that the formation record cannot answer (SS-4 ledger). */}
      <Dialog
        open={detailsFor !== null && detailsFor.type === "ein"}
        onOpenChange={(v) => { if (!v) { snapshotEinDraft(); setDetailsFor(null); } }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>EIN application details</DialogTitle>
            <DialogDescription>
              We use this to complete the IRS EIN application for{" "}
              {detailsFor ? summaryOf(detailsFor) : ""}. This form is transmitted over your secure
              portal session; the identification number is encrypted, used only for the IRS
              application, and deleted from our systems when your EIN is issued.
            </DialogDescription>
          </DialogHeader>
          <form
            ref={einFormRef}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!detailsFor) return;
              const fd = new FormData(e.currentTarget);
              const num = (k: string) => Number(String(fd.get(k) ?? "0")) || 0;
              submitDetails.mutate({
                id: detailsFor.id,
                payload: {
                  responsibleFirst: String(fd.get("responsibleFirst") ?? ""),
                  responsibleMiddle: String(fd.get("responsibleMiddle") ?? ""),
                  responsibleLast: String(fd.get("responsibleLast") ?? ""),
                  responsibleSuffix: String(fd.get("responsibleSuffix") ?? ""),
                  tin: String(fd.get("tin") ?? ""),
                  phone: String(fd.get("phone") ?? ""),
                  county: String(fd.get("county") ?? ""),
                  activity: String(fd.get("activity") ?? "Real estate"),
                  activityDetail: String(fd.get("activityDetail") ?? ""),
                  employeesExpected: einEmployees,
                  employeeCountOther: num("employeeCountOther"),
                  employeeCountAg: num("employeeCountAg"),
                  employeeCountHousehold: num("employeeCountHousehold"),
                  firstWageDate: String(fd.get("firstWageDate") ?? ""),
                  form944Annual: fd.get("form944Annual") === "on",
                  closingMonth: String(fd.get("closingMonth") ?? "December"),
                  exciseApplies: einExcise,
                  exciseDetail: String(fd.get("exciseDetail") ?? ""),
                },
              });
            }}
          >
            <p className="text-sm font-medium">Responsible party — must match IRS records</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">First name</label>
                <Input name="responsibleFirst" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.responsibleFirst ?? ""} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Last name</label>
                <Input name="responsibleLast" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.responsibleLast ?? ""} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Middle name/initial (optional)</label>
                <Input name="responsibleMiddle" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.responsibleMiddle ?? ""} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Suffix (optional)</label>
                <Input name="responsibleSuffix" placeholder="Jr, Sr, III…" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.responsibleSuffix ?? ""} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">SSN or ITIN (9 digits)</label>
                <Input name="tin" type="password" inputMode="numeric" autoComplete="off" placeholder="•••-••-••••" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.tin ?? ""} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone for IRS questions</label>
                <Input name="phone" inputMode="tel" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.phone ?? ""} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">County of the LLC's principal address</label>
              <Input name="county" placeholder="e.g., Orange" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.county ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="ein-activity" className="text-sm font-medium">Principal activity</label>
                <Select name="activity" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.activity ?? "Real estate"}>
                  <SelectTrigger id="ein-activity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Real estate", "Rental & leasing", "Construction", "Retail", "Finance & insurance", "Health care & social assistance", "Accommodation & food service", "Transportation & warehousing", "Manufacturing", "Wholesale", "Other"].map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ein-closing-month" className="text-sm font-medium">Closing month of accounting year</label>
                <Select name="closingMonth" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.closingMonth ?? "December"}>
                  <SelectTrigger id="ein-closing-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">What the business does, in a few words</label>
              <Input name="activityDetail" placeholder='e.g., "residential rental real estate"' autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.activityDetail ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={einEmployees} onChange={(e) => setEinEmployees(e.target.checked)} className="h-4 w-4 accent-trust" />
              The LLC expects to have employees in the next 12 months
            </label>
            {einEmployees ? (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Employees (general)</label>
                    <Input name="employeeCountOther" inputMode="numeric" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.employeeCountOther ?? "1"} autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Agricultural</label>
                    <Input name="employeeCountAg" inputMode="numeric" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.employeeCountAg ?? "0"} autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Household</label>
                    <Input name="employeeCountHousehold" inputMode="numeric" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.employeeCountHousehold ?? "0"} autoComplete="off" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">First date wages will be paid</label>
                  <Input name="firstWageDate" type="date" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.firstWageDate ?? ""} />
                </div>
                <label className="flex items-start gap-2 text-xs leading-relaxed">
                  <input type="checkbox" name="form944Annual" defaultChecked={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.form944Annual === "on"} className="mt-0.5 h-4 w-4 shrink-0 accent-trust" />
                  Expect $1,000 or less in employment tax for a full year (roughly $5,000 or less
                  in total wages)? Check to ask the IRS for annual filing (Form 944) instead of
                  quarterly (Form 941).
                </label>
              </div>
            ) : null}
            <label className="flex items-start gap-2 text-sm leading-relaxed">
              <input type="checkbox" checked={einExcise} onChange={(e) => setEinExcise(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-trust" />
              <span>
                The business operates heavy highway vehicles (55,000 lbs+), involves gambling,
                sells or manufactures alcohol, tobacco, or firearms, or expects to file federal
                excise tax returns
              </span>
            </label>
            {einExcise ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Which of those applies?</label>
                <Input name="exciseDetail" autoComplete="off" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.exciseDetail ?? ""} />
              </div>
            ) : null}
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 p-3">
              <input
                type="checkbox"
                checked={einCertified}
                onChange={(e) => setEinCertified(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-trust"
              />
              <span className="text-xs leading-relaxed">{EIN_CERTIFICATION}</span>
            </label>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitDetails.isPending || !einCertified}
                className="rounded-full"
              >
                {submitDetails.isPending ? "Submitting…" : "Certify and submit securely"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
