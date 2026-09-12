/**
 * Adam's example (12 Sep 2026): two owners transfer three rental properties
 * and $50,000 together; property 1 to Series 1, 2 to Series 2, 3 to Series 3;
 * $10,000 to Series 1, $15,000 to Series 2, $25,000 to Series 3.
 */
import { computeCapital } from "./oa-capital";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, got?: unknown): void {
  checks++;
  if (ok) console.log(`✅ ${name}`);
  else { failures++; console.log(`❌ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 300)}` : ""}`); }
}
const owners = ["Adam Kirwan", "Tom Jones"];
const series = ["ACME LLC - PS 1", "ACME LLC - PS 2", "ACME LLC - PS 3"];
const r = computeCapital(
  [
    { description: "123 Main Street, Orlando", kind: "other", value: 200000, contributedBy: { mode: "equal" }, allocatedTo: 0 },
    { description: "456 Oak Avenue, Orlando", kind: "other", value: 250000, contributedBy: { mode: "equal" }, allocatedTo: 1 },
    { description: "789 Pine Road, Orlando", kind: "other", value: 300000, contributedBy: { mode: "equal" }, allocatedTo: 2 },
    { description: "Cash", kind: "cash", value: 50000, contributedBy: { mode: "equal" }, cashAllocations: [10000, 15000, 25000] },
  ],
  owners,
  series,
);
check("no errors on the example", r.errors.length === 0, r.errors);
check("each owner contributed $400,000", r.memberContributions.join("|") === "$400,000|$400,000", r.memberContributions);
check("the assets table names both owners equally", r.assetRows.every((a) => a.by === "Adam Kirwan and Tom Jones, equally"), r.assetRows.map((a) => a.by));
check("the cash row says where it went", r.assetRows[3].to === "ACME LLC - PS 1: $10,000; ACME LLC - PS 2: $15,000; ACME LLC - PS 3: $25,000", r.assetRows[3].to);
check("Series 1 holds property 1 and $10,000, $210,000 in all", r.seriesRows[0].items === "123 Main Street, Orlando ($200,000); Cash ($10,000)" && r.seriesRows[0].total === "$210,000", r.seriesRows[0]);
check("Series 2 totals $265,000 and Series 3 $325,000", r.seriesRows[1].total === "$265,000" && r.seriesRows[2].total === "$325,000", r.seriesRows.map((s) => s.total));
check("the company retains nothing", r.retained === "$0" && r.retainedItems === "None", { retained: r.retained, items: r.retainedItems });

const s = computeCapital(
  [{ description: "Cash", kind: "cash", value: 100000, contributedBy: { mode: "shares", shares: [60, 40] }, cashAllocations: [30000] }],
  owners,
  ["ACME LLC - PS 1"],
);
check("shares of 60 and 40 give $60,000 and $40,000", s.memberContributions.join("|") === "$60,000|$40,000", s.memberContributions);
check("the contributed-by cell shows the shares", s.assetRows[0].by === "Adam Kirwan (60%) and Tom Jones (40%)", s.assetRows[0].by);
check("unallocated cash stays with the company", s.retained === "$70,000" && s.assetRows[0].to === "ACME LLC - PS 1: $30,000; the Company: $70,000", { retained: s.retained, to: s.assetRows[0].to });

const bad = computeCapital(
  [
    { description: "Cash", kind: "cash", value: 1000, contributedBy: { mode: "shares", shares: [60, 50] }, cashAllocations: [5000] },
    { description: "", kind: "other", value: 0, allocatedTo: 7 },
  ],
  owners,
  ["ACME LLC - PS 1"],
);
check("shares that do not total 100 are refused", bad.errors.some((e) => /shares must total 100/.test(e)), bad.errors);
check("cash allocated beyond the amount is refused", bad.errors.some((e) => /exceed the cash contributed/.test(e)), bad.errors);
check("a blank description, no value, and a bad destination are each refused", ["describe the asset", "agreed value", "where the Company allocates"].every((m) => bad.errors.some((e) => e.includes(m))), bad.errors);

const sole = computeCapital([{ description: "Cash", kind: "cash", value: 5000, cashAllocations: [2000] }], ["Casey Gatecheck"], ["X - PS 1"]);
check("a sole owner contributes the whole asset", sole.memberContributions[0] === "$5,000" && sole.assetRows[0].by === "Casey Gatecheck", sole);
check("the single form's list names the series and its assets", sole.singleAllocationList === "X - PS 1: Cash ($2,000)" && sole.retained === "$3,000", sole.singleAllocationList);
const none = computeCapital([], owners, series);
check("no assets means no errors and nothing allocated", none.errors.length === 0 && none.seriesRows.every((r) => r.items === "None") && none.memberContributions.every((m) => m === "$0"), none);
console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
