import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, Check, ChevronRight, Clock, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import OrderDetail from "./OrderDetail";
import {
  type AdminServiceOrder, ServiceFulfillDialog } from "./ServiceOrdersSection";
import { boughtAfterFormation, serviceIsOpen, serviceLabel } from "./serviceOrders.helpers";

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
  cert_status_purchased: boolean;
  certified_copy_purchased: boolean;
  cert_status_uploaded: boolean;
  certified_copy_uploaded: boolean;
}

/** Days since the order was placed — Adam's measure, not days in the column: a
 *  client counts from when they paid, and so should we. Amber at 5, red at 10. */
function ageInDays(iso: string): number {
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

/** One company: the formation plus its service orders, worked from one place.
 *  The card is not itself a button any more — the title row opens the order,
 *  because the service rows carry their own Fulfill actions. */
function Card({
  order,
  services,
  onOpen,
  onFulfill,
}: {
  order: BoardOrder;
  services: AdminServiceOrder[];
  onOpen: () => void;
  onFulfill: (s: AdminServiceOrder) => void;
}) {
  // Green only for a purchase made after formation; the age pill then counts
  // from that purchase, since the formation itself is old news.
  const newPurchases = order.status === "formed" ? services.filter((s) => boughtAfterFormation(s, order.formed_at)) : [];
  const freshWork = newPurchases.length > 0;
  const ageFrom = freshWork
    ? newPurchases.reduce((latest, s) => (s.created_at > latest ? s.created_at : latest), newPurchases[0].created_at)
    : order.status === "filed" && order.filed_at
      ? order.filed_at
      : order.created_at;
  return (
    <div
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left transition hover:shadow-sm",
        freshWork ? "border-trust ring-1 ring-trust hover:border-trust" : "border-border hover:border-trust/60",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium leading-snug">{order.llc_name}</span>
          {freshWork ? (
            <span className="rounded-full bg-trust/10 px-2 py-0.5 text-xs font-medium text-trust">new order</span>
          ) : null}
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{order.contact_name}</div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <AgeBadge createdAt={ageFrom} />
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            {order.series_count} series
          </span>
          {order.ra_service ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              our RA
            </span>
          ) : null}
        </div>
      </button>
      {/* Adam's spec: only whether EIN / S corp was ordered and whether each
          is completed. Everything else lives in the fulfill dialog, opened by
          clicking an open line. A series designation shows only while open —
          it has no other admin fulfill surface — and vanishes once done. */}
      {services.some((s) => s.type !== "series" || serviceIsOpen(s)) ? (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5">
          {services
            .filter((s) => s.type !== "series" || serviceIsOpen(s))
            .map((s) =>
              serviceIsOpen(s) ? (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFulfill(s)}
                  className="flex w-full items-start gap-1.5 text-left text-xs transition hover:text-trust"
                >
                  <span className="min-w-0 break-words font-medium">{serviceLabel(s, order.llc_name)}</span>
                  <span className="shrink-0 text-muted-foreground">— open</span>
                </button>
              ) : (
                <div key={s.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-trust" />
                  <span className="min-w-0 break-words">{serviceLabel(s, order.llc_name)}</span>
                </div>
              ),
            )}
        </div>
      ) : null}
    </div>
  );
}

