/**
 * Replays every recorded fix's assertions that a text search cannot decide
 * (docs/audit/guard.ts replays the rest at every commit):
 *   page     — what a reader sees on a rendered page of the isolated site;
 *   document — the master AND the Word document generated from it;
 *   check    — a named check in the server checks or the browser walk ran and
 *              passed. A label that is missing from the results, or a suite
 *              that did not run, counts as FAILED.
 *
 *   bun run scripts/audit-assert.ts --commit <full> --run <id> [--results file.jsonl]... [--extra assertions.json] [--base-url http://…]
 *
 * Run identity (Codex's review of revision 2, F): --commit and --run are
 * required, and a result counts only if it carries the same commit AND the
 * same run — a result from an earlier run of the same commit is not this
 * run's proof. The suites write both from CHECK_COMMIT and CHECK_RUN_ID.
 *
 * Pages behind a sign-in are not opened here; their fixes are protected by a
 * source assertion or by a named check in the walk.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, loadLedger, activeFix, type Assertion } from "../../docs/audit/ledger-lib";
import { startIsolatedStack, type Stack } from "./isolated-stack";
import { isolateBrowser } from "./browser-isolation";

const args = process.argv.slice(2);
const flag = (name: string): string[] => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const wantCommit = flag("--commit")[0] ?? "";
const wantRun = flag("--run")[0] ?? "";
if (!/^[0-9a-f]{40}$/.test(wantCommit) || wantRun.trim() === "") { console.error("assertions: REFUSED — --commit <full commit> and --run <run identity> are required; a result is proof only for the run and commit it was produced in"); process.exit(1); }

const todo: { name: string; a: Assertion }[] = [];
if (existsSync(join(ROOT, "docs/audit/ledger.json"))) {
  for (const it of loadLedger().items) for (const p of it.parts) {
    const fix = activeFix(p);
    if (!fix) continue;
    for (const a of fix.assertions) todo.push({ name: `item ${it.id}${p.key === "all" ? "" : ` (${p.key})`}`, a });
  }
}
for (const f of flag("--extra")) for (const a of JSON.parse(readFileSync(f, "utf8")) as Assertion[]) todo.push({ name: `extra (${f.split("/").pop()})`, a });

// Results are kept by SUITE and label: a server assertion is not satisfied by
// a walk result that happens to share its label (Codex's review of r1, finding
// 12). `ok` must be the boolean true. A result from any other commit or any
// other run does not count.
const results = new Map<string, boolean[]>();
const resultFiles = flag("--results");
let foreign = 0;
for (const f of resultFiles) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { suite?: string; label: string; ok: unknown; commit?: string | null; run?: string | null };
    if (r.commit !== wantCommit || r.run !== wantRun) { foreign++; continue; }
    const key = `${r.suite ?? "?"}\u0000${r.label}`;
    results.set(key, [...(results.get(key) ?? []), r.ok === true]);
  }
}

const failures: string[] = [];
let outside = new Set<string>();
let ran = 0;

/** The text of a Word document, the way a reader would see it. */
function wordText(path: string): string {
  const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

const pages = todo.filter((t) => t.a.kind === "page");
let stack: Stack | null = null;
try {
  if (pages.length > 0) {
    const given = flag("--base-url")[0];
    if (!given) stack = await startIsolatedStack({ apiPort: 3700 + Math.floor(Math.random() * 200), webPort: 8300 + Math.floor(Math.random() * 200), quiet: true });
    const base = given ?? (stack as Stack).web;
    const browser = await chromium.launch();
    // The page is read offline: nothing but this machine is contacted (scripts/browser-isolation.ts).
    const iso = isolateBrowser(browser);
    const page = await browser.newPage();
    for (const { name, a } of pages) {
      if (a.kind !== "page") continue;
      ran++;
      let text = "";
      try {
        await page.goto(`${base}${a.path}`);
        await page.waitForSelector("main", { timeout: 15000 });
        await page.waitForTimeout(400);
        text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      } catch (e) {
        failures.push(`${name}: the page ${a.path} did not render (${String(e).split("\n")[0]})`);
        continue;
      }
      for (const t of a.present ?? []) if (!text.includes(t.replace(/\s+/g, " "))) failures.push(`${name}: the page ${a.path} does not show "${t.slice(0, 100)}"`);
      for (const t of a.absent ?? []) if (text.includes(t.replace(/\s+/g, " "))) failures.push(`${name}: the page ${a.path} shows "${t.slice(0, 100)}" again`);
    }
    outside = iso.blocked;
    await browser.close();
  }
  for (const { name, a } of todo) {
    if (a.kind === "document") {
      ran++;
      const master = existsSync(join(ROOT, a.master)) ? readFileSync(join(ROOT, a.master), "utf8") : null;
      const wordPath = join(ROOT, "docs/word", a.word);
      if (master === null) { failures.push(`${name}: ${a.master} does not exist`); continue; }
      if (!existsSync(wordPath)) { failures.push(`${name}: the Word document "${a.word}" does not exist`); continue; }
      const word = wordText(wordPath).replace(/\s+/g, " ");
      for (const t of a.masterPresent ?? []) if (!master.includes(t)) failures.push(`${name}: ${a.master} does not say "${t.slice(0, 100)}"`);
      for (const t of a.masterAbsent ?? []) if (master.includes(t)) failures.push(`${name}: ${a.master} says "${t.slice(0, 100)}" again`);
      for (const t of a.wordPresent ?? []) if (!word.includes(t.replace(/\s+/g, " "))) failures.push(`${name}: the Word document "${a.word}" does not say "${t.slice(0, 100)}" — it was not regenerated from its master`);
      for (const t of a.wordAbsent ?? []) if (word.includes(t.replace(/\s+/g, " "))) failures.push(`${name}: the Word document "${a.word}" still says "${t.slice(0, 100)}"`);
    }
    if (a.kind === "check") {
      ran++;
      const got = results.get(`${a.suite}\u0000${a.label}`);
      if (resultFiles.length === 0) failures.push(`${name}: the ${a.suite} check "${a.label}" — no results were supplied, so it did not run; that counts as failed`);
      else if (!got) failures.push(`${name}: the check "${a.label}" is missing from the ${a.suite} results for run ${wantRun} at commit ${wantCommit.slice(0, 7)} — skipped, removed, run by another suite or in another run counts as failed`);
      else if (!got.every(Boolean)) failures.push(`${name}: the ${a.suite} check "${a.label}" ran and FAILED`);
    }
  }
} finally {
  stack?.stop();
}

if (foreign > 0) console.log(`assertions: ${foreign} result line(s) from another commit or run were ignored`);
if (pages.length > 0) console.log(`assertions: requests to other machines stopped in the browser: ${outside.size === 0 ? "none attempted" : [...outside].join(", ")}`);
console.log(`assertions: ${ran} replayed (${pages.length} page, ${todo.filter((t) => t.a.kind === "document").length} document, ${todo.filter((t) => t.a.kind === "check").length} behaviour), ${failures.length} failed`);
if (failures.length > 0) { console.error(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
