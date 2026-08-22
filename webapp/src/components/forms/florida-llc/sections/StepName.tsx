import { Input } from "@/components/ui/input";
import { normalizeEntityName, similarityExamples, sunbizSearchUrl } from "../nameSimilarity";
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

      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        You can see if your name is available by{" "}
        <a
          href="https://search.sunbiz.org/Inquiry/CorporationSearch/ByName"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-trust underline underline-offset-2"
        >
          clicking here
        </a>
        . The State of Florida's website does not offer a way for services like
        ours to check availability automatically. If you provide an alternate
        name and your first choice is not available, we will use your alternate
        names in order of preference. This will save you time if your first
        choice is unavailable. If you check the "I only want this exact name"
        option and your name is unavailable, we will have to email you
        (typically within 1 business day) which can potentially slow down the
        formation process.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell label="Alternate name #1" error={errors.alternateName1}>
          <Input
            value={data.alternateName1 ?? ""}
            disabled={data.exactNameOnly === true}
            onChange={(e) =>
              patch({ alternateName1: e.target.value, exactNameOnly: false })
            }
          />
        </FieldShell>
        <FieldShell label="Alternate name #2 (optional)" error={errors.alternateName2}>
          <Input
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
        <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
          <a
            href={sunbizSearchUrl(data.desiredLlcName)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Search Sunbiz for "{normalizeEntityName(data.desiredLlcName) || data.desiredLlcName.trim()}"
          </a>
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">How to read the results (from the Division's own rules):</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li><span className="font-medium">Active</span> — taken.</li>
              <li><span className="font-medium">INACT/UA</span> — dissolved but the name is still held (one year after administrative dissolution; 120 days after voluntary).</li>
              <li><span className="font-medium">INACT or Inactive</span> — the company is gone and its name is available again.</li>
              <li><span className="font-medium">CROSS RF</span> — a cross-reference; click it, and the real record's status decides.</li>
            </ul>
            {similarityExamples(data.desiredLlcName).length > 0 ? (
              <p className="mt-2">
                Florida treats near-matches as the same name — watch the list for
                names like{" "}
                {similarityExamples(data.desiredLlcName).map((s, i, arr) => (
                  <span key={s}>
                    <em>{s}</em>
                    {i < arr.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
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