function Column({
  title,
  hint,
  orders,
  servicesFor,
  onOpen,
  onFulfill,
}: {
  title: string;
  hint: string;
  orders: BoardOrder[];
  servicesFor: (id: string) => AdminServiceOrder[];
  onOpen: (id: string) => void;
  onFulfill: (s: AdminServiceOrder) => void;
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
          orders.map((o) => (
            <Card
              key={o.id}
              order={o}
              services={servicesFor(o.id)}
              onOpen={() => onOpen(o.id)}
              onFulfill={onFulfill}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface BoardData {
  orders: BoardOrder[];
  total: number;
  shown: number;
}

export default function OrderBoard({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [viewing, setViewing] = useState<AdminServiceOrder | null>(null);
  const [search, setSearch] = useState("");
  const q = search.trim();

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", q],
    queryFn: () =>
      api.get<BoardData>(`/api/admin/orders${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled,
    placeholderData: (prev) => prev,
  });

  const servicesQuery = useQuery({
    queryKey: ["admin-services"],
    queryFn: () => api.get<AdminServiceOrder[]>("/api/admin/services"),
    enabled,
  });

  const markFiled = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/orders/${id}/filed`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });

  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const shown = ordersQuery.data?.shown ?? 0;

  // Attach each service order to a company card: by formation_order_id when
  // the order was bought with the formation, otherwise (portal purchases) to
  // the client's newest visible formation. Abandoned service checkouts and
  // cancellations don't appear on cards.
  const newestByClient = new Map<string, string>();
  for (const o of orders) {
    if (o.client_id && !newestByClient.has(o.client_id)) newestByClient.set(o.client_id, o.id);
  }
  const byOrder = new Map<string, AdminServiceOrder[]>();
  for (const s of servicesQuery.data ?? []) {
    if (s.status === "pending_payment" || s.status === "cancelled") continue;
    const target = s.formation_order_id ?? newestByClient.get(s.client_id);
    if (!target) continue;
    const list = byOrder.get(target);
    if (list) list.push(s);
    else byOrder.set(target, [s]);
  }
  const servicesFor = (id: string) => byOrder.get(id) ?? [];

  const pending = orders.filter((o) => o.status === "pending_payment");
  const isNew = orders.filter((o) => o.status === "paid");
  // Complete means COMPLETE (Adam, 30 Aug 2026): the Articles are back, every
  // purchased certificate is uploaded, and no service order is open. A formed
  // order still owing any of that stays in column two — and a later portal
  // purchase pulls a Complete card straight back there.
  const certOwed = (o: BoardOrder) =>
    (o.cert_status_purchased && !o.cert_status_uploaded) ||
    (o.certified_copy_purchased && !o.certified_copy_uploaded);
  const everythingDone = (o: BoardOrder) =>
    o.status === "formed" && !certOwed(o) && !servicesFor(o.id).some(serviceIsOpen);
  // A formed company whose client bought something AFTER formation is NEW
  // WORK: it goes back to the first column with a green outline (Adam,
  // 31 Aug 2026). Open intake add-ons do not count (5 Sep 2026): a formed
  // order still owing its intake EIN, S election, or certificates is
  // formation work and stays in column two.
  const newWork = orders.filter(
    (o) => o.status === "formed" && servicesFor(o.id).some((s) => boughtAfterFormation(s, o.formed_at)),
  );
  const withState = orders.filter(
    (o) => o.status === "filed" || (o.status === "formed" && !everythingDone(o) && !newWork.includes(o)),
  );
  const done = orders.filter(everythingDone);
  const oldestPending = pending.reduce<number>((m, o) => Math.max(m, ageInDays(o.created_at)), 0);

  return (
    <>
      {/* The list caps at 200 rows, so the count and the search reach what the
          board cannot show. The count is always stated — truncation is never
          silent. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search by LLC name, client name, or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by LLC name, client name, or email"
          className="w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-trust/60"
        />
        {ordersQuery.data ? (
          <span className="text-sm text-muted-foreground">
            {shown < total
              ? `Showing the ${shown} most recent of ${total} orders${q ? " matching" : ""} — search to reach the rest`
              : q
                ? `${total} ${total === 1 ? "order matches" : "orders match"}`
                : `${total} ${total === 1 ? "order" : "orders"}`}
          </span>
        ) : null}
      </div>

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

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <Column
          title="New Orders"
          hint="Paid, not yet filed — green: new order from an existing client"
          orders={[...newWork, ...isNew]}
          servicesFor={servicesFor}
          onOpen={setOpenId}
          onFulfill={setViewing}
        />
        <Column
          title="With The State"
          hint="Filed, awaiting the Division"
          orders={withState}
          servicesFor={servicesFor}
          onOpen={setOpenId}
          onFulfill={setViewing}
        />
        <Column
          title="Complete"
          hint="Everything delivered — documents and services"
          orders={done}
          servicesFor={servicesFor}
          onOpen={setOpenId}
          onFulfill={setViewing}
        />
      </div>

      {ordersQuery.isError ? (
        <p className="mt-3 text-sm text-destructive">Could not load orders.</p>
      ) : null}

      {openId ? (
        <OrderDetail
          orderId={openId}
          services={servicesFor(openId)}
          onFulfill={setViewing}
          onClose={() => setOpenId(null)}
          onMarkFiled={() => markFiled.mutate(openId)}
          markingFiled={markFiled.isPending}
        />
      ) : null}

      <ServiceFulfillDialog viewing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
