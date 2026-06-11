import { FieldShell } from "../FieldShell";
import { FeeEstimate } from "../FeeEstimate";
import type { FloridaLLCFormData } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
}

export function StepOptionalDocs({ data, patch }: StepProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Optional state documents</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add optional documents from the Florida Division of Corporations.
          State fees may change without notice.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        <FieldShell label="Certificate of Status (+$5)">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.orderCertificateOfStatus}
              onChange={(e) =>
                patch({ orderCertificateOfStatus: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-trust"
            />
            <span>
              Order an official Certificate of Status confirming the LLC is
              active and in good standing.
            </span>
          </label>
        </FieldShell>
        <FieldShell label="Certified Copy (+$30)">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.orderCertifiedCopy}
              onChange={(e) =>
                patch({ orderCertifiedCopy: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-trust"
            />
            <span>
              Order a certified copy of the Articles of Organization.
            </span>
          </label>
        </FieldShell>
      </div>

      <FeeEstimate
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
      />
    </div>
  );
}
