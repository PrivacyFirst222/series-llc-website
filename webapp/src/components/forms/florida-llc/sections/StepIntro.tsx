import { AcknowledgeBox, FieldShell } from "../FieldShell";
import type { FloridaLLCFormData, FormationType } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepIntro({ data, patch, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Eligibility & basics</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          This wizard collects the information needed to prepare Florida
          Articles of Organization for a new domestic LLC. It is not a filing
          and we do not provide legal, tax, or accounting advice.
        </p>
      </header>

      <FieldShell label="Formation type" required helper="Choose 'Professional LLC' if your business will provide a regulated professional service such as law, medicine, or accounting.">
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            { val: "DOMESTIC_LLC", title: "Domestic Florida LLC", sub: "Standard LLC for any lawful business." },
            { val: "PLLC", title: "Domestic Florida PLLC", sub: "Professional LLC for licensed services." },
          ] as { val: FormationType; title: string; sub: string }[]).map((opt) => (
            <label
              key={opt.val}
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                data.formationType === opt.val
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="formationType"
                className="sr-only"
                checked={data.formationType === opt.val}
                onChange={() => patch({ formationType: opt.val })}
              />
              <div className="font-medium">{opt.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{opt.sub}</div>
            </label>
          ))}
        </div>
      </FieldShell>

      <div className="space-y-3">
        <AcknowledgeBox
          id="ack-domestic"
          checked={data.isFloridaDomesticEntityOnly}
          onChange={(v) => patch({ isFloridaDomesticEntityOnly: v })}
          label="I understand this form is for forming a new domestic Florida LLC only."
          error={errors.isFloridaDomesticEntityOnly}
        />
        <AcknowledgeBox
          id="ack-legal"
          checked={data.notLegalAdvice}
          onChange={(v) => patch({ notLegalAdvice: v })}
          label="I understand that this service does not provide legal, tax, or accounting advice."
          error={errors.notLegalAdvice}
        />
        <AcknowledgeBox
          id="ack-public"
          checked={data.publicRecordNotice}
          onChange={(v) => patch({ publicRecordNotice: v })}
          label="I understand that information submitted to the Florida Division of Corporations may become part of the public record."
          error={errors.publicRecordNotice}
        />
      </div>
    </div>
  );
}
