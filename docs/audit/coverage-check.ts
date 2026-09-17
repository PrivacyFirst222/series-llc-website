/**
 * The audit's gate (16 Sep 2026, FAILURES.md P86–P87). Reads every reader
 * report under docs/audit/runs/<day>/ and compares it to the inventory. The
 * audit is complete only when every inventory file appears in exactly one
 * report with lines read equal to its line count, and every finding carries
 * its five parts and a severity. Prints the fraction; exits 1 otherwise.
 *
 *   bun run docs/audit/coverage-check.ts [YYYY-MM-DD]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "./inventory";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const day = process.argv[2] ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const dir = join(ROOT, "docs/audit/runs", day);

interface Report {
  files?: { path: string; lines: number }[];
  priorFindings?: { id: string; status: string; evidence: string }[];
  findings?: { where: string; file: string; line: number | string; reads: string; claims: string; truth: string; replacement: string; severity: string }[];
}

const problems: string[] = [];
if (!existsSync(dir)) { console.error(`no run directory ${dir}`); process.exit(1); }
const reports = readdirSync(dir).filter((f) => /^bucket-\d+\.json$/.test(f));
if (reports.length === 0) problems.push("no reader reports found");

const inv = buildInventory();
const expected = new Map(inv.files.map((f) => [f.path, f.lines]));
const seen = new Map<string, { lines: number; report: string }>();
let findings = 0;
let priors = 0;
for (const name of reports) {
  let r: Report;
  try { r = JSON.parse(readFileSync(join(dir, name), "utf8")) as Report; }
  catch (e) { problems.push(`${name}: not valid JSON (${String(e)})`); continue; }
  for (const f of r.files ?? []) {
    const p = f.path.replace(/^\.?\//, "");
    if (!expected.has(p)) { problems.push(`${name}: ${p} is not in the inventory`); continue; }
    if (seen.has(p)) problems.push(`${name}: ${p} also read by ${seen.get(p)?.report}`);
    seen.set(p, { lines: Number(f.lines), report: name });
    if (Number(f.lines) < (expected.get(p) ?? 0)) problems.push(`${name}: ${p} read ${f.lines} of ${expected.get(p)} lines`);
  }
  for (const [i, x] of (r.findings ?? []).entries()) {
    findings += 1;
    for (const k of ["where", "file", "line", "reads", "claims", "truth", "replacement", "severity"] as const) {
      if (x[k] === undefined || x[k] === null || String(x[k]).trim() === "") problems.push(`${name}: finding ${i + 1} lacks "${k}"`);
    }
    if (x.severity && !["substantive", "wording", "housekeeping"].includes(String(x.severity))) problems.push(`${name}: finding ${i + 1} severity "${x.severity}" is not substantive/wording/housekeeping`);
    if (x.file && !expected.has(String(x.file).replace(/^\.?\//, ""))) problems.push(`${name}: finding ${i + 1} names ${x.file}, which is not in the inventory`);
  }
  for (const p of r.priorFindings ?? []) {
    priors += 1;
    if (!["fixed", "still open", "regressed", "not in my bucket"].includes(p.status)) problems.push(`${name}: prior ${p.id} status "${p.status}" is not fixed/still open/regressed`);
  }
}
const missing = inv.files.filter((f) => !seen.has(f.path));
for (const f of missing) problems.push(`not read by any reader: ${f.path} (${f.lines} lines)`);

const linesRead = inv.files.reduce((s, f) => s + Math.min(seen.get(f.path)?.lines ?? 0, f.lines), 0);
const totalLines = inv.files.reduce((s, f) => s + f.lines, 0);
console.log(`${inv.files.length - missing.length} of ${inv.files.length} files, ${linesRead} of ${totalLines} lines read; ${reports.length} reports, ${findings} findings, ${priors} prior items re-verified`);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) — the audit is NOT complete:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("coverage check passed");
