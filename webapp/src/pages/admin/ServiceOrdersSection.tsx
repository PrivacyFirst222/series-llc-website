import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { summaryOf } from "./serviceOrders.helpers";

interface SElectionShareholderView {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string;
  ssnLast4: string;
}

export interface AdminServiceOrder {
  id: string;
  type: "series" | "ein" | "s-election" | "certificate-of-status" | "certified-copy";
  status: string;
  llc_name: string;
  details: {
    seriesName?: string; target?: string; responsibleName?: string; tinLast4?: string; purpose?: string; note?: string;
    ein?: string; einPending?: boolean; dateIncorporated?: string; effectiveDate?: string;
    officerName?: string; officerTitle?: string; phone?: string; shareholders?: SElectionShareholderView[];
    fulfilledByOverride?: boolean; overrideAt?: string;
  };
  amount_cents: number;
  client_id: string;
  formation_order_id: string | null;
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

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";



/** The one-line name for a service order. The surrounding card or dialog
 *  already names the LLC, so series names are shortened to their own part —
 *  "Jimmy Flanagan, LLC - PS 3" reads "PS 3". Never truncated, only wrapped. */


/** The fulfill flow for one service order, opened from a company card. The
 *  caller owns which order is being viewed; everything else — secret detail
 *  fetch, attachment, the fulfill action — lives here. */
export function ServiceFulfillDialog({
  viewing,
  onClose,
}: {
  viewing: AdminServiceOrder | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [attachment, setAttachment] = useState<File | null>(null);
  const [skipDocument, setSkipDocument] = useState(false);
  // Adam's override (6 Sep 2026): the details were obtained outside the
  // portal, so fulfill anyway. The deliverable is still required.
  const [override, setOverride] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["admin-service-detail", viewing?.id],
    queryFn: () => api.get<ServiceDetail>(`/api/admin/services/${viewing?.id}`),
    enabled: viewing !== null,
  });

  // The formation date is entered here, from the filed Articles, when the
  // S election is prepared (Adam, 6 Sep 2026). Entering it builds the
  // package and posts it to the client.
  const [formationDate, setFormationDate] = useState<string>("");
  const enterFormationDate = useMutation({
    mutationFn: (args: { id: string; date: string }) =>
      api.post<{ documentId: string }>(`/api/admin/services/${args.id}/s-election-formation-date`, { date: args.date }),
    onSuccess: () => {
      setFormationDate("");
      queryClient.invalidateQueries({ queryKey: ["admin-service-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
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
      setAttachment(null);
      setSkipDocument(false);
      setOverride(false);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  return (
    <Dialog
      open={viewing !== null}
      onOpenChange={(v) => {
        if (!v) {
          setAttachment(null);
          setSkipDocument(false);
          setOverride(false);
          onClose();
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
            <div><span className="text-muted-foreground">Placed:</span> {day(viewing.created_at)}</div>
            {viewing.details.fulfilledByOverride ? (
              <div className="font-medium text-amber-800">
                Fulfilled by override — details obtained outside the portal
                {viewing.details.overrideAt ? ` (${day(viewing.details.overrideAt)})` : ""}.
              </div>
            ) : null}
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
                {detailQuery.data?.details.dateIncorporated ? (
                  <div>
                    <span className="text-muted-foreground">Filed by the Division / election effective:</span>{" "}
                    {detailQuery.data.details.dateIncorporated} / {detailQuery.data.details.effectiveDate || detailQuery.data.details.dateIncorporated}
                  </div>
                ) : viewing.has_secret ? (
                  <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-amber-900" data-testid="formation-date-entry">
                    <p className="text-sm font-medium">Enter the date the Division filed the Articles.</p>
                    <p className="text-xs">
                      From the filed Articles. It goes on Form 2553 as the date of incorporation, sets the
                      election's effective date where the client left it blank, and starts their two-week
                      download window. Entering it builds the package and emails the client.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="date"
                        aria-label="Date filed by the Division"
                        value={formationDate}
                        onChange={(e) => setFormationDate(e.target.value)}
                        className="w-48"
                      />
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={!formationDate || enterFormationDate.isPending}
                        onClick={() => enterFormationDate.mutate({ id: viewing.id, date: formationDate })}
                      >
                        {enterFormationDate.isPending ? "Building the package…" : "Enter date & build the package"}
                      </Button>
                    </div>
                    {enterFormationDate.isError ? (
                      <p className="text-xs text-destructive">{(enterFormationDate.error as Error).message}</p>
                    ) : null}
                  </div>
                ) : null}
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
                {viewing.has_secret && detailQuery.data?.details.dateIncorporated ? (
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
        {/* An EIN or S election waiting on the client's details cannot be
            fulfilled — the IRS forms are built from those details, and
            fulfilling deletes them. Say so instead of greying out a button
            (Adam, 6 Sep 2026: "I can't upload the pdf"). */}
        {(viewing?.type === "ein" || viewing?.type === "s-election") && viewing?.status === "awaiting_info" ? (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900" data-testid="waiting-on-client">
            <p className="font-medium">Waiting on the client.</p>
            <p className="mt-1">
              {viewing.type === "ein"
                ? "They haven't provided the responsible party's details yet. The EIN application can't be prepared or fulfilled until they do — the portal is asking them for it."
                : "They haven't provided the S election details yet. The Form 2553 package can't be prepared or fulfilled until they do — the portal is asking them for it."}
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="override-fulfill"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-trust"
              />
              <span>I have the details from outside the portal — fulfill anyway.</span>
            </label>
          </div>
        ) : null}
        {(viewing?.type === "ein" || viewing?.type === "s-election") && viewing?.status === "awaiting_info" && !override ? null : (
        <div className="space-y-2 border-t border-border pt-3">
          <label htmlFor="service-attachment-file" className="text-sm font-medium">
            {viewing?.type === "ein"
              ? "Attach the EIN confirmation letter (CP 575)"
              : viewing?.type === "s-election"
                ? "Attach the final election package PDF"
                : viewing?.type === "certificate-of-status"
                  ? "Attach the Certificate of Status from the Division"
                  : viewing?.type === "certified-copy"
                    ? "Attach the certified copy from the Division"
                    : "Attach the filed Designation"}
          </label>
          <input
            id="service-attachment-file"
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
        )}
        {fulfill.isError ? (
          <p className="text-xs text-destructive">{(fulfill.error as Error).message}</p>
        ) : null}
        {(viewing?.type === "ein" || viewing?.type === "s-election") && viewing?.status === "awaiting_info" && !override ? null : (
          <DialogFooter>
            <Button
              className="rounded-full"
              disabled={fulfill.isPending || (!attachment && !skipDocument)}
              onClick={() => viewing && fulfill.mutate({ id: viewing.id, file: attachment })}
            >
              {fulfill.isPending ? "Fulfilling…" : attachment ? "Upload & fulfill" : "Mark fulfilled"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
