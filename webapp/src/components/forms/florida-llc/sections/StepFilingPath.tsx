import { Building2, Sparkles } from "lucide-react";
import { FieldShell } from "../FieldShell";
import type { FilingPath, FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const OPTIONS: {
  val: FilingPath;
  icon: typeof Building2;
  title: string;
  sub: string;
}[] = [
  {
    val: "NEW",
    icon: Sparkles,
    title: "Forming a new LLC",
    sub: "You don't have a Florida LLC yet. We file the Articles of Organization and your Protected Series Designations together.",
  },
  {
    val: "CONVERT",
    icon: Building2,
    title: "Converting an existing Florida LLC",
    sub: "You already have a Florida LLC on file with the state. We file Protected Series Designations for it — no Articles fee.",
  },
];

export function StepFilingPath({ data, patch, errors }: StepProps) {
  const selected = data.filingPath ?? "NEW";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Getting started</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The service fee is the same either way. Converting skips the $125
          Articles filing fee, because your company is already on file.
        </p>
      </header>

      <FieldShell
        label="Are you forming a new LLC or converting an existing one?"
        required
        error={errors.filingPath}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selected === opt.val;
            return (
              <label
                key={opt.val}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  active
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <input
                  type="radio"
                  name="filingPath"
                  className="sr-only"
                  checked={active}
                  onChange={() => patch({ filingPath: opt.val })}
                />
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 ${active ? "text-accent" : "text-trust"}`}
                  />
                  <span className="font-medium text-sm">{opt.title}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  {opt.sub}
                </p>
              </label>
            );
          })}
        </div>
      </FieldShell>
    </div>
  );
}
