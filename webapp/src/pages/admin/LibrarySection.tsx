import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

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
    queryKey: ["portal-library"],
    queryFn: () => api.get<LibraryDoc[]>("/api/portal/library"),
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
      queryClient.invalidateQueries({ queryKey: ["portal-library"] });
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
      queryClient.invalidateQueries({ queryKey: ["portal-library"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const manual = (libraryQuery.data ?? []).find((d) => d.key === "owners-manual");

  return (
    <>
      <h2 className="mt-12 font-display text-xl">Reference library</h2>
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
    </>
  );
}
