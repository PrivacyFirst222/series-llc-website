import { AlertTriangle } from "lucide-react";
import { FieldShell } from "../FieldShell";
import { RepeatableMemberFields } from "../RepeatableMemberFields";
import { ownershipPercentageWarning } from "../validation";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepMembers({ data, patch, errors }: StepProps) {
  const ownershipWarning = ownershipPercentageWarning(data.members);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Members / ownership</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida law allows certain optional statements (including member
          information) to appear in the Articles, but Sunbiz instructions say
          not to list members in the Manager / Authorized Representative
          section. We collect this information for internal records and
          operating agreement preparation.
        </p>
      </header>

      <FieldShell label="Internal records">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.collectMembersForInternalRecords}
            onChange={(e) =>
              patch({
                collectMembersForInternalRecords: e.target.checked,
              })
            }
            className="h-4 w-4 accent-trust"
          />
          Collect member information for internal records and operating
          agreement preparation.
        </label>
      </FieldShell>

      {data.collectMembersForInternalRecords ? (
        <>
          <FieldShell label="Include members in Articles (optional)">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.includeMembersInArticles}
                onChange={(e) =>
                  patch({ includeMembersInArticles: e.target.checked })
                }
                className="h-4 w-4 accent-trust"
              />
              Include member names and addresses in the Articles of Organization.
            </label>
            {data.includeMembersInArticles ? (
              <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 flex gap-2 text-amber-900 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Member information included in the Articles may become public
                record.
              </div>
            ) : null}
          </FieldShell>

          <RepeatableMemberFields
            members={data.members}
            onChange={(next) => patch({ members: next })}
          />

          {ownershipWarning ? (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-amber-900 text-xs">
              {ownershipWarning}
            </div>
          ) : null}

          {errors.members ? (
            <p className="text-xs text-destructive">{errors.members}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
