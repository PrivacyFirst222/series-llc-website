import { Input } from "@/components/ui/input";
import { NameCheck } from "../NameCheck";
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
  const isConversion = data.filingPath === "CONVERT";
  // Only the designators that are legal for the chosen formation type are
  // offered at all (s. 621.12(2)(b)3: professional in lieu of standard).
  const opts = data.formationType === "PLLC" ? PROFESSIONAL : STANDARD;

  const finalName = buildFinalLlcName(data.desiredLlcName, data.llcDesignator);
  const finalNameValid = !finalName || nameContainsLegalDesignator(finalName);

  const designatorMismatch =
    data.llcDesignator &&
    !designatorAllowedForFormationType(
      data.llcDesignator as LlcDesignator,
      data.formationType,
    );

  if (isConversion) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="font-display text-3xl">Your existing LLC</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Tell us which company you want to convert. Enter the name exactly as
            it appears on Sunbiz, along with its document number, so we file
            against the right entity.
          </p>
        </header>

        <FieldShell
          label="Existing LLC name"
          htmlFor="existing-llc-name"
          required
          helper="Exactly as it appears with the Florida Division of Corporations, including the designator."
          error={errors.existingLlcName}
        >
          <Input
            id="existing-llc-name"
            value={data.existingLlcName ?? ""}
            onChange={(e) => patch({ existingLlcName: e.target.value })}
            placeholder="Sunshine Holdings, LLC"
            aria-invalid={!!errors.existingLlcName}
          />
        </FieldShell>

        <FieldShell
          label="Sunbiz document number"
          htmlFor="sunbiz-doc-number"
          required
          helper="Found on your Sunbiz record — usually letter-and-digit, e.g. L24000123456."
          error={errors.sunbizDocumentNumber}
        >
          <Input
            id="sunbiz-doc-number"
            value={data.sunbizDocumentNumber ?? ""}
            onChange={(e) => patch({ sunbizDocumentNumber: e.target.value })}
            placeholder="L24000123456"
            aria-invalid={!!errors.sunbizDocumentNumber}
          />
        </FieldShell>

        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground leading-relaxed">
          Because the company is already on file, there is no name availability
          check and no $125 Articles of Organization filing fee.
        </div>
      </div>
    );
  }

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
        htmlFor="llc-designator"
        required
        error={errors.llcDesignator}
        helper={
          data.formationType === "PLLC"
            ? "A professional LLC's name must use PLLC, P.L.L.C., or Professional Limited Liability Company."
            : "Standard designators only — switch to PLLC formation type if you need a professional designator."
        }
      >
        <select
          id="llc-designator"
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
            : "A professional LLC must use a professional designator — PLLC, P.L.L.C., or Professional Limited Liability Company."}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        The State of Florida's website does not offer a way for services like
        ours to check availability automatically. We have created a tool to
        check whether a name is unavailable. It does not guarantee that the
        name will be accepted by the Florida Secretary of State, but it can
        save you time submitting a name that will be rejected. If you provide
        an alternate name and your first choice is not available, we will use
        your alternate names in order of preference. This will also save you
        time if your first choice is rejected. If you check the "I only want
        this exact name" option and your name is unavailable, we will have to
        email you (typically within 1 business day) which can potentially slow
        down the formation process.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell label="Alternate name #1" error={errors.alternateName1} htmlFor="alternate-name-1">
          <Input
            id="alternate-name-1"
            value={data.alternateName1 ?? ""}
            disabled={data.exactNameOnly === true}
            onChange={(e) =>
              patch({ alternateName1: e.target.value, exactNameOnly: false })
            }
          />
        </FieldShell>
        <FieldShell label="Alternate name #2 (optional)" error={errors.alternateName2} htmlFor="alternate-name-2">
          <Input
            id="alternate-name-2"
            value={data.alternateName2 ?? ""}
            disabled={data.exactNameOnly === true}
            onChange={(e) =>
              patch({ alternateName2: e.target.value, exactNameOnly: false })
            }
          />
        </FieldShell>
      </div>
      <p className="text-xs text-muted-foreground">
        Without the designator — it is added automatically. Alternate #1 is
        required unless you check the exact-name box.
      </p>

      {data.desiredLlcName.trim() ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <NameCheck
            names={[
              { label: "First choice", value: data.desiredLlcName },
              {
                label: "Alternate 1",
                value: data.exactNameOnly === true ? "" : (data.alternateName1 ?? ""),
              },
              {
                label: "Alternate 2",
                value: data.exactNameOnly === true ? "" : (data.alternateName2 ?? ""),
              },
            ]}
            state={data.nameCheck}
            onState={(s) => patch({ nameCheck: s })}
          />
          {errors.nameCheck ? (
            <p className="mt-2 text-sm text-destructive">{errors.nameCheck}</p>
          ) : null}
        </div>
      ) : null}

      <AcknowledgeBox
        id="exact-name-only"
        checked={data.exactNameOnly === true}
        onChange={(v) =>
          patch(
            v
              ? { exactNameOnly: true, alternateName1: "", alternateName2: "" }
              : { exactNameOnly: false },
          )
        }
        label="I only want this exact name — if it is unavailable, contact me before doing anything else."
        error={errors.exactNameOnly}
      />

      {finalName ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-trust font-medium">
            Final name preview
          </div>
          <div className="mt-1 font-display text-xl">{finalName}</div>
          {[data.alternateName1, data.alternateName2]
            .map((n) => buildFinalLlcName((n ?? "").trim(), data.llcDesignator))
            .filter(Boolean)
            .map((n, i) => (
              <div key={i} className="mt-1 text-sm text-muted-foreground">
                Alternate {i + 1}: <span className="font-display text-base text-foreground">{n}</span>
              </div>
            ))}
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
