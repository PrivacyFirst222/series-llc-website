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

// Manager-managed leads, and is preselected, because the panel below argues for
// it: reading order was working against the recommendation it sits above.
const OPTIONS: { v: ManagementStructure; t: string; s: string; recommended?: boolean }[] = [
  {
    v: "MANAGER_MANAGED",
    t: "Manager-managed",
    s: "One or more managers run the LLC; members may be passive.",
    recommended: true,
  },
  {
    v: "MEMBER_MANAGED",
    t: "Member-managed",
    s: "Members run day-to-day operations.",
  },
];

export function StepManagement({ data, patch, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Management structure</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida permits the Articles to include a statement that the LLC is
          manager-managed. Some institutions or agencies may require a manager or
          authorized representative to appear in state records.
        </p>
      </header>

      <FieldShell
        label="How will the LLC be managed?"
        required
        error={errors.managementStructure}
      >
        <div className="grid sm:grid-cols-2 gap-3">
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
                    // The manager-managed statement always goes in the Articles.
                    includeManagementStatementInArticles: o.v === "MANAGER_MANAGED",
                  })
                }
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{o.t}</span>
                {o.recommended ? (
                  <span className="shrink-0 rounded-full bg-trust/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-trust">
                    Recommended
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{o.s}</div>
            </label>
          ))}
        </div>
      </FieldShell>

      <details className="rounded-xl border border-trust/30 bg-trust/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-trust">
          Why manager-managed is usually the smarter choice — learn why
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
          <p>
            An LLC shields its owners from most personal liability — but anyone
            with management authority keeps some exposure that ownership alone
            doesn't carry. People who manage the company owe duties to it, and
            while ordinary business mistakes are generally protected, willful
            and reckless conduct is not. In a member-managed LLC, every owner
            automatically has that management power: every owner can sign
            contracts and bind the company, and every owner carries
            manager-level exposure. If a share later passes to a trust, a
            holding company, or a passive investor, the new owner inherits
            management authority — and the exposure — too.
          </p>
          <p>
            An example: a manager who knows a rental property's balcony railing
            is failing and lets it go unrepaired. If someone gets hurt, that
            manager's knowledge could lead to a claim that they were acting
            recklessly. Recklessness is much harder to prove than mere
            negligence, but some exposure still exists. An owner (i.e., Member)
            with no management role and no part in that decision generally has
            no comparable exposure.
          </p>
          <p>
            A manager-managed LLC confines that exposure to the people you
            actually name as managers. Everyone else simply owns their share,
            with no management duties. And if you want all the active owners to
            share control equally, you can still name each of them as a
            manager.
          </p>
          <p>
            It also gives better privacy. Florida's public records list the
            managers of a manager-managed LLC — and being listed as a manager
            does not identify you as an owner, so passive owners stay off the
            public listing. In a member-managed LLC, the people listed are
            identified as members (owners), so ownership is more visible.
          </p>
          <p>
            If you ever plan to bring in passive owners, use trusts, or simply
            want to limit who can bind the company and who appears in public
            records, the manager-managed structure is cleaner and safer.
          </p>
        </div>
      </details>

      {data.managementStructure === "MANAGER_MANAGED" ? (
        <div className="rounded-xl border border-trust/30 bg-trust/5 p-4 text-sm">
          <p className="font-medium">
            Your Articles will state that the LLC is manager-managed.
          </p>
          <p className="mt-1 text-muted-foreground">
            Florida recognizes the manager-managed structure when it appears in
            the Articles of Organization, so we include the statement in every
            manager-managed filing — it becomes part of the public record and
            is what banks and title companies look for.
          </p>
        </div>
      ) : null}
    </div>
  );
}
