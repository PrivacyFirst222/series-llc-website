import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Landmark, ShoppingBag, Lock } from "lucide-react";
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
  type: "series" | "ein";
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
  pricing: { seriesCents: number; einCents: number };
  orders: ServiceOrder[];
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
  return `Federal EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}

export function ServicesCard() {
  const queryClient = useQueryClient();
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [einOpen, setEinOpen] = useState(false);
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

      {/* Secure EIN details dialog */}
      <Dialog open={detailsFor !== null} onOpenChange={(v) => { if (!v) setDetailsFor(null); }}>
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
