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
import { nameCheckKey } from "./nameSimilarity";
import { validateStep } from "./stepValidation";
import { defaultFormData } from "./defaults";
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

// The name-check gate must key its result to the name it actually checked.
// A stale failure for a superseded name once stamped "unavailable" onto the
// name on screen, which waived the gate and let a TAKEN name through — the
// exact thing the mandatory check exists to prevent (audited and reproduced
// in the browser, 26 Aug 2026).
{
  const base = {
    ...defaultFormData,
    filingPath: "NEW" as const,
    desiredLlcName: "Race B Ventures",
    llcDesignator: "LLC" as const,
    exactNameOnly: true,
    nameSearchAcknowledgment: true,
    governmentAffiliationAcknowledgment: true,
    lawfulPurposeNameAcknowledgment: true,
  };
  const keyFor = (n: string) => nameCheckKey([n]);

  const staleKeyed = validateStep("name", {
    ...base,
    // A result belonging to a DIFFERENT name must never satisfy this step.
    nameCheck: { key: keyFor("Race A Holdings"), available: false, results: [] },
  } as typeof base);
  if (!staleKeyed.nameCheck) {
    throw new Error("FAIL name-check gate: a result keyed to another name satisfied the step");
  }

  const takenNow = validateStep("name", {
    ...base,
    nameCheck: {
      key: keyFor("Race B Ventures"),
      available: true,
      results: [{ input: "Race B Ventures", verdict: "taken", conflicts: [] }],
    },
  } as typeof base);
  if (!takenNow.desiredLlcName) {
    throw new Error("FAIL name-check gate: a taken verdict for the current name did not block");
  }

  // Documented, intended behaviour: when the mirror itself is unavailable for
  // THIS name, the step is waived — the server re-checks at order time.
  const waived = validateStep("name", {
    ...base,
    nameCheck: { key: keyFor("Race B Ventures"), available: false, results: [] },
  } as typeof base);
  if (waived.nameCheck || waived.desiredLlcName) {
    throw new Error("FAIL name-check gate: an unavailable mirror for the current name should waive");
  }
  console.log("[fl-llc] name-check gate: results bind to the name they checked.");
}

// Taxation labels: exhaustive over all eight OA versions. Three of eight were
// mislabeled "Partnership" by a default branch (PORTAL-001) — an S corporation
// agreement showed the wrong tax status in the client portal. The full table
// is asserted so a ninth version added without a label fails here, not there.
{
  const { taxationLabel } = await import("../../../lib/datetime");
  const expected: Record<string, string> = {
    single: "Single-Member",
    "single-s": "S Corporation",
    "member-single": "Single-Member",
    "member-single-s": "S Corporation",
    multi: "Partnership",
    s: "S Corporation",
    member: "Partnership",
    "member-s": "S Corporation",
  };
  for (const [version, label] of Object.entries(expected)) {
    const got = taxationLabel(version);
    if (got !== label) {
      throw new Error(`FAIL taxation label: ${version} shows "${got}", expected "${label}"`);
    }
  }
  if (taxationLabel("unknown-future-version") !== "") {
    throw new Error("FAIL taxation label: unknown version must show nothing, not a guess");
  }
  console.log("[fl-llc] taxation labels: all 8 versions correct, unknown shows nothing.");
}

// Admin board: "new order from an existing client" means a service bought
// AFTER formation (Adam, 5 Sep 2026). Jimmy Flanagan, LLC — formed 12 days
// earlier, intake EIN and S election still open — went green under the old
// rule ("formed + any open service"); intake add-ons are created at payment,
// before formation, and must not count.
{
  const { boughtAfterFormation } = await import("../../../pages/admin/serviceOrders.helpers");
  const svc = (status: string, created_at: string) =>
    ({ id: "x", type: "ein", status, created_at } as unknown as Parameters<typeof boughtAfterFormation>[0]);
  const formedAt = "2026-08-24T12:00:00.000Z";
  const cases: [boolean, string, boolean][] = [
    [boughtAfterFormation(svc("awaiting_info", "2026-08-20T12:00:00.000Z"), formedAt), "intake add-on (before formation) is not new work", false],
    [boughtAfterFormation(svc("awaiting_info", "2026-09-04T12:00:00.000Z"), formedAt), "post-formation purchase is new work", true],
    [boughtAfterFormation(svc("fulfilled", "2026-09-04T12:00:00.000Z"), formedAt), "a fulfilled post-formation order is not open work", false],
    [boughtAfterFormation(svc("awaiting_info", "2026-09-04T12:00:00.000Z"), null), "an unformed company can have no post-formation work", false],
  ];
  for (const [got, label, want] of cases) {
    if (got !== want) throw new Error(`FAIL board new-work rule: ${label} (got ${got})`);
  }
  console.log("[admin] board new-work rule: 4 cases correct.");
}

