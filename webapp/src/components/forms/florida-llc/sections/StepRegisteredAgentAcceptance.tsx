import { useEffect } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import { RA_SERVICE } from "../raService";
import type { FloridaLLCFormData } from "../types";

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
  const isService = data.registeredAgentChoice === "SERVICE";

  // Self-agents sign as themselves — carry the name over so they don't
  // retype it, and pin the capacity.
  useEffect(() => {
    if (!isService && data.registeredAgentName && !data.registeredAgentAcceptanceName) {
      patch({
        registeredAgentAcceptanceName: data.registeredAgentName,
        registeredAgentAcceptanceCapacity: "INDIVIDUAL_AGENT",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isService) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="font-display text-3xl">Registered agent acceptance</h2>
        </header>
        <div className="rounded-xl border border-trust/30 bg-trust/5 p-5 flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-trust mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Handled by us — nothing to sign.</p>
            <p className="text-sm text-muted-foreground">
              {RA_SERVICE.name} accepts the appointment as your registered
              agent, and we execute the signed acceptance when we prepare your
              filing with the Florida Division of Corporations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Registered agent acceptance</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida requires the registered agent to accept the appointment.
          Because you're serving as your own agent, you sign as yourself.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 flex gap-3 text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-sm">
          Your typed name below is your electronic signature accepting the
          registered agent role and its obligations.
        </p>
      </div>

      <FieldShell
        label="Your name (as registered agent)"
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
          onChange={(v) => patch({ registeredAgentAcceptanceCheckbox: v })}
          label="I accept the appointment and acknowledge the obligations of serving as registered agent for this Florida LLC."
          error={errors.registeredAgentAcceptanceCheckbox}
        />
        <AcknowledgeBox
          id="ra-sigauth"
          checked={data.registeredAgentSignatureAuthorizationCheckbox}
          onChange={(v) =>
            patch({ registeredAgentSignatureAuthorizationCheckbox: v })
          }
          label="I certify that I am signing for myself as the registered agent."
          error={errors.registeredAgentSignatureAuthorizationCheckbox}
        />
      </div>
    </div>
  );
}
