import { calculateEstimatedFees } from "../src/components/forms/florida-llc/validation";

export const SERVICE_FEE_CENTS = 499_00;

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
}): PricedOrder {
  const fees = calculateEstimatedFees({
    certificateOfStatus: opts.certificateOfStatus,
    certifiedCopy: opts.certifiedCopy,
    seriesCount: opts.seriesCount,
    isConversion: opts.isConversion,
  });
  const stateFeesCents = fees.estimatedTotal * 100;
  const lineItems: { name: string; amountCents: number }[] = [
    { name: "Formation service fee", amountCents: SERVICE_FEE_CENTS },
  ];
  if (fees.articlesOfOrganization) {
    lineItems.push({ name: "FL state fee — Articles of Organization", amountCents: fees.articlesOfOrganization * 100 });
  }
  lineItems.push({ name: "FL state fee — registered agent designation", amountCents: fees.registeredAgentDesignation * 100 });
  if (fees.additionalSeriesFee) {
    lineItems.push({ name: "Additional Protected Series Designations", amountCents: fees.additionalSeriesFee * 100 });
  }
  if (fees.certificateOfStatus) {
    lineItems.push({ name: "FL state fee — Certificate of Status", amountCents: fees.certificateOfStatus * 100 });
  }
  if (fees.certifiedCopy) {
    lineItems.push({ name: "FL state fee — certified copy", amountCents: fees.certifiedCopy * 100 });
  }
  return {
    serviceFeeCents: SERVICE_FEE_CENTS,
    stateFeesCents,
    totalCents: SERVICE_FEE_CENTS + stateFeesCents,
    lineItems,
  };
}
