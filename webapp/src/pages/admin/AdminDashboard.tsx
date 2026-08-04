import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { ServiceOrdersSection } from "./ServiceOrdersSection";

interface AdminOrder {
  id: string;
  contact_name: string;
  contact_email: string;
  package: "NEW" | "CONVERT";
  llc_name: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
}

interface AdminClient {
  id: string;
  email: string;
  name: string;
  created_at: string;
  ra_cancellation_requested_at: string | null;
  has_password: boolean;
  document_count: number;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
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
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message }),
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

export default function AdminDashboard() {
  const navigate = useNavigate();

  const authQuery = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api.get<{ ok: boolean }>("/api/admin/me"),
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => api.get<AdminOrder[]>("/api/admin/orders"),
    enabled: authQuery.isSuccess,
  });

  const clientsQuery = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => api.get<AdminClient[]>("/api/admin/clients"),
    enabled: authQuery.isSuccess,
  });

  if (authQuery.isError) {
    navigate("/admin/login");
    return null;
  }
  if (authQuery.isLoading) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const orders = ordersQuery.data ?? [];
  const clients = clientsQuery.data ?? [];

  return (
    <section className="container-wide section-y">
      <span className="eyebrow">Admin</span>
      <h1 className="display mt-3 text-3xl lg:text-4xl">Orders &amp; clients</h1>

      <h2 className="mt-10 font-display text-xl">Orders</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">LLC</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Package</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Placed</th>
              <th className="px-4 py-3 font-medium">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  No orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium">{o.llc_name}</td>
                  <td className="px-4 py-3">
                    {o.contact_name}
                    <div className="text-xs text-muted-foreground">{o.contact_email}</div>
                  </td>
                  <td className="px-4 py-3">{o.package === "CONVERT" ? "Conversion" : "New"}</td>
                  <td className="px-4 py-3 font-mono-feature">{money(o.total_cents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        o.status === "paid"
                          ? "rounded-full bg-trust/10 px-2.5 py-1 text-xs font-medium text-trust"
                          : "rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {o.status === "paid" ? "Paid" : "Pending payment"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{day(o.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{day(o.paid_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServiceOrdersSection enabled={authQuery.isSuccess} />

      <h2 className="mt-12 font-display text-xl">Clients</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Portal account</th>
              <th className="px-4 py-3 font-medium">Documents</th>
              <th className="px-4 py-3 font-medium">Since</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Clients appear here after their first paid order.
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
                  <td className="px-4 py-3">{cl.has_password ? "Active" : "Invite sent"}</td>
                  <td className="px-4 py-3">{cl.document_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{day(cl.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <UploadDialog client={cl} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
