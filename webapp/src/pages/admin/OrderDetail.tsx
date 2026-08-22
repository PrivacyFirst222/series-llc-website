import { sunbizSearchUrl } from "@/components/forms/florida-llc/nameSimilarity";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileUp, Landmark, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FilingField {
  key: string;
  label: string;
  value: string;
  block?: boolean;
}
interface FilingGroup {
  title: string;
  fields: FilingField[];
}
interface OrderDetailData {
  id: string;
  clientId: string | null;
  llcName: string;
  status: string;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  filedAt: string | null;
  formedAt: string | null;
  groups: FilingGroup[];
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
      <Button type="button" variant="ghost" size="sm" onClick={copy} className="shrink-0">
        {flash ? <Check className="h-4 w-4 text-trust" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function OrderDetail({
  orderId,
  onClose,
  onMarkFiled,
  markingFiled,
}: {
  orderId: string;
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
  const [showSsn, setShowSsn] = useState(false);

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
      if (!articles) throw new Error("Choose the Articles of Organization PDF.");
      fd.append("articles", articles);
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
    !!articlesRef.current?.files?.length && psdRows.some((r) => r.file) && uncovered.length === 0;

  const einService = d?.services.find((s) => s.type === "ein");

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
            <p className="text-sm text-muted-foreground">
              {d ? `${d.contactName} <${d.contactEmail}>` : ""}
            </p>
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
              <Button onClick={onMarkFiled} disabled={markingFiled} className="w-full rounded-full">
                {markingFiled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Mark sent to the Division
              </Button>
            ) : null}

            {d.groups.map((g) => (
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

            {einService ? (
              <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <h3 className="font-display text-base">EIN service</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{einService.status}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Taxpayer numbers are held encrypted with the EIN service, not with the filing —
                  the Articles never ask for one. Open the service to work the SS-4.
                </p>
                {!showSsn ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-full"
                    onClick={() => setShowSsn(true)}
                  >
                    Show taxpayer details
                  </Button>
                ) : (
                  <p className="mt-3 text-sm">
                    Open <span className="font-medium">Services</span> below and select this EIN
                    order — the numbers are decrypted there, and destroyed when it is fulfilled.
                  </p>
                )}
              </section>
            ) : null}

            <section>
              <h3 className="font-display text-base">Formation documents</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload the filed Articles and the Protected Series Designations. One designation may
                cover several series — tick the ones each file covers. This marks the order formed
                and emails the client.
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
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Articles of Organization
                    </label>
                    <input
                      ref={articlesRef}
                      type="file"
                      accept="application/pdf"
                      className="mt-1 block w-full text-sm"
                      onChange={() => setUploadError(null)}
                    />
                  </div>

                  {psdRows.map((row, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Protected Series Designation {psdRows.length > 1 ? i + 1 : ""}
                      </label>
                      <input
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
                    Upload and mark formed
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-trust">
                  Formed{d.formedAt ? ` on ${new Date(d.formedAt).toLocaleDateString()}` : ""} — the
                  client has been emailed.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
