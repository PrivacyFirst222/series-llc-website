import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

interface SElectionShareholderView {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string;
  ssnLast4: string;
}

interface AdminServiceOrder {
  id: string;
  type: "series" | "ein" | "s-election";
  status: string;
  llc_name: string;
  details: {
    seriesName?: string; target?: string; responsibleName?: string; tinLast4?: string; purpose?: string; note?: string;
    ein?: string; einPending?: boolean; dateIncorporated?: string; effectiveDate?: string;
    officerName?: string; officerTitle?: string; phone?: string; shareholders?: SElectionShareholderView[];
  };
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  has_secret: boolean;
  ein_pending: boolean;
  client_email: string;
  client_name: string;
}

interface ServiceDetail {
  id: string;
  type: string;
  status: string;
  llc_name: string;
  details: AdminServiceOrder["details"];
  tin: string | null;
  ssns: string[] | null;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

const STATUS_STYLE: Record<string, string> = {
  fulfilled: "bg-trust/10 text-trust",
  in_progress: "bg-amber-100 text-amber-900",
  awaiting_info: "bg-secondary text-muted-foreground",
  pending_payment: "bg-secondary text-muted-foreground",
};

function summaryOf(o: { type: string; details: AdminServiceOrder["details"]; llc_name: string }): string {
  if (o.type === "series") return o.details.seriesName ?? o.llc_name;
  if (o.type === "s-election") return `S Election (2553) — ${o.llc_name}`;
  return `EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}

export function ServiceOrdersSection({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<AdminServiceOrder | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [skipDocument, setSkipDocument] = useState(false);

  const servicesQuery = useQuery({
    queryKey: ["admin-services"],
    queryFn: () => api.get<AdminServiceOrder[]>("/api/admin/services"),
    enabled,
  });

  const detailQuery = useQuery({
    queryKey: ["admin-service-detail", viewing?.id],
    queryFn: () => api.get<ServiceDetail>(`/api/admin/services/${viewing?.id}`),
    enabled: viewing !== null,
  });

  const fulfill = useMutation({
    mutationFn: async (args: { id: string; file: File | null }) => {
      const fd = new FormData();
      if (args.file) fd.set("file", args.file);
      const res = await fetch(`/api/admin/services/${args.id}/fulfill`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Fulfill failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setViewing(null);
      setAttachment(null);
      setSkipDocument(false);
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    },
  });

  const services = servicesQuery.data ?? [];
  if (services.length === 0) return null;

  return (
    <>
      <h2 className="mt-12 font-display text-xl">Service orders</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Placed</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {services.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">
                  {summaryOf(s)}
                  {s.ein_pending ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      waiting on EIN
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {s.client_name || "—"}
                  <div className="text-xs text-muted-foreground">{s.client_email}</div>
                </td>
                <td className="px-4 py-3 font-mono-feature">{money(s.amount_cents)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[s.status] ?? "bg-secondary text-muted-foreground"}`}
                  >
                    {s.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{day(s.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {s.status === "in_progress" || s.status === "awaiting_info" ? (
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => setViewing(s)}>
                      {s.type === "ein" && s.has_secret ? "View & fulfill" : "Fulfill"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={viewing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setViewing(null);
            setAttachment(null);
            setSkipDocument(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing ? summaryOf(viewing) : ""}</DialogTitle>
            <DialogDescription>
              {viewing?.type === "ein"
                ? "The identification number below is shown for SS-4 preparation and is permanently deleted when you mark the order fulfilled."
                : viewing?.type === "s-election"
                  ? "Download the draft package, review the filled Form 2553, and attach the final PDF to fulfill. The SSNs below are permanently deleted when you mark the order fulfilled."
                  : "Mark fulfilled once the designation is filed and the confirmation is uploaded to the client's documents."}
            </DialogDescription>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Client:</span> {viewing.client_name} ({viewing.client_email})</div>
              <div><span className="text-muted-foreground">LLC:</span> {viewing.llc_name}</div>
              {viewing.type === "series" ? (
                <>
                  <div><span className="text-muted-foreground">Series name:</span> {viewing.details.seriesName}</div>
                  {viewing.details.purpose ? (
                    <div><span className="text-muted-foreground">Purpose:</span> {viewing.details.purpose}</div>
                  ) : null}
                </>
              ) : viewing.type === "s-election" ? (
                <>
                  <div>
                    <span className="text-muted-foreground">EIN:</span>{" "}
                    {detailQuery.data?.details.einPending
                      ? "pending — we're obtaining it"
                      : detailQuery.data?.details.ein || "— not yet provided —"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Formed / effective:</span>{" "}
                    {detailQuery.data?.details.dateIncorporated ?? "—"} / {detailQuery.data?.details.effectiveDate ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Officer:</span>{" "}
                    {detailQuery.data?.details.officerName
                      ? `${detailQuery.data.details.officerName}, ${detailQuery.data.details.officerTitle ?? ""}`
                      : "— not yet provided —"}
                  </div>
                  {(detailQuery.data?.details.shareholders ?? []).map((sh, i) => (
                    <div key={i} className="rounded-md border border-border px-3 py-2">
                      <div className="font-medium">{sh.name} — {sh.percentage}%</div>
                      <div className="text-xs text-muted-foreground">{sh.address}</div>
                      <div className="text-xs">
                        SSN:{" "}
                        <span className="font-mono-feature">
                          {detailQuery.data?.ssns?.[i] ?? `•••-••-${sh.ssnLast4}`}
                        </span>{" "}
                        · acquired {sh.dateAcquired}
                      </div>
                    </div>
                  ))}
                  {viewing.has_secret ? (
                    <a
                      href={`/api/admin/services/${viewing.id}/s-election-draft`}
                      className="inline-block rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:border-accent"
                    >
                      Download draft package (Form 2553 + letter + instructions)
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <div><span className="text-muted-foreground">EIN for:</span>{" "}
                    {viewing.details.target === "series" ? viewing.details.seriesName : viewing.llc_name}
                  </div>
                  <div><span className="text-muted-foreground">Responsible party:</span>{" "}
                    {detailQuery.data?.details.responsibleName ?? viewing.details.responsibleName ?? "— not yet provided —"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">SSN/ITIN:</span>{" "}
                    {detailQuery.isLoading ? "…" : detailQuery.data?.tin ? (
                      <span className="font-mono-feature">{detailQuery.data.tin}</span>
                    ) : (
                      "— not yet provided —"
                    )}
                  </div>
                  {detailQuery.data?.details.note ? (
                    <div><span className="text-muted-foreground">Note:</span> {detailQuery.data.details.note}</div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          <div className="space-y-2 border-t border-border pt-3">
            <label className="text-sm font-medium">
              {viewing?.type === "ein"
                ? "Attach the EIN confirmation letter (CP 575)"
                : viewing?.type === "s-election"
                  ? "Attach the final election package PDF"
                  : "Attach the filed Designation"}
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border file:border-border file:bg-secondary file:px-4 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">
              Posted to the client's portal documents in the same action, so "documents have been
              posted" in their completion email is true.
              {viewing?.type === "ein"
                ? " The letter is required — fulfilling deletes the TIN, so an EIN order can't complete without it."
                : viewing?.type === "s-election"
                  ? " The package is required — fulfilling deletes the shareholder SSNs, so an S election order can't complete without it."
                  : ""}
            </p>
            {viewing?.type !== "ein" && viewing?.type !== "s-election" ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={skipDocument}
                  onChange={(e) => setSkipDocument(e.target.checked)}
                  className="h-3.5 w-3.5 accent-trust"
                />
                Fulfill without attaching a document
              </label>
            ) : null}
          </div>
          {fulfill.isError ? (
            <p className="text-xs text-destructive">{(fulfill.error as Error).message}</p>
          ) : null}
          <DialogFooter>
            <Button
              className="rounded-full"
              disabled={
                fulfill.isPending ||
                ((viewing?.type === "ein" || viewing?.type === "s-election") && viewing?.status === "awaiting_info") ||
                (!attachment && !skipDocument)
              }
              onClick={() => viewing && fulfill.mutate({ id: viewing.id, file: attachment })}
            >
              {fulfill.isPending ? "Fulfilling…" : attachment ? "Upload & fulfill" : "Mark fulfilled"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
