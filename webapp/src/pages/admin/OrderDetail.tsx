import { sunbizSearchUrl } from "@/components/forms/florida-llc/nameSimilarity";
import { NameCheck } from "@/components/forms/florida-llc/NameCheck";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileUp, Landmark, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { type AdminServiceOrder } from "./ServiceOrdersSection";
import { serviceIsOpen, serviceLabel } from "./serviceOrders.helpers";

interface FilingField {
  key: string;
  label: string;
  value: string;
  block?: boolean;
  statement?: boolean;
}
interface FilingGroup {
  title: string;
  fields: FilingField[];
  series?: boolean;
}
interface OrderDetailData {
  id: string;
  clientId: string | null;
  llcName: string;
  alternateNames: string[];
  status: string;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  filedAt: string | null;
  formedAt: string | null;
  groups: FilingGroup[];
  seriesFiledAt: string | null;
  copiedFields: Record<string, boolean>;
  series: { name: string; covered: boolean }[];
  documents: { id: string; kind: string; title: string; createdAt: string }[];
  services: { id: string; type: string; status: string; llc_name: string }[];
  hasArticles: boolean;
}

/** A field and its copy button. The check is not a UI flourish — it is the
 *  record of which values have already been typed into the Division's form, so
 *  a filing interrupted halfway resumes without re-reading everything. It is
 *  stored on the order, not in this browser, so the machine can change. */
