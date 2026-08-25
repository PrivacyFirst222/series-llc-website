import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { nameCheckKey, sunbizSearchUrl } from "./nameSimilarity";
import type { NameCheckResult, NameCheckState } from "./types";

interface CheckResponse {
  available: boolean;
  asOf?: string;
  results: NameCheckResult[];
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const CARD: Record<NameCheckResult["verdict"], string> = {
  taken: "border-destructive/40 bg-destructive/5",
  held: "border-destructive/40 bg-destructive/5",
  clear: "border-trust/40 bg-trust/5",
};

function VerdictRow({ v, label }: { v: NameCheckResult; label: string }) {
  return (
    <div className={`rounded-lg border p-3 ${CARD[v.verdict]}`}>
      <div className="flex items-start gap-2">
        {v.verdict === "taken" ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : v.verdict === "held" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
        )}
        <div className="min-w-0 text-sm">
          <span className="font-medium">{label}:</span>{" "}
          {v.verdict === "taken"
            ? "Unavailable — an existing Florida company already has this name. Please choose a different name."
            : v.verdict === "held"
              ? "Unavailable — this name belongs to a recently dissolved company, and Florida protects it for up to a year. Please choose a different name."
              : "No conflict found in the state's records."}
          {v.conflicts.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {v.conflicts.map((cf) => (
                <li key={cf.docNumber}>
                  <span className="font-medium text-foreground">{cf.name}</span>{" "}
                  — {cf.status}, document {cf.docNumber}.{" "}
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

/** Checks the entered names against our nightly mirror of the Division of
 *  Corporations' records, applying Florida's distinguishability rules to the
 *  client's input. Runs by itself when the names settle; the result is stored
 *  on the form (keyed to the exact names checked) so step validation can
 *  refuse to continue past a taken or held name. If the mirror is stale or
 *  unreachable the check reports itself unavailable and the gate is waived —
 *  the Division makes the final determination either way. */
export function NameCheck({
  names,
  state,
  onState,
  compactDisclaimer = false,
}: {
  names: { label: string; value: string }[];
  state?: NameCheckState;
  /** Omitted (admin panel): results are kept locally instead of on a form. */
  onState?: (s: NameCheckState) => void;
  /** Admin panel only: "Verified: [date]" instead of the client-facing
   *  disclaimer. Clients always get the full final-determination language. */
  compactDisclaimer?: boolean;
}) {
  const [localState, setLocalState] = useState<NameCheckState | undefined>(undefined);
  const effectiveState = onState ? state : localState;
  const setState = onState ?? setLocalState;
  const list = names.filter((n) => n.value.trim().length > 0);
  const key = nameCheckKey(list.map((n) => n.value));

  const check = useMutation({
    mutationFn: async (k: string) => {
      const r = await api.post<CheckResponse>("/api/name-check", {
        names: list.map((n) => n.value.trim()),
      });
      return { k, r };
    },
    onSuccess: ({ k, r }) =>
      setState({ key: k, available: r.available, asOf: r.asOf, results: r.results }),
    // A failed request must not strand the step: record the check as
    // unavailable so validation waives it, same as a stale mirror.
    onError: () => setState({ key, available: false, results: [] }),
  });

  // Auto-run when the names settle on a value we have no result for.
  const { mutate, isPending } = check;
  useEffect(() => {
    if (list.length === 0) return;
    if (effectiveState?.key === key) return;
    const t = setTimeout(() => mutate(key), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (list.length === 0) return null;
  const current = effectiveState?.key === key ? effectiveState : undefined;

  return (
    <div className="space-y-2">
      {isPending || (!current && list.length > 0) ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your names against Florida's records…
        </p>
      ) : null}

      {current && !current.available ? (
        <p className="text-xs text-muted-foreground">
          The automatic check is unavailable right now, so it won't hold up your
          order — you can still look yourself on{" "}
          <a
            href={sunbizSearchUrl(list[0].value)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Sunbiz
          </a>
          .
        </p>
      ) : null}

      {current?.available ? (
        <div className="space-y-2">
          {current.results.map((v, i) => (
            <VerdictRow key={i} v={v} label={list[i]?.label ?? v.input} />
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {compactDisclaimer ? (
              <>Verified: {current.asOf ? fmtDate(current.asOf) : "latest state data file"}</>
            ) : (
              <>
                Checked against the Division of Corporations' public records as of{" "}
                {current.asOf ? fmtDate(current.asOf) : "the latest state data file"}.
                The Division makes the final determination when your Articles are
                filed — no result here is a guarantee.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
