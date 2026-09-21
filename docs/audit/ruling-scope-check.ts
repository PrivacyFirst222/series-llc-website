/** B1-N05: a decision on one part must not authorize its sibling.
 * The independent audit's probe recorded a part-a-only ruling and observed
 * waitsA:[], waitsB:[]; the approved correction keeps part b blocked.
 * Exercise the resolver, reader's queue and real authorization command in a
 * disposable clone. No real ledger or owner decision is written. --against
 * runs this same harness against an earlier committed implementation.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Item, Ledger, Part, PartRef, Ruling } from "./ledger-lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "ruling-scope-"));
const repo = join(temp, "repo");
const rows: { name: string; ok: boolean; observed: unknown }[] = [];
const check = (name: string, ok: boolean, observed: unknown) => {
  rows.push({ name, ok, observed });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(observed)}`);
};
const put = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
};
const part = (key: string, waitsOn: string[] = [], canonical?: PartRef): Part => ({
  key, scope: `synthetic ${key}`, status: "open", waitsOn, history: [], ...(canonical ? { canonical } : {}),
});
const item = (id: string, parts: Part[], waitsOn: string[] = []): Item => ({
  id, tag: "SYNTHETIC", area: "Public pages, Terms and Privacy", housekeeping: true,
  source: "B1-N05 disposable regression fixture", text: "Synthetic fixture only.", verdict: "open", waitsOn, parts,
});
const ruling = (id: string, key?: string): Ruling => ({
  date: "2026-09-20", kind: "ruling", item: id, text: "Synthetic owner decision; not a real approval.", ...(key === undefined ? {} : { part: key }),
});

try {
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, repo]);
  execFileSync("git", ["remote", "remove", "origin"], { cwd: repo });
  const at = process.argv.indexOf("--against");
  if (at >= 0) {
    if (!process.argv[at + 1]) throw new Error("--against needs a commit");
    execFileSync("git", ["checkout", "--quiet", "--detach", process.argv[at + 1]], { cwd: repo });
  } else copyFileSync(join(ROOT, "docs/audit/ledger-lib.ts"), join(repo, "docs/audit/ledger-lib.ts"));
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  console.log(`B1-N05 implementation: ${at >= 0 ? base : `working ledger-lib.ts over ${base}`}; synthetic decisions only; no remote or pushes.`);
  const { unmetWaits } = await import(join(repo, "docs/audit/ledger-lib.ts"));
  const { renderRulings } = await import(join(repo, "docs/audit/ledger-print.ts"));
  const own = item("100", [part("alpha"), part("beta")], ["ruling:100"]);
  const alpha = item("101", [part("all", [], { item: "100", part: "alpha" })]);
  const beta = item("102", [part("all", [], { item: "100", part: "beta" })]);
  const chain = item("103", [part("all", [], { item: "101", part: "all" })]);
  const unrelated = item("104", [part("alpha", ["ruling:100"])]);
  const localWait = item("105", [part("alpha", ["ruling:105"]), part("beta", ["ruling:105"])]);
  const l: Ledger = { version: 2, builtFrom: [], items: [own, alpha, beta, chain, unrelated, localWait], rulings: [], batches: [] };
  const expect = (name: string, it: Item, key: string, expected: string[]) => {
    const observed = unmetWaits(l, it, it.parts.find(p => p.key === key)!);
    check(name, JSON.stringify(observed) === JSON.stringify(expected), { expected, actual: observed });
  };
  expect("no decision leaves alpha blocked", own, "alpha", ["ruling:100"]);
  expect("no decision leaves beta blocked", own, "beta", ["ruling:100"]);
  l.rulings = [ruling("100", "alpha")];
  expect("part decision unblocks exact own part", own, "alpha", []);
  expect("part decision does not unblock sibling", own, "beta", ["ruling:100"]);
  expect("main part decision unblocks linked sighting", alpha, "all", []);
  expect("main part decision does not unblock sibling sighting", beta, "all", ["ruling:100"]);
  expect("main part decision unblocks chained sighting", chain, "all", []);
  expect("same part key on unrelated item does not supply dependency scope", unrelated, "alpha", ["ruling:100"]);
  let queue = renderRulings(l);
  const row = queue.split("\n").find((s: string) => s.startsWith("- 100 —"));
  check("ruling queue retains sibling and cross-item wait without approved part", row === "- 100 — unblocks 100 (beta), 102, 104: Synthetic fixture only.", row);
  l.rulings = [ruling("100", "missing")];
  expect("unknown part decision cannot unblock alpha", own, "alpha", ["ruling:100"]);
  l.rulings = [ruling("101", "all")];
  expect("sighting decision cannot satisfy main item's distinct wait", alpha, "all", ["ruling:100"]);
  l.rulings = [ruling("100")];
  for (const [it, key] of [[own, "alpha"], [own, "beta"], [alpha, "all"], [beta, "all"], [unrelated, "alpha"]] as [Item, string][]) {
    expect(`item-wide decision covers ${it.id}:${key}`, it, key, []);
  }
  l.rulings = [ruling("105", "alpha")];
  expect("part-level wait is satisfied for exact part", localWait, "alpha", []);
  expect("part-level sibling wait remains", localWait, "beta", ["ruling:105"]);
  l.rulings = [{ ...ruling("100"), kind: "migration" }];
  expect("migration is not an owner ruling", own, "alpha", ["ruling:100"]);
  l.rulings = [];
  const release = item("106", [part("all", ["100"])]);
  l.items.push(release);
  expect("item release wait remains while all parts are open", release, "all", ["100"]);
  own.parts[0].status = "released";
  expect("item release wait remains with one unreleased part", release, "all", ["100"]);
  own.parts[1].status = "released";
  expect("item release wait ends after all parts release", release, "all", []);
  own.parts.forEach(p => { p.status = "open"; });

  // Actual command path: a wrong scope must fail before writing an assignment.
  const env = { ...process.env, FPSLLC_HOME: join(temp, "synthetic-owner") };
  const cmd = (...args: string[]) => {
    const result = spawnSync(process.execPath, ["run", ...args], { cwd: repo, env, encoding: "utf8" });
    return { code: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  };
  const ledgerPath = join(repo, "docs/audit/ledger.json");
  const authorize = (id: string, key: string) => {
    put(join(repo, "docs/audit/batches", id, "batch.json"), {
      id, revision: 1, title: "Synthetic ruling-scope authorization", model: "fixture", base,
      items: [{ id: "100", part: key, scope: "fixture", assertions: [{ kind: "present", file: "CLAUDE.md", text: "Quote the source" }] }],
      files: [], requiredChecks: [],
    });
    return cmd("docs/audit/batch.ts", "authorize", id);
  };
  l.rulings = [ruling("100", "alpha")];
  put(ledgerPath, l);
  const before = readFileSync(ledgerPath, "utf8");
  const denied = authorize("scope-wrong", "beta");
  check("real authorize refuses sibling on scoped ruling", denied.code !== 0 && denied.output.includes("waits on Adam's ruling on item 100"), denied);
  check("refused authorize writes neither ledger nor revision snapshot", readFileSync(ledgerPath, "utf8") === before && !existsSync(join(repo, "docs/audit/batches/scope-wrong/revisions/r1.json")), { ledgerUnchanged: readFileSync(ledgerPath, "utf8") === before });
  put(ledgerPath, l);
  const allowed = authorize("scope-right", "alpha");
  const assigned = JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger;
  check("real authorize allows exact approved part only", allowed.code === 0 && assigned.items[0].parts[0].status === "assigned" && assigned.items[0].parts[1].status === "open", allowed);
  queue = renderRulings(assigned);
  check("reader still sees sibling ruling after approved part assigned", queue.includes("unblocks 100 (beta), 102, 104:"), queue);

  // Compare every actual part without changing the source ledger. This reports
  // newly blocked work instead of manufacturing a decision to make it pass.
  const current = JSON.parse(readFileSync(join(ROOT, "docs/audit/ledger.json"), "utf8")) as Ledger;
  const changes: { item: string; part: string; before: string[]; after: string[] }[] = [];
  let inspected = 0;
  for (const it of current.items) for (const p of it.parts) {
    inspected++;
    // Pre-fix behavior: any normal ruling for the wait's item satisfies it.
    const oldRulings = current.rulings.map(r => { const copy = { ...r }; delete copy.part; return copy; });
    const old = unmetWaits({ ...current, rulings: oldRulings }, it, p);
    const after = unmetWaits(current, it, p);
    if (JSON.stringify(old) !== JSON.stringify(after)) changes.push({ item: it.id, part: p.key, before: old, after });
  }
  console.log(`CURRENT LEDGER IMPACT ${JSON.stringify({ partsChecked: inspected, changedParts: changes })}`);
  const failures = rows.filter(r => !r.ok);
  console.log(`Ruling scope: ${rows.length - failures.length}/${rows.length} checks passed.`);
  if (failures.length) process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