function Field({
  field,
  copied,
  onCopied,
}: {
  field: FilingField;
  copied: boolean;
  onCopied: (key: string, next: boolean) => void;
}) {
  const [flash, setFlash] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      /* clipboard refused — the tick still records that you dealt with it */
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    onCopied(field.key, true);
  };
  // Context rows (filing type, the fee, leave-blank advice) are statements:
  // nothing to enter on Sunbiz, so no tick to track and nothing to copy.
  if (field.statement) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{field.label}</div>
        <div className={cn("mt-0.5 text-sm", field.block ? "leading-relaxed" : "truncate")}>
          {field.value}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2 transition",
        copied ? "border-trust/40 bg-trust/5" : "border-border bg-card",
      )}
    >
      <button
        type="button"
        aria-label={copied ? `Mark ${field.label} not copied` : `Mark ${field.label} copied`}
        onClick={() => onCopied(field.key, !copied)}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
          copied ? "border-trust bg-trust text-white" : "border-border",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{field.label}</div>
        <div className={cn("mt-0.5 text-sm", field.block ? "leading-relaxed" : "truncate")}>
          {field.value}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" aria-label={`Copy ${field.label}`} onClick={copy} className="shrink-0">
        {flash ? <Check className="h-4 w-4 text-trust" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function OrderDetail({
  orderId,
  services,
  onFulfill,
  onClose,
  onMarkFiled,
  markingFiled,
}: {
  orderId: string;
  services: AdminServiceOrder[];
  onFulfill: (s: AdminServiceOrder) => void;
  onClose: () => void;
  onMarkFiled: () => void;
  markingFiled: boolean;
}) {
  const queryClient = useQueryClient();
  const articlesRef = useRef<HTMLInputElement>(null);
  const [psdRows, setPsdRows] = useState<{ file: File | null; covers: string[] }[]>([
    { file: null, covers: [] },
  ]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadArticles = useMutation({
    mutationFn: async () => {
      const f = articlesRef.current?.files?.[0];
      if (!f) throw new Error("Choose the filed Articles PDF.");
      const fd = new FormData();
      fd.append("articles", f);
      const res = await fetch(`/api/admin/orders/${orderId}/articles`, { method: "POST", body: fd, credentials: "include" });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? "Upload failed.");
      return body;
    },
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  const seriesFiled = useMutation({
    mutationFn: () => api.post(`/api/admin/orders/${orderId}/series-filed`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    },
  });

  const detail = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: () => api.get<OrderDetailData>(`/api/admin/orders/${orderId}`),
  });

  const setCopied = useMutation({
    mutationFn: (v: { key: string; copied: boolean }) =>
      api.post(`/api/admin/orders/${orderId}/copied`, v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] }),
  });

  const d = detail.data;

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      const articles = articlesRef.current?.files?.[0];
      if (articles) fd.append("articles", articles);
      for (const row of psdRows) {
        if (!row.file) continue;
        fd.append("psd", row.file);
        fd.append("psdSeries", JSON.stringify(row.covers));
      }
      const res = await fetch(`/api/admin/orders/${orderId}/formation-documents`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(body?.error?.message ?? "Upload failed.");
      return body;
    },
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  // Every series must be covered by some designation before the button is live.
  const claimed = new Set(psdRows.flatMap((r) => (r.file ? r.covers : [])));
  const uncovered = (d?.series ?? []).filter((s) => !s.covered && !claimed.has(s.name));
  const canUpload =
    (d?.hasArticles || !!articlesRef.current?.files?.length) &&
    psdRows.some((r) => r.file) && uncovered.length === 0;


  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-xl">{d?.llcName ?? "Loading…"}</h2>
            {d?.llcName ? (
              <a
                href={sunbizSearchUrl(d.llcName)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-trust underline underline-offset-2"
              >
                Check name on Sunbiz (Active = taken · INACT/UA = held · INACT = available)
              </a>
            ) : null}
            {d?.llcName ? (
              <div className="mt-2">
                <NameCheck
                  compactDisclaimer
                  names={[
                    { label: "First choice", value: d.llcName },
                    ...(d.alternateNames ?? []).map((n, i) => ({
                      label: `Alternate ${i + 1}`,
                      value: n,
                    })),
                  ]}
                />
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {d ? (
                <>
                  <span className="font-medium text-foreground">Client:</span>{" "}
                  {`${d.contactName} <${d.contactEmail}>`}
                </>
              ) : (
                ""
              )}
            </p>
            {/* Adam's spec: the service orders sit right here, first thing
                after the name verdicts — the extra prose is gone; the
                fulfill dialog explains the taxpayer-number handling. */}
            {/* Ancillary services wait their turn: nothing to fulfill while
                the base LLC is not even sent (Adam, 30 Aug 2026). */}
            {d && d.status !== "paid" && services.length > 0 ? (
              <section className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <h3 className="font-display text-base">Service orders</h3>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {services.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 break-words font-medium">
                        {serviceLabel(s, d.llcName, true)}
                      </span>
                      {serviceIsOpen(s) ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {s.status.replace(/_/g, " ")}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto rounded-full"
                            onClick={() => onFulfill(s)}
                          >
                            {s.type === "ein" && s.has_secret ? "View & fulfill" : "Fulfill"}
                          </Button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-trust">
                          <Check className="h-3.5 w-3.5" /> fulfilled
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {detail.isLoading ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">Loading the filing…</p>
        ) : !d ? (
          <p className="px-6 py-8 text-sm text-destructive">Could not load this order.</p>
        ) : (
          <div className="space-y-8 px-6 py-6">
            {d.status === "paid" ? (
              <div className="space-y-3">
                {!d.hasArticles ? (
                  <div className="rounded-lg border border-border p-3">
                    <label htmlFor="upload-articles-first" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Filed Articles of Organization
                    </label>
                    <input
                      id="upload-articles-first"
                      ref={articlesRef}
                      type="file"
                      accept="application/pdf"
                      className="mt-1 block w-full text-sm"
                      onChange={() => setUploadError(null)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-full"
                      disabled={uploadArticles.isPending}
                      onClick={() => uploadArticles.mutate()}
                    >
                      {uploadArticles.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                      Upload Articles
                    </Button>
                    {uploadError ? <p className="mt-2 text-sm text-destructive">{uploadError}</p> : null}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-trust">
                    <Check className="h-4 w-4" /> Filed Articles uploaded
                  </p>
                )}
                <Button onClick={onMarkFiled} disabled={markingFiled || !d.hasArticles} className="w-full rounded-full">
                  {markingFiled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Mark sent to the Division
                </Button>
                {!d.hasArticles ? (
                  <p className="text-xs text-muted-foreground">
                    Upload the filed Articles first — the order moves to With The State only once they are on file.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* The panel follows Adam's filing sequence (30 Aug 2026):
                New Orders shows the base Articles' fields alone — series
                designations cannot be filed until the LLC exists. With The
                State swaps to the series section and its own done-button;
                the base fields are finished business. Formed shows neither. */}
            {d.status === "filed" && !d.seriesFiledAt ? (
              <Button onClick={() => seriesFiled.mutate()} disabled={seriesFiled.isPending} className="w-full rounded-full">
                {seriesFiled.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                All series designations filed
              </Button>
            ) : null}
            {d.seriesFiledAt ? (
              <p className="flex items-center gap-2 text-sm text-trust">
                <Check className="h-4 w-4" />
                Series designations filed {new Date(d.seriesFiledAt).toLocaleDateString()}
              </p>
            ) : null}

            {d.groups.filter((g) =>
              d.status === "paid" ? !g.series : d.status === "filed" && !d.seriesFiledAt ? !!g.series : false,
            ).map((g) => (
              <section key={g.title}>
                <h3 className="font-display text-base">{g.title}</h3>
                <div className="mt-2 space-y-1.5">
                  {g.fields.map((f) => (
                    <Field
                      key={f.key}
                      field={f}
                      copied={!!d.copiedFields[f.key]}
                      onCopied={(key, copied) => setCopied.mutate({ key, copied })}
                    />
                  ))}
                </div>
              </section>
            ))}

            {d.status !== "paid" ? (
            <section>
              <h3 className="font-display text-base">Formation documents</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {d.hasArticles
                  ? "Upload the Protected Series Designations. One designation may cover several series — tick the ones each file covers. This marks the order formed and emails the client."
                  : "Upload the filed Articles and the Protected Series Designations. One designation may cover several series — tick the ones each file covers. This marks the order formed and emails the client."}
              </p>

              {d.documents.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {d.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-trust" />
                      {doc.title}
                    </li>
                  ))}
                </ul>
              ) : null}

              {d.status !== "formed" ? (
                <div className="mt-4 space-y-3">
                  {!d.hasArticles ? (
                  <div>
                    <label htmlFor="upload-articles" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Articles of Organization
                    </label>
                    <input
                      id="upload-articles"
                      ref={articlesRef}
                      type="file"
                      accept="application/pdf"
                      className="mt-1 block w-full text-sm"
                      onChange={() => setUploadError(null)}
                    />
                  </div>
                  ) : null}

                  {psdRows.map((row, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <label htmlFor={`upload-psd-${i}`} className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Protected Series Designation {psdRows.length > 1 ? i + 1 : ""}
                      </label>
                      <input
                        id={`upload-psd-${i}`}
                        type="file"
                        accept="application/pdf"
                        className="mt-1 block w-full text-sm"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setPsdRows((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, file: f } : r)),
                          );
                          setUploadError(null);
                        }}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.series.map((s) => (
                          <label
                            key={s.name}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                              s.covered ? "opacity-50" : "cursor-pointer",
                            )}
                          >
                            <input
                              type="checkbox"
                              disabled={s.covered}
                              checked={row.covers.includes(s.name)}
                              onChange={(e) =>
                                setPsdRows((rows) =>
                                  rows.map((r, j) =>
                                    j === i
                                      ? {
                                          ...r,
                                          covers: e.target.checked
                                            ? [...r.covers, s.name]
                                            : r.covers.filter((n) => n !== s.name),
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                            {s.name}
                            {s.covered ? " (filed)" : ""}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPsdRows((r) => [...r, { file: null, covers: [] }])}
                  >
                    + Add another designation
                  </Button>

                  {uncovered.length > 0 ? (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Not yet covered: {uncovered.map((s) => s.name).join(", ")}
                    </p>
                  ) : null}
                  {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

                  <Button
                    onClick={() => upload.mutate()}
                    disabled={!canUpload || upload.isPending}
                    className="w-full rounded-full"
                  >
                    {upload.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="mr-2 h-4 w-4" />
                    )}
                    {d.hasArticles ? "Upload designations and mark formed" : "Upload and mark formed"}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-trust">
                  Formed{d.formedAt ? ` on ${new Date(d.formedAt).toLocaleDateString()}` : ""} — the
                  client has been emailed.
                </p>
              )}
            </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
