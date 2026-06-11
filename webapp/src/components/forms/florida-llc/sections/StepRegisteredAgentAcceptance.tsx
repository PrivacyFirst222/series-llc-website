import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import type {
  FloridaLLCFormData,
  RegisteredAgentCapacity,
} from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepRegisteredAgentAcceptance({
  data,
  patch,
  errors,
}: StepProps) {
  const isEntity = data.registeredAgentType === "ENTITY";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Registered agent acceptance</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida requires the registered agent to accept the appointment. If
          the agent is a business entity, an authorized individual principal
          must sign on its behalf.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 flex gap-3 text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-sm">
          Typing someone's name without permission may have legal
          consequences. Only sign if you are the registered agent or you are
          authorized to sign on their behalf.
        </p>
      </div>

      <FieldShell
        label="Acceptance signer name"
        required
        error={errors.registeredAgentAcceptanceName}
      >
        <Input
          value={data.registeredAgentAcceptanceName}
          onChange={(e) =>
            patch({ registeredAgentAcceptanceName: e.target.value })
          }
        />
      </FieldShell>

      <FieldShell label="Capacity" required>
        <select
          value={data.registeredAgentAcceptanceCapacity}
          onChange={(e) =>
            patch({
              registeredAgentAcceptanceCapacity: e.target
                .value as RegisteredAgentCapacity,
            })
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select…</option>
          <option value="INDIVIDUAL_AGENT">Individual Registered Agent</option>
          <option value="PRINCIPAL_OF_ENTITY">
            Principal of Registered Agent Entity
          </option>
        </select>
        {isEntity &&
        data.registeredAgentAcceptanceCapacity === "INDIVIDUAL_AGENT" ? (
          <p className="mt-1 text-xs text-destructive">
            Because the registered agent is a business entity, the signer must
            be a Principal of the entity.
          </p>
        ) : null}
      </FieldShell>

      <FieldShell
        label="Electronic signature"
        required
        helper="Type your full legal name as your electronic signature."
        error={errors.registeredAgentElectronicSignature}
      >
        <Input
          value={data.registeredAgentElectronicSignature}
          onChange={(e) =>
            patch({ registeredAgentElectronicSignature: e.target.value })
          }
          className="font-display italic text-lg"
        />
      </FieldShell>

      <div className="space-y-3">
        <AcknowledgeBox
          id="ra-accept"
          checked={data.registeredAgentAcceptanceCheckbox}
          onChange={(v) =>
            patch({ registeredAgentAcceptanceCheckbox: v })
          }
          label="The registered agent accepts the appointment and acknowledges the obligations of serving as registered agent for this Florida LLC."
          error={errors.registeredAgentAcceptanceCheckbox}
        />
        <AcknowledgeBox
          id="ra-sigauth"
          checked={data.registeredAgentSignatureAuthorizationCheckbox}
          onChange={(v) =>
            patch({ registeredAgentSignatureAuthorizationCheckbox: v })
          }
          label="I certify that I am authorized to type this electronic signature."
          error={errors.registeredAgentSignatureAuthorizationCheckbox}
        />
      </div>
    </div>
  );
}
