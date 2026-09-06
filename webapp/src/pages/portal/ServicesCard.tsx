import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusCircle, Landmark, ShoppingBag, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";

import { money } from "./services.helpers";

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

export interface ServicesData {
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


const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function ServicesCard({ company }: { company?: string | null }) {
  // Every read and purchase carries the selected company (Adam, 31 Aug 2026);
  // absent, the server defaults to the latest formation — the old behavior.
  const cq = company ? `?company=${company}` : "";
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [einOpen, setEinOpen] = useState(false);
  const [sElectionOpen, setSElectionOpen] = useState(false);
  const [certKind, setCertKind] = useState<"certificate-of-status" | "certified-copy" | null>(null);
  const [error, setError] = useState<string>("");

  const servicesQuery = useQuery({
    queryKey: ["portal-services", company ?? null],
    queryFn: () => api.get<ServicesData>(`/api/portal/services${cq}`),
  });

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

    </div>
  );
}
