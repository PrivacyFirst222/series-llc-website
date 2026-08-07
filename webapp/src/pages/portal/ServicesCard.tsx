import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Landmark, ShoppingBag, Lock, FileCheck2, Trash2 } from "lucide-react";
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

interface ServiceOrder {
  id: string;
  type: "series" | "ein" | "s-election";
  status: "pending_payment" | "awaiting_info" | "in_progress" | "fulfilled" | "cancelled";
  llc_name: string;
  details: { seriesName?: string; target?: string; responsibleName?: string; tinLast4?: string };
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
}

interface ServicesData {
  llcName: string;
  dev: boolean;
  pricing: { seriesCents: number; einCents: number; sElectionCents: number };
  sElection: {
    eligible: boolean;
    reason: "ok" | "no_new_formation" | "window_closed" | "already_ordered";
    orderBy: string | null;
  };
  orders: ServiceOrder[];
}

interface ShareholderRow {
  name: string;
  address: string;
  percentage: string;
  dateAcquired: string;
  ssn: string;
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

  const data = servicesQuery.data;
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Get a Federal EIN</DialogTitle>
              <DialogDescription>
                {money(data.pricing.einCents)}. After payment, you'll provide the responsible
                party's details through a secure form here in the portal — never by email.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const target = String(fd.get("target") ?? "company") as "company" | "series";
                orderEin.mutate({
                  target,
                  seriesName: target === "series" ? String(fd.get("seriesName") ?? "") : undefined,
                });
              }}
            >
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="target" value="company" defaultChecked className="accent-trust" />
                  For the LLC: {data.llcName || "your LLC"}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="target" value="series" className="accent-trust" />
                  For a protected series:
                </label>
                <Input
                  name="seriesName"
                  placeholder={`${data.llcName} - PS 1`}
                  className="ml-6 w-[calc(100%-1.5rem)]"
                  autoComplete="off"
                />
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
                <div className="truncate text-sm font-medium">{summaryOf(o)}</div>
                <div className="text-xs text-muted-foreground">
                  {money(o.amount_cents)} ·{" "}
                  <span className={o.status === "awaiting_info" ? "font-medium text-amber-700" : ""}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
              We use this to complete IRS Form 2553 for {detailsFor?.llc_name}. This form is
              transmitted over your secure portal session; Social Security numbers are encrypted,
              used only to prepare the form, and deleted from our systems when your package is
              delivered.
            </DialogDescription>
          </DialogHeader>
          {detailsFor ? (
            <SElectionDetailsForm
              orderId={detailsFor.id}
              onDone={() => { setDetailsFor(null); refresh(); }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Secure EIN details dialog */}
      <Dialog open={detailsFor !== null && detailsFor.type === "ein"} onOpenChange={(v) => { if (!v) setDetailsFor(null); }}>
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
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={submitDetails.isPending} className="rounded-full">
                {submitDetails.isPending ? "Submitting…" : "Submit securely"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EMPTY_ROW: ShareholderRow = { name: "", address: "", percentage: "", dateAcquired: "", ssn: "" };

function SElectionDetailsForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [ein, setEin] = useState("");
  const [einPending, setEinPending] = useState(false);
  const [dateIncorporated, setDateIncorporated] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [officerTitle, setOfficerTitle] = useState("Manager");
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<ShareholderRow[]>([{ ...EMPTY_ROW }]);
  const [formError, setFormError] = useState("");

  const patchRow = (i: number, p: Partial<ShareholderRow>) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...p } : r)));

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/api/portal/services/${orderId}/s-election-details`, {
        ein,
        einPending,
        dateIncorporated,
        effectiveDate: effectiveDate || dateIncorporated,
        officerName,
        officerTitle,
        phone,
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
              <Input placeholder="Owner's full legal name" value={r.name} onChange={(e) => patchRow(i, { name: e.target.value })} autoComplete="off" />
              <Input placeholder="Home address" value={r.address} onChange={(e) => patchRow(i, { address: e.target.value })} autoComplete="off" />
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
                type="password" inputMode="numeric" placeholder="SSN •••-••-••••"
                value={r.ssn}
                onChange={(e) => patchRow(i, { ssn: e.target.value })}
                className="w-40"
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
          Spouses who own an interest together (tenants by the entireties or joint tenants):
          enter one row with both names — e.g., "Sam Lee and Alex Lee, as tenants by the
          entireties" — their combined percentage, and either spouse's SSN. The instruction
          sheet will direct <em>both</em> spouses to sign that row's consent line.
        </p>
      </div>

      {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={submit.isPending} className="rounded-full">
          {submit.isPending ? "Submitting…" : "Submit securely"}
        </Button>
      </DialogFooter>
    </form>
  );
}
