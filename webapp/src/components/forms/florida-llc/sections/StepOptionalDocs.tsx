import { FieldShell } from "../FieldShell";
import { FeeEstimate } from "../FeeEstimate";
import { ServiceFeeEstimate } from "../ServiceFeeEstimate";
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
        <FieldShell label="Certificate of Status (+$15 — $10 service fee + $5 state fee)">
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
        <FieldShell label="Certified Copy (+$40 — $10 service fee + $30 state fee)">
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
        {data.filingPath !== "CONVERT" ? (
          <FieldShell label="S corporation election (+$95 service fee)">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.orderSElection}
                onChange={(e) => patch({ orderSElection: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-trust"
              />
              <span>
                We prepare IRS Form 2553 — completed, with a cover letter and
                step-by-step filing instructions — so your new LLC can elect S
                corporation status. You review, sign, and mail it; there is no
                IRS filing fee. The IRS deadline is strict (2 months and 15
                days from formation), so this is available only at formation
                and for a limited time afterward in your portal. Choose this
                only if your tax professional recommends the election.
              </span>
            </label>
          </FieldShell>
        ) : null}
        <FieldShell label="Federal EIN (+$50 service fee)">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.orderEin}
              onChange={(e) => patch({ orderEin: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-trust"
            />
            <span>
              We obtain the LLC's Federal Employer Identification Number from
              the IRS. After checkout, you'll provide the responsible party's
              details through a secure form in your client portal — never enter
              a Social Security number on this page or in email. EINs for
              individual series can be ordered from your portal at any time.
            </span>
          </label>
        </FieldShell>
      </div>

      <ServiceFeeEstimate
        seriesCount={data.series.length}
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
        ein={data.orderEin === true}
        sElection={data.orderSElection === true}
        isConversion={data.filingPath === "CONVERT"}
      />

      <FeeEstimate
        isConversion={data.filingPath === "CONVERT"}
        certificateOfStatus={data.orderCertificateOfStatus}
        certifiedCopy={data.orderCertifiedCopy}
        seriesCount={data.series.length}
      />
    </div>
  );
}
