import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

interface NameConflict {
  name: string;
  docNumber: string;
  status: "Active" | "Inactive";
  reason: string;
  detailUrl: string;
}
interface NameVerdict {
  input: string;
  verdict: "taken" | "held" | "clear";
  conflicts: NameConflict[];
}
interface CheckResponse {
  available: boolean;
  asOf?: string;
  results: NameVerdict[];
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const CARD: Record<NameVerdict["verdict"], string> = {
  taken: "border-destructive/40 bg-destructive/5",
  held: "border-amber-500/40 bg-amber-500/5",
  clear: "border-trust/40 bg-trust/5",
};

function VerdictRow({ v, label }: { v: NameVerdict; label: string }) {
  return (
    <div className={`rounded-lg border p-3 ${CARD[v.verdict]}`}>
      <div className="flex items-start gap-2">
        {v.verdict === "taken" ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : v.verdict === "held" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
        )}
        <div className="min-w-0 text-sm">
          <span className="font-medium">{label}:</span>{" "}
          {v.verdict === "taken"
            ? "Taken — an existing company already has this name."
            : v.verdict === "held"
              ? "Likely unavailable — a recently dissolved company may still hold this name."
              : "No conflict found in the state's records."}
          {v.conflicts.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {v.conflicts.map((cf) => (
                <li key={cf.docNumber}>
                  <span className="font-medium text-foreground">{cf.name}</span>{" "}
                  — {cf.status}, document {cf.docNumber}.{" "}
                  {cf.reason}.{" "}
                  <a
                    href={cf.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 underline underline-offset-2"
                  >
                    View on Sunbiz <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Checks names against our nightly mirror of the Division of Corporations'
 *  public data files, applying Florida's distinguishability rules to the
 *  client's input — so a name that differs only by suffix, articles,
 *  "&"/"and", plurals, or punctuation is flagged without the client having
 *  to know the rules. The Division's determination at filing is final, and
 *  the copy never promises more than "no conflict found." */
export function NameCheck({ names }: { names: { label: string; value: string }[] }) {
  const list = names.filter((n) => n.value.trim().length > 0);
  const check = useMutation({
    mutationFn: () =>
      api.post<CheckResponse>("/api/name-check", { names: list.map((n) => n.value.trim()) }),
  });

  if (list.length === 0) return null;
  const data = check.data;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => check.mutate()}
        disabled={check.isPending}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {check.isPending
          ? "Checking Florida's records…"
          : data
            ? "Check again"
            : list.length > 1
              ? "Check these names against Florida's records"
              : "Check this name against Florida's records"}
      </button>

      {check.isError ? (
        <p className="text-xs text-muted-foreground">
          The check didn't go through — use the Sunbiz search below instead.
        </p>
      ) : null}

      {data && !data.available ? (
        <p className="text-xs text-muted-foreground">
          Our copy of the state's records isn't current right now — use the
          Sunbiz search below to check by hand.
        </p>
      ) : null}

      {data?.available ? (
        <div className="space-y-2">
          {data.results.map((v, i) => (
            <VerdictRow key={i} v={v} label={list[i]?.label ?? v.input} />
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Checked against the Division of Corporations' public records as of{" "}
            {data.asOf ? fmtDate(data.asOf) : "the latest state data file"}. The
            Division makes the final determination when your Articles are filed
            — no result here is a guarantee.
          </p>
        </div>
      ) : null}
    </div>
  );
}
