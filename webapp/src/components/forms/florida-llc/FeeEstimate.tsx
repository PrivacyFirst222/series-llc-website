import { Receipt } from "lucide-react";
import { calculateEstimatedFees } from "./validation";

interface FeeEstimateProps {
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
  seriesCount?: number;
  isConversion?: boolean;
  registeredAgentChange?: boolean;
  compact?: boolean;
}

export function FeeEstimate({
  certificateOfStatus,
  certifiedCopy,
  seriesCount = 0,
  isConversion = false,
  registeredAgentChange = false,
  compact,
}: FeeEstimateProps) {
  const fees = calculateEstimatedFees({
    certificateOfStatus,
    certifiedCopy,
    seriesCount,
    isConversion,
    registeredAgentChange,
  });

  const extraSeries = Math.max(0, seriesCount - 3);

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-border bg-secondary/40 p-3"
          : "rounded-2xl border border-border bg-card p-5"
      }
    >
      <div className="flex items-center gap-2 text-trust">
        <Receipt className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.18em] font-medium">
          Estimated state fees
        </span>
      </div>
      <ul className="mt-3 text-sm space-y-1.5">
        {isConversion ? null : (
          <li className="flex justify-between">
            <span className="text-foreground/80">Articles of Organization</span>
            <span className="font-mono-feature">${fees.articlesOfOrganization}</span>
          </li>
        )}
        {fees.registeredAgentDesignation > 0 ? (
          <li className="flex justify-between">
            <span className="text-foreground/80">
              {isConversion ? "Change of Registered Agent" : "Registered Agent Designation"}
            </span>
            <span className="font-mono-feature">${fees.registeredAgentDesignation}</span>
          </li>
        ) : null}
        <li className="flex justify-between text-muted-foreground">
          <span>Certificate of Status (optional)</span>
          <span className="font-mono-feature">
            {certificateOfStatus ? `$${fees.certificateOfStatus}` : "—"}
          </span>
        </li>
        <li className="flex justify-between text-muted-foreground">
          <span>Certified Copy (optional)</span>
          <span className="font-mono-feature">
            {certifiedCopy ? `$${fees.certifiedCopy}` : "—"}
          </span>
        </li>
        {seriesCount > 0 ? (
          <li className="flex justify-between">
            <span className={extraSeries > 0 ? "text-foreground/80" : "text-muted-foreground"}>
              {extraSeries > 0
                ? `Additional series — state fee (${extraSeries} × $25)`
                : `Series (${seriesCount} of 3 included)`}
            </span>
            <span className="font-mono-feature">
              {extraSeries > 0 ? `$${fees.additionalSeriesFee}` : "—"}
            </span>
          </li>
        ) : null}
      </ul>
      <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
        <span>Estimated total</span>
        <span className="font-mono-feature text-trust">
          ${fees.estimatedTotal}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
        Government fees are subject to change. Base $499 service fee not
        included. Each series beyond the included three costs $50 — the $25
        shown here is Florida's filing fee; our $25 preparation charge is
        billed with the service fee.{isConversion && fees.registeredAgentDesignation === 0
          ? " If you are changing the registered agent already on file for your"
            + " LLC, Florida charges $25 for that filing."
          : ""}
      </p>
    </div>
  );
}
