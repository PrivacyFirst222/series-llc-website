import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, ChevronRight, Clock, Landmark, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import OrderDetail from "./OrderDetail";

export interface BoardOrder {
  id: string;
  client_id: string | null;
  contact_name: string;
  contact_email: string;
  llc_name: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  filed_at: string | null;
  formed_at: string | null;
  series_count: number;
  ein_purchased: boolean;
  ra_service: boolean;
  ein_outstanding: boolean;
}

/** Days since the order was placed — Adam's measure, not days in the column: a
 *  client counts from when they paid, and so should we. Amber at 5, red at 10. */
export function ageInDays(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = ageInDays(createdAt);
  const tone =
    days >= 10
      ? "bg-destructive/10 text-destructive"
      : days >= 5
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      <Clock className="h-3 w-3" />
      {days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`}
    </span>
  );
}

function Card({ order, onOpen }: { order: BoardOrder; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-trust/60 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug">{order.llc_name}</span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{order.contact_name}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <AgeBadge createdAt={order.created_at} />
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          {order.series_count} {order.series_count === 1 ? "series" : "series"}
        </span>
        {order.ra_service ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            our RA
          </span>
        ) : null}
        {order.ein_purchased ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              order.ein_outstanding
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-secondary text-muted-foreground",
            )}
          >
            <Landmark className="h-3 w-3" />
            EIN{order.ein_outstanding ? " outstanding" : ""}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function Column({
  title,
  hint,
  orders,
  onOpen,
}: {
  title: string;
  hint: string;
  orders: BoardOrder[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex min-w-[260px] flex-1 flex-col rounded-2xl border border-border bg-secondary/30">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-base">{title}</h3>
          <span className="text-sm text-muted-foreground">{orders.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {orders.length === 0 ? (
          <p className="px-1 py-4 text-xs text-muted-foreground">Nothing here.</p>
        ) : (
          orders.map((o) => <Card key={o.id} order={o} onOpen={() => onOpen(o.id)} />)
        )}
      </div>
    </div>
  );
}

export default function OrderBoard({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => api.get<BoardOrder[]>("/api/admin/orders"),
    enabled,
  });

  const markFiled = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/orders/${id}/filed`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });

  const orders = ordersQuery.data ?? [];
  const pending = orders.filter((o) => o.status === "pending_payment");
  const isNew = orders.filter((o) => o.status === "paid");
  const withState = orders.filter((o) => o.status === "filed");
  const done = orders.filter((o) => o.status === "formed");
  const oldestPending = pending.reduce<number>((m, o) => Math.max(m, ageInDays(o.created_at)), 0);

  return (
    <>
      <h2 className="mt-10 font-display text-xl">Formations</h2>

      {/* Not a column: an abandoned checkout is not work in progress, and there
          will be far more of them than real orders. But an old one can also be
          a payment Square took whose confirmation never reached us, so they are
          never hidden — only folded. */}
      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowPending((v) => !v)}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm"
        >
          <AlertCircle
            className={cn("h-4 w-4", oldestPending >= 5 ? "text-amber-600" : "text-muted-foreground")}
          />
          <span className="font-medium">{pending.length} pending payment</span>
          <span className="text-muted-foreground">
            oldest {oldestPending === 0 ? "today" : `${oldestPending} days`} — abandoned checkouts, or a
            payment whose confirmation never arrived
          </span>
          <ChevronRight className={cn("ml-auto h-4 w-4 transition", showPending && "rotate-90")} />
        </button>
      ) : null}

      {showPending ? (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
          {pending.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="font-medium">{o.llc_name}</span>
              <span className="text-xs text-muted-foreground">
                {o.contact_name} &lt;{o.contact_email}&gt;
              </span>
              <span className="ml-auto">
                <AgeBadge createdAt={o.created_at} />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <Column
          title="New"
          hint="Paid, not yet filed"
          orders={isNew}
          onOpen={setOpenId}
        />
        <Column
          title="With the State"
          hint="Filed, awaiting the Division"
          orders={withState}
          onOpen={setOpenId}
        />
        <Column
          title="Completed"
          hint="Articles and designations in the client's portal"
          orders={done}
          onOpen={setOpenId}
        />
      </div>

      {ordersQuery.isError ? (
        <p className="mt-3 text-sm text-destructive">Could not load orders.</p>
      ) : null}

      {openId ? (
        <OrderDetail
          orderId={openId}
          onClose={() => setOpenId(null)}
          onMarkFiled={() => markFiled.mutate(openId)}
          markingFiled={markFiled.isPending}
        />
      ) : null}
    </>
  );
}
