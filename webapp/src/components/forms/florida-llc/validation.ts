import { easternToday, validCalendarDate, isBankingDay, shiftBankingDays, effectiveDateRange } from "../../../lib/calendar";
import { isPoBox } from "./schema";
import type {
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
  if (nameContainsLegalDesignator(cleaned)) return cleaned;
  return `${cleaned}, ${designator}`;
}

/** A complete terminal designator, never letters embedded in Millcreek. */
const DESIGNATOR_END = /(?:^|[\s,])(p\.?l\.?l\.?c\.?|l\.?l\.?c\.?|(?:professional\s+)?limited\s+liability\s+company)\s*$/i;
export function nameContainsLegalDesignator(name: string): boolean { return DESIGNATOR_END.test(name); }
export function typedDesignatorProblem(name: string, type: FormationType): string | null {
  const ending = name.match(DESIGNATOR_END)?.[1];
  if (!ending) return null;
  const professional = /^p/i.test(ending);
  if (professional && type === "DOMESTIC_LLC") return "Your name has a professional ending. Choose Domestic Florida PLLC, or remove the ending and use the LLC designator selected below.";
  if (!professional && type === "PLLC") return "Your name has an ordinary LLC ending. Choose Domestic Florida LLC, or remove the ending and use the PLLC designator selected below.";
  return null;
}

/** The wizard scaffolds one empty member row; a manager-managed flow hides
 *  the members step, so that scaffold reaches the server untouched — and was
 *  validated as a real member, making manager-managed orders unsubmittable
 *  (caught 30 Aug 2026). A row with no name, no entity, and no address is
 *  scaffolding, never information. */
export function memberRowIsBlank(m: Record<string, unknown>): boolean {
  return ["firstName", "lastName", "entityName", "address1", "city", "zip"].every(
    (k) => typeof m[k] !== "string" || (m[k] as string).trim() === "",
  );
}

