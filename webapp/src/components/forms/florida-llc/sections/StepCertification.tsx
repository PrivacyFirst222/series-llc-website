import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

export function StepCertification({ data, patch, errors }: StepProps) {
  const sigMismatch =
    data.authorizedRepresentativeSignature &&
    data.authorizedRepresentativeName &&
    data.authorizedRepresentativeSignature
      .trim()
      .toLowerCase() !== data.authorizedRepresentativeName.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Certification & signature</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          A person authorized to act for the LLC must certify and electronically
          sign these articles. By signing, you affirm everything you've entered
          is true and accurate.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell
          label="Authorized representative name"
          required
          error={errors.authorizedRepresentativeName}
        >
          <Input
            value={data.authorizedRepresentativeName}
            onChange={(e) =>
              patch({ authorizedRepresentativeName: e.target.value })
            }
          />
        </FieldShell>
        <FieldShell label="Title (optional)">
          <Input
            value={data.authorizedRepresentativeTitle ?? ""}
            onChange={(e) =>
              patch({ authorizedRepresentativeTitle: e.target.value })
            }
            placeholder="Member, Manager, etc."
          />
        </FieldShell>
        <FieldShell label="Email (optional)">
          <Input
            type="email"
            value={data.authorizedRepresentativeEmail ?? ""}
            onChange={(e) =>
              patch({ authorizedRepresentativeEmail: e.target.value })
            }
          />
        </FieldShell>
        <FieldShell label="Phone (optional)">
          <Input
            value={data.authorizedRepresentativePhone ?? ""}
            onChange={(e) =>
              patch({ authorizedRepresentativePhone: e.target.value })
            }
          />
        </FieldShell>
      </div>

      <FieldShell
        label="Electronic signature"
        required
        helper="Type your full legal name. This is your electronic signature."
        error={errors.authorizedRepresentativeSignature}
      >
        <Input
          value={data.authorizedRepresentativeSignature}
          onChange={(e) =>
            patch({ authorizedRepresentativeSignature: e.target.value })
          }
          className="font-display italic text-lg"
        />
      </FieldShell>

      {sigMismatch ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 flex gap-2 text-amber-900 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Your signature does not match the authorized representative name. You
          may proceed, but please confirm that this is intentional.
        </div>
      ) : null}

      <div className="space-y-3">
        <AcknowledgeBox
          id="cert-sig-auth"
          checked={data.authorizedRepresentativeSignatureCheckbox}
          onChange={(v) =>
            patch({ authorizedRepresentativeSignatureCheckbox: v })
          }
          label="I certify that I am authorized to sign and submit information for this LLC."
          error={errors.authorizedRepresentativeSignatureCheckbox}
        />
        <AcknowledgeBox
          id="cert-member"
          checked={data.atLeastOneMemberAcknowledgment}
          onChange={(v) => patch({ atLeastOneMemberAcknowledgment: v })}
          label="I affirm that the LLC has or will have at least one member when the Articles of Organization become effective."
          error={errors.atLeastOneMemberAcknowledgment}
        />
        <AcknowledgeBox
          id="cert-accuracy"
          checked={data.accuracyAcknowledgment}
          onChange={(v) => patch({ accuracyAcknowledgment: v })}
          label="I certify that the information provided is true and accurate to the best of my knowledge."
          error={errors.accuracyAcknowledgment}
        />
        <AcknowledgeBox
          id="cert-public"
          checked={data.publicRecordAcknowledgment}
          onChange={(v) => patch({ publicRecordAcknowledgment: v })}
          label="I understand that filed information may become part of the public record."
          error={errors.publicRecordAcknowledgment}
        />
        <AcknowledgeBox
          id="cert-legal"
          checked={data.legalAdviceAcknowledgment}
          onChange={(v) => patch({ legalAdviceAcknowledgment: v })}
          label="I understand this service does not provide legal, tax, or accounting advice."
          error={errors.legalAdviceAcknowledgment}
        />
      </div>
    </div>
  );
}
