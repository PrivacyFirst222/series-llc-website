/**
 * The demonstrations batch zero owes. A valid authorized change must PASS and
 * each planted fault must FAIL for its own stated reason.
 *
 * Revision 2 (17 Sep 2026): Codex's review of revision 1 reproduced failures
 * these rows had not tried, because they were written after the code and from
 * the code. Every one of Codex's reproductions is now a row (C1–C20). They
 * were written BEFORE the fixes and run against revision 1, where they had to
 * come out NOT AS REQUIRED (evidence/red-before-revision-2.md), and again
 * after (evidence/demo.md).
 *
 * How a row is measured is stated on the row, and nothing else is shown:
 *   exit      — the real exit code of the real command;
 *   parsed    — read from a command's output or from the files it left; no
 *               exit code is shown, because the row has none of its own;
 *   simulated — the review package's check results are fixtures written by
 *               this script, so the row proves the gate's branching, not
 *               that those checks ran.
 *
 * All of it runs in a DISPOSABLE COPY with a throwaway remote, a fake Dropbox
 * folder and a SIMULATED acceptance file (FPSLLC_HOME). Setup commits use
 * --no-verify (the copy has no installed packages for lint and typecheck),
 * and ONE setup push — creating the throwaway remote — uses --no-verify.
 * Every other push goes through the real push hook; the guard is run exactly
 * as the commit step runs it.
 *
 *   bun run docs/audit/demo.ts [--with-behaviour] [--out red-before-revision-2.md]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "./ledger-lib";

const tmp = mkdtempSync(join(tmpdir(), "fix-ledger-demo-"));
const COPY = join(tmp, "copy"), REMOTE = join(tmp, "remote.git"), HOME = join(tmp, "home"), FAKEBOX = join(tmp, "fake-dropbox");
const env: Record<string, string> = { ...(process.env as Record<string, string>), FPSLLC_HOME: HOME, FPSLLC_DROPBOX: FAKEBOX, CLAUDE_PROJECT_DIR: COPY, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@example.com" };
const S = "Drawn from real client questions about Florida's Protected Series LLC statute.";
const T = "The questions people ask before forming a Florida Protected Series LLC, answered.";
const FAQ = "webapp/src/pages/FAQ.tsx", CONTACT = "webapp/src/pages/Contact.tsx", HOW = "webapp/src/pages/HowItWorks.tsx", E2E = "webapp/server/e2e.ts";
const outName = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "demo.md";

type Kind = "exit" | "parsed" | "simulated";
const rows: { n: string; what: string; expect: string; kind: Kind; exit: number | null; line: string; ok: boolean }[] = [];
const sh = (cmd: string, args: string[], cwd = COPY, extraEnv: Record<string, string> = {}): { code: number; out: string } => {
  const r = spawnSync(cmd, args, { cwd, env: { ...env, ...extraEnv }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const g = (...args: string[]) => { const r = sh("git", args); if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.out}`); return r.out.trim(); };
const guard = (...a: string[]) => sh("bun", ["run", "docs/audit/guard.ts", ...(a.length ? a : ["--staged"])]);
const batchCmd = (...a: string[]) => sh("bun", ["run", "docs/audit/batch.ts", ...a]);
const edit = (file: string, from: string, to: string) => { const p = join(COPY, file); const s = readFileSync(p, "utf8"); if (!s.includes(from)) throw new Error(`${file} lacks: ${from}`); writeFileSync(p, s.split(from).join(to)); };
const reset = (to?: string) => { g("reset", "-q", "--hard", ...(to ? [to] : [])); g("clean", "-fdq"); };
const commit = (msg: string) => { g("add", "-A"); g("commit", "-q", "--no-verify", "-m", msg); return g("rev-parse", "HEAD"); };

/** A real command: passes on exit 0; a fault must exit non-zero AND print its reason. */
function record(n: string, what: string, r: { code: number; out: string }, want: "pass" | RegExp, kind: Kind = "exit") {
  const passWanted = want === "pass";
  const line = passWanted ? (r.out.trim().split("\n").filter((l) => /ok|passed|accepted|records only|authorized|recorded|nothing to write/.test(l)).pop() ?? r.out.trim().split("\n").pop() ?? "") : (r.out.split("\n").find((l) => (want as RegExp).test(l)) ?? "");
  const ok = passWanted ? r.code === 0 : r.code !== 0 && line !== "";
  rows.push({ n, what, expect: passWanted ? "passes" : `refused, saying: ${String(want)}`, kind, exit: r.code, line: (ok ? line : line || r.out.trim().split("\n").slice(-2).join(" / ")).trim().slice(0, 420), ok });
  console.log(`${ok ? "✅" : "❌"} ${n} ${what}`);
}
/** Something read from output or files: no exit code belongs to this row. */
function parsed(n: string, what: string, expect: string, ok: boolean, line: string) {
  rows.push({ n, what, expect, kind: "parsed", exit: null, line: line.trim().slice(0, 420), ok });
  console.log(`${ok ? "✅" : "❌"} ${n} ${what}`);
}
const tryRow = (n: string, what: string, f: () => void, back?: () => void) => { try { f(); } catch (e) { parsed(n, what, "the scenario can be set up at all", false, `could not be set up: ${String(e).split("\n")[0]}`); } finally { try { back?.(); } catch { /* keep going */ } } };

