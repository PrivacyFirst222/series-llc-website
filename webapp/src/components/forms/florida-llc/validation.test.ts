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
import {
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
  fullLegalName: "Test",
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

// Print results to console when imported in dev
if (typeof console !== "undefined") {
  const failed = results.filter((r) => !r.ok);
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

export const validationTestResults = results;
