import { RA_CARD_CONSENT } from "@/lib/agentBilling";
import { useState } from "react";
import { AGENT_RESIDENCY, AGENT_EXISTING_RECORD } from "../registeredAgent";
import { ShieldCheck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import { AddressAutocomplete } from "../AddressAutocomplete";
import { isPoBox } from "../schema";
import { RA_SERVICE, raServicePatch, raSelfPatch } from "../raService";
import { fullPersonName } from "../validation";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepRegisteredAgent({ data, patch, errors }: StepProps) {
  const choice = data.registeredAgentChoice;
  const existing = data.filingPath === "CONVERT";
  const [addressError, setAddressError] = useState<string>();
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
          must have a physical Florida street address. {existing
            ? "Keep the agent already on file or choose our service to replace it."
            : "For a new appointment, Florida requires the agent’s signed acceptance. Through this service, you may appoint our service or serve personally."}
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
              {data.filingPath === "CONVERT"
                ? " Florida charges $25 to change the agent on file for your LLC."
                : ""}
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
              {existing ? "Keep the registered agent already on file" : "I’ll serve as my own registered agent"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {existing
                ? "Enter your agent’s name and Florida street address exactly as the Division has them on file. This order does not change your agent; no new appointment acceptance is needed. You will confirm the agent’s agreement to serve the protected series at Certification."
                : "You must live in Florida and have a physical Florida business address; you’ll sign the acceptance on the next screen."}
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
            when we prepare your filing, and service of process and official government correspondence we receive for your LLC is posted to your client portal.
          </p>
          {/* Square requires the client's permission before a card is kept
              ("include a checkbox in your purchase flow"); the Terms' yearly
              renewal runs on it (16 Sep 2026). */}
          <div className="pt-3">
            <AcknowledgeBox
              id="ra-renewal-card-consent"
              checked={data.raRenewalCardConsent === true}
              onChange={(v) => patch({ raRenewalCardConsent: v })}
              error={errors.raRenewalCardConsent}
              label={RA_CARD_CONSENT}
            />
          </div>
        </div>
      ) : null}

      {choice === "SELF" ? (
        <>
          {data.registeredAgentType !== "ENTITY" && [data.clientFirstName, data.clientLastName].every((s) => s.trim()) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (data.clientAddress.state !== "FL") { setAddressError("A Florida address is required. Your information was not copied; enter the agent’s Florida address."); return; }
                setAddressError(undefined);
                patch({
                  registeredAgentFirstName: data.clientFirstName.trim(),
                  registeredAgentLastName: data.clientLastName.trim(),
                  registeredAgentSuffix: data.clientSuffix ?? "",
                  registeredAgentStreetAddress1: data.clientAddress.address1,
                  registeredAgentStreetAddress2: data.clientAddress.address2 ?? "",
                  registeredAgentCity: data.clientAddress.city,
                  // The source state was checked before copying any field.
                  registeredAgentState: "FL",
                  registeredAgentZip: data.clientAddress.zip,
                  registeredAgentEmail: data.clientEmail,
                  registeredAgentPhone: data.clientPhone ?? "",
                });
              }}
            >
              Use my information ({fullPersonName(data.clientFirstName, data.clientLastName, data.clientSuffix)})
            </Button>
          ) : null}
          {existing ? (
            <FieldShell label="Agent type" required htmlFor="ra-type" error={errors.registeredAgentType}>
              <select id="ra-type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={data.registeredAgentType} onChange={(e) => patch({ registeredAgentType: e.target.value as "INDIVIDUAL" | "ENTITY", registeredAgentFirstName: "", registeredAgentLastName: "", registeredAgentSuffix: "", registeredAgentBusinessEntityName: "" })}>
                <option value="INDIVIDUAL">Individual</option><option value="ENTITY">Business entity</option>
              </select>
            </FieldShell>
          ) : null}
          {existing && data.registeredAgentType === "ENTITY" ? (
            <FieldShell label="Agent's legal entity name" required htmlFor="ra-entity" error={errors.registeredAgentBusinessEntityName}>
              <Input id="ra-entity" value={data.registeredAgentBusinessEntityName ?? ""} onChange={(e) => patch({ registeredAgentBusinessEntityName: e.target.value })} />
            </FieldShell>
          ) : <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <FieldShell
              label={existing ? "Agent’s first name" : "Your first name"}
              required
              error={errors.registeredAgentFirstName}
              htmlFor="ra-first-name"
            >
              <Input
                id="ra-first-name"
                value={data.registeredAgentFirstName ?? ""}
                onChange={(e) => patch({ registeredAgentFirstName: e.target.value })}
              />
            </FieldShell>
            <FieldShell
              label={existing ? "Agent’s last name" : "Your last name"}
              required
              error={errors.registeredAgentLastName}
              htmlFor="ra-last-name"
            >
              <Input
                id="ra-last-name"
                value={data.registeredAgentLastName ?? ""}
                onChange={(e) => patch({ registeredAgentLastName: e.target.value })}
              />
            </FieldShell>
            <FieldShell label="Suffix (optional)" htmlFor="ra-suffix">
              <Input
                id="ra-suffix"
                value={data.registeredAgentSuffix ?? ""}
                onChange={(e) => patch({ registeredAgentSuffix: e.target.value })}
                placeholder="Jr, Sr, III…"
              />
            </FieldShell>
          </div>}

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <FieldShell
              label="Florida street address"
              required
              className="md:col-span-6"
              error={addressError ?? poBoxError ?? errors.registeredAgentStreetAddress1}
              htmlFor="ra-street"
            >
              <AddressAutocomplete
                id="ra-street"
                value={data.registeredAgentStreetAddress1}
                onChangeText={(text) =>
                  { setAddressError(undefined); patch({ registeredAgentStreetAddress1: text }); }
                }
                onSelect={(s) => {
                  if (s.state !== "FL") { setAddressError("A Florida address is required. This suggestion was not selected."); return; }
                  setAddressError(undefined);
                  patch({
                    registeredAgentStreetAddress1: s.address1,
                    registeredAgentCity: s.city,
                    registeredAgentState: "FL",
                    registeredAgentZip: s.zip,
                  });
                }}
              />
            </FieldShell>

            <FieldShell label="Suite / Unit (optional)" className="md:col-span-6" htmlFor="ra-suite">
              <Input
                id="ra-suite"
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
              htmlFor="ra-city"
            >
              <Input
                id="ra-city"
                value={data.registeredAgentCity}
                onChange={(e) => patch({ registeredAgentCity: e.target.value })}
              />
            </FieldShell>

            <FieldShell label="State" required className="md:col-span-2" htmlFor="ra-state" error={errors.registeredAgentState}>
              <Input id="ra-state" value={data.registeredAgentState === "FL" ? "FL — Florida" : data.registeredAgentState} disabled aria-invalid={!!errors.registeredAgentState} />
            </FieldShell>

            <FieldShell
              label="ZIP"
              required
              className="md:col-span-1"
              error={errors.registeredAgentZip}
              htmlFor="ra-zip"
            >
              <Input
                id="ra-zip"
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
            {existing ? <AcknowledgeBox id="ra-existing-record" checked={data.registeredAgentExistingRecordAcknowledgment === true} onChange={(v) => patch({ registeredAgentExistingRecordAcknowledgment: v })} label={AGENT_EXISTING_RECORD} error={errors.registeredAgentExistingRecordAcknowledgment} /> : <>
              <AcknowledgeBox id="ra-not-llc" checked={data.registeredAgentNotSameAsLlc} onChange={(v) => patch({ registeredAgentNotSameAsLlc: v })} label="I understand that the LLC itself cannot serve as its own registered agent — I am accepting this role personally." error={errors.registeredAgentNotSameAsLlc} />
              <AcknowledgeBox id="ra-physical" checked={data.registeredAgentResidencyAcknowledgment === true && data.registeredAgentPhysicalAddressAcknowledgment} onChange={(v) => patch({ registeredAgentResidencyAcknowledgment: v, registeredAgentPhysicalAddressAcknowledgment: v })} label={AGENT_RESIDENCY} error={errors.registeredAgentResidencyAcknowledgment ?? errors.registeredAgentPhysicalAddressAcknowledgment} />
            </>}
          </div>
        </>
      ) : null}
    </div>
  );
}
