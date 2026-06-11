import { FieldShell } from "../FieldShell";
import { RepeatablePartyFields } from "../RepeatablePartyFields";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepManagers({ data, patch, errors }: StepProps) {
  const required =
    data.managementStructure === "MANAGER_MANAGED" &&
    data.includeManagementStatementInArticles;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">
          Managers / Authorized Representatives
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add managers (MGR) or authorized representatives (AR). Do not list
          members here unless they are actually serving as a manager or AR.
          {required ? (
            <span className="text-foreground"> At least one manager is required because you elected to include a manager-managed statement in the Articles.</span>
          ) : null}
        </p>
      </header>

      {data.managementStructure === "MEMBER_MANAGED" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Member-Managed LLC — Use Authorized Representative (AR) Title</p>
          <p className="mt-1">
            Because you selected a <strong>member-managed</strong> LLC, any person you list here should be designated as an <strong>Authorized Representative (AR)</strong> — not as a Manager (MGR). In a member-managed LLC, the members themselves run the company, so the "Manager" title is not applicable. Please select <strong>AR</strong> as the role for each person you add below.
          </p>
        </div>
      ) : null}

      <FieldShell label="Managers / Authorized Representatives">
        <RepeatablePartyFields
          entries={data.managers}
          onChange={(next) => patch({ managers: next })}
        />
      </FieldShell>

      {errors["managers"] ? (
        <p className="text-xs text-destructive">{errors["managers"]}</p>
      ) : null}
    </div>
  );
}
