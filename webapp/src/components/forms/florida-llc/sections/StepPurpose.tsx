import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "../FieldShell";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const GENERAL_DEFAULT =
  "The limited liability company may engage in any lawful activity for which a limited liability company may be organized in Florida.";

export function StepPurpose({ data, patch, errors }: StepProps) {
  const isPllc = data.formationType === "PLLC";
  const addingSpecific = data.purposeType === "SPECIFIC";

  // Non-professional LLCs always carry the general lawful purpose; there is
  // no way to narrow it in this flow.
  useEffect(() => {
    if (!isPllc && !data.purposeType) {
      patch({ purposeType: "GENERAL", businessPurposeText: "" });
    }
    if (isPllc && data.purposeType !== "PROFESSIONAL") {
      patch({ purposeType: "PROFESSIONAL", businessPurposeText: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPllc]);

  if (isPllc) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="font-display text-3xl">Business purpose</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            A Professional LLC must list a single specific professional
            purpose. Vague or general purposes are not accepted.
          </p>
        </header>
        <FieldShell
          label="Specific professional purpose"
          required
          error={errors.businessPurposeText}
          helper="e.g., 'The practice of law,' 'Accounting services,' 'Practicing medicine.'"
          htmlFor="professional-purpose"
        >
          <Textarea
            id="professional-purpose"
            value={data.businessPurposeText}
            onChange={(e) => patch({ businessPurposeText: e.target.value })}
            rows={4}
          />
        </FieldShell>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Business purpose</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Your Articles will always include a general purpose covering any
          lawful business activity, so your LLC is never limited to one line of
          business.
        </p>
      </header>

      <div className="rounded-xl border border-trust/30 bg-trust/5 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-trust font-medium mb-2">
          <ShieldCheck className="h-4 w-4" />
          Included in every filing
        </div>
        <p className="text-sm text-foreground/85">{GENERAL_DEFAULT}</p>
      </div>

      <FieldShell label="Additional specific purpose (optional)">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={addingSpecific}
            onChange={(e) =>
              patch({
                purposeType: e.target.checked ? "SPECIFIC" : "GENERAL",
                businessPurposeText: e.target.checked
                  ? data.businessPurposeText
                  : "",
              })
            }
            className="h-4 w-4 mt-0.5 accent-trust shrink-0"
          />
          <span>
            Also list a specific purpose in the Articles — for example, if a
            lender or licensing agency wants to see one.
          </span>
        </label>
      </FieldShell>

      {addingSpecific ? (
        <FieldShell
          label="Specific purpose"
          required
          error={errors.businessPurposeText}
          helper="This is added alongside the general purpose above — it does not narrow what the LLC may lawfully do."
          htmlFor="specific-purpose"
        >
          <Textarea
            id="specific-purpose"
            value={data.businessPurposeText}
            onChange={(e) => patch({ businessPurposeText: e.target.value })}
            rows={4}
          />
        </FieldShell>
      ) : null}
    </div>
  );
}
