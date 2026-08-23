import { BadgeDollarSign } from "lucide-react";
import {
  EIN_FEE_CENTS,
  OPTIONAL_DOC_PREP_CENTS,
  SERIES_ADDON_PREP_CENTS,
  SERVICE_FEE_CENTS,
  S_ELECTION_FEE_CENTS,
} from "../../../../server/pricing";

interface ServiceFeeEstimateProps {
  seriesCount: number;
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
  ein: boolean;
  sElection: boolean;
  isConversion?: boolean;
}

const usd = (cents: number) => `$${cents / 100}`;

/** The service-fee side of the price, itemized with a total — the mirror of
 *  the Estimated State Fees box, drawing on the same constants the server
 *  charges from (server/pricing.ts), so the two can never disagree. */
export function ServiceFeeEstimate({
  seriesCount,
  certificateOfStatus,
  certifiedCopy,
  ein,
  sElection,
  isConversion = false,
}: ServiceFeeEstimateProps) {
  const extraSeries = Math.max(0, seriesCount - 3);
  const rows: { label: string; cents: number }[] = [
    { label: "Formation service (includes up to 3 series)", cents: SERVICE_FEE_CENTS },
  ];
  if (extraSeries > 0) {
    rows.push({
      label: `Additional series — preparation (${extraSeries} × ${usd(SERIES_ADDON_PREP_CENTS)})`,
      cents: extraSeries * SERIES_ADDON_PREP_CENTS,
    });
  }
  if (certificateOfStatus) {
    rows.push({ label: "Certificate of Status — preparation", cents: OPTIONAL_DOC_PREP_CENTS });
  }
  if (certifiedCopy) {
    rows.push({ label: "Certified copy of the Articles — preparation", cents: OPTIONAL_DOC_PREP_CENTS });
  }
  if (ein) rows.push({ label: "Federal EIN service", cents: EIN_FEE_CENTS });
  // The S election package is available on new formations only — a converted
  // entity's IRS window runs from its original existence (server/pricing.ts).
  if (sElection && !isConversion) {
    rows.push({ label: "S corporation election package (Form 2553)", cents: S_ELECTION_FEE_CENTS });
  }
  const total = rows.reduce((s, r) => s + r.cents, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-trust font-medium">
        <BadgeDollarSign className="h-4 w-4" />
        Service fees
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-mono">{usd(r.cents)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
        <span className="font-medium">Service fees total</span>
        <span className="font-mono font-semibold text-trust">{usd(total)}</span>
      </div>
    </div>
  );
}