/* ---- the disposable copy: the committed tree plus this working tree ---- */
execFileSync("git", ["clone", "-q", ROOT, COPY]);
const dirty = execFileSync("git", ["ls-files", "-m", "-o", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").concat(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" }).split("\n")).filter(Boolean);
for (const f of new Set(dirty)) { if (!existsSync(join(ROOT, f))) continue; mkdirSync(dirname(join(COPY, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(COPY, f)); }
execFileSync("git", ["init", "-q", "--bare", REMOTE]);
mkdirSync(FAKEBOX, { recursive: true });
g("remote", "remove", "origin"); g("remote", "add", "origin", REMOTE); g("config", "core.hooksPath", ".githooks");
g("checkout", "-q", "-B", "main");
appendFileSync(join(COPY, CONTACT), `\n// demo: ${S}\n`); // the same defect, seen in a second file
commit("baseline for the demonstrations");
g("push", "-q", "--no-verify", "origin", "main"); // THE ONE setup push made without the hook: it creates the throwaway remote

const CHECKS = ["typecheck", "lint", "unit", "facts", "guard", "documents", "server", "walk", "assertions"];
const mkBatch = (id: string, items: unknown[], files: unknown[], extra: Record<string, unknown> = {}) => {
  const b = { id, revision: 1, title: `Demonstration batch ${id}`, model: "demo", base: g("rev-parse", "HEAD"), items, files, requiredChecks: CHECKS, ...extra };
  mkdirSync(join(COPY, `docs/audit/batches/${id}`), { recursive: true });
  writeFileSync(join(COPY, `docs/audit/batches/${id}/batch.json`), JSON.stringify(b, null, 2) + "\n");
  return b;
};
const batch = mkBatch("demo", [{ id: "1", part: "all", scope: "Replace the FAQ page's 'real client questions' sentence, everywhere it appears.", assertions: [
  { kind: "replace", file: FAQ, before: S, after: T },
  { kind: "replace", file: CONTACT, before: `// demo: ${S}`, after: `// demo: ${T}` },
] }], [{ path: FAQ, mode: "replace", why: "the sentence" }, { path: CONTACT, mode: "replace", why: "its second copy" }]);
const BATCH = join(COPY, "docs/audit/batches/demo/batch.json");
const keepDemo = () => { reset(); mkdirSync(dirname(BATCH), { recursive: true }); writeFileSync(BATCH, JSON.stringify(batch, null, 2) + "\n"); };

/* ---- before Go: what cannot even be authorized ---- */
mkBatch("waits", [{ id: "12", part: "all", scope: "an item that waits on Adam's ruling", assertions: [{ kind: "absent", text: "x" }] }], []);
record("1", "an item that waits on Adam's ruling cannot be put in a batch", batchCmd("authorize", "waits"), /waits on Adam's ruling on item 12/);
keepDemo();
mkBatch("wrongwords", [{ id: "1", part: "all", scope: "x", assertions: [{ kind: "replace", file: FAQ, before: "Drawn from real customer questions.", after: T }] }], []);
record("2", "a 'before' sentence that is not in the file, word for word, cannot be authorized", batchCmd("authorize", "wrongwords"), /must be proven present/);
keepDemo();
mkBatch("c13", [{ id: "28", part: "all", scope: "Terms 9(g): its own note says Adam decides", assertions: [{ kind: "absent", text: "x" }] }], []);
record("C13", "Codex 10: an item whose own note says Adam decides (item 28) cannot be put in a batch", batchCmd("authorize", "c13"), /waits on Adam's ruling/);
keepDemo();

record("3", "the valid batch is authorized: frozen and assigned", batchCmd("authorize", "demo"), "pass");
commit("authorize batch demo (records only)");
record("4", "a push made only of record files needs no acceptance", sh("git", ["push", "origin", "main"]), "pass");
const B1 = g("rev-parse", "HEAD");

mkBatch("second", batch.items, batch.files);
record("5", "a second batch cannot claim an item already assigned", batchCmd("authorize", "second"), /cannot be claimed twice|already (claimed|assigned)/);
reset();

tryRow("C12", "Codex 9: a main record and its second sighting cannot go to two batches", () => {
  mkBatch("one", [{ id: "127", part: "all", scope: "the label table", assertions: [{ kind: "absent", text: "zzz-demo-127" }] }], []);
  const a = batchCmd("authorize", "one");
  if (a.code !== 0) throw new Error(a.out);
  mkBatch("two", [{ id: "228", part: "all", scope: "the same label table, seen in the server file", assertions: [{ kind: "absent", text: "zzz-demo-228" }] }], []);
  record("C12", "Codex 9: a main record (127) and its second sighting (228) cannot go to two batches", batchCmd("authorize", "two"), /same defect/);
}, () => reset());

tryRow("C2", "Codex 1: an authorized batch's required checks trimmed in a 'records only' push", () => {
  const b = JSON.parse(readFileSync(BATCH, "utf8")); b.requiredChecks = ["typecheck"]; writeFileSync(BATCH, JSON.stringify(b, null, 2) + "\n");
  commit("trim the batch's required checks (records only)");
  record("C2", "Codex 1: an authorized batch's required checks trimmed in a 'records only' push", sh("git", ["push", "origin", "main"]), /batch demo.*(changed|frozen|revision)/);
}, () => { reset(B1); g("push", "-q", "--no-verify", "--force", "origin", "main"); });

tryRow("C11", "Codex 8: a work order shows that Codex rejected the proposed replacement", () => {
  mkBatch("w39", [{ id: "39", part: "all", scope: "the FAQ's S election sentence", assertions: [{ kind: "absent", text: "zzz" }] }], []);
  const o = sh("bun", ["run", "docs/audit/ledger-print.ts", "order", "w39"]);
  const hit = o.out.split("\n").find((l) => /Codex rejected the proposed replacement/i.test(l)) ?? "";
  parsed("C11", "Codex 8: the work order for item 39 says Codex rejected the proposed replacement, with its correction", "a line saying so, carrying Codex's note about the 65 days", hit !== "" && /65/.test(hit), hit || "(the work order does not mention it)");
}, () => reset());

/* ---- on the batch branch: planted faults, each reset afterwards ---- */
g("checkout", "-q", "-b", "audit/batch-demo");
const applyBoth = () => { edit(FAQ, S, T); edit(CONTACT, `// demo: ${S}`, `// demo: ${T}`); };

applyBoth(); edit(FAQ, "Questions, answered", "Questions and answers"); g("add", "-A");
record("6", "an unrelated edit INSIDE a declared wording file", guard(), /differs from what the declared replacements produce/);
reset();
applyBoth(); edit(HOW, "It saves as you go", "It saves as you type"); g("add", "-A");
record("7", "an edit to a file the batch did not declare", guard(), /HowItWorks\.tsx: changed, but batch demo does not declare it/);
reset();
applyBoth(); edit(E2E, 'check("the client signs in"', '// check("the client signs in"'); g("add", "-A");
record("8", "an edit to the check suite, which the batch did not declare", guard(), /e2e\.ts: changed, but batch demo does not declare it/);
reset();
applyBoth(); writeFileSync(BATCH, JSON.stringify({ ...batch, items: [{ ...(batch.items[0] as Record<string, unknown>), assertions: [{ kind: "replace", file: FAQ, before: S, after: `${T} (edited after Go)` }] }] }, null, 2)); g("add", "-A");
record("9", "the batch file changed after Go", guard(), /not the one frozen at Go/);
reset();
edit(FAQ, S, T); batchCmd("implemented", "demo"); g("add", "-A");
record("10", "a missed copy: one place fixed, the second left", guard(), /retired wording is back in webapp\/src\/pages\/Contact\.tsx/);
reset();
tryRow("C16", "Codex 14: a new file nobody staged", () => {
  applyBoth(); writeFileSync(join(COPY, "webapp/src/pages/Extra.tsx"), "export default function Extra() { return null; }\n");
  record("C16", "Codex 14: a new, unstaged file on the batch branch (the guard run on the working tree)", guard("--working-tree"), /Extra\.tsx/);
}, () => reset());
tryRow("C1a", "Codex 1: the ledger deleted", () => {
  g("rm", "-q", "docs/audit/ledger.json");
  record("C1a", "Codex 1: the ledger deleted — the commit guard", guard(), /ledger.*(missing|deleted|removed|gone)/i);
}, () => reset());

applyBoth(); batchCmd("implemented", "demo"); g("add", "-A");
record("11", "THE VALID CHANGE: both declared replacements, nothing else", guard(), "pass");
g("commit", "-q", "--no-verify", "-m", "batch demo: the FAQ sentence, both places");
const X = g("rev-parse", "HEAD");

/* ---- release: the push hook. Package check results below are FIXTURES. ---- */
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const diffOf = (a: string, b: string) => execFileSync("git", ["diff", "--no-renames", a, b], { cwd: COPY, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
type Chk = { name: string; command: string; exit: number | null; skipped: boolean; log: string };
const ALLNAMES = [...CHECKS, "dropbox-unchanged", "checkout-unchanged"];
const pkg = (id: string, c: string, base: string, mutate: (c: Chk[]) => Chk[] = (x) => x, names = ALLNAMES) => {
  for (const d of [join(HOME, "reviews", `${id}-r1-${c.slice(0, 7)}`), join(HOME, "reviews", `${id}-r1-${c}`)]) {
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "package.json"), JSON.stringify({ batch: id, revision: 1, base, commit: c, diffSha: sha(diffOf(base, c)), createdAt: new Date().toISOString(), required: names, checks: mutate(names.map((name) => ({ name, command: "(fixture written by the demonstration)", exit: 0, skipped: false, log: "" }))), docs: [] }, null, 2));
  }
};
const accept = (id: string, c: string) => sh("bun", ["run", "docs/audit/accept.ts", "accept", id, "1", c]);
const remoteMain = () => execFileSync("git", ["rev-parse", "main"], { cwd: REMOTE, encoding: "utf8" }).trim();

g("checkout", "-q", "main"); g("merge", "-q", "--ff-only", "audit/batch-demo");
record("12", "release with NO acceptance from Adam", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
parsed("12a", "…and the remote is unchanged by the refused push", `remote main is still ${B1.slice(0, 7)}`, remoteMain() === B1, `remote main = ${remoteMain().slice(0, 7)}`);

pkg("demo", X, B1); accept("demo", X.slice(0, 7));
{ const rec = existsSync(join(HOME, "acceptances.jsonl")) ? readFileSync(join(HOME, "acceptances.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).pop() : null; parsed("C19", "Codex 18: Adam types a short commit; the acceptance is stored as the one full commit it names", "a 40-character commit in the record", String(rec?.commit ?? "").length === 40, `recorded commit: ${rec?.commit}`); }
pkg("demo", X, B1, (c) => c.filter((x) => x.name !== "walk"));
record("13", "accepted, but a required check never ran", sh("git", ["push", "origin", "main"]), /required check "walk" did not run for this commit — missing counts as failed/, "simulated");
pkg("demo", X, B1, (c) => c.map((x) => (x.name === "walk" ? { ...x, skipped: true } : x)));
record("14", "accepted, but a required check was skipped", sh("git", ["push", "origin", "main"]), /required check "walk" was skipped — skipped counts as failed/, "simulated");
pkg("demo", X, B1, (c) => c.map((x) => (x.name === "server" ? { ...x, exit: 1 } : x)));
record("15", "accepted, but a required check failed", sh("git", ["push", "origin", "main"]), /required check "server" failed/, "simulated");
pkg("demo", X, B1);

edit(FAQ, T, `${T} `); commit("a change made after Adam accepted");
record("16", "a change AFTER acceptance voids it", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
reset(X);

g("reset", "-q", "--hard", B1); edit(HOW, "It saves as you go", "It saves as you type");
const U = commit("an earlier change nobody reviewed"); g("cherry-pick", "--no-edit", X); const X2 = g("rev-parse", "HEAD");
for (const d of [X2.slice(0, 7), X2]) { mkdirSync(join(HOME, "reviews", `demo-r1-${d}`), { recursive: true }); writeFileSync(join(HOME, "reviews", `demo-r1-${d}`, "package.json"), JSON.stringify({ batch: "demo", revision: 1, base: U, commit: X2, diffSha: sha(diffOf(U, X2)), createdAt: new Date().toISOString(), required: ALLNAMES, checks: ALLNAMES.map((name) => ({ name, command: "(fixture)", exit: 0, skipped: false, log: "" })), docs: [] })); }
accept("demo", X2);
record("17", "an earlier, unreviewed commit riding along with an accepted one", sh("git", ["push", "origin", "main"]), /main has moved, or other commits would ride along/, "simulated");
reset(X);

record("18", "THE VALID RELEASE: accepted commit, complete package, nothing riding along. The package's checks are fixtures and it lists no documents, so this proves the gate's branching — not that checks ran or documents matched", sh("git", ["push", "origin", "main"]), "pass", "simulated");
parsed("18a", "…and only now is the remote at the accepted commit", `remote main is ${X.slice(0, 7)}`, remoteMain() === X, `remote main = ${remoteMain().slice(0, 7)}`);

tryRow("C18", "Codex 16: recording a release after Adam rejected it", () => {
  const before = readFileSync(join(HOME, "acceptances.jsonl"), "utf8");
  sh("bun", ["run", "docs/audit/accept.ts", "reject", "demo", "1", "changed my mind"]);
  record("C18", "Codex 16: Adam accepted, then rejected; the release cannot be recorded", batchCmd("released", "demo", X), /rejected/);
  writeFileSync(join(HOME, "acceptances.jsonl"), before);
}, () => reset());
record("19", "the release is recorded against Adam's acceptance", batchCmd("released", "demo", X), "pass");
edit(HOW, "It saves as you go", "It saves as you type"); commit("records, with a page change slipped in");
record("20", "a 'records' push that also touches a page", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
g("reset", "-q", "--soft", "HEAD~1"); g("restore", "--staged", HOW); g("checkout", "--", HOW); commit("record the release (records only)");
record("21", "the same push without the page change", sh("git", ["push", "origin", "main"]), "pass");
const R = g("rev-parse", "HEAD");

edit(FAQ, T, S); g("add", "-A");
record("22", "a LATER change restores the defect", guard(), /item 1: (the fixed wording is gone|retired wording is back)/);
reset();
type L = { items: { id: string; parts: { fix: { assertions: unknown[] }; history: unknown[] }[] }[]; rulings: unknown[]; batches: { id: string; history: unknown[] }[] };
const ledgerEdit = (f: (l: L) => void) => { const p = join(COPY, "docs/audit/ledger.json"); const l = JSON.parse(readFileSync(p, "utf8")) as L; f(l); writeFileSync(p, JSON.stringify(l, null, 2) + "\n"); sh("bun", ["run", "docs/audit/ledger-print.ts", "list"]); };
ledgerEdit((l) => { const part = l.items.find((i) => i.id === "1")!.parts[0]; part.fix.assertions = [part.fix.assertions[0]]; }); g("add", "-A");
record("23", "an accepted fix's protection quietly removed from the ledger", guard(), /an accepted fix's assertions changed/);
reset();
tryRow("C3", "Codex 1: protection removed behind a new ruling line", () => {
  ledgerEdit((l) => { const part = l.items.find((i) => i.id === "1")!.parts[0]; part.fix.assertions = [part.fix.assertions[0]]; l.rulings.push({ date: "2026-09-17", item: "1", text: "an ordinary ruling line" }); });
  commit("remove a fix's protection behind a ruling line (records only)");
  record("C3", "Codex 1: an accepted fix's protection removed behind a new ruling line, in a 'records only' push", sh("git", ["push", "origin", "main"]), /accepted fix's assertions changed|no acceptance from Adam/);
}, () => reset(R));
tryRow("C4", "Codex 1: batch history erased", () => {
  ledgerEdit((l) => { l.batches.find((b) => b.id === "demo")!.history = []; });
  commit("erase a batch's history (records only)");
  record("C4", "Codex 1: a batch's history erased in a 'records only' push", sh("git", ["push", "origin", "main"]), /history/);
}, () => reset(R));
tryRow("C1b", "Codex 1: the ledger deleted, pushed", () => {
  g("rm", "-q", "docs/audit/ledger.json"); g("commit", "-q", "--no-verify", "-m", "delete the ledger (records only)");
  record("C1b", "Codex 1: the ledger deleted — the release gate", sh("git", ["push", "origin", "main"]), /ledger.*(missing|deleted|removed|gone)/i);
}, () => reset(R));
if (remoteMain() !== R) { g("push", "-q", "--no-verify", "--force", "origin", "main"); } // put the throwaway remote back if a faulty gate let something through

tryRow("C8", "Codex 5: a batch that requires no checks at all", () => {
  mkBatch("lazy", [{ id: "3", part: "all", scope: "demo", assertions: [{ kind: "present", file: HOW, text: "It saves as you type" }] }], [{ path: HOW, mode: "code", why: "demo" }], { requiredChecks: [] });
  if (batchCmd("authorize", "lazy").code !== 0) throw new Error("authorize failed");
  const A = commit("authorize lazy (records only)"); g("push", "-q", "origin", "main");
  g("checkout", "-q", "-b", "audit/batch-lazy"); edit(HOW, "It saves as you go", "It saves as you type"); batchCmd("implemented", "lazy");
  const Lz = commit("batch lazy"); g("checkout", "-q", "main"); g("merge", "-q", "--ff-only", "audit/batch-lazy");
  pkg("lazy", Lz, A, (c) => c, ["dropbox-unchanged"]); accept("lazy", Lz);
  record("C8", "Codex 5: a batch that lists NO required checks, with a package holding only the Dropbox comparison", sh("git", ["push", "origin", "main"]), /required check "(guard|assertions|typecheck)" did not run/, "simulated");
}, () => { reset(R); sh("git", ["branch", "-q", "-D", "audit/batch-lazy"]); g("push", "-q", "--no-verify", "--force", "origin", "main"); });

tryRow("C17", "Codex 15: a permitted leftover beside a live one", () => {
  mkBatch("allow", [{ id: "7", part: "all", scope: "a retired promise that may remain, inside a historical quotation only", assertions: [{ kind: "absent", text: "PROMISE-XYZ", allow: [{ file: HOW, count: 2, context: "// historical quotation: PROMISE-XYZ" }] }] }], [{ path: HOW, mode: "code", why: "demo" }]);
  if (batchCmd("authorize", "allow").code !== 0) throw new Error("authorize failed");
  commit("authorize allow"); g("checkout", "-q", "-b", "audit/batch-allow");
  appendFileSync(join(COPY, HOW), "\n// historical quotation: PROMISE-XYZ\n// live: PROMISE-XYZ is guaranteed\n");
  batchCmd("implemented", "allow"); g("add", "-A");
  record("C17", "Codex 15: one permitted quotation plus one LIVE use of the retired words, under an allowance of two", guard(), /retired wording is back/);
}, () => { reset(); g("checkout", "-q", "main"); reset(R); sh("git", ["branch", "-q", "-D", "audit/batch-allow"]); });

tryRow("C20", "Codex 19: a check disabled inside a DECLARED check file", () => {
  mkBatch("quiet", [{ id: "3", part: "all", scope: "demo", assertions: [{ kind: "present", file: E2E, text: "the client signs in" }] }], [{ path: E2E, mode: "code", control: true, why: "declared, so the file itself is in scope" }]);
  if (batchCmd("authorize", "quiet").code !== 0) throw new Error("authorize failed");
  commit("authorize quiet"); g("checkout", "-q", "-b", "audit/batch-quiet");
  edit(E2E, 'check("the client signs in"', '// check("the client signs in"'); batchCmd("implemented", "quiet"); g("add", "-A");
  record("C20", "Codex 19: a check commented out inside a check file the batch DID declare", guard(), /check.*(removed|fewer|disappeared)/i);
}, () => { reset(); g("checkout", "-q", "main"); reset(R); sh("git", ["branch", "-q", "-D", "audit/batch-quiet"]); });

tryRow("C5", "Codex 2: conditional words recorded as acceptance", () => {
  const H = join(tmp, "hookhome"); pkg("demo", X, B1);
  for (const d of readdirSync(join(HOME, "reviews"))) { mkdirSync(join(H, "reviews", d), { recursive: true }); copyFileSync(join(HOME, "reviews", d, "package.json"), join(H, "reviews", d, "package.json")); }
  const say = (m: string) => spawnSync(join(COPY, ".claude/hooks/accept-prompt.sh"), [], { input: JSON.stringify({ prompt: m }), env: { ...env, FPSLLC_HOME: H }, encoding: "utf8" });
  const count = () => (existsSync(join(H, "acceptances.jsonl")) ? readFileSync(join(H, "acceptances.jsonl"), "utf8").trim().split("\n").filter(Boolean).length : 0);
  say(`Accept demo, revision 1, ${X.slice(0, 7)} only if Codex finds no problems. Do not release yet.`);
  say(`Accept demo, revision 1, ${X.slice(0, 7)} is the command I would use; I am not accepting it.`);
  const n1 = count();
  say(`Accept demo, revision 1, ${X.slice(0, 7)}. Go`);
  parsed("C5", "Codex 2: its two conditional sentences record nothing; the exact sentence records one acceptance", "0 records after the two conditional sentences, 1 after the exact one", n1 === 0 && count() === 1, `records after the conditional sentences: ${n1}; after the exact sentence: ${count()}`);
});

tryRow("C6", "Codex 3: publishing Word documents with no acceptance", () => {
  const H = join(tmp, "nohome");
  const listing = () => readdirSync(FAKEBOX).map((f) => `${f}:${sha(readFileSync(join(FAKEBOX, f)))}:${statSync(join(FAKEBOX, f)).mtimeMs}`).sort().join("|");
  record("C6a", "Codex 3: the Dropbox publisher with NO acceptance on file and an empty destination", sh("bun", ["run", "docs/audit/publish-docs.ts"], COPY, { FPSLLC_HOME: H }), /REFUSED/);
  parsed("C6b", "…and it wrote nothing to the (fake) Dropbox folder", "0 files", readdirSync(FAKEBOX).length === 0, `${readdirSync(FAKEBOX).length} file(s) in the fake Dropbox folder`);
  for (const f of readdirSync(FAKEBOX)) rmSync(join(FAKEBOX, f));
  for (const f of readdirSync(join(COPY, "docs/word")).filter((x) => x.endsWith(".docx"))) copyFileSync(join(COPY, "docs/word", f), join(FAKEBOX, f));
  const before = listing();
  const r = sh("bun", ["run", "docs/audit/publish-docs.ts"], COPY, { FPSLLC_HOME: H });
  parsed("C6c", "when the destination already holds exactly these documents, nothing is written", "exit 0, 'nothing to write', every file's content and time unchanged", r.code === 0 && /nothing to write/.test(r.out) && before === listing(), (r.out.trim().split("\n").pop() ?? "") + (before === listing() ? " — files untouched" : " — FILES CHANGED"));
}, () => { for (const f of readdirSync(FAKEBOX)) rmSync(join(FAKEBOX, f)); });

tryRow("C9", "Codex 6: another server already on the port", () => {
  const runner = join(tmp, "stale.ts");
  writeFileSync(runner, `import { startIsolatedStack } from ${JSON.stringify(join(COPY, "webapp/scripts/isolated-stack.ts"))};
const fake = Bun.serve({ port: 0, fetch: (req) => new URL(req.url).pathname === "/api/health" ? new Response("{}") : Response.json({ data: { offline: true, externals: {}, note: "WRONG SERVER" } }) });
try { const s = await startIsolatedStack({ apiPort: fake.port, webPort: 0, apiOnly: true, quiet: true, cwd: ${JSON.stringify(join(COPY, "webapp"))} }); s.stop(); console.log("ACCEPTED the server that was already there"); fake.stop(true); process.exit(0); }
catch (e) { console.log(String(e).split("\\n")[0]); fake.stop(true); process.exit(1); }
`);
  record("C9", "Codex 6: an unrelated server is already listening on the port the review API was told to use", sh("bun", ["run", runner], tmp), /not the process|did not start|exited|does not own/i);
});

{ const files = ["docs/audit/README.md", "docs/audit/release-check.ts", "docs/audit/batches/0/batch.md", ".github/workflows/check.yml", "docs/audit/ledger-lib.ts", "docs/audit/guard.ts"];
  const hits = sh("grep", ["-rniE", "shows up red|shows up here|Detection, not prevention|detection afterwards|bypass shows", ...files]).out.trim();
  parsed("C7", "Codex 4: the claim that the GitHub check catches an unaccepted release is gone from every file that made it", "no such sentence in the manual, the gate, the batch summary, the workflow or the guard", hits === "", hits === "" ? "no file makes the claim" : hits.split("\n").slice(0, 3).join(" ; ")); }

/* ---- a behaviour fix: its check must FAIL on the tree before the fix ---- */
if (process.argv.includes("--with-behaviour")) {
  execFileSync("ln", ["-s", join(ROOT, "webapp/node_modules"), join(COPY, "webapp/node_modules")]);
  tryRow("C14", "Codex 12: a server assertion satisfied by a walk result", () => {
    const a = join(tmp, "wrong-suite.json"), res = join(tmp, "walk-only.jsonl");
    writeFileSync(a, JSON.stringify([{ kind: "check", suite: "server", label: "a label that exists only in the walk" }]));
    writeFileSync(res, JSON.stringify({ suite: "walk", label: "a label that exists only in the walk", ok: true, run: "demo", commit: R }) + "\n");
    record("C14", "Codex 12: a SERVER assertion, when only a WALK result carries that label", sh("bun", ["run", "scripts/audit-assert.ts", "--results", res, "--extra", a], join(COPY, "webapp")), /missing from the server results/);
  });
  const PROVEN = "demo: the health report carries the planted field", UNPROVEN = "fresh database: server boots";
  mkBatch("bug", [{ id: "24", part: "all", scope: "A planted behaviour defect: the health report lacks a field.", assertions: [{ kind: "check", suite: "server", label: PROVEN }, { kind: "check", suite: "server", label: UNPROVEN }] }],
    [{ path: "webapp/server/routes-payments.ts", mode: "code", why: "the planted fix" }, { path: E2E, mode: "code", control: true, why: "the check that proves it" }, { path: "webapp/server/e2e-demo-helper.ts", mode: "new", control: true, why: "a new helper the new check imports" }, { path: "webapp/api/index.mjs", mode: "generated", why: "rebuilt bundle" }],
    { testSupport: ["webapp/server/e2e-demo-helper.ts"] });
  batchCmd("authorize", "bug"); commit("authorize batch bug (records only)"); g("push", "-q", "origin", "main");
  g("checkout", "-q", "-b", "audit/batch-bug");
  edit("webapp/server/routes-payments.ts", "return c.json({ data: { ok: ordering, database: true, ordering } }", "return c.json({ data: { ok: ordering, database: true, ordering, ledgerDemo: true } }");
  writeFileSync(join(COPY, "webapp/server/e2e-demo-helper.ts"), "export const planted = (body: unknown): boolean => (body as { data?: { ledgerDemo?: boolean } } | null)?.data?.ledgerDemo === true;\n");
  edit(E2E, "const testEmail =", `check(${JSON.stringify(PROVEN)}, planted(await fetch(BASE + "/api/health").then((r) => r.json()).catch(() => null)));\nconst testEmail =`);
  edit(E2E, 'import { writeFileSync, appendFileSync } from "node:fs";', 'import { writeFileSync, appendFileSync } from "node:fs";\nimport { planted } from "./e2e-demo-helper";');
  batchCmd("implemented", "bug"); g("add", "-A");
  record("24", "a behaviour fix inside its declared files", guard(), "pass");
  g("commit", "-q", "--no-verify", "-m", "batch bug: the planted behaviour fix and its check");
  // Codex 7: the working tree is broken AFTER the commit. The review must test the commit, not this.
  edit("webapp/server/routes-payments.ts", "ledgerDemo: true", "ledgerDemo: false");
  const rv = sh("bun", ["run", "scripts/audit-review.ts", "bug", "--no-serve", "--only", "server,assertions"], join(COPY, "webapp"));
  const has = (re: RegExp) => rv.out.split("\n").find((l) => re.test(l)) ?? "";
  parsed("C10", "Codex 7: the working tree was broken after the commit; the review still tested the COMMIT", "the review names the commit it checked out, and its server checks pass", /server … passed/.test(rv.out) && /checked out/.test(rv.out), `${has(/checked out/)} | ${has(/server …/) || rv.out.trim().split("\n").pop()}`);
  parsed("25", "the fix's check passes on the fixed commit", "the review's own server run reports passed", /server … passed/.test(rv.out), has(/server …/) || "(the server checks did not run)");
  parsed("26", "…and FAILS on the tree before the fix, at its own label", "a line saying so, naming the label", has(/red, as required: "demo: the health report carries the planted field" fails on/) !== "", has(/red, as required|NOT PROVEN: "demo/) || "(no before-fix result)");
  parsed("C15", "Codex 13: the new check imports a NEW helper file; it is carried onto the before-fix tree, and that run's full output is kept", "red is proven despite the new import, and the before-fix output is kept", has(/red, as required: "demo/) !== "" && /before-fix output kept/.test(rv.out), has(/before-fix output kept/) || has(/NOT PROVEN: "demo|could not run/) || "(nothing)");
  record("27", "a named check that also passes BEFORE the fix proves nothing, so the review ends NOT READY", rv, /NOT PROVEN: "fresh database: server boots" PASSES on the tree before the fix/);
}

/* ---- the report ---- */
const failed = rows.filter((r) => !r.ok);
const md = [
  "# Batch zero — the demonstrations", "",
  `Run ${new Date().toISOString()} in a disposable copy with a throwaway remote, a fake Dropbox folder and a simulated acceptance file. Nothing here touched the real repository, GitHub, Dropbox or Adam's acceptances. One setup push, the one that creates the throwaway remote, was made without the push hook${rows.some((r) => !r.ok) ? "; where a faulty gate let a bad push through, the throwaway remote was put back by force before the next row" : ""}. Every other push went through the hook. Setup commits in the copy skip the commit step (no installed packages there); the guard is run directly, exactly as the commit step runs it.`, "",
  `**${rows.length - failed.length} of ${rows.length} as required.** Rows C1–C20 are Codex's reproductions from its review of revision 1.`, "",
  "How each row is measured: **exit** = the real exit code of the real command, and a fault passes only if it exits non-zero AND prints its own reason. **parsed** = read from output or files; the row has no exit code of its own, so none is shown. **simulated** = a real push through the real hook, but the review package's check results are fixtures written by the script: it proves the gate's branching, not that those checks ran.", "",
  "| # | What was tried | Required | Measured | Exit | What it printed |", "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.n} | ${r.what} | ${r.expect.replace(/\|/g, "\\|")} | ${r.kind} | ${r.exit === null ? "—" : r.exit} | ${r.ok ? "" : "**NOT AS REQUIRED** "}${r.line.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`), "",
].join("\n");
mkdirSync(join(ROOT, "docs/audit/batches/0/evidence"), { recursive: true });
writeFileSync(join(ROOT, "docs/audit/batches/0/evidence", outName), md + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${rows.length - failed.length} of ${rows.length} as required → docs/audit/batches/0/evidence/${outName}`);
process.exit(failed.length ? 1 : 0);
