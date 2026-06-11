import { FieldShell } from "../FieldShell";
import type {
  FloridaLLCFormData,
  ManagementStructure,
} from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const OPTIONS: { v: ManagementStructure; t: string; s: string }[] = [
  {
    v: "MEMBER_MANAGED",
    t: "Member-managed",
    s: "Members run day-to-day operations.",
  },
  {
    v: "MANAGER_MANAGED",
    t: "Manager-managed",
    s: "One or more managers run the LLC; members may be passive.",
  },
  {
    v: "NOT_SPECIFIED",
    t: "Not specified in Articles",
    s: "Defer the choice to the operating agreement.",
  },
];

export function StepManagement({ data, patch, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Management structure</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida permits the Articles to include a statement that the LLC is
          manager-managed. Some banks or agencies may require a manager or
          authorized representative to appear in state records.
        </p>
      </header>

      <FieldShell
        label="How will the LLC be managed?"
        required
        error={errors.managementStructure}
      >
        <div className="grid sm:grid-cols-3 gap-3">
          {OPTIONS.map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                data.managementStructure === o.v
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="mgmt"
                className="sr-only"
                checked={data.managementStructure === o.v}
                onChange={() =>
                  patch({
                    managementStructure: o.v,
                    includeManagementStatementInArticles:
                      o.v === "MANAGER_MANAGED" ? true : data.includeManagementStatementInArticles,
                  })
                }
              />
              <div className="font-medium">{o.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{o.s}</div>
            </label>
          ))}
        </div>
      </FieldShell>

      <details className="rounded-xl border border-border bg-secondary/30 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Why we ask this
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Sunbiz instructions say not to list members in the Manager /
          Authorized Representative section. If the LLC is member-managed, you
          may collect members for internal records in the next steps without
          listing them as managers.
        </p>
      </details>

      {data.managementStructure === "MANAGER_MANAGED" ? (
        <FieldShell
          label="Include manager-managed statement in Articles?"
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.includeManagementStatementInArticles}
              onChange={(e) =>
                patch({
                  includeManagementStatementInArticles: e.target.checked,
                })
              }
              className="h-4 w-4 mt-0.5 accent-trust shrink-0"
            />
            <span>Yes, include a statement that the LLC is manager-managed.</span>
          </label>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Important — Manager-Managed Statement Required</p>
            <p className="mt-1">
              For your LLC to be legally recognized as manager-managed, this statement must appear in either the <strong>Articles of Organization</strong> or the company's <strong>Operating Agreement</strong>. We <strong>strongly recommend</strong> including it in the Articles of Organization so it becomes part of the public record filed with the State of Florida.
            </p>
          </div>
        </FieldShell>
      ) : null}
    </div>
  );
}
