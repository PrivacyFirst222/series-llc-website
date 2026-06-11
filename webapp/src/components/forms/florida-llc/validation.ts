import { isPoBox } from "./schema";
import type {
  FloridaLLCFormData,
  FormationType,
  LlcDesignator,
} from "./types";

const PLLC_DESIGNATORS: LlcDesignator[] = [
  "PLLC",
  "P.L.L.C.",
  "Professional Limited Liability Company",
];

const STANDARD_DESIGNATORS: LlcDesignator[] = [
  "LLC",
  "L.L.C.",
  "Limited Liability Company",
];

export function buildFinalLlcName(
  desired: string,
  designator: LlcDesignator | "",
): string {
  const cleaned = desired.trim();
  if (!cleaned || !designator) return cleaned;
  const lower = cleaned.toLowerCase();
  const hasIt =
    lower.endsWith("llc") ||
    lower.endsWith("l.l.c.") ||
    lower.endsWith("limited liability company") ||
    lower.endsWith("pllc") ||
    lower.endsWith("p.l.l.c.") ||
    lower.endsWith("professional limited liability company");
  if (hasIt) return cleaned;
  return `${cleaned}, ${designator}`;
}

export function nameContainsLegalDesignator(name: string): boolean {
  const lower = name.toLowerCase();
  return [
    "limited liability company",
    "professional limited liability company",
    "llc",
    "l.l.c.",
    "pllc",
    "p.l.l.c.",
  ].some((d) => lower.includes(d));
}

export function designatorAllowedForFormationType(
  designator: LlcDesignator | "",
  formationType: FormationType,
): boolean {
  if (!designator) return false;
  if (formationType === "DOMESTIC_LLC") {
    return STANDARD_DESIGNATORS.includes(designator as LlcDesignator);
  }
  return [...STANDARD_DESIGNATORS, ...PLLC_DESIGNATORS].includes(
    designator as LlcDesignator,
  );
}

export function totalOwnershipPct(members: FloridaLLCFormData["members"]): number {
  return members.reduce((sum, m) => sum + (m.ownershipPercentage ?? 0), 0);
}

export function ownershipPercentageWarning(
  members: FloridaLLCFormData["members"],
): string | null {
  const provided = members.filter((m) => typeof m.ownershipPercentage === "number");
  if (provided.length === 0) return null;
  if (provided.length !== members.length) {
    return "Ownership percentages should be provided for all members or none.";
  }
  const total = totalOwnershipPct(members);
  if (Math.abs(total - 100) > 0.001) {
    return `Ownership percentages total ${total}%. Should equal 100%.`;
  }
  return null;
}

export function validateRegisteredAgentAddress(
  street1: string,
  street2: string | undefined,
  state: string,
): string | null {
  if (state !== "FL") {
    return "Registered agent address must be a physical Florida street address.";
  }
  if (isPoBox(street1) || isPoBox(street2 ?? "")) {
    return "A P.O. Box cannot be used for the registered agent address.";
  }
  return null;
}

export function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start);
  let added = 0;
  const dir = n >= 0 ? 1 : -1;
  while (added < Math.abs(n)) {
    d.setDate(d.getDate() + dir);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

export function validateEffectiveDate(
  isoDate: string,
  anticipatedFilingDate: Date = new Date(),
): string | null {
  if (!isoDate) return "Effective date is required.";
  const target = new Date(isoDate);
  if (isNaN(target.getTime())) return "Invalid effective date.";
  const earliest = addBusinessDays(anticipatedFilingDate, -5);
  const latest = new Date(anticipatedFilingDate);
  latest.setDate(latest.getDate() + 90);

  earliest.setHours(0, 0, 0, 0);
  latest.setHours(23, 59, 59, 999);
  target.setHours(12, 0, 0, 0);

  if (target < earliest) {
    return "Effective date cannot be more than 5 business days before the filing date.";
  }
  if (target > latest) {
    return "Effective date cannot be more than 90 days after the filing date.";
  }
  return null;
}

export function shouldRecommendJanuary1Effective(today: Date = new Date()): boolean {
  const m = today.getMonth(); // 0=Jan
  return m >= 9 && m <= 11; // Oct, Nov, Dec
}

export function calculateEstimatedFees(opts: {
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
  seriesCount?: number;
}): {
  articlesOfOrganization: number;
  registeredAgentDesignation: number;
  certificateOfStatus: number;
  certifiedCopy: number;
  additionalSeriesFee: number;
  estimatedTotal: number;
} {
  const articlesOfOrganization = 100;
  const registeredAgentDesignation = 25;
  const certificateOfStatus = opts.certificateOfStatus ? 5 : 0;
  const certifiedCopy = opts.certifiedCopy ? 30 : 0;
  const extraSeries = Math.max(0, (opts.seriesCount ?? 0) - 3);
  const additionalSeriesFee = extraSeries * 50;
  return {
    articlesOfOrganization,
    registeredAgentDesignation,
    certificateOfStatus,
    certifiedCopy,
    additionalSeriesFee,
    estimatedTotal:
      articlesOfOrganization +
      registeredAgentDesignation +
      certificateOfStatus +
      certifiedCopy +
      additionalSeriesFee,
  };
}

/**
 * SERVER-SIDE VALIDATION EXPECTATIONS:
 * 1. Re-run the full Zod schema in `schema.ts` on the request body.
 * 2. Re-validate registered-agent address (FL state, no P.O. box).
 * 3. Re-validate principal office address (no P.O. box).
 * 4. Re-validate LLC name contains a legal designator.
 * 5. If formationType === "PLLC", require purposeType === "PROFESSIONAL"
 *    and businessPurposeText non-empty.
 * 6. If managementStructure === "MANAGER_MANAGED" and
 *    includeManagementStatementInArticles, require >=1 manager (role MGR).
 * 7. Require >= 1 initial member.
 * 8. If specific effective date, re-validate -5 business days / +90 days range.
 * 9. Verify both correspondent emails match.
 * 10. Sanitize all string inputs and reject HTML/script payloads.
 */