// S election form: optional dates are typed as MM/DD/YYYY and stored as
// YYYY-MM-DD; blank stays blank; nonsense is refused (Adam, 6 Sep 2026 —
// the iPad's date picker filled in today's date on a tap).
{
  const { typedDateToIso, isoToTypedDate } = await import("../../../pages/portal/typedDate");
  const cases: [string | null, string | null, string][] = [
    [typedDateToIso(""), "", "blank stays blank"],
    [typedDateToIso("09/06/2026"), "2026-09-06", "MM/DD/YYYY converts"],
    [typedDateToIso("9/6/2026"), "2026-09-06", "M/D/YYYY converts"],
    [typedDateToIso("2026-09-06"), "2026-09-06", "an ISO date passes through"],
    [typedDateToIso("13/40/2026"), null, "an impossible date is refused"],
    [typedDateToIso("Sept 6"), null, "words are refused"],
    [isoToTypedDate("2026-09-06"), "09/06/2026", "stored dates display as MM/DD/YYYY"],
    [isoToTypedDate(undefined), "", "no stored date displays blank"],
  ];
  for (const [got, want, label] of cases) {
    if (got !== want) throw new Error(`FAIL typed date: ${label} (got ${JSON.stringify(got)})`);
  }
  console.log("[portal] S election typed dates: 8 cases correct.");
}

// The slashes are added as the digits arrive (Adam, 6 Sep 2026: "The date
// field should add the '/' symbols if missing"), typed slashes are kept, and
// a backspace never gets stuck on a slash.
{
  const { formatTypedDate } = await import("../../../pages/portal/typedDate");
  const cases: [string, string, string][] = [
    [formatTypedDate("09012026"), "09/01/2026", "eight bare digits get both slashes"],
    [formatTypedDate("09"), "09", "two digits: no slash yet"],
    [formatTypedDate("090"), "09/0", "the third digit brings the first slash"],
    [formatTypedDate("09012"), "09/01/2", "the fifth digit brings the second slash"],
    [formatTypedDate("9/1/2026"), "9/1/2026", "typed slashes are kept"],
    [formatTypedDate("9/"), "9/", "a typed trailing slash is kept"],
    [formatTypedDate("09/"), "09/", "backspacing 09/0 to 09/ keeps the slash"],
    [formatTypedDate("09/01/"), "09/01/", "backspacing 09/01/2 to 09/01/ keeps the slash"],
    [formatTypedDate("0901202699"), "09/01/2026", "extra digits are dropped"],
    [formatTypedDate("ab09cd"), "09", "letters are ignored"],
  ];
  for (const [got, want, label] of cases) {
    if (got !== want) throw new Error(`FAIL date slashes: ${label} (got ${JSON.stringify(got)})`);
  }
  console.log("[portal] S election date slashes: 10 cases correct.");
}

