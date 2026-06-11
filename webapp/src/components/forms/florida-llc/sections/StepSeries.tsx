import { Plus, Trash2, Layers, Info, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell } from "../FieldShell";
import { buildFinalLlcName } from "../validation";
import type { FloridaLLCFormData, SeriesEntry } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const INCLUDED_COUNT = 3;
const ADDITIONAL_FEE = 50;

function nextDefaultName(existing: SeriesEntry[]): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < letters.length; i++) {
    const candidate = `Series ${letters[i]}`;
    if (!existing.some((s) => s.name === candidate)) return candidate;
  }
  return `Series ${existing.length + 1}`;
}

export function StepSeries({ data, patch, errors }: StepProps) {
  const llcName =
    buildFinalLlcName(data.desiredLlcName, data.llcDesignator) ||
    "[Your LLC Name]";
  const extraSeries = Math.max(0, data.series.length - INCLUDED_COUNT);
  const additionalFee = extraSeries * ADDITIONAL_FEE;

  const addSeries = () => {
    patch({
      series: [...data.series, { id: newId(), name: nextDefaultName(data.series) }],
    });
  };

  const removeSeries = (id: string) => {
    patch({ series: data.series.filter((s) => s.id !== id) });
  };

  const updateName = (id: string, name: string) => {
    patch({ series: data.series.map((s) => (s.id === id ? { ...s, name } : s)) });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Your protected series</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Each series is a legally separate compartment within your LLC, created
          by filing a Certificate of Designation with the state. Define your
          initial series below.
        </p>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2 text-sm text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" />
          How series must be named
        </div>
        <ul className="list-disc list-inside space-y-1.5 text-blue-800 leading-relaxed">
          <li>
            Each series must reference your LLC name and carry a unique
            identifier that distinguishes it from all other series.
          </li>
          <li>
            <strong>Full name format:</strong>{" "}
            <span className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">
              {llcName}, Series [Identifier]
            </span>
          </li>
          <li>
            Identifiers can be letters (A, B, C …), numbers (1, 2, 3 …), or
            descriptive words (Real Estate, Investments, Vehicles).
          </li>
          <li>
            No two series of the same LLC may share an identical name.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-trust font-semibold">
          <DollarSign className="h-4 w-4 shrink-0" />
          Series pricing
        </div>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between">
            <span className="text-foreground/80">Up to 3 series</span>
            <span className="font-medium text-trust">Included in $499</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-foreground/80">Each additional series</span>
            <span className="font-medium">$50 / series</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1 border-t border-border">
          The $50 additional series fee includes $25 to prepare the Certificate
          of Designation and a $25 state filing fee.
        </p>
        {extraSeries > 0 ? (
          <div className="flex justify-between font-semibold text-sm pt-1 border-t border-border">
            <span>
              Additional series ({extraSeries} × $50)
            </span>
            <span className="text-trust">${additionalFee}</span>
          </div>
        ) : null}
      </div>

      {errors.series ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errors.series}
        </p>
      ) : null}

      <div className="space-y-3">
        {data.series.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No series defined yet.</p>
            <p className="text-xs mt-1">Add at least one series to proceed.</p>
          </div>
        ) : null}

        {data.series.map((s, i) => (
          <div
            key={s.id}
            className="rounded-xl border border-border bg-card p-4 flex items-start gap-3"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-trust/10 text-trust text-xs font-semibold mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1">
              <FieldShell
                label="Series identifier"
                error={errors[`series.${i}.name`]}
                helper={
                  s.name.trim()
                    ? `Full name: ${llcName}, ${s.name.trim()}`
                    : undefined
                }
              >
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateName(s.id, e.target.value)}
                  placeholder="e.g. Series A or Series Real Estate"
                  aria-invalid={!!errors[`series.${i}.name`]}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-trust/30 focus:border-trust/50"
                />
              </FieldShell>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeSeries(s.id)}
              className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addSeries}
        className="rounded-full"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Add a series
      </Button>
    </div>
  );
}
