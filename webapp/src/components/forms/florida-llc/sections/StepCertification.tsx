import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { AlertTriangle, UserCheck } from "lucide-react";
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
        <h2 className="font-display text-3xl">Certification &amp; signature</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Florida requires the Articles of Organization to be signed by an
          &ldquo;authorized representative&rdquo; (&sect;605.0203(1)(b)).
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <UserCheck className="h-4 w-4 shrink-0 text-trust" />
          Who is the authorized representative?
        </div>
        <p className="text-foreground/80 leading-relaxed">
          For a company being formed, Florida defines it as{" "}
          <em>
            a person authorized by a prospective member to form the company by
            executing and filing its articles of organization
          </em>{" "}
          (&sect;605.0102(8)(a)).
        </p>
        <p className="text-foreground/80 leading-relaxed">
          <strong>For almost everyone, that is you</strong> &mdash; an owner
          signing for the company you are about to create. It does not have to be
          an owner: you may authorize your attorney, your accountant, or anyone
          else you trust to sign and file for you. What matters is that whoever
          signs has an intended owner&rsquo;s authority to do it.
        </p>
        <p className="text-foreground/80 leading-relaxed">
          <strong>You are signing under penalty of perjury.</strong> Under
          &sect;605.0205(3), the person who signs &ldquo;affirms under penalty of
          perjury that the information stated in the record is accurate.&rdquo;
          If you have not read the Review step, go back and read it before you
          sign.
        </p>
      </div>

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
          id="cert-address-accuracy"
          checked={data.addressAccuracyAcknowledgment}
          onChange={(v) => patch({ addressAccuracyAcknowledgment: v })}
          label="I am solely responsible for the accuracy of all addresses I have provided. I understand that state filings, legal notices, and official correspondence will be directed to these addresses exactly as entered, and that MyFloridaSeriesLLC does not verify the accuracy or deliverability of any address. Any address-suggestion or address-checking feature in this form is a convenience only and is not a verification, warranty, or guarantee of any kind."
          error={errors.addressAccuracyAcknowledgment}
        />
        <AcknowledgeBox
          id="cert-terms"
          checked={data.termsOfServiceAcknowledgment}
          onChange={(v) => patch({ termsOfServiceAcknowledgment: v })}
          label={
            <>
              I agree to all terms and conditions set forth in the{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener"
                className="underline underline-offset-2 font-medium"
              >
                Terms of Service
              </Link>
              , including its binding individual arbitration provision and class action waiver.
            </>
          }
          error={errors.termsOfServiceAcknowledgment}
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
