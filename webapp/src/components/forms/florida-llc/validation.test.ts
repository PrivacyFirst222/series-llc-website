import { normalizeEntityName } from "./nameSimilarity";
/**
 * Lightweight unit-style assertions for validation logic.
 * Intentionally framework-free so they can be ported to vitest/jest later.
 *
 * Run manually in dev:
 *   import("@/components/forms/florida-llc/validation.test")
 *
 * TODO(testing): Wire this into a real test runner (vitest) when the project
 * adopts one. The shape of each test (`describe`/`it`-style strings) is ready
 * for that migration.
 */
import { isPoBox } from "./schema";
import { canonicalizeSeriesName, seriesDedupeKey,
  buildFinalLlcName,
  calculateEstimatedFees,
  designatorAllowedForFormationType,
  nameContainsLegalDesignator,
  ownershipPercentageWarning,
  validateEffectiveDate,
} from "./validation";
import type { MemberEntry } from "./types";

type AssertFn = (cond: boolean, label: string) => void;
const results: { label: string; ok: boolean }[] = [];
const assert: AssertFn = (cond, label) => {
  results.push({ label, ok: Boolean(cond) });
};

// LLC designator validation
assert(
  nameContainsLegalDesignator("Coastal Holdings, LLC"),
  "name w/ LLC passes designator check",
);
assert(
  !nameContainsLegalDesignator("Coastal Holdings"),
  "name w/o designator fails",
);
assert(
  designatorAllowedForFormationType("LLC", "DOMESTIC_LLC"),
  "LLC allowed for domestic LLC",
);
assert(
  !designatorAllowedForFormationType("PLLC", "DOMESTIC_LLC"),
  "PLLC NOT allowed for plain LLC",
);
assert(
  designatorAllowedForFormationType("PLLC", "PLLC"),
  "PLLC allowed for PLLC",
);
assert(
  buildFinalLlcName("Coastal Holdings", "LLC") === "Coastal Holdings, LLC",
  "buildFinalLlcName appends designator",
);

// P.O. Box rejection (principal & registered agent)
assert(isPoBox("P.O. Box 123"), "P.O. Box detected");
assert(isPoBox("PO BOX 7"), "PO BOX detected case-insensitively");
assert(!isPoBox("123 Main St"), "real street address not flagged");

// Effective date limits
const today = new Date();
const tooFarFuture = new Date(today);
tooFarFuture.setDate(today.getDate() + 120);
assert(
  validateEffectiveDate(tooFarFuture.toISOString().slice(0, 10)) !== null,
  "120 days out is rejected",
);
const tooFarPast = new Date(today);
tooFarPast.setDate(today.getDate() - 30);
assert(
  validateEffectiveDate(tooFarPast.toISOString().slice(0, 10)) !== null,
  "30 days back is rejected",
);
const ok = new Date(today);
ok.setDate(today.getDate() + 10);
assert(
  validateEffectiveDate(ok.toISOString().slice(0, 10)) === null,
  "10 days out is accepted",
);

// Ownership percentage total
const m = (pct?: number, isInitial = true): MemberEntry => ({
  id: Math.random().toString(),
  memberType: "INDIVIDUAL",
  firstName: "Test",
  lastName: "Member",
  entityName: "",
  address1: "1 Main",
  city: "Miami",
  state: "FL",
  zip: "33101",
  country: "US",
  ownershipPercentage: pct,
  capitalContribution: undefined,
  isInitialMember: isInitial,
  email: "",
  phone: "",
});
assert(
  ownershipPercentageWarning([m(50), m(50)]) === null,
  "100% total is fine",
);
assert(
  typeof ownershipPercentageWarning([m(50), m(40)]) === "string",
  "90% total flags warning",
);
assert(
  ownershipPercentageWarning([m(undefined), m(undefined)]) === null,
  "no percentages provided is fine",
);

// Fee estimate
const fees = calculateEstimatedFees({
  certificateOfStatus: true,
  certifiedCopy: true,
});
assert(fees.estimatedTotal === 160, "fees: 100+25+5+30 = 160");

const baseFees = calculateEstimatedFees({
  certificateOfStatus: false,
  certifiedCopy: false,
});
assert(baseFees.estimatedTotal === 125, "base fees: 100+25 = 125");

const failed = results.filter((r) => !r.ok);

