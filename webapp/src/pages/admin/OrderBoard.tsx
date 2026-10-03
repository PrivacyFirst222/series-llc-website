import {BackupAttentionBanner} from './OfficeRecoveryPanel';
import { Button } from "@/components/ui/button";
import { WAITING_FOR_CLIENT } from "./serviceOrders.helpers";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronRight, Clock, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import OrderDetail from "./OrderDetail";
import {
  type AdminServiceOrder, ServiceFulfillDialog } from "./ServiceOrdersSection";
import { boughtAfterFormation, serviceIsOpen, serviceLabel } from "./serviceOrders.helpers";

export interface BoardOrder {
  work_stage: "pending" | "new" | "state" | "post-filing" | "completed" | "other";
  id: string;
  client_id: string | null;
  contact_name: string;
  contact_email: string;
  llc_name: string;
  status: string;
  created_at: string;
  formed_at: string | null;
  series_count: number;
  ra_service: boolean;
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
  // Otherwise from the day the order was placed, in every column (15 Sep
  // 2026: marking an order sent restarted the count).
  const ageFrom = freshWork
    ? newPurchases.reduce((latest, s) => (s.created_at > latest ? s.created_at : latest), newPurchases[0].created_at)
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
          {(order.cert_status_purchased && !order.cert_status_uploaded) || (order.certified_copy_purchased && !order.certified_copy_uploaded) ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900" data-testid="certs-owed-chip">
              certificates owed
            </span>
          ) : null}
        </div>
      </button>
      {/* Adam's spec: only whether EIN / S corp was ordered and whether each
          is completed. Everything else lives in the fulfill dialog, opened by
          clicking an open line. A series designation shows only while open —
          it has no other admin fulfill surface — and vanishes once done. */}
      {services.some((s) => s.type !== "series" || serviceIsOpen(s) || s.completion_available) ? (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5">
          {services
            .filter((s) => s.type !== "series" || serviceIsOpen(s) || s.completion_available)
            .map((s) =>
              serviceIsOpen(s) ? (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFulfill(s)}
                  className="flex w-full items-start gap-1.5 text-left text-xs transition hover:text-trust"
                >
                  <span className="min-w-0 break-words font-medium">{serviceLabel(s, order.llc_name)}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {s.status === "awaiting_info" && (s.type === "ein" || s.type === "s-election")
                      ? `— ${WAITING_FOR_CLIENT}`
                      : "— in progress"}
                  </span>
                </button>
              ) : s.completion_available || (s.type === "s-election" && s.has_secret) ? (
                // The client built this package from their own details. The
                // office can still open it while those details are on file —
                // to see the date they typed and correct it if the Articles
                // say otherwise.
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFulfill(s)}
                  data-testid="view-built-s-election"
                  className="flex w-full items-start gap-1.5 text-left text-xs text-muted-foreground transition hover:text-trust"
                >
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-trust" />
                  <span className="min-w-0 break-words">{serviceLabel(s, order.llc_name)}</span>
                  <span className="shrink-0">{s.type === "s-election" && s.has_secret ? "— built by the client · view" : "— completed · view"}</span>
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
  page: number;
  pageSize: number;
}

export default function OrderBoard({ enabled, view = "active" }: { enabled: boolean; view?: "active" | "completed" }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AdminServiceOrder | null>(null);
  const [search, setSearch] = useState("");
  const q = search.trim();
  const [page, setPage] = useState(1);

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", view, q, page],
    queryFn: () => api.get<BoardData>(`/api/admin/orders?view=${view}&page=${page}&q=${encodeURIComponent(q)}`),
    enabled,
  });
  const orderIds = (ordersQuery.data?.orders ?? []).map((o) => o.id).join(",");
  const servicesQuery = useQuery({
    queryKey: ["admin-services", "board", orderIds],
    queryFn: () => orderIds
      ? api.get<(AdminServiceOrder & { board_order_id: string })[]>(`/api/admin/services?orders=${encodeURIComponent(orderIds)}`)
      : Promise.resolve([]),
    enabled: enabled && ordersQuery.isSuccess,
  });

  const markFiled = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/orders/${id}/filed`, {}),
    // The open card reads its own key; refresh both so the card changes at
    // once (14 Sep 2026: it did not until closed and reopened).
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "order", id] });
    },
    onError: (e: Error) => toast({ duration: Infinity, title: "Could not mark sent", description: e.message }),
  });

  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const shown = ordersQuery.data?.shown ?? 0;

  const currentPage = ordersQuery.data?.page ?? page;
  const pageSize = ordersQuery.data?.pageSize ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // Server-resolved company association stays consistent across search/pages.
  const byOrder = new Map<string, AdminServiceOrder[]>();
  for (const s of servicesQuery.data ?? []) {
    if (s.status === "pending_payment" || s.status === "cancelled") continue;
    const target = s.board_order_id;
    if (!target) continue;
    const list = byOrder.get(target);
    if (list) list.push(s);
    else byOrder.set(target, [s]);
  }
  const servicesFor = (id: string) => byOrder.get(id) ?? [];

  const isNew = orders.filter((o) => o.work_stage === "new");
  const withState = orders.filter((o) => o.work_stage === "state");
  const postFiling = orders.filter((o) => o.work_stage === "post-filing");
  const done = servicesQuery.isSuccess ? orders.filter((o) => o.work_stage === "completed") : [];

  return (
    <>
      <BackupAttentionBanner/>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search by LLC name, client name, or email"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by LLC name, client name, or email"
          className="w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-trust/60"
        />
        {ordersQuery.data ? (
          <span className="text-sm text-muted-foreground">
            {total ? `Showing ${(currentPage - 1) * pageSize + 1}–${(currentPage - 1) * pageSize + shown} of ${total} ${view === "completed" ? "completed orders" : "active orders"}` : `No ${view === "completed" ? "completed orders" : "active orders"}${q ? " match your search" : ""}`}

          </span>
        ) : null}
      </div>


      {ordersQuery.isPending ? <p className="mt-4 text-sm" role="status">Loading orders…</p> : null}
      {ordersQuery.isSuccess && (view === "active" || servicesQuery.isSuccess) ? (
        <div className="mt-4 flex flex-col gap-4 xl:flex-row">
          {view === "completed" ? (
            <Column title="Completed Orders" hint="Everything delivered — documents and services" orders={done} servicesFor={servicesFor} onOpen={setOpenId} onFulfill={setViewing} />
          ) : <>
            <Column title="New Orders" hint="Paid, not yet filed — green: new order from an existing client" orders={isNew} servicesFor={servicesFor} onOpen={setOpenId} onFulfill={setViewing} />
            <Column title="With The State" hint="Awaiting filed Articles or Series Designations" orders={withState} servicesFor={servicesFor} onOpen={setOpenId} onFulfill={setViewing} />
            <Column title="Post-Filing Items" hint="Filings complete — documents or services still owed" orders={postFiling} servicesFor={servicesFor} onOpen={setOpenId} onFulfill={setViewing} />
          </>}
        </div>
      ) : null}
      {ordersQuery.isSuccess && pages > 1 ? (
        <nav aria-label="Order pages" className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
          <span className="text-sm">Page {currentPage} of {pages}</span>
          <Button variant="outline" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
        </nav>
      ) : null}

      {!servicesQuery.isSuccess ? (
        <div className="mt-3 text-sm" role="status" data-testid="service-load-status">
          {servicesQuery.isError ? "We could not check the remaining service orders. Try again." : "Checking remaining service orders…"}
          {servicesQuery.isError ? <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => servicesQuery.refetch()}>Try again</Button> : null}
        </div>
      ) : null}

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
