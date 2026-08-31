import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Landmark, ShoppingBag, Lock, FileCheck2, Download, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";

import { formatDateTime } from "@/lib/datetime";
import { SElectionDetailsForm, EIN_CERTIFICATION } from "./SElectionDetailsForm";

export interface StoredShareholder {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string;
  ssnLast4: string;
}

export interface ServiceOrder {
  id: string;
  type: "series" | "ein" | "s-election" | "certificate-of-status" | "certified-copy";
  status: "pending_payment" | "awaiting_info" | "in_progress" | "fulfilled" | "cancelled";
  llc_name: string;
  details: {
    seriesName?: string;
    purpose?: string;
    target?: string;
    responsibleName?: string;
    tinLast4?: string;
    ein?: string;
    einPending?: boolean;
    dateIncorporated?: string;
    effectiveDate?: string;
    officerName?: string;
    officerTitle?: string;
    phone?: string;
    purgedAt?: string;
    shareholders?: StoredShareholder[];
  };
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  /** s-election only: when the package and the SSNs are destroyed. */
  editableUntil?: string | null;
  editable?: boolean;
  documentId?: string | null;
}

interface ServicesData {
  llcName: string;
  dev: boolean;
  members: { name: string; address: string }[];
  pricing: { seriesCents: number; einCents: number; sElectionCents: number; certStatusCents: number; certifiedCopyCents: number };
  sElection: {
    eligible: boolean;
    reason: "ok" | "no_new_formation" | "window_closed" | "already_ordered";
    orderBy: string | null;
  };
  orders: ServiceOrder[];
  series: { name: string; einOrdered: boolean }[];
  einCompanyOrdered: boolean;
  llcFormed: boolean;
}

export interface ShareholderRow {
  name: string;
  address: string;
  percentage: string;
  dateAcquired: string;
  ssn: string;
  /** Set when the number is already on file: the field stays blank and the
   *  server keeps what it has, so an edit never means retyping SSNs. */
  ssnLast4?: string;
  /** True once the address came from a verified suggestion. */
  verified?: boolean;
}

