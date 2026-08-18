import { RepeatableMemberFields } from "../RepeatableMemberFields";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepMembers({ data, patch, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Initial members</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          We collect member information for your internal records and operating
          agreement preparation. Members are not listed in the Articles of
          Organization. You can add, remove, or change owners later when you
          build your operating agreement.
        </p>
      </header>

      {data.members.length > 1 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground/80 leading-relaxed">
          <strong>All members own the LLC itself</strong>, in the percentages
          you agree among yourselves. No member will own a particular protected
          series — the LLC owns every series, as you confirmed on the Series
          step.
        </div>
      ) : null}

      <RepeatableMemberFields
        members={data.members}
        onChange={(next) => patch({ members: next })}
      />

      {errors.members ? (
        <p className="text-xs text-destructive">{errors.members}</p>
      ) : null}
    </div>
  );
}
