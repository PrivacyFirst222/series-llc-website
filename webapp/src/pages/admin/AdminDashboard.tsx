import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { api, ApiError } from "@/lib/api";
import OrderBoard from "./OrderBoard";
import { LibrarySection } from "./LibrarySection";

interface AdminClient {
  id: string;
  email: string;
  name: string;
  created_at: string;
  ra_cancellation_requested_at: string | null;
  has_password: boolean;
  document_count: number;
  ra_llcs: string[];
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function UploadDialog({ client }: { client: AdminClient }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [kind, setKind] = useState<"package" | "legal_mail">("package");
  const [notify, setNotify] = useState<boolean>(true);
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      const form = new FormData();
      form.set("clientId", client.id);
      form.set("kind", kind);
      form.set("title", title);
      form.set("notify", String(notify));
      form.set("file", file);
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
      }
    },
    onSuccess: () => {
      toast({ title: "Document uploaded", description: notify ? "The client was emailed." : undefined });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      setOpen(false);
      setTitle("");
      setFile(null);
    },
    onError: (e: Error) => toast({ duration: Infinity, title: "Upload failed", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload for {client.name || client.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document title</Label>
            <Input
              id="doc-title"
              placeholder="e.g. Operating Agreement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={kind === "package" ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setKind("package")}
              >
                Formation package
              </Button>
              <Button
                type="button"
                variant={kind === "legal_mail" ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setKind("legal_mail")}
              >
                Legal mail
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              type="file"
              accept="application/pdf,.pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
            Email the client that a new document is available
          </label>
          <Button
            className="w-full rounded-full"
            disabled={!file || !title.trim() || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Support override: a client who can reach neither their old nor new address
 *  cannot fix this themselves. Both addresses are notified by the server. */
function ChangeEmailDialog({ client }: { client: AdminClient }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const change = useMutation({
    mutationFn: (newEmail: string) =>
      api.post(`/api/admin/clients/${client.id}/email`, { newEmail }),
    onSuccess: () => {
      setOpen(false);
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change client email</DialogTitle>
          <DialogDescription>
            Sets the sign-in address for {client.name || client.email} without a confirmation
            link. Use this only when the client cannot reach either address. Both the old and new
            addresses are notified.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            change.mutate(String(fd.get("newEmail") ?? ""));
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Current address</label>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New address</label>
            <Input name="newEmail" type="email" autoComplete="off" />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={change.isPending} className="rounded-full">
              {change.isPending ? "Changing…" : "Change email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The client roster. The RA variant shows the LLCs we serve as registered
 *  agent for — that is what the relationship attaches to — and keeps a client
 *  listed after a cancellation request until we are replaced as agent of
 *  record (the chip carries that state). */
function ClientsTable({
  clients,
  variant,
  emptyText,
}: {
  clients: AdminClient[];
  variant: "all" | "ra";
  emptyText: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-3 font-medium">Client</th>
            {variant === "ra" ? <th className="px-4 py-3 font-medium">Registered agent for</th> : null}
            <th className="px-4 py-3 font-medium">Portal account</th>
            <th className="px-4 py-3 font-medium">Documents</th>
            <th className="px-4 py-3 font-medium">Since</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.length === 0 ? (
            <tr>
              <td colSpan={variant === "ra" ? 6 : 5} className="px-4 py-6 text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            clients.map((cl) => (
              <tr key={cl.id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{cl.name || "—"}</span>
                  {cl.ra_cancellation_requested_at ? (
                    <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                      RA cancel requested {day(cl.ra_cancellation_requested_at)}
                    </span>
                  ) : null}
                  <div className="text-xs text-muted-foreground">{cl.email}</div>
                </td>
                {variant === "ra" ? (
                  <td className="px-4 py-3">{(cl.ra_llcs ?? []).join(", ")}</td>
                ) : null}
                <td className="px-4 py-3">{cl.has_password ? "Active" : "Invite sent"}</td>
                <td className="px-4 py-3">{cl.document_count}</td>
                <td className="px-4 py-3 text-muted-foreground">{day(cl.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <ChangeEmailDialog client={cl} />
                    <UploadDialog client={cl} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {

  const authQuery = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api.get<{ ok: boolean }>("/api/admin/me"),
    retry: false,
  });

  const clientsQuery = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => api.get<AdminClient[]>("/api/admin/clients"),
    enabled: authQuery.isSuccess,
  });

  if (authQuery.isError) {
    return <Navigate to={"/admin/login"} replace />;
  }
  if (authQuery.isLoading) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const clients = clientsQuery.data ?? [];
  // ra_llcs may be missing on a response cached before the field existed —
  // never let a stale cache blank the page.
  const raClients = clients.filter((cl) => (cl.ra_llcs ?? []).length > 0);

  return (
    <section className="container-wide section-y">
      <span className="eyebrow">Admin</span>
      <h1 className="display mt-3 text-3xl lg:text-4xl">Orders &amp; clients</h1>

      <Tabs defaultValue="formations" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="formations">Formations &amp; Service Orders</TabsTrigger>
          <TabsTrigger value="library">Reference Library</TabsTrigger>
          <TabsTrigger value="ra-clients">Registered Agent Clients</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="formations">
          <OrderBoard enabled={authQuery.isSuccess} />
        </TabsContent>

        <TabsContent value="library">
          <LibrarySection enabled={authQuery.isSuccess} />
        </TabsContent>

        <TabsContent value="ra-clients">
          <ClientsTable
            clients={raClients}
            variant="ra"
            emptyText="No registered agent clients yet — clients appear here when a paid order takes our registered agent service."
          />
        </TabsContent>

        <TabsContent value="clients">
          <ClientsTable
            clients={clients}
            variant="all"
            emptyText="Clients appear here after their first paid order."
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
