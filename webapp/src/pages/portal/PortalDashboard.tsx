import { useMemo } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Mail, LogOut, Download, ShieldCheck, Clock, ScrollText, BookOpen, ArrowRight, Trash2 } from "lucide-react";
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
import { formatDate, formatDateTime, taxationLabel } from "@/lib/datetime";
import { ServicesCard } from "./ServicesCard";
import { AccountCard } from "./AccountCard";

interface PortalDoc {
  id: string;
  kind: "package" | "legal_mail";
  title: string;
  size_bytes: number;
  created_at: string;
  order_id: string | null;
}

interface Me {
  email: string;
  name: string;
  pendingEmail: string | null;
  raCancellationRequestedAt: string | null;
}

/** Agreements the client generated themselves, keyed by document, so the list
 *  they actually look at is where they manage them. */
interface OwnAgreement {
  generationId: string;
  isCurrent: boolean;
  /** "S Corporation" / "Partnership" / "Single-Member". Read from the
   *  generation record, so agreements made before the designation was part of
   *  the title are labeled too. */
  taxation: string;
}

function DocList({
  docs,
  empty,
  own,
  onDelete,
  deleting,
}: {
  docs: PortalDoc[];
  empty: string;
  own?: Map<string, OwnAgreement>;
  onDelete?: (generationId: string, isCurrent: boolean) => void;
  deleting?: boolean;
}) {
  if (docs.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {docs.map((d) => {
        const mine = own?.get(d.id);
        return (
          <li
            key={d.id}
            className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Wrap rather than truncate: the agreement number and company
                    name sit at the end of the title and are what tell two
                    agreements apart. */}
                <span className="text-sm font-medium">{d.title}</span>
                {mine ? (
                  <>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        mine.isCurrent ? "bg-trust/10 text-trust" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {mine.isCurrent ? "Current" : "Superseded"}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {mine.taxation}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={`/api/portal/documents/${d.id}/download`}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
              {mine && onDelete ? (
                <button
                  type="button"
                  aria-label="Delete this agreement"
                  title="Delete this agreement"
                  disabled={deleting}
                  onClick={() => onDelete(mine.generationId, mine.isCurrent)}
                  className="rounded-full p-2 text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface LibraryDoc {
  key: string;
  title: string;
  edition: string;
  size_bytes: number;
  updated_at: string;
}

interface OaStatus {
  generations: { id: string }[];
  memberManaged: boolean;
}

function AgreementAndLibraryRow({ company }: { company: string | null }) {
  const oaQuery = useQuery({
    queryKey: ["portal-oa-status", company],
    queryFn: () => api.get<OaStatus>(`/api/portal/oa${company ? `?company=${company}` : ""}`),
    retry: false,
  });
  const libraryQuery = useQuery({
    queryKey: ["portal-library"],
    queryFn: () => api.get<LibraryDoc[]>("/api/portal/library"),
  });

  const hasGeneration = (oaQuery.data?.generations?.length ?? 0) > 0;
  const library = libraryQuery.data ?? [];

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
          <ScrollText className="h-4 w-4 text-trust" />
          <h2 className="font-display text-lg">Operating agreement</h2>
        </div>
        <div className="px-5 py-4">
          {oaQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Your agreement questionnaire unlocks once your formation order is complete.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {hasGeneration
                  ? "Your agreement is generated. Update your answers and regenerate anytime — always on the current master edition."
                  : "Answer a short questionnaire and we'll generate your operating agreement as a signed-ready PDF."}
              </p>
              <Button asChild size="sm" className="shrink-0 self-start rounded-full sm:self-auto">
                <Link to={company ? `/portal/agreement?company=${company}` : "/portal/agreement"}>
                  {hasGeneration ? "Update / regenerate" : "Complete questionnaire"}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}
          {!hasGeneration && !oaQuery.isError ? (
            <p className="mt-2 text-xs font-medium text-amber-700">Action needed</p>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
          <BookOpen className="h-4 w-4 text-trust" />
          <h2 className="font-display text-lg">Reference library</h2>
        </div>
        {library.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            The Series LLC Owner's Manual and other reference materials will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {library.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.edition ? `${d.edition} · ` : ""}always the latest edition
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
                  <a href={`/api/portal/library/${d.key}/download`}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
  const [searchParams, setSearchParams] = useSearchParams();

  const meQuery = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<Me>("/api/auth/me"),
    retry: false,
  });

  // One tab per company — shown only when the client has more than one
  // (Adam, 31 Aug 2026). A single-company client sees the portal unchanged.
  const companiesQuery = useQuery({
    queryKey: ["portal-companies"],
    queryFn: () => api.get<{ orderId: string; llcName: string; formed: boolean }[]>("/api/portal/companies"),
    enabled: meQuery.isSuccess,
  });
  const companies = companiesQuery.data ?? [];
  const company = searchParams.get("company") ?? companies[0]?.orderId ?? null;

  const docsQuery = useQuery({
    queryKey: ["portal-documents"],
    queryFn: () => api.get<PortalDoc[]>("/api/portal/documents"),
    enabled: meQuery.isSuccess,
  });

  // Same key as the agreement card, so React Query serves one request.
  const oaGenerations = useQuery({
    queryKey: ["portal-oa", company],
    queryFn: () =>
      api.get<{ generations: { id: string; document_id: string | null; version: string | null }[] }>(
        `/api/portal/oa${company ? `?company=${company}` : ""}`,
      ),
    enabled: meQuery.isSuccess,
    retry: false,
  });

  const deleteGeneration = useMutation({
    mutationFn: (id: string) => api.delete(`/api/portal/oa/generations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      queryClient.invalidateQueries({ queryKey: ["portal-oa"] });
    },
  });

  // The agreements a client generated are the only documents they may remove;
  // everything else on this list was posted by us and stays download-only.
  const ownAgreements = useMemo(() => {
    const gens = oaGenerations.data?.generations ?? [];
    const map = new Map<string, OwnAgreement>();
    gens.forEach((g, i) => {
      if (g.document_id) {
        map.set(g.document_id, {
          generationId: g.id,
          isCurrent: i === 0,
          taxation: taxationLabel(g.version ?? ""),
        });
      }
    });
    return map;
  }, [oaGenerations.data]);

  if (meQuery.isError) {
    return <Navigate to={"/portal/login"} replace />;
  }
  if (meQuery.isLoading) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading your portal…</p>
      </section>
    );
  }

  const docs = docsQuery.data ?? [];
  // "articles" and "psd" are the filed originals, uploaded when the company is
  // formed. They belong with the formation package rather than in a section of
  // their own — and they must be listed explicitly, because a filter that names
  // only the kinds it knows drops silently the day a new one is added.
  const FORMATION_KINDS = ["articles", "psd", "package", "certificate-of-status", "certified-copy"];
  const multiCompany = companies.length > 1;
  const packageDocs = docs.filter(
    (d) =>
      FORMATION_KINDS.includes(d.kind) &&
      (!multiCompany || d.order_id === null || d.order_id === company),
  );

  const legalMail = docs.filter((d) => d.kind === "legal_mail");
  // Anything whose kind no section claims. Better a plainly labelled leftover
  // than a document the client paid for and never sees.
  const otherDocs = docs.filter(
    (d) => !FORMATION_KINDS.includes(d.kind) && d.kind !== "legal_mail",
  );

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

      {companies.length > 1 ? (
        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Your companies">
          {companies.map((co) => (
            <button
              key={co.orderId}
              type="button"
              role="tab"
              aria-selected={co.orderId === company}
              onClick={() => setSearchParams(co.orderId === companies[0]?.orderId ? {} : { company: co.orderId }, { replace: true })}
              className={
                co.orderId === company
                  ? "rounded-full border border-trust bg-trust/10 px-4 py-2 text-sm font-medium text-trust"
                  : "rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:border-foreground/30"
              }
            >
              {co.llcName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
            <FileText className="h-4 w-4 text-trust" />
            <h2 className="font-display text-lg">Your formation package</h2>
          </div>
          <DocList
            docs={packageDocs}
            empty="Your documents will appear here once your formation is prepared."
            own={ownAgreements}
            deleting={deleteGeneration.isPending}
            onDelete={(generationId, isCurrent) => {
              const ok = window.confirm(
                isCurrent
                  ? "Delete your most recent agreement? The PDF is removed from your documents. Anything we posted for you is unaffected."
                  : "Delete this superseded agreement? The PDF is removed from your documents.",
              );
              if (ok) deleteGeneration.mutate(generationId);
            }}
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

      {otherDocs.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-5 py-4">
            <FileText className="h-4 w-4 text-trust" />
            <h2 className="font-display text-lg">Other documents</h2>
          </div>
          <DocList docs={otherDocs} empty="" />
        </div>
      ) : null}

      <AgreementAndLibraryRow company={company} />

      <ServicesCard company={company} />

      <RegisteredAgentCard me={meQuery.data ?? null} />

      <AccountCard
        email={meQuery.data?.email ?? ""}
        pendingEmail={meQuery.data?.pendingEmail ?? null}
      />

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
