import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "../FieldShell";
import type { FloridaLLCFormData, PurposeType } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const GENERAL_DEFAULT =
  "The limited liability company may engage in any lawful activity for which a limited liability company may be organized in Florida.";

export function StepPurpose({ data, patch, errors }: StepProps) {
  const isPllc = data.formationType === "PLLC";

  const options: { v: PurposeType; t: string; s: string; disabled?: boolean }[] = isPllc
    ? [
        {
          v: "PROFESSIONAL",
          t: "Professional service purpose",
          s: "Required for PLLC. Provide a single, specific professional service.",
        },
      ]
    : [
        {
          v: "GENERAL",
          t: "General lawful business purpose",
          s: "Default — any lawful activity allowed in Florida.",
        },
        {
          v: "SPECIFIC",
          t: "Specific purpose",
          s: "Describe the LLC's specific business purpose.",
        },
      ];

  const onSelect = (v: PurposeType) => {
    if (v === "GENERAL") {
      patch({ purposeType: v, businessPurposeText: GENERAL_DEFAULT });
    } else {
      patch({
        purposeType: v,
        businessPurposeText:
          data.purposeType === v ? data.businessPurposeText : "",
      });
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Business purpose</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Non-professional LLCs are not required to list a purpose but may do
          so. A Professional LLC must list a single specific professional
          purpose.
        </p>
      </header>

      <FieldShell label="Purpose type" required error={errors.purposeType}>
        <div className="grid sm:grid-cols-2 gap-3">
          {options.map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                data.purposeType === o.v
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="purpose"
                className="sr-only"
                checked={data.purposeType === o.v}
                onChange={() => onSelect(o.v)}
              />
              <div className="font-medium">{o.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{o.s}</div>
            </label>
          ))}
        </div>
      </FieldShell>

      {data.purposeType && data.purposeType !== "GENERAL" ? (
        <FieldShell
          label={
            data.purposeType === "PROFESSIONAL"
              ? "Specific professional purpose"
              : "Specific business purpose"
          }
          required
          error={errors.businessPurposeText}
          helper={
            data.purposeType === "PROFESSIONAL"
              ? "e.g., 'The practice of law,' 'Accounting services,' 'Practicing medicine.'"
              : "Describe the primary lawful business activity."
          }
        >
          <Textarea
            value={data.businessPurposeText}
            onChange={(e) => patch({ businessPurposeText: e.target.value })}
            rows={4}
          />
        </FieldShell>
      ) : null}

      {data.purposeType === "GENERAL" ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-trust font-medium mb-1">
            Default purpose text
          </div>
          {data.businessPurposeText || GENERAL_DEFAULT}
        </div>
      ) : null}

      {isPllc ? (
        <p className="text-xs text-muted-foreground">
          A Professional LLC must provide a specific professional purpose.
          Vague or general purposes are not accepted.
        </p>
      ) : null}
    </div>
  );
}
