import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Landmark, ShoppingBag, Lock, FileCheck2, Trash2, Download, CheckCircle2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { AddressAutocomplete } from "@/components/forms/florida-llc/AddressAutocomplete";
import { formatDateTime } from "@/lib/datetime";

interface StoredShareholder {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string;
  ssnLast4: string;
}

interface ServiceOrder {
  id: string;
  type: "series" | "ein" | "s-election";
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
  pricing: { seriesCents: number; einCents: number; sElectionCents: number };
  sElection: {
    eligible: boolean;
    reason: "ok" | "no_new_formation" | "window_closed" | "already_ordered";
    orderBy: string | null;
  };
  orders: ServiceOrder[];
  series: { name: string; einOrdered: boolean }[];
  einCompanyOrdered: boolean;
}

interface ShareholderRow {
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
  return `Federal EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function ServicesCard() {
  const queryClient = useQueryClient();
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [einOpen, setEinOpen] = useState(false);
  const [sElectionOpen, setSElectionOpen] = useState(false);
  const [detailsFor, setDetailsFor] = useState<ServiceOrder | null>(null);
  const [einCertified, setEinCertified] = useState(false);
  const [error, setError] = useState<string>("");

  const servicesQuery = useQuery({
    queryKey: ["portal-services"],
    queryFn: () => api.get<ServicesData>("/api/portal/services"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portal-services"] });

  const orderSeries = useMutation({
    mutationFn: (body: { suffix: string; purpose?: string }) =>
      api.post<{ checkoutUrl: string }>("/api/portal/services/series", body),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const orderEin = useMutation({
    mutationFn: (body: { target: "company" | "series"; seriesName?: string }) =>
      api.post<{ checkoutUrl: string }>("/api/portal/services/ein", body),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const orderSElection = useMutation({
    mutationFn: () => api.post<{ checkoutUrl: string }>("/api/portal/services/s-election", {}),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  const submitDetails = useMutation({
    mutationFn: (args: { id: string; responsibleName: string; tin: string; note?: string }) =>
      api.post(`/api/portal/services/${args.id}/ein-details`, {
        responsibleName: args.responsibleName,
        tin: args.tin,
        note: args.note,
        certified: true,
      }),
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
    "Every series is wholly owned by your LLC, so the IRS disregards it — a series never files its own tax return, with or without an EIN. The only income tax return in the structure is the LLC's own. A series needs its own EIN only in limited circumstances — most commonly because its bank requires one for an account in the series' name, or because the series will have employees.";
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
                <span className="text-sm font-medium text-foreground">Federal EIN</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <strong className="text-foreground">{einFirstBold}</strong> {einFirstRest}
              </p>
              <p className="mt-2 font-display text-lg text-trust">{money(data.pricing.einCents)}</p>
            </button>
          </DialogTrigger>
          <DialogContent>
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
                    <select
                      name="seriesName"
                      defaultValue={openSeries[0]?.name}
                      className="ml-6 flex h-10 w-[calc(100%-1.5rem)] rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {openSeries.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
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
                    onClick={() => { setDetailsFor(o); setError(""); }}
                  >
                    Edit answers
                  </Button>
                ) : null}
                {o.status === "awaiting_info" ? (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => { setDetailsFor(o); setError(""); }}
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

      {/* Secure EIN details dialog */}
      <Dialog
        open={detailsFor !== null && detailsFor.type === "ein"}
        onOpenChange={(v) => { if (!v) { setDetailsFor(null); setEinCertified(false); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responsible party details</DialogTitle>
            <DialogDescription>
              The IRS requires a responsible party for {detailsFor ? summaryOf(detailsFor) : ""}.
              This form is transmitted over your secure portal session; the identification number
              is encrypted, used only to prepare IRS Form SS-4, and deleted from our systems when
              your EIN is issued.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!detailsFor) return;
              const fd = new FormData(e.currentTarget);
              submitDetails.mutate({
                id: detailsFor.id,
                responsibleName: String(fd.get("responsibleName") ?? ""),
                tin: String(fd.get("tin") ?? ""),
                note: String(fd.get("note") ?? "") || undefined,
              });
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Responsible party's full legal name</label>
              <Input name="responsibleName" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">SSN or ITIN (9 digits)</label>
              <Input name="tin" type="password" inputMode="numeric" autoComplete="off" placeholder="•••-••-••••" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Note (optional)</label>
              <Input name="note" autoComplete="off" />
            </div>
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
const EIN_CERTIFICATION =
  "I am authorized to provide this information on behalf of the company. I understand it will be " +
  "used to apply for a federal Employer Identification Number on IRS Form SS-4, which is signed " +
  "under penalties of perjury, and that knowingly giving false information to the IRS may result " +
  "in civil penalties and criminal prosecution. I declare that the information I am submitting is " +
  "true, correct, and complete to the best of my knowledge and belief.";

function SElectionDetailsForm({
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
                <select
                  aria-label="Owner"
                  value={members.some((m) => m.name === r.name) ? r.name : r.name === "" ? "" : OTHER}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === OTHER) {
                      patchRow(i, { name: " ", address: r.address, verified: false });
                      return;
                    }
                    const m = members.find((mm) => mm.name === v);
                    patchRow(i, { name: v, address: m?.address ?? r.address, verified: Boolean(m?.address) });
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select an owner…</option>
                  {members.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                  <option value={OTHER}>Other — enter a name</option>
                </select>
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