// Jointly held interests on Form 2553 (Adam, 6 Sep 2026): both names with the
// joint kind in column J, both Social Security numbers in column M.
{
  const { jointDisplayName, ssnColumnText, packSsns, unpackSsns, columnJText } = await import("../../../lib/jointOwner");
  const cases: [string, string, string][] = [
    [columnJText({ name: "John Jones", address: "305 N Lakeland Ave, Orlando, FL 32805" }), "John Jones\n305 N Lakeland Ave, Orlando, FL 32805", "column J: an individual's name over the address"],
    [columnJText({ name: "Bob Jones", address: "123 N Hyer Ave, Orlando, FL 32801", joint: "tbe", name2: "Mary Jones", address2: "123 N Hyer Ave, Orlando, FL 32801" }), "Bob Jones and Mary Jones as Tenants by the Entirety\n123 N Hyer Ave, Orlando, FL 32801", "column J: co-owners at one address share the line"],
    [columnJText({ name: "Bob Jones", address: "123 N Hyer Ave, Orlando, FL 32801", joint: "tbe", name2: "Mary Jones", address2: "456 Park Lake St, Orlando, FL 32803" }), "Bob Jones and Mary Jones as Tenants by the Entirety\nBob Jones: 123 N Hyer Ave, Orlando, FL 32801\nMary Jones: 456 Park Lake St, Orlando, FL 32803", "column J: co-owners living apart each get their address"],
    [jointDisplayName("John A. Smith", "", ""), "John A. Smith", "an individual owner is named alone"],
    [jointDisplayName("John A. Smith", "Jane B. Smith", "tbe"), "John A. Smith and Jane B. Smith as Tenants by the Entirety", "tenants by the entirety are named together"],
    [jointDisplayName("John A. Smith", "Jane B. Smith", "jtwros"), "John A. Smith and Jane B. Smith as Joint Tenants with Right of Survivorship", "joint tenants are named together"],
    [ssnColumnText("123456789", "", ""), "123-45-6789", "one number for an individual"],
    [ssnColumnText("123456789", "987654321", "tbe"), "123-45-6789 /\n987-65-4321", "both numbers for a joint row, stacked"],
    [ssnColumnText("123456789", "987654321", "tbe", true), "XXX-XX-6789 /\nXXX-XX-4321", "the record copy masks both"],
    [ssnColumnText("123456789", "987654321", ""), "123-45-6789", "a stray second number is ignored on an individual row"],
    [packSsns("123456789", "987654321"), "123456789|987654321", "both numbers pack into one stored string"],
    [unpackSsns("123456789|987654321").ssn2, "987654321", "the second number unpacks"],
    [unpackSsns("123456789").ssn2, "", "an individual row unpacks with no second number"],
  ];
  for (const [got, want, label] of cases) {
    if (got !== want) throw new Error(`FAIL joint owner: ${label} (got ${JSON.stringify(got)})`);
  }
  console.log("[2553] joint owners: 13 cases correct.");
}

// A first and last name everywhere a name is typed (Adam, 7 Sep 2026).
{
  const { hasFirstAndLast } = await import("../../../lib/personName");
  const cases: [boolean, boolean, string][] = [
    [hasFirstAndLast("Adam"), false, "one word is refused"],
    [hasFirstAndLast("  Adam  "), false, "one word with spaces is refused"],
    [hasFirstAndLast(""), false, "blank is refused"],
    [hasFirstAndLast("Adam Kirwan"), true, "first and last pass"],
    [hasFirstAndLast("Casey Member, Jr."), true, "a suffix passes"],
    [hasFirstAndLast("Bob Jones and Susan Jones, as tenants by the entirety"), true, "a couple's line passes"],
    [hasFirstAndLast("Adam 2"), false, "a digit is not a name"],
    [hasFirstAndLast("José Núñez"), true, "accented letters count"],
  ];
  for (const [got, want, label] of cases) {
    if (got !== want) throw new Error(`FAIL first and last: ${label} (got ${got})`);
  }
  console.log("[names] first and last: 8 cases correct.");
}

// The 2553's phone box and the documents order (Adam, 7 Sep 2026).
{
  const { fmtPhone } = await import("../../../../server/s-election");
  const { sortDocuments } = await import("../../../pages/portal/documentOrder");
  if (fmtPhone("5672109988") !== "(567) 210-9988") throw new Error(`FAIL phone shape: ${fmtPhone("5672109988")}`);
  if (fmtPhone("") !== "") throw new Error("FAIL phone shape: blank stays blank");
  const docs = [
    { kind: "package", title: "S Corporation Election Package (Form 2553) — X", created_at: "2026-09-07" },
    { kind: "package", title: "Partnership Operating Agreement (No. 1) — X", created_at: "2026-09-06" },
    { kind: "package", title: "EIN Confirmation Letter — X", created_at: "2026-09-06" },
    { kind: "psd", title: "Protected Series Designation — PS 1", created_at: "2026-09-05" },
    { kind: "articles", title: "Articles of Organization — X", created_at: "2026-09-05" },
    { kind: "certificate-of-status", title: "Certificate of Status — X", created_at: "2026-09-08" },
  ];
  const order = sortDocuments(docs).map((d) => d.title.split(" ")[0]);
  const want = ["Articles", "Protected", "EIN", "Partnership", "Certificate", "S"];
  if (order.join(",") !== want.join(",")) throw new Error(`FAIL documents order: ${order.join(",")}`);
  console.log("[portal] documents order: Articles, PS Designation, EIN, Operating Agreement, then newest first.");
}

// Run directly (bun run validation.test.ts): exit non-zero on failure. Printing
// a warning and exiting 0 is how a broken fee calculation ships — the run has
// to fail, not merely say something.
if (typeof process !== "undefined" && import.meta.main) {
  process.exit(failed.length === 0 ? 0 : 1);
}

export const validationTestResults = results;
