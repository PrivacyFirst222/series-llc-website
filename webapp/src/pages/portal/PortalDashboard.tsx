import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Mail, LogOut, Download, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";

interface PortalDoc {
  id: string;
  kind: "package" | "legal_mail";
  title: string;
  size_bytes: number;
  created_at: string;
}

interface Me {
  email: string;
  name: string;
  raCancellationRequestedAt: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function DocList({ docs, empty }: { docs: PortalDoc[]; empty: string }) {
  if (docs.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{d.title}</div>
            <div className="text-xs text-muted-foreground">{formatDate(d.created_at)}</div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
            <a href={`/api/portal/documents/${d.id}/download`}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RegisteredAgentCard({ me }: { me: Me | null }) {
  const queryClient = useQueryClient();
  const cancelMutation = useMutation({
    mutationFn: () =>
      api.post<{ raCancellationRequestedAt: string }>(
        "/api/portal/registered-agent/cancel",
        {},
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-me"] }),
  });

  const requestedAt = me?.raCancellationRequestedAt ?? null;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
        <ShieldCheck className="h-4 w-4 text-trust" />
        <h2 className="font-display text-lg">Registered agent service</h2>
      </div>
      <div className="px-5 py-4">
        {requestedAt ? (
          <div className="flex gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                Cancellation requested on {formatDate(requestedAt)}.
              </p>
              <p className="mt-1">
                To complete it, designate a successor registered agent with the Florida
                Division of Corporations and email proof of the change to{" "}
                <a href="mailto:support@myfloridaseriesllc.com" className="underline underline-offset-2">
                  support@myfloridaseriesllc.com
                </a>
                . Until we receive that proof, we remain your agent of record and service
                continues to be billed as described in the Terms of Service.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Your registered agent service is active and renews annually. You can cancel
              here at any time.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start rounded-full sm:self-auto"
                  disabled={cancelMutation.isPending}
                >
                  Cancel registered agent service
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel registered agent service?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <p>
                        This records your cancellation notice today. If your notice is at
                        least 30 days before your renewal date, your service will not renew.
                      </p>
                      <p>
                        Florida law requires your LLC to have a registered agent at all
                        times. To finish cancelling, you must designate a successor
                        registered agent with the Florida Division of Corporations and send
                        us proof of the change. Until we receive that proof, we remain your
                        agent of record and service continues to be billed.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my service</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancelMutation.mutate()}>
                    Request cancellation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        {cancelMutation.isError ? (
          <p className="mt-2 text-xs text-destructive">
            Something went wrong recording your request. Please try again or email
            support@myfloridaseriesllc.com.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<Me>("/api/auth/me"),
    retry: false,
  });

  const docsQuery = useQuery({
    queryKey: ["portal-documents"],
    queryFn: () => api.get<PortalDoc[]>("/api/portal/documents"),
    enabled: meQuery.isSuccess,
  });

  if (meQuery.isError) {
    navigate("/portal/login");
    return null;
  }
  if (meQuery.isLoading) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading your portal…</p>
      </section>
    );
  }

  const docs = docsQuery.data ?? [];
  const packageDocs = docs.filter((d) => d.kind === "package");
  const legalMail = docs.filter((d) => d.kind === "legal_mail");

  const logout = async () => {
    await api.post("/api/auth/logout", {});
    queryClient.clear();
    navigate("/portal/login");
  };

  return (
    <section className="container-wide section-y">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">Client portal</span>
          <h1 className="display mt-3 text-3xl lg:text-4xl">Your documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {meQuery.data?.email}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="self-start rounded-full sm:self-auto">
          <LogOut className="mr-1.5 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
            <FileText className="h-4 w-4 text-trust" />
            <h2 className="font-display text-lg">Your formation package</h2>
          </div>
          <DocList
            docs={packageDocs}
            empty="Your documents will appear here once your formation is prepared."
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
            <Mail className="h-4 w-4 text-trust" />
            <h2 className="font-display text-lg">Legal mail</h2>
          </div>
          <DocList
            docs={legalMail}
            empty="Nothing here — that's good news. Anything we receive for you as registered agent will be posted here, and you'll get an email the moment it is."
          />
        </div>
      </div>

      <RegisteredAgentCard me={meQuery.data ?? null} />

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Documents are download-only. If something looks wrong or missing, email{" "}
        <a href="mailto:support@myfloridaseriesllc.com" className="underline underline-offset-4">
          support@myfloridaseriesllc.com
        </a>
        .
      </p>
    </section>
  );
}