export function designatorAllowedForFormationType(
  designator: LlcDesignator | "",
  formationType: FormationType,
): boolean {
  if (!designator) return false;
  if (formationType === "DOMESTIC_LLC") {
    return STANDARD_DESIGNATORS.includes(designator as LlcDesignator);
  }
  // s. 621.12(2)(b)3: a PLLC formed on or after 1 Jan 2014 uses a professional
  // designator IN LIEU OF the s. 605.0112 ones — plain "LLC" is not allowed.
  return PLLC_DESIGNATORS.includes(designator as LlcDesignator);
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

export function isBusinessDay(d: Date): boolean { return isBankingDay(easternToday(d)); }
export function addBusinessDays(start: Date, n: number): Date {
  return new Date(`${shiftBankingDays(easternToday(start), n)}T12:00:00Z`);
}
/** Requested dates can be outside the range: the approved policy clamps at filing. */
export function validateRequestedDate(iso: string): string | null {
  return !iso ? "Effective date is required." : validCalendarDate(iso) ? null : "Invalid effective date.";
}
/** Range evaluator for filing checks, kept separate from accepting a request. */
export function validateEffectiveDate(isoDate: string, filingDate: Date = new Date()): string | null {
  const problem = validateRequestedDate(isoDate);
  if (problem) return problem;
  const { earliest, latest } = effectiveDateRange(easternToday(filingDate));
  if (isoDate < earliest) return "Effective date cannot be more than 5 business days before the filing date.";
  if (isoDate > latest) return "Effective date cannot be more than 90 days after the filing date.";
  return null;
}

export function shouldRecommendJanuary1Effective(today: Date = new Date()): boolean {
  const m = Number(easternToday(today).slice(5, 7)) - 1; // 0=Jan, Eastern calendar
  return m >= 9 && m <= 11; // Oct, Nov, Dec
}

export function calculateEstimatedFees(opts: {
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
  seriesCount?: number;
  /** Converting an existing LLC means no Articles of Organization filing. */
  isConversion?: boolean;
  /** Converting AND switching to a new registered agent. A new formation
   *  designates its agent in the articles; a conversion pays the same $25
   *  under s. 605.0213(7) only when the agent actually changes. */
  registeredAgentChange?: boolean;
}): {
  articlesOfOrganization: number;
  registeredAgentDesignation: number;
  certificateOfStatus: number;
  certifiedCopy: number;
  additionalSeriesFee: number;
  /** Our preparation charge for series beyond the included three — NOT a
   *  state fee; billed with the service fee. */
  additionalSeriesPrepFee: number;
  estimatedTotal: number;
} {
  // s. 605.0213(2) — $100 to file articles of organization.
  // s. 605.0213(7) — $25 for a certificate designating or CHANGING a
  // registered agent. A new formation designates its agent in the articles
  // and owes both, $125 in total. A conversion files no articles and owes
  // the $25 only if it is switching agents.
  const articlesOfOrganization = opts.isConversion ? 0 : 100;
  const registeredAgentDesignation = opts.isConversion ? (opts.registeredAgentChange ? 25 : 0) : 25;
  const certificateOfStatus = opts.certificateOfStatus ? 5 : 0;
  const certifiedCopy = opts.certifiedCopy ? 30 : 0;
  const extraSeries = Math.max(0, (opts.seriesCount ?? 0) - 3);
  // $50 per extra series, but only half of it is Florida's. The other $25 is
  // our preparation fee and must not be presented as a government charge.
  const additionalSeriesFee = extraSeries * 25;
  const additionalSeriesPrepFee = extraSeries * 25;
  return {
    articlesOfOrganization,
    registeredAgentDesignation,
    certificateOfStatus,
    certifiedCopy,
    additionalSeriesFee,
    additionalSeriesPrepFee,
    estimatedTotal:
      articlesOfOrganization +
      registeredAgentDesignation +
      certificateOfStatus +
      certifiedCopy +
      additionalSeriesFee,
  };
}

// Order requests are validated by webapp/server/validation.ts before routes-payments.ts builds the stored payload.

/**
 * s. 605.2202(2)(b): a protected series name must contain the phrase
 * "protected series" or the abbreviation "P.S." or "PS."
 */
export function hasProtectedSeriesPhrase(name: string): boolean {
  return /(?:^|[^a-z0-9])(?:protected\s+series|p\.?s\.?)(?=[^a-z0-9]|$)/i.test(name);
}

/** Adam's rule (23 Aug 2026): the statutory prefix is corrected, not
 *  rejected — any dotted variant becomes "P.S.", bare "ps" becomes "PS",
 *  and "protected series" gets initial caps. */
export function canonicalizeSeriesName(name: string): string {
  return name.trim().replace(/\s+/g, " ").replace(
    /(^|[^a-z0-9])(protected\s+series|p\.?s\.?)(?=[^a-z0-9]|$)[\s-]*/gi,
    (_, lead: string, token: string) => `${lead}${/^protected/i.test(token) ? "Protected Series" : token.includes(".") ? "P.S." : "PS"} `,
  ).trim();
}

/** Two series identifiers are the SAME once every prefix occurrence
 *  ("Protected Series" / "P.S." / "PS") and capitalization are ignored:
 *  "PS 2" ≡ "P.s. 2", "Protected Series Jimmy" ≡ "PS Jimmy". */
export function seriesDedupeKey(name: string): string {
  return canonicalizeSeriesName(name).toUpperCase()
    .replace(/(^|[^A-Z0-9])(?:PROTECTED\s+SERIES|P\.?S\.?)(?=[^A-Z0-9]|$)[\s-]*/g, "$1")
    .replace(/\s+/g, " ").trim();
}

/** Same strictness as the server's Zod email rule — no colons, spaces, or
 *  missing domains sneak through to the final submit. */
const EMAIL_REGEX =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_REGEX.test(s);
}

/** Fixes the classic paste accidents: "mailto:" prefixes and stray spaces. */
export function cleanEmailInput(s: string): string {
  return s.replace(/^\s*mailto:\s*/i, "").trim();
}

/** A person's printed legal name. The suffix is set off by a comma —
 *  "John Smith, Jr." — which is how it appears in the operating agreement's
 *  signature blocks and Exhibit A. (The EIN form joins with spaces instead,
 *  matching the SS-4's own separate boxes; that stays as it is.) */
export function fullPersonName(
  first?: string,
  last?: string,
  suffix?: string,
): string {
  const base = [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const sfx = (suffix ?? "").trim().replace(/^,\s*/, "");
  if (!base) return sfx;
  return sfx ? `${base}, ${sfx}` : base;
}
