import { Input } from "@/components/ui/input";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import {
  buildFinalLlcName,
  designatorAllowedForFormationType,
  nameContainsLegalDesignator,
} from "../validation";
import type { FloridaLLCFormData, LlcDesignator } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const STANDARD: LlcDesignator[] = ["LLC", "L.L.C.", "Limited Liability Company"];
const PROFESSIONAL: LlcDesignator[] = [
  "PLLC",
  "P.L.L.C.",
  "Professional Limited Liability Company",
];

export function StepName({ data, patch, errors }: StepProps) {
  const opts =
    data.formationType === "PLLC"
      ? [...STANDARD, ...PROFESSIONAL]
      : STANDARD;

  const finalName = buildFinalLlcName(data.desiredLlcName, data.llcDesignator);
  const finalNameValid = !finalName || nameContainsLegalDesignator(finalName);

  const designatorMismatch =
    data.llcDesignator &&
    !designatorAllowedForFormationType(
      data.llcDesignator as LlcDesignator,
      data.formationType,
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">LLC name</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Choose the legal name for your LLC. Florida requires the name to
          include an LLC-style designator. Run a free Sunbiz name search before
          submitting — availability isn't guaranteed.
        </p>
      </header>

      <FieldShell
        label="Desired LLC name"
        htmlFor="llc-name"
        required
        helper="The base name without the LLC designator (we'll add it for you)."
        error={errors.desiredLlcName}
      >
        <Input
          id="llc-name"
          value={data.desiredLlcName}
          onChange={(e) => patch({ desiredLlcName: e.target.value })}
          placeholder="Coastal Holdings"
        />
      </FieldShell>

      <FieldShell
        label="LLC designator"
        required
        error={errors.llcDesignator}
        helper={
          data.formationType === "PLLC"
            ? "PLLC, P.L.L.C., or Professional Limited Liability Company is recommended for a professional LLC."
            : "Standard designators only — switch to PLLC formation type if you need a professional designator."
        }
      >
        <select
          value={data.llcDesignator}
          onChange={(e) =>
            patch({ llcDesignator: e.target.value as LlcDesignator })
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select designator…</option>
          {opts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </FieldShell>

      {designatorMismatch ? (
        <p className="text-xs text-destructive">
          {data.formationType === "DOMESTIC_LLC"
            ? "PLLC designators are not allowed for a standard LLC. Switch to PLLC formation type to use them."
            : "Designator not valid for this formation type."}
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell
          label="Alternate name #1 (optional)"
          helper="Used if your first choice is unavailable."
        >
          <Input
            value={data.alternateName1 ?? ""}
            onChange={(e) => patch({ alternateName1: e.target.value })}
          />
        </FieldShell>
        <FieldShell label="Alternate name #2 (optional)">
          <Input
            value={data.alternateName2 ?? ""}
            onChange={(e) => patch({ alternateName2: e.target.value })}
          />
        </FieldShell>
      </div>

      {finalName ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-trust font-medium">
            Final name preview
          </div>
          <div className="mt-1 font-display text-xl">{finalName}</div>
          {!finalNameValid ? (
            <p className="mt-2 text-xs text-destructive">
              Florida LLC name must include LLC, L.L.C., Limited Liability
              Company, PLLC, P.L.L.C., or Professional Limited Liability
              Company.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <AcknowledgeBox
          id="ack-namesearch"
          checked={data.nameSearchAcknowledgment}
          onChange={(v) => patch({ nameSearchAcknowledgment: v })}
          label="I understand that availability is not guaranteed until accepted by the Florida Division of Corporations."
          error={errors.nameSearchAcknowledgment}
        />
        <AcknowledgeBox
          id="ack-gov"
          checked={data.governmentAffiliationAcknowledgment}
          onChange={(v) =>
            patch({ governmentAffiliationAcknowledgment: v })
          }
          label="I confirm the name does not imply affiliation with a state or federal government agency."
          error={errors.governmentAffiliationAcknowledgment}
        />
        <AcknowledgeBox
          id="ack-lawful"
          checked={data.lawfulPurposeNameAcknowledgment}
          onChange={(v) => patch({ lawfulPurposeNameAcknowledgment: v })}
          label="I confirm the name does not imply a purpose unauthorized for this LLC."
          error={errors.lawfulPurposeNameAcknowledgment}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: Search the public Sunbiz business records before submitting. We
        cannot guarantee availability.
      </p>
    </div>
  );
}
