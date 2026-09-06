// Adam's cases for form2553Timing (6 Sep 2026). Run by `bun run test`; exits
// non-zero on any failure.
import { form2553Deadline, evaluate2553Timing, ORDER_TIME_ACKNOWLEDGMENT } from "./form2553Timing";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.log(`  ❌ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};

// Deadlines — the IRS example first.
const deadlines: [string, string][] = [
  ["2026-01-07", "2026-03-21"],
  ["2026-12-31", "2027-03-15"],
  ["2027-12-31", "2028-03-15"],
  ["2026-03-01", "2026-05-15"],
  ["2026-01-31", "2026-04-14"],
  ["2026-01-30", "2026-04-13"],
  ["2026-12-30", "2027-03-15"],
  ["2026-11-30", "2027-02-13"],
  ["2026-09-05", "2026-11-19"],
  ["2027-01-01", "2027-03-15"],
  ["2028-02-29", "2028-05-13"],
];
for (const [eff, want] of deadlines) eq(form2553Deadline(eff), want, `deadline ${eff}`);

// The gate.
const g1 = evaluate2553Timing({ formationDate: "2026-09-05", today: "2026-09-06" });
eq([g1.status, g1.daysRemaining], ["ok", 74], "formation 2026-09-05, today 2026-09-06 → ok, 74 days");
eq(evaluate2553Timing({ formationDate: "2026-03-01", today: "2026-09-06" }).status, "late", "formation 2026-03-01, today 2026-09-06 → late");
const g3 = evaluate2553Timing({ formationDate: "2026-09-05", today: "2026-11-19" });
eq([g3.status, g3.daysRemaining], ["insufficient", 0], "today 2026-11-19 → insufficient, 0 days");
eq(evaluate2553Timing({ formationDate: "2026-09-05", today: "2026-11-15" }).status, "insufficient", "today 2026-11-15 → insufficient");
eq(evaluate2553Timing({ formationDate: "2026-09-05", today: "2026-11-14" }).status, "ok", "today 2026-11-14 → ok");
eq(evaluate2553Timing({ formationDate: "2026-09-05", today: "2026-11-20" }).status, "late", "today 2026-11-20 → late");
const g7 = evaluate2553Timing({ formationDate: "2025-03-10", effectiveDate: "2027-01-01", today: "2026-09-06" });
eq([g7.status, g7.deadlineDisplay], ["ok", "03/15/2027"], "prospective 2027-01-01 → ok, deadline 03/15/2027");
eq(evaluate2553Timing({ formationDate: "2026-09-05", effectiveDate: "2026-09-01", today: "2026-09-06" }).status, "invalid", "effective before formation → invalid");
for (const bad of ["2026-02-30", "09/05/2026"]) {
  let threw = false;
  try { form2553Deadline(bad); } catch { threw = true; }
  eq(threw, true, `${bad} throws`);
}
eq(g1.acknowledgment?.includes("11/19/2026"), true, "the acknowledgment carries the deadline");
eq(ORDER_TIME_ACKNOWLEDGMENT.includes("no refund"), true, "the order-time acknowledgment says no refund");

console.log(`[2553 timing] ${deadlines.length + 11} cases, ${failed} failures.`);
if (typeof process !== "undefined" && import.meta.main) process.exit(failed === 0 ? 0 : 1);