const STATUS_LABEL: Record<ServiceOrder["status"], string> = {
  pending_payment: "Awaiting payment",
  awaiting_info: "Action needed",
  in_progress: "In progress",
  fulfilled: "Complete",
  cancelled: "Cancelled",
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function summaryOf(o: ServiceOrder): string {
  if (o.type === "series") return `Protected Series Designation — ${o.details.seriesName ?? o.llc_name}`;
  if (o.type === "s-election") return `S Corporation Election Package — ${o.llc_name}`;
  if (o.type === "certificate-of-status") return `Certificate of Status — ${o.llc_name}`;
  if (o.type === "certified-copy") return `Certified Copy of the Articles — ${o.llc_name}`;
  return `Federal EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function ServicesCard({ company }: { company?: string | null }) {
  // Every read and purchase carries the selected company (Adam, 31 Aug 2026);
  // absent, the server defaults to the latest formation — the old behavior.
  const cq = company ? `?company=${company}` : "";
  const queryClient = useQueryClient();
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [einOpen, setEinOpen] = useState(false);
  const [sElectionOpen, setSElectionOpen] = useState(false);
  const [certKind, setCertKind] = useState<"certificate-of-status" | "certified-copy" | null>(null);
  const [detailsFor, setDetailsFor] = useState<ServiceOrder | null>(null);
  // Before the LLC is formed, the detail buttons explain instead of collect.
  const [formedGateFor, setFormedGateFor] = useState<"ein" | "s-election" | null>(null);
  const [einEmployees, setEinEmployees] = useState(false);
  const [einExcise, setEinExcise] = useState(false);
  const [einCertified, setEinCertified] = useState(false);
  const [error, setError] = useState<string>("");

  const servicesQuery = useQuery({
    queryKey: ["portal-services", company ?? null],
    queryFn: () => api.get<ServicesData>(`/api/portal/services${cq}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal-services"] });

  const orderSeries = useMutation({
    mutationFn: (body: { suffix: string; purpose?: string }) =>
      api.post<{ checkoutUrl: string }>(`/api/portal/services/series${cq}`, body),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const orderEin = useMutation({
    mutationFn: (body: { target: "company" | "series"; seriesName?: string }) =>
      api.post<{ checkoutUrl: string }>(`/api/portal/services/ein${cq}`, body),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const orderCertificate = useMutation({
    mutationFn: (kind: string) => api.post<{ checkoutUrl: string }>(`/api/portal/services/certificate${cq}`, { kind }),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const orderSElection = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>(`/api/portal/services/s-election${cq}`, {}),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const submitDetails = useMutation({
    mutationFn: (args: { id: string; payload: Record<string, unknown> }) =>
      api.post(`/api/portal/services/${args.id}/ein-details`, { ...args.payload, certified: true }),
    onSuccess: () => {
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
  // The card's four states come from two facts we can actually know — what
  // was bought through us. LLC EIN: bought or not. Series EINs: bought for
  // one or more, or never. Where we don't know (nothing bought), wording is
  // conditional — we never assert an outside LLC's EIN status.
  const companyEinTaken = data?.einCompanyOrdered === true;
  const openSeries = (data?.series ?? []).filter((s) => !s.einOrdered);
  // Adam's card text, dictated 23 Aug 2026 — his format is the template.
  // Two purchasable first blocks (LLC unbought / LLC bought); a fifth,
  // informational state when the LLC and every series are covered.
  const einAllCovered = companyEinTaken && openSeries.length === 0;
  // Each paragraph: first sentence bold, remainder plain (Adam, 24 Aug 2026).
  const einFirstBold = companyEinTaken
    ? "You already purchased a Federal EIN for the mothership LLC."
    : "Get a Federal EIN for the Mothership LLC.";
  const einFirstRest = companyEinTaken
    ? "This was an important step as it is necessary for opening bank accounts, tax reporting and tax elections, and completing requested W-9s."
    : "If your LLC doesn't already have an EIN, it needs one for opening bank accounts, tax reporting and tax elections, and completing requested W-9s.";
  const einSeriesBold = "A protected series usually does not require its own EIN.";
  const einSeriesRest =
    "Every series is wholly owned by your LLC, so the IRS disregards it — a series never files its own income tax return, with or without an EIN. The only income tax return in the structure is the LLC's own. A series needs its own EIN only in limited circumstances — most commonly because its bank requires one for an account in the series' name, or because the series will have employees.";
  const einSeparateBold = "A separate EIN does not create a separate tax return.";
  const einSeparateRest =
    "Questions about the technicalities? Check the User's Manual and ask your attorney or accountant.";
  const einPriceRest =
    "After payment, you'll provide the responsible party's details through a secure form here in the portal — never by email.";
  const einAllCoveredText =
    "You already purchased a Federal EIN for the mothership LLC and every protected series. No further EINs are necessary or appropriate.";
  if (!data) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
        <ShoppingBag className="h-4 w-4 text-trust" />
        <h2 className="font-display text-lg">Order services</h2>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        {/* Add a series */}
        <Dialog open={seriesOpen} onOpenChange={(v) => { setSeriesOpen(v); setError(""); }}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-trust">
                <PlusCircle className="h-4 w-4" />
                <span className="text-sm font-medium text-foreground">Add a Protected Series</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                We draft and file a new Protected Series Designation for {data.llcName || "your LLC"}.
              </p>
              <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.seriesCents)}</p>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a Protected Series</DialogTitle>
              <DialogDescription>
                {money(data.pricing.seriesCents)} total — $25 preparation plus the $25 state filing
                fee. The name must include "PS", "P.S.", or "protected series."
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                orderSeries.mutate({
                  suffix: String(fd.get("suffix") ?? ""),
                  purpose: String(fd.get("purpose") ?? "") || undefined,
                });
              }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Series identifier</label>
                <div className="flex items-center gap-2">
                  <span className="max-w-[55%] truncate text-sm text-muted-foreground">
                    {data.llcName} -
                  </span>
                  <Input name="suffix" defaultValue="PS " className="flex-1" autoComplete="off" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filed exactly as shown, e.g. "{data.llcName} - PS 4".
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Purpose (optional)</label>
                <Input name="purpose" placeholder='e.g., "own and lease 123 Main Street"' autoComplete="off" />
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={orderSeries.isPending} className="rounded-full">
                  {orderSeries.isPending ? "Preparing checkout…" : "Continue to payment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* EIN */}
        {einAllCovered ? (
          <div className="rounded-xl border border-border bg-background p-4 text-left">
            <div className="flex items-center gap-2 text-trust">
              <Landmark className="h-4 w-4" />
              <span className="text-sm font-medium text-foreground">Federal EINs</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{einAllCoveredText}</p>
          </div>
        ) : (
        <Dialog open={einOpen} onOpenChange={(v) => { setEinOpen(v); setError(""); }}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-trust">
                <Landmark className="h-4 w-4" />
                <span className="text-sm font-medium text-foreground">Get a Federal EIN</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                For the LLC or any protected series. Details are collected through a secure form
                after checkout.
              </p>
              <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.einCents)}</p>
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="sr-only">Federal EIN</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-left">
                  <p>
                    <strong className="text-foreground">{einFirstBold}</strong> {einFirstRest}
                  </p>
                  <p>
                    <strong className="text-foreground">{einSeriesBold}</strong> {einSeriesRest}
                  </p>
                  <p>
                    <strong className="text-foreground">{einSeparateBold}</strong> {einSeparateRest}
                  </p>
                  <p>
                    <strong className="text-foreground">{money(data.pricing.einCents)}.</strong>{" "}
                    {einPriceRest}
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const target = companyEinTaken
                  ? "series"
                  : (String(fd.get("target") ?? "company") as "company" | "series");
                orderEin.mutate({
                  target,
                  seriesName: target === "series" ? String(fd.get("seriesName") ?? "") : undefined,
                });
              }}
            >
              <div className="space-y-2 text-sm">
                {!companyEinTaken ? (
                  <label className="flex items-center gap-2">
                    <input type="radio" name="target" value="company" defaultChecked className="accent-trust" />
                    For the LLC: {data.llcName || "your LLC"}
                  </label>
                ) : null}
                {openSeries.length > 0 ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="target"
                        value="series"
                        defaultChecked={companyEinTaken}
                        className="accent-trust"
                      />
                      For a protected series:
                    </label>
                    {/* A list, not a dropdown: full filed names wrap instead of
                        truncating — no name of any length is ever clipped. */}
                    <div className="ml-6 max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-input bg-background p-2">
                      {openSeries.map((s, i) => (
                        <label key={s.name} className="flex items-start gap-2 text-sm leading-relaxed">
                          <input
                            type="radio"
                            name="seriesName"
                            value={s.name}
                            defaultChecked={i === 0}
                            className="mt-1 h-4 w-4 shrink-0 accent-trust"
                          />
                          <span className="min-w-0 break-words">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={orderEin.isPending} className="rounded-full">
                  {orderEin.isPending ? "Preparing checkout…" : "Continue to payment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}

        {/* S corporation election — only inside the post-formation window */}
        {data.sElection.eligible ? (
          <Dialog open={sElectionOpen} onOpenChange={(v) => { setSElectionOpen(v); setError(""); }}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-trust">
                  <FileCheck2 className="h-4 w-4" />
                  <span className="text-sm font-medium text-foreground">S Corporation Election Package</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Completed IRS Form 2553 with a cover letter and filing instructions — you sign
                  and mail it.
                  {data.sElection.orderBy ? (
                    <span className="font-medium text-amber-700">
                      {" "}Available until {fmtDay(data.sElection.orderBy)}.
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.sElectionCents)}</p>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>S Corporation Election Package</DialogTitle>
                <DialogDescription>
                  {money(data.pricing.sElectionCents)}. We prepare IRS Form 2553 for{" "}
                  {data.llcName || "your LLC"} — completed and ready to sign — plus a cover letter
                  and step-by-step filing instructions. You review, sign, and mail or fax it to the
                  IRS yourself; there is no IRS filing fee. After payment, you'll provide the
                  owners' details through a secure form here in the portal.
                </DialogDescription>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                The IRS deadline is strict — 2 months and 15 days from the start of the company's
                first tax year — which is why this package is only available until{" "}
                {data.sElection.orderBy ? fmtDay(data.sElection.orderBy) : "the window closes"}.
                Choose this only if your tax professional recommends the election.
              </p>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button
                  className="rounded-full"
                  disabled={orderSElection.isPending}
                  onClick={() => orderSElection.mutate()}
                >
                  {orderSElection.isPending ? "Preparing checkout…" : "Continue to payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

          {/* Another company entirely: the wizard handles it, and the new
              order joins this same portal account by email (Adam,
              31 Aug 2026). */}
          <a
            href="/form-llc?path=new"
            className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-trust">
              <FileCheck2 className="h-4 w-4" />
              <span className="text-sm font-medium text-foreground">Form another Protected Series LLC</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A brand-new company, filed the same way as your first. It appears in
              this portal when it's paid for.
            </p>
          </a>
          <a
            href="/form-llc?path=convert"
            className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-trust">
              <FileCheck2 className="h-4 w-4" />
              <span className="text-sm font-medium text-foreground">Convert an existing Florida LLC</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Already have another Florida LLC? We file its Protected Series
              Designations — no Articles fee.
            </p>
          </a>

          {/* State certificates — the typical time to buy is AFTER formation,
              when a bank or lender asks (Adam, 30 Aug 2026). */}
          {data.llcFormed ? (
            <>
              <button
                type="button"
                onClick={() => { setCertKind("certificate-of-status"); setError(""); }}
                className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-trust">
                  <FileCheck2 className="h-4 w-4" />
                  <span className="text-sm font-medium text-foreground">Certificate of Status</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The state's certificate that your LLC is active and in good standing — banks and
                  lenders often ask for a recent one.
                </p>
                <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.certStatusCents)}</p>
              </button>
              <button
                type="button"
                onClick={() => { setCertKind("certified-copy"); setError(""); }}
                className="rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-accent hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-trust">
                  <FileCheck2 className="h-4 w-4" />
                  <span className="text-sm font-medium text-foreground">Certified Copy of the Articles</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  A state-certified copy of your filed Articles of Organization.
                </p>
                <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.certifiedCopyCents)}</p>
              </button>
              <Dialog open={certKind !== null} onOpenChange={(v) => { if (!v) setCertKind(null); setError(""); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {certKind === "certified-copy" ? "Certified Copy of the Articles" : "Certificate of Status"}
                    </DialogTitle>
                    <DialogDescription>
                      {certKind === "certified-copy"
                        ? `${money(data.pricing.certifiedCopyCents)} — includes the state's fee. We order the certified copy from the Florida Division of Corporations and deliver the PDF to your portal.`
                        : `${money(data.pricing.certStatusCents)} — includes the state's fee. We order the certificate from the Florida Division of Corporations and deliver the PDF to your portal.`}
                    </DialogDescription>
                  </DialogHeader>
                  {error ? <p className="text-xs text-destructive">{error}</p> : null}
                  <DialogFooter>
                    <Button
                      className="rounded-full"
                      disabled={orderCertificate.isPending}
                      onClick={() => certKind && orderCertificate.mutate(certKind)}
                    >
                      {orderCertificate.isPending ? "Preparing checkout…" : "Continue to payment"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
      </div>

      {data.orders.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {data.orders.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium">{summaryOf(o)}</div>
                <div className="text-xs text-muted-foreground">
                  {money(o.amount_cents)} ·{" "}
                  <span className={o.status === "awaiting_info" ? "font-medium text-amber-700" : ""}>
                    {o.type === "s-election" && o.status === "fulfilled"
                      ? "Ready to download"
                      : STATUS_LABEL[o.status]}
                  </span>
                </div>
                {/* The package carries every owner's SSN, so it does not live
                    here indefinitely — say so where they will see it. */}
                {o.type === "s-election" && o.editable && o.editableUntil ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Editable until {formatDateTime(o.editableUntil)} — after that we delete the
                    package and the Social Security numbers. Download and keep a copy.
                  </p>
                ) : null}
                {o.type === "s-election" && o.details.purgedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deleted on {formatDateTime(o.details.purgedAt)} as promised — the package and
                    every Social Security number are gone from our systems.
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
                {o.type === "s-election" && o.documentId ? (
                  <Button asChild size="sm" variant="outline" className="rounded-full">
                    <a href={`/api/portal/documents/${o.documentId}/download`}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                ) : null}
                {o.type === "s-election" && o.status === "fulfilled" && o.editable ? (
                  <Button
                    size="sm"
                    variant="outline"
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
                    Edit answers
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

      {/* Secure S election details dialog */}
      <Dialog
        open={detailsFor !== null && detailsFor.type === "s-election"}
        onOpenChange={(v) => { if (!v) setDetailsFor(null); }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
              onDone={() => { setDetailsFor(null); refresh(); queryClient.invalidateQueries({ queryKey: ["portal-documents"] }); }}
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
        onOpenChange={(v) => { if (!v) { setDetailsFor(null); setEinCertified(false); setEinEmployees(false); setEinExcise(false); } }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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
                <Input name="responsibleFirst" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Last name</label>
                <Input name="responsibleLast" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Middle name/initial (optional)</label>
                <Input name="responsibleMiddle" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Suffix (optional)</label>
                <Input name="responsibleSuffix" placeholder="Jr, Sr, III…" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">SSN or ITIN (9 digits)</label>
                <Input name="tin" type="password" inputMode="numeric" autoComplete="off" placeholder="•••-••-••••" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone for IRS questions</label>
                <Input name="phone" inputMode="tel" autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">County of the LLC's principal address</label>
              <Input name="county" placeholder="e.g., Orange" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="ein-activity" className="text-sm font-medium">Principal activity</label>
                <Select name="activity" defaultValue="Real estate">
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
                <Select name="closingMonth" defaultValue="December">
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
              <Input name="activityDetail" placeholder='e.g., "residential rental real estate"' autoComplete="off" />
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
                    <Input name="employeeCountOther" inputMode="numeric" defaultValue="1" autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Agricultural</label>
                    <Input name="employeeCountAg" inputMode="numeric" defaultValue="0" autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Household</label>
                    <Input name="employeeCountHousehold" inputMode="numeric" defaultValue="0" autoComplete="off" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">First date wages will be paid</label>
                  <Input name="firstWageDate" type="date" autoComplete="off" />
                </div>
                <label className="flex items-start gap-2 text-xs leading-relaxed">
                  <input type="checkbox" name="form944Annual" className="mt-0.5 h-4 w-4 shrink-0 accent-trust" />
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
                <Input name="exciseDetail" autoComplete="off" />
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
    </div>
  );
}
