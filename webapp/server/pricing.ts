import { calculateEstimatedFees } from "../src/components/forms/florida-llc/validation";

export const SERVICE_FEE_CENTS = 499_00;
export const EIN_FEE_CENTS = 50_00;
export const S_ELECTION_FEE_CENTS = 95_00;
export const SERIES_ADDON_PREP_CENTS = 25_00;
/** Adam's pricing (23 Aug 2026): each optional document carries a $10
 *  preparation charge on the service-fee side, plus the state fee at cost
 *  (Certificate of Status $5, certified copy $30). */
export const OPTIONAL_DOC_PREP_CENTS = 10_00;
export const SERIES_ADDON_STATE_CENTS = 25_00;
/** S election package is purchasable only this many days after the formation
 *  order is paid — leaves ~10 days of buffer inside the IRS's 2-months-and-15-days
 *  election deadline for preparation, signing, and mailing. */
export const S_ELECTION_WINDOW_DAYS = 65;

export interface PricedOrder {
  serviceFeeCents: number;
  stateFeesCents: number;
  totalCents: number;
  lineItems: { name: string; amountCents: number }[];
}

/** Single source of truth for what the customer is charged. Mirrors the
 *  client-side estimator exactly; the client's numbers are never trusted. */
export function priceOrder(opts: {
  isConversion: boolean;
  seriesCount: number;
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
  ein: boolean;
  sElection: boolean;
  /** A converting client who takes our registered agent service is changing
   *  the agent on file — s. 605.0213(7), $25. */
  registeredAgentChange: boolean;
}): PricedOrder {
  const fees = calculateEstimatedFees({
    certificateOfStatus: opts.certificateOfStatus,
    certifiedCopy: opts.certifiedCopy,
    seriesCount: opts.seriesCount,
    isConversion: opts.isConversion,
    registeredAgentChange: opts.registeredAgentChange,
  });
  const stateFeesCents = fees.estimatedTotal * 100;
  const lineItems: { name: string; amountCents: number }[] = [
    { name: "Formation service fee", amountCents: SERVICE_FEE_CENTS },
  ];
  if (opts.ein) {
    lineItems.push({ name: "Federal EIN service", amountCents: EIN_FEE_CENTS });
  }
  if (opts.sElection) {
    lineItems.push({ name: "S corporation election package (Form 2553)", amountCents: S_ELECTION_FEE_CENTS });
  }
  if (opts.certificateOfStatus) {
    lineItems.push({ name: "Certificate of Status — preparation", amountCents: OPTIONAL_DOC_PREP_CENTS });
  }
  if (opts.certifiedCopy) {
    lineItems.push({ name: "Certified copy of the Articles — preparation", amountCents: OPTIONAL_DOC_PREP_CENTS });
  }
  if (fees.articlesOfOrganization) {
    lineItems.push({ name: "FL state fee — Articles of Organization", amountCents: fees.articlesOfOrganization * 100 });
  }
  if (fees.registeredAgentDesignation) {
    lineItems.push({
      name: opts.isConversion
        ? "FL state fee — change of registered agent"
        : "FL state fee — registered agent designation",
      amountCents: fees.registeredAgentDesignation * 100,
    });
  }
  if (fees.additionalSeriesPrepFee) {
    lineItems.push({
      name: "Additional Protected Series Designations — preparation",
      amountCents: fees.additionalSeriesPrepFee * 100,
    });
  }
  if (fees.additionalSeriesFee) {
    lineItems.push({
      name: "FL state fee — Additional Protected Series Designations",
      amountCents: fees.additionalSeriesFee * 100,
    });
  }
  if (fees.certificateOfStatus) {
    lineItems.push({ name: "FL state fee — Certificate of Status", amountCents: fees.certificateOfStatus * 100 });
  }
  if (fees.certifiedCopy) {
    lineItems.push({ name: "FL state fee — certified copy", amountCents: fees.certifiedCopy * 100 });
  }
  const serviceFeeCents =
    SERVICE_FEE_CENTS +
    fees.additionalSeriesPrepFee * 100 +
    (opts.ein ? EIN_FEE_CENTS : 0) +
    (opts.sElection ? S_ELECTION_FEE_CENTS : 0) +
    (opts.certificateOfStatus ? OPTIONAL_DOC_PREP_CENTS : 0) +
    (opts.certifiedCopy ? OPTIONAL_DOC_PREP_CENTS : 0);
  return {
    serviceFeeCents,
    stateFeesCents,
    totalCents: serviceFeeCents + stateFeesCents,
    lineItems,
  };
}
