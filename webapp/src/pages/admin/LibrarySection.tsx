import {BackupAttentionBanner,HistoryRecoveryPanel} from './OfficeRecoveryPanel';
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface MirrorStatus {
  configured: boolean;
  mirrored: number;
  pending: number;
  lastMirroredAt: string | null;
  complete?: boolean;
  failures?: number;
  lastError?: string | null;
}

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
  const [restartAcknowledged,setRestartAcknowledged]=useState(false);
  const [restartMessage,setRestartMessage]=useState('');

  const libraryQuery = useQuery({
    queryKey: ["admin-library"],
    queryFn: () => api.get<LibraryDoc[]>("/api/admin/library"),
    enabled,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF first.");
      if (!edition.trim()) throw new Error("Enter the edition label before publishing the manual.");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", "Series LLC Owner's Manual");
      fd.set("edition", edition.trim());
      const res = await fetch("/api/admin/library/owners-manual", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The upload did not go through. Try again.");
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
  const progressQuery = useQuery({
    queryKey:["admin-backup-progress"],
    queryFn:()=>api.get<{complete:boolean;pending:number;error:string|null;completedAt:string|null;status?:string;jobKey:string|null;historyCurrentConflicts:{historyId:string;title:string}[]}>("/api/admin/backups/progress"),
    enabled,refetchInterval:5000,
  });
  const restartBackup=useMutation({mutationFn:async(historyId:string)=>{
    if(!restartAcknowledged)throw Error('Confirm that the new snapshot will disclose the historical gap.');
    return api.post<{key:string}>('/api/admin/backups/restart-after-history-change',{expectedJobKey:progressQuery.data?.jobKey,historyId,acknowledge:true});
  },onSuccess:()=>{setRestartMessage('A new snapshot is queued with the acknowledged historical gap. The unfinished older snapshot has been preserved.');queryClient.invalidateQueries({queryKey:['admin-backup-progress']});},onError:e=>setRestartMessage(e.message)});
  const runBackup = useMutation({
    mutationFn: () => api.post<{ key: string; sizeBytes: number; complete: boolean; pending: number }>("/api/admin/backups/run", {}),
    onSuccess: () => {queryClient.invalidateQueries({ queryKey: ["admin-backups"] });queryClient.invalidateQueries({queryKey:["admin-backup-progress"]});},
  });
  const newest = (backupsQuery.data ?? [])[0];
  const mirrorQuery = useQuery({
    queryKey: ["admin-file-mirror"],
    queryFn: () => api.get<MirrorStatus>("/api/admin/file-mirror"),
    enabled,refetchInterval:5000,
  });
  const runMirror = useMutation({
    mutationFn: () => api.post<{ mirrored: number; failed: number; skipped: boolean }>("/api/admin/file-mirror/run", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-file-mirror"] }),
  });
  const mirror = mirrorQuery.data;
  // A backup nobody can see failing isn't a backup: flag a stale newest dump.
  const newestAgeDays = newest
    ? Math.floor((Date.now() - new Date(newest.uploadedAt).getTime()) / 86_400_000)
    : null;

  return (
    <>
      <BackupAttentionBanner/>
      <HistoryRecoveryPanel/>
      {progressQuery.data?.status==='complete_with_history_gaps'?<p role="status">Restorable backup with historical gaps</p>:null}
      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-trust" />
          <span className="text-sm font-medium">Series LLC Owner's Manual</span>
          <span className="text-xs text-muted-foreground">
            {manual
              ? `Current: ${manual.edition || "unlabeled edition"} · updated ${new Date(manual.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : libraryQuery.isError ? "Manual publication needs attention" : "Preparing the default manual…"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The site generates the default Owner’s Manual. Upload a replacement PDF only when needed;
          an uploaded replacement stays in use until you replace it or regenerate from the master.
          Clients download the current published edition, stamped with their name and served copy-restricted.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Replacement PDF for the manual"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-muted-foreground file:mr-3 file:rounded-full file:border file:border-border file:bg-secondary file:px-4 file:py-1.5 file:text-sm file:font-medium"
          />
          <Input
            aria-label="Edition label"
            placeholder='Edition label, e.g. "Second Edition — January 2027"'
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button
            size="sm"
            className="rounded-full"
            disabled={!file || !edition.trim() || upload.isPending}
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
        <p className="mt-2 text-xs text-muted-foreground">
          Regenerating replaces the currently published manual, including any PDF you uploaded by hand, with a new PDF from the master.
        </p>
        {libraryQuery.isError ? <p className="mt-2 text-sm text-destructive" role="alert">We could not prepare or check the Owner’s Manual. Choose Regenerate from the master to retry. Any previously published copy remains in place.</p> : null}
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
          Complete backups include business records, email and renewal history, and a verified
          manifest of retained documents. Database snapshots are stored privately in Vercel Blob;
          document copies are verified in Dropbox. Transient questionnaire taxpayer numbers are excluded;
          retained tax documents remain encrypted. Backups are kept. Restore instructions: docs/db-restore.md.
        </p>
        <p className="mt-2 text-xs" role="status" data-testid="backup-progress">
          {progressQuery.isError ? "Backup status unavailable — completeness has not been verified." : progressQuery.data?.status==='capacity_blocked'?'Backup capacity is blocked — the current snapshot has been unfinished for at least 24 hours in four-worker mode. Release qualification is refused. Completed backups remain available.':progressQuery.data?.status==='complete_with_history_gaps'?'Restorable backup with historical gaps — current documents are verified; the recorded historical originals are unavailable.':progressQuery.data?.complete ? `Complete — records and retained document copies verified at ${new Date(progressQuery.data.completedAt!).toLocaleString()}.` : `Incomplete — ${progressQuery.data?.pending ?? "unknown"} files pending. ${progressQuery.data?.error || "Automatic continuation runs every five minutes while work remains."}`}
        </p>
        {progressQuery.data?.historyCurrentConflicts?.length?<section className="my-3 space-y-2 rounded border p-3" aria-label="Restart backup after history change">
          <p>This snapshot needs a missing file that was current when it started. After recording that file as an unavailable historical original, start a new snapshot of the corrected documents.</p>
          <label className="flex gap-2"><input type="checkbox" checked={restartAcknowledged} onChange={e=>setRestartAcknowledged(e.target.checked)}/>I understand the new snapshot will disclose the acknowledged historical gap.</label>
          {progressQuery.data.historyCurrentConflicts.map(r=><Button key={r.historyId} variant="outline" disabled={!restartAcknowledged||restartBackup.isPending} onClick={()=>restartBackup.mutate(r.historyId)}>Start new snapshot: {r.title}</Button>)}
        </section>:null}
        {restartMessage?<p role={restartBackup.isError?'alert':'status'}>{restartMessage}</p>:null}
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
          {(backupsQuery.data ?? []).length > 5 ? (
            <span className="text-xs text-muted-foreground">newest 5 of {(backupsQuery.data ?? []).length}:</span>
          ) : null}
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
        {runBackup.isSuccess ? (
          <p className="mt-2 text-xs text-trust" data-testid="backup-result">Backed up: {runBackup.data.key} ({Math.max(1, Math.round(runBackup.data.sizeBytes / 1024))} KB).</p>
        ) : null}
        {runBackup.isError ? (
          <p className="mt-2 text-xs text-destructive">{(runBackup.error as Error).message}</p>
        ) : null}

        <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Client-file mirror to Dropbox</span>
            <span className={mirror && !mirror.configured ? "text-xs font-medium text-amber-700" : mirror && mirror.pending > 0 ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
              {mirrorQuery.isLoading || !mirror
                ? "…"
                : !mirror.configured
                  ? "Not connected — Dropbox credentials are not set"
                  : `${mirror.mirrored} mirrored · ${mirror.pending} pending${mirror.lastMirroredAt ? ` · last ${new Date(mirror.lastMirroredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={runMirror.isPending}
              onClick={() => runMirror.mutate()}
            >
              {runMirror.isPending ? "Mirroring…" : "Mirror now"}
            </Button>
            {runMirror.isSuccess ? (
              <span className={runMirror.data.skipped || runMirror.data.failed > 0 ? "text-xs text-amber-700" : "text-xs text-trust"} data-testid="mirror-result">
                {runMirror.data.skipped
                  ? "Mirror skipped: Dropbox is not connected."
                  : `Mirrored ${runMirror.data.mirrored} file${runMirror.data.mirrored === 1 ? "" : "s"}, ${runMirror.data.failed} failed.`}
              </span>
            ) : null}
            {runMirror.isError ? (
              <span className="text-xs text-destructive" data-testid="mirror-result">{(runMirror.error as Error).message}</span>
            ) : null}
          </div>
          <p className="mt-1 text-xs" role="status">{mirrorQuery.isError ? "Mirror status unavailable." : mirror?.complete ? "Complete — all retained client files verified." : `Incomplete — ${mirror?.pending ?? "unknown"} pending; ${mirror?.failures ?? 0} failures. ${mirror?.lastError || ""}`}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            All retained client files are backed up to Dropbox, organized by company.
            Interrupted work resumes automatically; failures are reported and retried without blocking later files.
            Sensitive documents are copied encrypted. Client deletion requests also remove their mirrored copies.
          </p>
        </div>
      </div>
    </>
  );
}
