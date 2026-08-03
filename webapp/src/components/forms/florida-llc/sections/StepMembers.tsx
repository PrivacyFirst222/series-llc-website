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
        <h2 className="font-display text-3xl">Members / ownership</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          We collect member information for your internal records and operating
          agreement preparation. Members are not listed in the Articles of
          Organization.
        </p>
      </header>

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
