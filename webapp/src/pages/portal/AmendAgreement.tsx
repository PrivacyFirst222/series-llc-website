// Amendment to Operating Agreement (Adam, 12 Sep 2026): "a standard amendment
// form with recitals that refer to the amendment provisions in the OA and then
// an area for them to add changes or to make changes set forth in the attached
// exhibit. Then signed by all members as required by the OA with the
// appropriate signature blocks. The explanation for the amendment form should
// say that any changes made to the agreement could have unintended legal
// consequences and the user is highly encouraged to have any amendments
// reviewed by an attorney."
import { useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FilePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { QuestionCard } from "./OaQuestionCard";
import { ViewingAsBanner } from "./ViewingAsBanner";

interface AmendData {
  seed: { llcName: string };
  generations: { id: string; created_at: string; amended_restated: boolean; generation_number: number }[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AmendAgreement() {
  const [params] = useSearchParams();
  const company = params.get("company");
  const cq = company ? `?company=${company}` : "";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [effectiveDate, setEffectiveDate] = useState<string>(todayIso());
  const [mode, setMode] = useState<"typed" | "attached">("typed");
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string>("");

  const meQuery = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<{ email: string }>("/api/auth/me"),
    retry: false,
  });
  const oaQuery = useQuery({
    queryKey: ["portal-oa"],
    queryFn: () => api.get<AmendData>(`/api/portal/oa${cq}`),
    enabled: meQuery.isSuccess,
    retry: false,
  });
  const data = oaQuery.data;

  const amend = useMutation({
    mutationFn: () =>
      api.post<{ documentId: string; title: string; number: number }>(`/api/portal/oa/amend${cq}`, {
        effectiveDate,
        mode,
        text: mode === "typed" ? text : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      setError("");
      // The finished amendment is in Your documents, beside the agreement.
      navigate(`/portal${cq}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong."),
  });

  if (meQuery.isError) {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      return <Navigate to={"/portal/login"} replace />;
    }
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">We couldn't reach your agreement just now.</p>
        <Button size="sm" className="mt-3 rounded-full" onClick={() => meQuery.refetch()}>
          Try again
        </Button>
      </section>
    );
  }
  if (oaQuery.isError) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">
          We couldn't find a formed LLC on your account yet. If you just completed checkout, your
          documents are being prepared — check back shortly or email support@myfloridaseriesllc.com.
        </p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="container-wide section-y">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const current = data.generations[0];
  const canCreate = !amend.isPending && !!effectiveDate && (mode === "attached" || text.trim() !== "");

  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-3xl">
        <ViewingAsBanner />
        <Link to={`/portal${cq}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to portal
        </Link>
        <span className="eyebrow mt-6 block">Operating agreement</span>
        <h1 className="display mt-2 text-3xl">Amendment to Operating Agreement</h1>
        <p className="mt-2 text-sm text-muted-foreground">{data.seed.llcName}</p>

        {!current ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm">
              An amendment amends the operating agreement on file. Generate your operating agreement
              first, then come back here.
            </p>
            <Button asChild className="mt-4 rounded-full">
              <Link to={`/portal/agreement${cq}`}>Go to the operating agreement</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="amendment-notice">
              Any change to your agreement can have legal consequences you do not intend, including
              for your protected series, your taxes, and the protection the agreement gives. We
              strongly encourage you to have any amendment reviewed by an attorney before it is
              signed.
            </div>

            <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
              This amends your current agreement:{" "}
              <strong className="text-foreground">
                {current.amended_restated ? "Amended & Restated" : "Operating Agreement"} (No. {current.generation_number})
              </strong>
              . It is signed by every member, as the agreement requires, and acknowledged by the
              manager where the agreement names one. The signature blocks come from the agreement.
            </div>

            <QuestionCard title="When does the amendment take effect?">
              <Input
                type="date"
                aria-label="Amendment effective date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="max-w-xs"
              />
            </QuestionCard>

            <QuestionCard title="How will you state the changes?">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="amendMode"
                  checked={mode === "typed"}
                  onChange={() => setMode("typed")}
                  className="mt-0.5 accent-trust"
                />
                <span>Type the changes here</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="amendMode"
                  checked={mode === "attached"}
                  onChange={() => setMode("attached")}
                  className="mt-0.5 accent-trust"
                />
                <span>Attach them as Exhibit A</span>
              </label>
              {mode === "typed" ? (
                <div className="space-y-1">
                  <Textarea
                    aria-label="Changes to the agreement"
                    placeholder={'Section 4.7 is deleted.\nSection 6.2 is amended to read: "…"'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Each line becomes a paragraph. Name the section you are changing and state the
                    new wording in full.
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                  The amendment will say the agreement is amended as set forth in Exhibit A attached
                  to it. Attach your exhibit to the printed amendment before it is signed.
                </p>
              )}
            </QuestionCard>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button className="w-full rounded-full" size="lg" disabled={!canCreate} onClick={() => amend.mutate()}>
              <FilePen className="mr-2 h-4 w-4" />
              {amend.isPending ? "Creating…" : "Create amendment"}
            </Button>
            <p className="text-xs text-muted-foreground">
              The finished PDF appears in your portal documents beside your agreement, ready to
              download, print, and sign. This is document assembly from your answers — not legal
              advice.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
