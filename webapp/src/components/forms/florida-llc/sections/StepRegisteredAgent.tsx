import { ShieldCheck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import { AddressAutocomplete } from "../AddressAutocomplete";
import { isPoBox } from "../schema";
import { RA_SERVICE, raServicePatch, raSelfPatch } from "../raService";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepRegisteredAgent({ data, patch, errors }: StepProps) {
  const choice = data.registeredAgentChoice;
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
          The registered agent receives legal notices on behalf of the LLC and
          must have a physical Florida street address. Florida requires the
          agent's signed acceptance, so the agent must be our service or you.
        </p>
      </header>

      <FieldShell label="Who will serve as registered agent?" required error={errors.registeredAgentChoice}>
        <div className="grid sm:grid-cols-2 gap-3">
          <label
            className={`cursor-pointer rounded-xl border p-4 transition-colors ${
              choice === "SERVICE"
                ? "border-accent bg-accent/5 ring-1 ring-accent"
                : "border-border hover:border-foreground/30"
            }`}
          >
            <input
              type="radio"
              name="ra-choice"
              className="sr-only"
              checked={choice === "SERVICE"}
              onChange={() => patch(raServicePatch())}
            />
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-trust" />
              Use our registered agent service
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              First year included in your service fee ($99/yr after). We accept
              the appointment and handle legal mail for you.
            </div>
          </label>
          <label
            className={`cursor-pointer rounded-xl border p-4 transition-colors ${
              choice === "SELF"
                ? "border-accent bg-accent/5 ring-1 ring-accent"
                : "border-border hover:border-foreground/30"
            }`}
          >
            <input
              type="radio"
              name="ra-choice"
              className="sr-only"
              checked={choice === "SELF"}
              onChange={() => patch(raSelfPatch())}
            />
            <div className="flex items-center gap-2 font-medium">
              <UserRound className="h-4 w-4 text-trust" />
              I'll serve as my own registered agent
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              You must have a physical Florida street address and you'll sign
              the acceptance on the next screen.
            </div>
          </label>
        </div>
      </FieldShell>

      {choice === "SERVICE" ? (
        <div className="rounded-xl border border-trust/30 bg-trust/5 p-5 space-y-1.5">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Your registered agent will be
          </div>
          <div className="font-medium">{RA_SERVICE.name}</div>
          <div className="text-sm text-muted-foreground">
            {RA_SERVICE.address1}, {RA_SERVICE.address2}
            <br />
            {RA_SERVICE.city}, {RA_SERVICE.state} {RA_SERVICE.zip}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Nothing to sign here — we execute the registered agent acceptance
            when we prepare your filing, and anything we receive for your LLC
            is posted to your client portal.
          </p>
        </div>
      ) : null}

      {choice === "SELF" ? (
        <>
          {[data.clientFirstName, data.clientLastName].every((s) => s.trim()) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  registeredAgentFirstName: data.clientFirstName.trim(),
                  registeredAgentLastName: data.clientLastName.trim(),
                  registeredAgentStreetAddress1: data.clientAddress.address1,
                  registeredAgentStreetAddress2: data.clientAddress.address2 ?? "",
                  registeredAgentCity: data.clientAddress.city,
                  registeredAgentState: data.clientAddress.state,
                  registeredAgentZip: data.clientAddress.zip,
                  registeredAgentEmail: data.clientEmail,
                  registeredAgentPhone: data.clientPhone ?? "",
                })
              }
            >
              Use my information ({data.clientFirstName.trim()} {data.clientLastName.trim()})
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <FieldShell
              label="Your first name"
              required
              error={errors.registeredAgentFirstName}
            >
              <Input
                value={data.registeredAgentFirstName ?? ""}
                onChange={(e) => patch({ registeredAgentFirstName: e.target.value })}
              />
            </FieldShell>
            <FieldShell
              label="Your last name"
              required
              error={errors.registeredAgentLastName}
            >
              <Input
                value={data.registeredAgentLastName ?? ""}
                onChange={(e) => patch({ registeredAgentLastName: e.target.value })}
              />
            </FieldShell>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <FieldShell
              label="Florida street address"
              required
              className="md:col-span-6"
              error={poBoxError ?? errors.registeredAgentStreetAddress1}
            >
              <AddressAutocomplete
                value={data.registeredAgentStreetAddress1}
                onChangeText={(text) =>
                  patch({ registeredAgentStreetAddress1: text })
                }
                onSelect={(s) =>
                  patch({
                    registeredAgentStreetAddress1: s.address1,
                    registeredAgentCity: s.city,
                    registeredAgentState: "FL",
                    registeredAgentZip: s.zip,
                  })
                }
              />
            </FieldShell>

            <FieldShell label="Suite / Unit (optional)" className="md:col-span-6">
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

            <FieldShell label="State" required className="md:col-span-2">
              <Input value="FL — Florida" disabled />
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

            <p className="md:col-span-6 text-xs leading-relaxed text-muted-foreground">
              We prepare your filing using this address exactly as entered.
              Please double-check it — an incorrect address can cause missed
              legal notices and state correspondence. Address suggestions are a
              convenience, not a verification.
            </p>
          </div>

          <div className="space-y-3">
            <AcknowledgeBox
              id="ra-not-llc"
              checked={data.registeredAgentNotSameAsLlc}
              onChange={(v) => patch({ registeredAgentNotSameAsLlc: v })}
              label="I understand that the LLC itself cannot serve as its own registered agent — I am accepting this role personally."
              error={errors.registeredAgentNotSameAsLlc}
            />
            <AcknowledgeBox
              id="ra-physical"
              checked={data.registeredAgentPhysicalAddressAcknowledgment}
              onChange={(v) =>
                patch({ registeredAgentPhysicalAddressAcknowledgment: v })
              }
              label="I confirm this is my physical street address in Florida and not a P.O. Box."
              error={errors.registeredAgentPhysicalAddressAcknowledgment}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
