import { Input } from "@/components/ui/input";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import { US_STATES } from "../AddressFields";
import { isPoBox } from "../schema";
import type { FloridaLLCFormData, RegisteredAgentType } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepRegisteredAgent({ data, patch, errors }: StepProps) {
  const isIndividual = data.registeredAgentType === "INDIVIDUAL";
  const stateError =
    data.registeredAgentState && data.registeredAgentState !== "FL"
      ? "Registered agent address must be a physical Florida street address."
      : errors.registeredAgentState;
  const poBoxError =
    isPoBox(data.registeredAgentStreetAddress1) ||
    isPoBox(data.registeredAgentStreetAddress2 ?? "")
      ? "A P.O. Box cannot be used for the registered agent address."
      : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Registered agent</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The registered agent receives legal notices on behalf of the LLC. The
          registered agent must have a physical Florida street address. The LLC
          itself cannot serve as its own registered agent.
        </p>
      </header>

      <FieldShell label="Registered agent type" required>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            { v: "INDIVIDUAL", t: "Individual", s: "A person who lives or works in Florida." },
            { v: "ENTITY", t: "Business entity", s: "A FL-registered company offering registered agent services." },
          ] as { v: RegisteredAgentType; t: string; s: string }[]).map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                data.registeredAgentType === o.v
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="agent-type"
                className="sr-only"
                checked={data.registeredAgentType === o.v}
                onChange={() => patch({ registeredAgentType: o.v })}
              />
              <div className="font-medium">{o.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{o.s}</div>
            </label>
          ))}
        </div>
      </FieldShell>

      {isIndividual ? (
        <FieldShell
          label="Registered agent name"
          required
          error={errors.registeredAgentName}
        >
          <Input
            value={data.registeredAgentName ?? ""}
            onChange={(e) => patch({ registeredAgentName: e.target.value })}
          />
        </FieldShell>
      ) : data.registeredAgentType === "ENTITY" ? (
        <FieldShell
          label="Registered agent business entity name"
          required
          error={errors.registeredAgentBusinessEntityName}
        >
          <Input
            value={data.registeredAgentBusinessEntityName ?? ""}
            onChange={(e) =>
              patch({ registeredAgentBusinessEntityName: e.target.value })
            }
          />
        </FieldShell>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <FieldShell
          label="Florida street address"
          required
          className="md:col-span-6"
          error={poBoxError ?? errors.registeredAgentStreetAddress1}
        >
          <Input
            value={data.registeredAgentStreetAddress1}
            onChange={(e) =>
              patch({ registeredAgentStreetAddress1: e.target.value })
            }
          />
        </FieldShell>

        <FieldShell
          label="Suite / Unit (optional)"
          className="md:col-span-6"
        >
          <Input
            value={data.registeredAgentStreetAddress2 ?? ""}
            onChange={(e) =>
              patch({ registeredAgentStreetAddress2: e.target.value })
            }
          />
        </FieldShell>

        <FieldShell
          label="City"
          required
          className="md:col-span-3"
          error={errors.registeredAgentCity}
        >
          <Input
            value={data.registeredAgentCity}
            onChange={(e) => patch({ registeredAgentCity: e.target.value })}
          />
        </FieldShell>

        <FieldShell
          label="State"
          required
          className="md:col-span-2"
          error={stateError}
        >
          <select
            value={data.registeredAgentState}
            onChange={(e) =>
              patch({ registeredAgentState: e.target.value })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell
          label="ZIP"
          required
          className="md:col-span-1"
          error={errors.registeredAgentZip}
        >
          <Input
            value={data.registeredAgentZip}
            onChange={(e) => patch({ registeredAgentZip: e.target.value })}
            inputMode="numeric"
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell label="Email (optional)">
          <Input
            type="email"
            value={data.registeredAgentEmail ?? ""}
            onChange={(e) => patch({ registeredAgentEmail: e.target.value })}
          />
        </FieldShell>
        <FieldShell label="Phone (optional)">
          <Input
            value={data.registeredAgentPhone ?? ""}
            onChange={(e) => patch({ registeredAgentPhone: e.target.value })}
          />
        </FieldShell>
      </div>

      <FieldShell label="Affiliated with the LLC?">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.registeredAgentIsAffiliatedPerson}
            onChange={(e) =>
              patch({ registeredAgentIsAffiliatedPerson: e.target.checked })
            }
            className="h-4 w-4 accent-trust"
          />
          The registered agent is a member, manager, or other affiliated party
          (for internal records).
        </label>
      </FieldShell>

      <div className="space-y-3">
        <AcknowledgeBox
          id="ra-not-llc"
          checked={data.registeredAgentNotSameAsLlc}
          onChange={(v) => patch({ registeredAgentNotSameAsLlc: v })}
          label="I understand that the LLC itself cannot serve as its own registered agent."
          error={errors.registeredAgentNotSameAsLlc}
        />
        <AcknowledgeBox
          id="ra-physical"
          checked={data.registeredAgentPhysicalAddressAcknowledgment}
          onChange={(v) =>
            patch({ registeredAgentPhysicalAddressAcknowledgment: v })
          }
          label="I confirm the registered agent has a physical street address in Florida and that this is not a P.O. Box."
          error={errors.registeredAgentPhysicalAddressAcknowledgment}
        />
      </div>
    </div>
  );
}