// Print results to console when imported in dev
if (typeof console !== "undefined") {
  if (failed.length === 0) {
    console.info(
      `[fl-llc] All ${results.length} validation tests passed.`,
    );
  } else {
    console.warn(
      `[fl-llc] ${failed.length}/${results.length} tests failed:`,
      failed,
    );
  }
}

// --- nameSimilarity: the Division's five published non-distinguishable factors ---
{
  const same = (a: string, b: string, label: string) => {
    if (normalizeEntityName(a) !== normalizeEntityName(b)) {
      throw new Error(`FAIL ${label}: "${a}" vs "${b}" -> "${normalizeEntityName(a)}" / "${normalizeEntityName(b)}"`);
    }
  };
  const diff = (a: string, b: string, label: string) => {
    if (normalizeEntityName(a) === normalizeEntityName(b)) {
      throw new Error(`FAIL ${label}: "${a}" and "${b}" should differ`);
    }
  };
  // the FAQ's own examples, verbatim
  same("Business Enterprises, Inc.", "Business Enterprises, LLC", "suffixes");
  same("The Kitchen, Ltd.", "Kitchen, Inc.", "articles-1");
  same("Kitchen, Inc.", "A Kitchen, LLC", "articles-2");
  same("Cheese and Crackers, LLC", "Cheese & Crackers, Inc.", "and-ampersand");
  same("Tallahassee Sport, Inc.", "Tallahassee Sports, LLC", "plural");
  same("Tallahassee Sports, LLC", "Tallahassee's Sports, LP", "possessive");
  same("Cookies 'n Cupcakes, Inc.", "Cookies-n-Cupcakes, Inc.", "punctuation-1");
  same("Cookies-n-Cupcakes, Inc.", "Cookies n Cupcakes! Inc.", "punctuation-2");
  diff("Sunshine Holdings", "Sunshine Holdings 2019", "real difference kept");
  diff("Palm Grove Estates", "Palm Grove Estate Partners", "added word kept");
  console.log("[fl-llc] nameSimilarity: all Division examples normalize correctly.");
}

// ---- series identifiers: canonical prefixes + prefix-blind duplicates ----
{
  const canon = (input: string, expected: string) => {
    const got = canonicalizeSeriesName(input);
    if (got !== expected) throw new Error(`FAIL canon: "${input}" -> "${got}", expected "${expected}"`);
  };
  canon("P.s. 2", "P.S. 2");
  canon("ps 2", "PS 2");
  canon("pS 2", "PS 2");
  canon("ps. 2", "P.S. 2");
  canon("p.s 2", "P.S. 2");
  // the prefix is corrected; the client's own words are left as typed
  canon("protected series jimmy", "Protected Series jimmy");
  canon("PROTECTED  SERIES JIMMY", "Protected Series JIMMY");
  canon("PS 1", "PS 1");
  canon("Lakeside ps", "Lakeside PS");

  const sameSeries = (a: string, b: string, label: string) => {
    if (seriesDedupeKey(a) !== seriesDedupeKey(b)) throw new Error(`FAIL ${label}: "${a}" ≡ "${b}" expected`);
  };
  const diffSeries = (a: string, b: string, label: string) => {
    if (seriesDedupeKey(a) === seriesDedupeKey(b)) throw new Error(`FAIL ${label}: "${a}" and "${b}" should differ`);
  };
  // Adam's screenshot pair, verbatim
  sameSeries("P.s. 2", "PS 2", "screenshot pair");
  sameSeries("Protected Series Jimmy", "PS Jimmy", "phrase vs abbrev");
  sameSeries("ps jimmy", "P.S. JIMMY", "case + dots");
  sameSeries("PS", "P.S.", "bare prefixes");
  diffSeries("PS 1", "PS 2", "numbers differ");
  diffSeries("PS Jimmy", "PS Jimmy II", "added word kept");
  console.log("[fl-llc] series identifiers: canonical prefixes and prefix-blind duplicates hold.");
}

// Run directly (bun run validation.test.ts): exit non-zero on failure. Printing
// a warning and exiting 0 is how a broken fee calculation ships — the run has
// to fail, not merely say something.
if (typeof process !== "undefined" && import.meta.main) {
  process.exit(failed.length === 0 ? 0 : 1);
}

export const validationTestResults = results;
