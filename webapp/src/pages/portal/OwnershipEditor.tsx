import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scale } from "lucide-react";
import {
  equalShares,
  shareLabel,
  sharesAreComplete,
  splitsEvenlyAsPercent,
  type OwnershipMode,
  type OwnershipShare,
} from "@/lib/ownership";

export interface OwnershipRow {
  key: string;
  label: string;
  note?: string;
  share: OwnershipShare;
}

interface OwnershipEditorProps {
  mode: OwnershipMode;
  rows: OwnershipRow[];
  onModeChange: (mode: OwnershipMode) => void;
  onShareChange: (key: string, share: OwnershipShare) => void;
  /** Fills every row with an equal share, switching notation if asked. */
  onEqualize: (mode: OwnershipMode, shares: OwnershipShare[]) => void;
}

/**
 * Ownership entry in either notation. Percentages suit unequal splits
 * (25 / 35 / 40); fractions are the only exact way to write equal thirds,
 * since 33.33 three times is 99.99.
 */
export function OwnershipEditor({
  mode,
  rows,
  onModeChange,
  onShareChange,
  onEqualize,
}: OwnershipEditorProps) {
  const complete = sharesAreComplete(mode, rows.map((r) => r.share));
  const needsFractionsToBeEqual = mode === "percent" && !splitsEvenlyAsPercent(rows.length);

  const totalLabel =
    mode === "percent"
      ? `${rows
          .reduce((acc, r) => acc + (r.share.percentage ?? 0), 0)
          .toFixed(2)
          .replace(/\.00$/, "")}%`
      : complete
        ? "one whole"
        : "not a whole";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-border p-0.5">
          {(["percent", "fraction"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "percent" ? "Percentages" : "Fractions"}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            // Equal shares in percentages only work when 100 divides evenly;
            // otherwise fractions are the exact answer, so offer the switch.
            if (needsFractionsToBeEqual) {
              const ok = window.confirm(
                `${rows.length} owners can't split 100% evenly — 33.33 three times is 99.99. ` +
                  `Use fractions instead (1/${rows.length} each)?`,
              );
              if (ok) {
                onEqualize("fraction", equalShares("fraction", rows.length));
                return;
              }
            }
            onEqualize(mode, equalShares(mode, rows.length));
          }}
        >
          <Scale className="mr-1.5 h-3.5 w-3.5" />
          Equal ownership
        </Button>
      </div>

      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="w-1/2 truncate text-sm">
            {row.label}
            {row.note ? <span className="ml-1 text-xs text-muted-foreground">({row.note})</span> : null}
          </span>
          {mode === "percent" ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={row.share.percentage ?? ""}
                onChange={(e) =>
                  onShareChange(row.key, {
                    percentage: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                step="1"
                aria-label={`${row.label} numerator`}
                value={row.share.numerator ?? ""}
                onChange={(e) =>
                  onShareChange(row.key, {
                    ...row.share,
                    numerator: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-16"
              />
              <span className="text-sm text-muted-foreground">/</span>
              <Input
                type="number"
                min={1}
                step="1"
                aria-label={`${row.label} denominator`}
                value={row.share.denominator ?? ""}
                onChange={(e) =>
                  onShareChange(row.key, {
                    ...row.share,
                    denominator: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-16"
              />
              {row.share.numerator && row.share.denominator ? (
                <span className="text-xs text-muted-foreground">
                  = {shareLabel("fraction", row.share)}
                </span>
              ) : null}
            </div>
          )}
        </div>
      ))}

      <p className={`text-xs font-medium ${complete ? "text-trust" : "text-destructive"}`}>
        Total: {totalLabel}
        {complete
          ? ""
          : mode === "percent"
            ? " — must be exactly 100%"
            : " — must add up to exactly one whole"}
      </p>
    </div>
  );
}
