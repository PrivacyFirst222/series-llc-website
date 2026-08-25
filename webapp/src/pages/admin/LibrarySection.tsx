import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface BackupInfo {
  key: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface LibraryDoc {
  key: string;
  title: string;
  edition: string;
  size_bytes: number;
  updated_at: string;
}

/** The client-facing reference library (the Owner's Manual). Replacing the
 *  file makes every client's next download the new edition. */
export function LibrarySection({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [edition, setEdition] = useState("");
  const [message, setMessage] = useState("");

  const libraryQuery = useQuery({
    queryKey: ["admin-library"],
    queryFn: () => api.get<LibraryDoc[]>("/api/admin/library"),
    enabled,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF first.");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", "Series LLC Owner's Manual");
      fd.set("edition", edition || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }));
      const res = await fetch("/api/admin/library/owners-manual", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Upload failed");
      }
    },
    onSuccess: () => {
      setFile(null);
      setEdition("");
      setMessage("Published — every client's next download is this edition.");
      queryClient.invalidateQueries({ queryKey: ["admin-library"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const regenerate = useMutation({
    mutationFn: () => api.post<{ published: boolean; pages?: number; edition?: string }>(
      "/api/admin/library/owners-manual/regenerate", {},
    ),
    onSuccess: (r) => {
      setMessage(
        r.published
          ? `Regenerated from the master — ${r.pages} pages, "${r.edition}". Every client's next download is this edition.`
          : "Already current — the published manual matches the master.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-library"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const manual = (libraryQuery.data ?? []).find((d) => d.key === "owners-manual");

  const backupsQuery = useQuery({
    queryKey: ["admin-backups"],
    queryFn: () => api.get<BackupInfo[]>("/api/admin/backups"),
    enabled,
  });
  const runBackup = useMutation({
    mutationFn: () => api.post<{ key: string; sizeBytes: number }>("/api/admin/backups/run", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-backups"] }),
  });
  const newest = (backupsQuery.data ?? [])[0];
  // A backup nobody can see failing isn't a backup: flag a stale newest dump.
  const newestAgeDays = newest
    ? Math.floor((Date.now() - new Date(newest.uploadedAt).getTime()) / 86_400_000)
    : null;

  return (
    <>
      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-trust" />
          <span className="text-sm font-medium">Series LLC Owner's Manual</span>
          <span className="text-xs text-muted-foreground">
            {manual
              ? `Current: ${manual.edition || "unlabeled edition"} · updated ${new Date(manual.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "Not yet published"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Upload the manual as a plain PDF. Clients always download the latest edition, stamped
          with their name and served copy-restricted; replacing the file updates it for everyone
          instantly.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-muted-foreground file:mr-3 file:rounded-full file:border file:border-border file:bg-secondary file:px-4 file:py-1.5 file:text-sm file:font-medium"
          />
          <Input
            placeholder='Edition label, e.g. "Second Edition — January 2027"'
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button
            size="sm"
            className="rounded-full"
            disabled={!file || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? "Publishing…" : manual ? "Replace edition" : "Publish"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            {regenerate.isPending ? "Rendering…" : "Regenerate from the master"}
          </Button>
        </div>
        {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Database backups</span>
          <span className={newestAgeDays !== null && newestAgeDays > 1 ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
            {backupsQuery.isLoading
              ? "…"
              : newest
                ? `Newest: ${newest.key} · ${(newest.sizeBytes / 1024).toFixed(0)} KB · ${new Date(newest.uploadedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${newestAgeDays !== null && newestAgeDays > 1 ? " — STALE, the nightly backup has not run" : ""}`
                : "No backups yet"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A nightly copy of clients, orders, service orders, and documents,
          stored privately outside the database's own company. The newest 30
          are kept. Click a backup to download it; restoring is described in
          the runbook (docs/db-restore.md).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={runBackup.isPending}
            onClick={() => runBackup.mutate()}
          >
            {runBackup.isPending ? "Backing up…" : "Back up now"}
          </Button>
          {(backupsQuery.data ?? []).slice(0, 5).map((b) => (
            <a
              key={b.key}
              href={`/api/admin/backups/${encodeURIComponent(b.key)}/download`}
              className="text-xs font-medium text-trust underline underline-offset-2"
            >
              {b.key}
            </a>
          ))}
        </div>
        {runBackup.isError ? (
          <p className="mt-2 text-xs text-destructive">{(runBackup.error as Error).message}</p>
        ) : null}
      </div>
    </>
  );
}
