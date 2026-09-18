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
 * Revision 3: Codex's reproductions A–I of its review of revision 2, and the
 * records rules, are rows R, A, B, C, D, E, F, G and H; sequence M runs the
 * real revision-3 commit through the real guard, review, gate and release
 * against main's real baseline in a second clean clone. Written before the
 * revision-3 fixes and run against revision 2 (evidence/red-before-revision-3.md).
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
 * folder and SIMULATED records (FPSLLC_HOME). Setup commits use --no-verify
 * (the copy has no installed packages for lint and typecheck); the pushes
 * that create or reset a throwaway remote use --no-verify and are counted in
 * the report's header. Every push a row measures goes through the real push
 * hook; the guard is run exactly as the commit step runs it.
 *
 *   bun run docs/audit/demo.ts [--with-behaviour] [--out red-before-revision-3.md]
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

type Kind = "exit" | "parsed" | "simulated" | "new";
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
/** Every push or reset that skips the hook is counted and named in the report. */
const bypass: string[] = [];
const resetRemote = (to: string, why: string) => { g("push", "-q", "--no-verify", "--force", "origin", `${to}:refs/heads/main`); bypass.push(`fixture reset to ${to.slice(0, 7)} (${why})`); };
const clearAcceptances = () => { if (existsSync(join(HOME, "acceptances.jsonl"))) writeFileSync(join(HOME, "acceptances.jsonl"), ""); };
const writeAcceptance = (batch: string, revision: number, c: string, packageId: string) => { mkdirSync(HOME, { recursive: true }); appendFileSync(join(HOME, "acceptances.jsonl"), JSON.stringify({ kind: "accept", batch, revision, commit: c, packageId, at: new Date().toISOString(), source: "forged by the demonstration" }) + "\n"); };

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
g("push", "-q", "--no-verify", "origin", "main"); bypass.push("creating the throwaway remote (setup)");

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
}, () => { reset(B1); resetRemote(B1, "after C2"); });

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
const pkgIds = new Map<string, string>();
/** A FIXTURE package: its check results are written by this script, not run. Shaped and named as the review
 *  command writes one (id, site manifest, partial marker). The same commit keeps the same id unless `fresh`,
 *  so a row can rewrite "the package Adam accepted" with different check results. (The red run against
 *  revision 2 also wrote the two directory names that revision's gate looked packages up by; revision 2 is
 *  rejected and those names are gone.) */
const pkg = (id: string, c: string, base: string, mutate: (c: Chk[]) => Chk[] = (x) => x, names = ALLNAMES, opts: { partial?: string[] | null; fresh?: boolean } = {}) => {
  const key = `${id}:${c}`;
  if (opts.fresh || !pkgIds.has(key)) pkgIds.set(key, createHash("sha256").update(`${key}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12));
  const packageId = pkgIds.get(key) as string;
  const d = join(HOME, "reviews", `${id}-r1-${c}-${packageId}`);
  mkdirSync(join(d, "site"), { recursive: true });
  const html = `<html><body>fixture site for ${c}</body></html>`; writeFileSync(join(d, "site", "index.html"), html);
  const site = [{ path: "index.html", sha: sha(html) }];
  writeFileSync(join(d, "package.json"), JSON.stringify({ batch: id, revision: 1, base, commit: c, packageId, partial: opts.partial ?? null, diffSha: sha(diffOf(base, c)), createdAt: new Date().toISOString(), runId: `fixture-${packageId}`, required: names, checks: mutate(names.map((name) => ({ name, command: "(fixture written by the demonstration)", exit: 0, skipped: false, log: "" }))), docs: [], site }, null, 2));
  return { id: packageId, dir: d };
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
pkg("demo", X2, U);
accept("demo", X2);
record("17", "an earlier, unreviewed commit riding along with an accepted one", sh("git", ["push", "origin", "main"]), /main has moved, or other commits would ride along/, "simulated");
reset(X);

record("18", "THE VALID RELEASE: accepted commit, complete package, nothing riding along. The package's checks are fixtures and it lists no documents, so this proves the gate's branching — not that checks ran or documents matched", sh("git", ["push", "origin", "main"]), "pass", "simulated");
parsed("18a", "…and only now is the remote at the accepted commit", `remote main is ${X.slice(0, 7)}`, remoteMain() === X, `remote main = ${remoteMain().slice(0, 7)}`);

tryRow("C18", "Codex 16: recording a release after Adam rejected it", () => {
  const before = readFileSync(join(HOME, "acceptances.jsonl"), "utf8");
  sh("bun", ["run", "docs/audit/accept.ts", "reject", "demo", "--revision", "1", "--reason", "changed my mind"]);
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
if (remoteMain() !== R) resetRemote(R, "after C1b: a faulty gate let something through");

tryRow("C8", "Codex 5: a batch that requires no checks at all", () => {
  mkBatch("lazy", [{ id: "3", part: "all", scope: "demo", assertions: [{ kind: "present", file: HOW, text: "It saves as you type" }] }], [{ path: HOW, mode: "code", why: "demo" }], { requiredChecks: [] });
  if (batchCmd("authorize", "lazy").code !== 0) throw new Error("authorize failed");
  const A = commit("authorize lazy (records only)"); g("push", "-q", "origin", "main");
  g("checkout", "-q", "-b", "audit/batch-lazy"); edit(HOW, "It saves as you go", "It saves as you type"); batchCmd("implemented", "lazy");
  const Lz = commit("batch lazy"); g("checkout", "-q", "main"); g("merge", "-q", "--ff-only", "audit/batch-lazy");
  pkg("lazy", Lz, A, (c) => c, ["dropbox-unchanged"]); accept("lazy", Lz);
  record("C8", "Codex 5: a batch that lists NO required checks, with a package holding only the Dropbox comparison", sh("git", ["push", "origin", "main"]), /required check "(guard|assertions|typecheck)" did not run/, "simulated");
}, () => { reset(R); sh("git", ["branch", "-q", "-D", "audit/batch-lazy"]); resetRemote(R, "after C8"); });

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

/* ================= revision 3: Codex's reproductions A–I, and the records rules ================= */
/* Written before the revision-3 fixes and run against revision 2 (must fail for their own fault). Rows
   marked "new" test a mechanism revision 2 does not have and are not counted as reproductions there. */
const R3 = g("rev-parse", "HEAD");
const ledgerJson = () => JSON.parse(readFileSync(join(COPY, "docs/audit/ledger.json"), "utf8"));
const writeLedger = (l: unknown) => { writeFileSync(join(COPY, "docs/audit/ledger.json"), JSON.stringify(l, null, 2) + "\n"); sh("bun", ["run", "docs/audit/ledger-print.ts", "list"]); };
const pushRow = (n: string, what: string, want: "pass" | RegExp, kind: Kind = "exit") => { record(n, what, sh("git", ["push", "origin", "main"]), want, kind); };

/* ---- records: FAILURES.md and rulings.md ---- */
tryRow("R1a", "records: an existing line of FAILURES.md deleted", () => {
  const p = join(COPY, "FAILURES.md"); const s = readFileSync(p, "utf8").split("\n"); s.splice(5, 1); writeFileSync(p, s.join("\n"));
  commit("edit FAILURES.md (records only)"); pushRow("R1a", "records: an existing line of FAILURES.md deleted in a 'records only' push", /FAILURES\.md.*(prefix|deleted|changed|append)/i);
}, () => { reset(R3); resetRemote(R3, "after R1a"); });
tryRow("R1b", "records: text inserted in the MIDDLE of FAILURES.md", () => {
  const p = join(COPY, "FAILURES.md"); const s = readFileSync(p, "utf8").split("\n"); s.splice(5, 0, "An inserted sentence."); writeFileSync(p, s.join("\n"));
  commit("insert into FAILURES.md (records only)"); pushRow("R1b", "records: a sentence inserted in the middle of FAILURES.md (no deletions) in a 'records only' push", /FAILURES\.md.*(prefix|middle|after|append)/i);
}, () => { reset(R3); resetRemote(R3, "after R1b"); });
tryRow("R1c", "records: an entry appended to the END of FAILURES.md", () => {
  appendFileSync(join(COPY, "FAILURES.md"), "\n## P999 — a demonstration entry\n\nappended after all prior content\n");
  commit("append to FAILURES.md (records only)"); pushRow("R1c", "records: an entry appended after all prior content of FAILURES.md", "pass");
}, () => { reset(R3); resetRemote(R3, "after R1c"); });
tryRow("R3a", "records: a ruling added to rulings.md with no ruling record", () => {
  appendFileSync(join(COPY, "docs/audit/rulings.md"), "\n- \"a sentence nobody ruled on\" — public pages — 17 Sep 2026.\n");
  commit("add a ruling line (records only)"); pushRow("R3a", "records: a line added to rulings.md (an audit control) with NO ruling record from Adam", /rulings\.md.*(record|Adam|ruling)/i);
}, () => { reset(R3); resetRemote(R3, "after R3a"); });
tryRow("R3b", "records: a ruling Adam actually made", () => {
  const H = HOME; // the simulated home already holds this copy's records
  const r = sh("bun", ["run", "docs/audit/accept.ts", "ruling", "28", "Keep the monthly proration; build the billing.", "--source", "chat"], COPY, { FPSLLC_HOME: H });
  if (r.code !== 0) throw new Error(r.out);
  const rr = batchCmd("ruling", "28", "Keep the monthly proration; build the billing.");
  if (rr.code !== 0) throw new Error(rr.out);
  commit("record Adam's ruling on item 28 (records only)"); pushRow("R3b", "records: a ruling recorded from Adam's own message, then copied into the ledger", "pass", "new" as Kind);
  const q = sh("bun", ["run", "docs/audit/ledger-print.ts", "rulings"]).out;
  parsed("D2", "D: once ruling 28 is recorded, the queue no longer lists it", "no line for ruling 28", !/^- 28 /m.test(q), (q.split("\n").find((l) => /^- 28 /.test(l)) ?? "ruling 28 is gone from the queue"));
}, () => { reset(R3); resetRemote(R3, "after R3b"); });

/* ---- A: batch status and the frozen file ---- */
tryRow("A1", "A: a batch's status rewritten to rejected with no event", () => {
  const l = ledgerJson(); const b = l.batches.find((x: { id: string; revision: number }) => x.id === "demo" && x.revision === 1); b.status = "rejected"; writeLedger(l);
  const bp = BATCH; const bj = JSON.parse(readFileSync(bp, "utf8")); bj.requiredChecks = []; writeFileSync(bp, JSON.stringify(bj, null, 2) + "\n");
  g("add", "-A"); record("A1a", "A: status rewritten to rejected by hand and the frozen file emptied — the commit guard", guard(), /(status|transition|frozen|event)/i);
  commit("rewrite a status (records only)"); pushRow("A1b", "A: the same, pushed as 'records only'", /(status|transition|frozen|event)/i);
}, () => { reset(R3); resetRemote(R3, "after A1"); });
tryRow("A2", "A: a higher revision number inserted with no valid file", () => {
  const l = ledgerJson(); const b = l.batches.find((x: { id: string; revision: number }) => x.id === "demo" && x.revision === 1);
  l.batches.push({ ...b, revision: 2, frozenHash: "0000000000000000000000000000000000000000000000000000000000000000", status: "authorized", history: [{ at: new Date().toISOString(), event: "authorized" }] }); writeLedger(l);
  const bj = JSON.parse(readFileSync(BATCH, "utf8")); bj.requiredChecks = []; bj.revision = 2; writeFileSync(BATCH, JSON.stringify(bj, null, 2) + "\n");
  commit("insert a revision 2 record with a bad hash (records only)"); pushRow("A2", "A: a revision-2 record inserted whose file does not match its hash, to lift revision 1's frozen file", /(hash|snapshot|frozen|revision)/i);
}, () => { reset(R3); resetRemote(R3, "after A2"); });
tryRow("A3", "A: released → rejected", () => {
  const l = ledgerJson(); const b = l.batches.find((x: { id: string; revision: number }) => x.id === "demo" && x.revision === 1);
  if (b.status !== "released") throw new Error(`demo r1 is ${b.status}, not released`);
  b.status = "rejected"; b.history.push({ at: new Date().toISOString(), event: "rejected by Adam", note: "too late" }); writeLedger(l);
  sh("bun", ["run", "docs/audit/accept.ts", "reject", "demo", "--revision", "1", "--reason", "too late"]);
  commit("reject a released batch (records only)"); pushRow("A3", "A: a RELEASED batch moved to rejected, with an event and a reject record", /(released|transition|forbidden)/i);
}, () => { reset(R3); resetRemote(R3, "after A3"); });

/* ---- B: waits, links and parts ---- */
tryRow("B1", "B: an item's wait on Adam's ruling deleted", () => {
  const l = ledgerJson(); const it = l.items.find((i: { id: string }) => i.id === "38"); it.waitsOn = []; writeLedger(l);
  commit("delete a wait (records only)"); pushRow("B1", "B: item 38's wait on ruling 15 deleted in a 'records only' push", /(wait|immutable|ruling|migration)/i);
}, () => { reset(R3); resetRemote(R3, "after B1"); });
tryRow("B2", "B: a part deleted and recreated without its wait", () => {
  const l = ledgerJson(); const it = l.items.find((i: { id: string }) => i.id === "27"); it.parts = it.parts.map((p: { key: string }) => (p.key === "retention" ? { key: "retention", scope: "What the policy promises about keeping or deleting the number.", status: "open", waitsOn: [], history: [{ at: new Date().toISOString(), event: "recorded" }] } : p)); writeLedger(l);
  commit("recreate a part without its wait (records only)"); pushRow("B2", "B: item 27's 'retention' part deleted and recreated without its wait, in a 'records only' push", /(part|wait|immutable|history|migration)/i);
}, () => { reset(R3); resetRemote(R3, "after B2"); });

/* ---- C: parts are independent; a sighting links to a part ---- */
tryRow("C1", "C: the two parts of item 17 in two batches", () => {
  mkBatch("t1", [{ id: "17", part: "amend-title", scope: "the page title", assertions: [{ kind: "absent", text: "zzz-17a" }] }], []);
  const a = batchCmd("authorize", "t1"); if (a.code !== 0) throw new Error(a.out);
  mkBatch("t2", [{ id: "17", part: "contact-wording", scope: "the contact sentence", assertions: [{ kind: "absent", text: "zzz-17b" }] }], []);
  record("C1", "C: item 17's title part in one batch and its Contact-wording part in another — independent parts", batchCmd("authorize", "t2"), "pass");
}, () => reset(R3));
tryRow("C2", "C: item 100's Review-rows part does not drag in item 112", () => {
  mkBatch("rr", [{ id: "100", part: "review-rows", scope: "the Review rows", assertions: [{ kind: "absent", text: "zzz-100" }] }], []);
  const a = batchCmd("authorize", "rr"); if (a.code !== 0) throw new Error(a.out);
  commit("authorize rr"); g("checkout", "-q", "-b", "audit/batch-rr"); batchCmd("implemented", "rr"); g("add", "-A");
  record("C2a", "C: batch with 100:review-rows only — the guard must NOT demand item 112 (which belongs with 100:unused-code)", guard(), "pass");
  g("checkout", "-q", "main"); reset(R3); sh("git", ["branch", "-q", "-D", "audit/batch-rr"]);
  mkBatch("uc", [{ id: "100", part: "unused-code", scope: "the dead code", assertions: [{ kind: "absent", text: "zzz-100u" }] }], []);
  const b = batchCmd("authorize", "uc"); if (b.code !== 0) throw new Error(b.out);
  commit("authorize uc"); g("checkout", "-q", "-b", "audit/batch-uc"); batchCmd("implemented", "uc"); g("add", "-A");
  record("C2b", "C: batch with 100:unused-code only — the guard MUST demand item 112, the same dead check seen elsewhere", guard(), /item 112/);
}, () => { g("checkout", "-q", "main"); reset(R3); sh("git", ["branch", "-q", "-D", "audit/batch-uc"]); });
tryRow("C3", "C: item 95's eyebrow part while its title part waits on ruling 82", () => {
  mkBatch("eb", [{ id: "95", part: "eyebrow", scope: "the eyebrow", assertions: [{ kind: "absent", text: "zzz-95" }] }, { id: "198", part: "all", scope: "the formation-documents wording", assertions: [{ kind: "absent", text: "zzz-198" }] }, { id: "80", part: "all", scope: "x", assertions: [{ kind: "absent", text: "zzz-80" }] }, { id: "149", part: "all", scope: "x", assertions: [{ kind: "absent", text: "zzz-149" }] }], []);
  record("C3", "C: 95:eyebrow assigned with its main record 198 while 95:title still waits on ruling 82 (positive control)", batchCmd("authorize", "eb"), "pass");
}, () => reset(R3));

/* ---- D: the rulings queue ---- */
{ const q = sh("bun", ["run", "docs/audit/ledger-print.ts", "rulings"]).out;
  const l63 = q.split("\n").find((l) => /^- 63 /.test(l)) ?? "", l28 = q.split("\n").find((l) => /^- 28 /.test(l)) ?? "";
  parsed("D1", "D: the queue says ruling 63 unblocks 63, 152, 153 and 202, and ruling 28 unblocks 28 and 201", "both lines, with those items", /\b63\b/.test(l63) && /\b152\b/.test(l63) && /\b153\b/.test(l63) && /\b202\b/.test(l63) && /\b28\b/.test(l28) && /\b201\b/.test(l28), `${l63.slice(0, 120)} | ${l28.slice(0, 120)}`); }

/* ---- F: run identity ---- */
tryRow("F", "F: run identity", () => {
  const a = join(tmp, "run-assert.json"), stale = join(tmp, "stale-run.jsonl"), fresh = join(tmp, "fresh-run.jsonl");
  writeFileSync(a, JSON.stringify([{ kind: "check", suite: "server", label: "a label from the walk of another day" }]));
  writeFileSync(stale, JSON.stringify({ suite: "server", label: "a label from the walk of another day", ok: true, run: "old-run", commit: R3 }) + "\n");
  writeFileSync(fresh, JSON.stringify({ suite: "server", label: "a label from the walk of another day", ok: true, run: "this-run", commit: R3 }) + "\n");
  record("F1", "F: a result from an OLDER run of the same commit, when this run is named", sh("bun", ["run", "scripts/audit-assert.ts", "--results", stale, "--extra", a, "--commit", R3, "--run", "this-run"], join(COPY, "webapp")), /(run|missing from)/i);
  record("F2", "F: no --run given at all", sh("bun", ["run", "scripts/audit-assert.ts", "--results", fresh, "--extra", a, "--commit", R3], join(COPY, "webapp")), /--run|run identity|required/i);
  record("F3", "F: the right run, commit, suite and label (positive control)", sh("bun", ["run", "scripts/audit-assert.ts", "--results", fresh, "--extra", a, "--commit", R3, "--run", "this-run"], join(COPY, "webapp")), "pass");
});

/* ---- G: rejection arguments ---- */
tryRow("G", "G: rejection arguments", () => {
  const H = join(tmp, "rejhome"); mkdirSync(H, { recursive: true });
  const say = (m: string) => spawnSync(join(COPY, ".claude/hooks/accept-prompt.sh"), [], { input: JSON.stringify({ prompt: m }), env: { ...env, FPSLLC_HOME: H }, encoding: "utf8" });
  const last = () => (existsSync(join(H, "acceptances.jsonl")) ? readFileSync(join(H, "acceptances.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).pop() : null);
  say("Reject A: 2"); const r1 = last();
  parsed("G1", "G: 'Reject A: 2' — batch A, NO revision, reason \"2\"", "revision null, note \"2\"", r1?.kind === "reject" && r1?.batch === "A" && r1?.revision === null && r1?.note === "2", JSON.stringify(r1));
  say("Reject A, revision 2: the sentence is wrong"); const r2 = last();
  parsed("G2", "G: 'Reject A, revision 2: the sentence is wrong' — revision 2 only", "revision 2, that reason", r2?.revision === 2 && r2?.note === "the sentence is wrong", JSON.stringify(r2));
  const before = existsSync(join(H, "acceptances.jsonl")) ? readFileSync(join(H, "acceptances.jsonl"), "utf8") : "";
  say("Reject"); say("Reject , revision x: y");
  const after = existsSync(join(H, "acceptances.jsonl")) ? readFileSync(join(H, "acceptances.jsonl"), "utf8") : "";
  parsed("G3", "G: two malformed rejections record nothing", "the file is unchanged", before === after, before === after ? "unchanged" : "A RECORD WAS WRITTEN");
});

/* ---- H: packages ---- */
tryRow("H", "H: packages", () => {
  // a fresh accepted release on the fixture: main at R3, batch "pk" implemented in one commit
  mkBatch("pk", [{ id: "3", part: "all", scope: "demo", assertions: [{ kind: "present", file: HOW, text: "It saves as you type" }] }], [{ path: HOW, mode: "code", why: "demo" }]);
  if (batchCmd("authorize", "pk").code !== 0) throw new Error("authorize failed");
  const A = commit("authorize pk (records only)"); resetRemote(A, "H: start from the authorize commit");
  g("checkout", "-q", "-b", "audit/batch-pk"); edit(HOW, "It saves as you go", "It saves as you type"); batchCmd("implemented", "pk");
  const K = commit("batch pk"); g("checkout", "-q", "main"); g("merge", "-q", "--ff-only", "audit/batch-pk");
  const partial = pkg("pk", K, A, (c) => c, ALLNAMES, { partial: ["server"] });
  record("H1a", "H: a package marked partial cannot be accepted", sh("bun", ["run", "docs/audit/accept.ts", "accept", "pk", "1", K, "--package", partial.id]), /partial/i);
  writeAcceptance("pk", 1, K, partial.id);
  pushRow("H1b", "H: a partial package with a forged acceptance cannot be released", /partial/i, "simulated");
  rmSync(partial.dir, { recursive: true, force: true }); clearAcceptances();
  const full = pkg("pk", K, A);
  const acc = sh("bun", ["run", "docs/audit/accept.ts", "accept", "pk", "1", K]);
  parsed("H4a", "H: with one full package, acceptance resolves it and stores its id", "the record names the package", acc.code === 0 && /package/.test(acc.out) && JSON.stringify(readFileSync(join(HOME, "acceptances.jsonl"), "utf8")).includes(full.id), acc.out.trim().split("\n").pop() ?? "");
  writeFileSync(join(full.dir, "site", "extra.js"), "// added after review\n");
  pushRow("H2a", "H: a file ADDED to the kept site after acceptance", /site/i, "simulated");
  rmSync(join(full.dir, "site", "extra.js"));
  writeFileSync(join(full.dir, "site", "index.html"), "<html>changed</html>");
  pushRow("H2b", "H: a kept site file CHANGED after acceptance", /site/i, "simulated");
  rmSync(full.dir, { recursive: true, force: true });
  const regen = pkg("pk", K, A, undefined, undefined, { fresh: true });
  pushRow("H3", "H: the accepted package deleted and regenerated (new id) — the old acceptance releases nothing", /(package|acceptance)/i, "simulated");
  const second = pkg("pk", K, A, undefined, undefined, { fresh: true });
  const amb = sh("bun", ["run", "docs/audit/accept.ts", "accept", "pk", "1", K]);
  parsed("H6", "H: with TWO full packages for the commit, acceptance refuses and prints the exact command with the package id", "refusal naming --package", amb.code !== 0 && /--package/.test(amb.out), amb.out.trim().split("\n").pop() ?? "");
  const pick = sh("bun", ["run", "docs/audit/accept.ts", "accept", "pk", "1", K, "--package", second.id]);
  if (pick.code !== 0) throw new Error(pick.out);
  pushRow("H5", "H: the release of the package Adam named by id, checks fixtures, site intact (positive control)", "pass", "simulated");
  void regen;
}, () => { g("checkout", "-q", "main"); reset(R3); sh("git", ["branch", "-q", "-D", "audit/batch-pk"]); resetRemote(R3, "after H"); clearAcceptances(); });

/* ---- a behaviour fix: its check must FAIL on the tree before the fix ---- */
if (process.argv.includes("--with-behaviour")) {
  execFileSync("ln", ["-s", join(ROOT, "webapp/node_modules"), join(COPY, "webapp/node_modules")]);
  /* ---- E: browser isolation, four probes with a mocked sink (nothing real is contacted) ---- */
  tryRow("E", "E: browser isolation probes", () => {
    const runner = join(tmp, "probe.ts");
    writeFileSync(runner, `import { chromium } from ${JSON.stringify(join(COPY, "webapp/node_modules/playwright/index.mjs"))};
import { isolateBrowser, guardedRoute } from ${JSON.stringify(join(COPY, "webapp/scripts/browser-isolation.ts"))};
const browser = await chromium.launch();
const out: Record<string, string> = {};
const sinkHits: string[] = [];
const iso = isolateBrowser(browser); // the real wrapper, installed the way the walk installs it
const sink = async (ctx: { route: (u: string, h: (r: { fulfill: (o: { body: string }) => Promise<void>; request: () => { url: () => string } }) => Promise<void>) => Promise<void> }) => ctx.route("**probe.invalid**", async (r) => { sinkHits.push(r.request().url()); await r.fulfill({ body: "sink" }); });
const attempt = async (page: { evaluate: (f: string) => Promise<unknown> }, url: string) => { try { return String(await page.evaluate("fetch(" + JSON.stringify(url) + ").then(r => 'reached:' + r.status).catch(e => 'failed:' + e.message)")); } catch (e) { return "failed:" + String(e).split("\\n")[0]; } };
// 1 ordinary page — the sink is registered first so that, without isolation, it would answer
const p1 = await browser.newPage(); await sink(p1.context()); await p1.goto("about:blank");
const before1 = sinkHits.length; out.ordinary = (await attempt(p1, "http://probe.invalid/ping")) + (sinkHits.length > before1 ? " SINK REACHED" : " sink not reached");
// 2 the Clients-tab route: a context, then a page from it
const ctx = await browser.newContext(); await sink(ctx); const p2 = await ctx.newPage(); await p2.goto("about:blank");
const before2 = sinkHits.length; out.contextPage = (await attempt(p2, "http://probe.invalid/ping")) + (sinkHits.length > before2 ? " SINK REACHED" : " sink not reached");
// 3 a popup's first request
const before3 = sinkHits.length; const popupPromise = ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null);
await p2.evaluate("window.open('http://probe.invalid/popup')"); const pop = await popupPromise; await new Promise((r) => setTimeout(r, 800));
out.popup = (pop ? "popup opened, " : "no popup page, ") + (sinkHits.length > before3 ? "SINK REACHED" : "sink not reached");
// 4 a page with the walk's API handler installed, sent to an outside /api/ path
const p4 = await browser.newPage(); await sink(p4.context());
let handlerRan = "handler did not run";
await guardedRoute(p4, "**/api/**", async (route) => { handlerRan = "handler ran and continued"; await route.continue(); });
await p4.goto("about:blank");
const before4 = sinkHits.length; out.apiHandler = (await attempt(p4, "http://probe.invalid/api/x")) + (sinkHits.length > before4 ? " SINK REACHED" : " sink not reached") + "; " + handlerRan;
out.blocked = "stopped: " + [...iso.blocked].join(", ");
await browser.close();
console.log(JSON.stringify(out));
`);
    const r = sh("bun", ["run", runner], join(COPY, "webapp"));
    let o: Record<string, string> = {};
    try { o = JSON.parse(r.out.trim().split("\n").pop() ?? "{}"); } catch { o = { error: r.out.slice(0, 300) }; }
    const ok = (s?: string) => !!s && /sink not reached/.test(s) && !/reached:/.test(s);
    parsed("E1", "E: an ordinary page's request to an outside host", "aborted; the sink never sees it", ok(o.ordinary), o.ordinary ?? o.error ?? "");
    parsed("E2", "E: a page created from a separate browser context (the Clients-tab route)", "aborted; the sink never sees it", ok(o.contextPage), o.contextPage ?? o.error ?? "");
    parsed("E3", "E: a popup's first request", "the sink never sees it", !!o.popup && /sink not reached/.test(o.popup), o.popup ?? o.error ?? "");
    parsed("E4", "E: a page with the walk's API handler installed, request to an outside /api/ path", "aborted before the handler; the sink never sees it", ok(o.apiHandler) && /did not run/.test(o.apiHandler ?? ""), o.apiHandler ?? o.error ?? "");
    writeFileSync(join(ROOT, "docs/audit/batches/0/evidence/browser-isolation-probes.json"), JSON.stringify(o, null, 2) + "\n");
  });

  /* ---- M: the actual batch-zero sequence against main's real baseline, in a second clean clone ---- */
  tryRow("M", "M: the batch-zero sequence", () => {
    const C2 = join(tmp, "clean"), REM2 = join(tmp, "remote2.git"), H2 = join(tmp, "home2");
    execFileSync("git", ["clone", "-q", ROOT, C2]);
    for (const f of new Set(dirty)) { if (!existsSync(join(ROOT, f))) continue; mkdirSync(dirname(join(C2, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(C2, f)); }
    execFileSync("git", ["init", "-q", "--bare", REM2]);
    const sh2 = (cmd: string, args: string[], cwd = C2, extraEnv: Record<string, string> = {}) => { const r = spawnSync(cmd, args, { cwd, env: { ...env, FPSLLC_HOME: H2, FPSLLC_DROPBOX: join(tmp, "no-dropbox-here"), CLAUDE_PROJECT_DIR: C2, ...extraEnv }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` }; };
    const g2 = (...a: string[]) => { const r = sh2("git", a); if (r.code !== 0) throw new Error(`git ${a.join(" ")}: ${r.out}`); return r.out.trim(); };
    g2("remote", "remove", "origin"); g2("remote", "add", "origin", REM2); g2("config", "core.hooksPath", ".githooks");
    const MAIN = "82abf541a6643981d93d41bc5d8b6da169897971"; // main's actual baseline, the commit batch 0 was cut from
    g2("push", "-q", "--no-verify", "origin", `${MAIN}:refs/heads/main`); bypass.push("M: creating the second throwaway remote at main's real baseline");
    g2("checkout", "-q", "-B", "audit/batch-0"); g2("add", "-A"); g2("commit", "-q", "--no-verify", "-m", "revision 3 as it stands in this working tree (fixture commit)");
    const X3 = g2("rev-parse", "HEAD");
    execFileSync("ln", ["-s", join(ROOT, "webapp/node_modules"), join(C2, "webapp/node_modules")]);
    const lj = JSON.parse(readFileSync(join(C2, "docs/audit/ledger.json"), "utf8")) as { batches: { id: string; revision: number; status: string; history: { event: string }[] }[] };
    const r2 = lj.batches.find((b) => b.id === "0" && b.revision === 2), r3 = lj.batches.find((b) => b.id === "0" && b.revision === 3);
    parsed("M1", "M: revision 2 is recorded as rejected by Adam's own message, and revision 3 as authorized after it", "r2 rejected with a 'rejected by Adam' event; r3 authorized", r2?.status === "rejected" && r2.history.some((h) => /^rejected by Adam/.test(h.event)) && !!r3 && ["authorized", "implemented"].includes(r3.status), `r2: ${r2?.status}; r3: ${r3?.status ?? "absent"}`);
    parsed("M2", "M: the migration is declared in a file the ledger's changes must match", "docs/audit/migrations/001-part-level-links.json exists and the ledger names it", existsSync(join(C2, "docs/audit/migrations/001-part-level-links.json")) && /001-part-level-links/.test(readFileSync(join(C2, "docs/audit/ledger.json"), "utf8")), existsSync(join(C2, "docs/audit/migrations/001-part-level-links.json")) ? "declared" : "no migration file");
    record("M3", "M: the local commit guard, run as the commit step runs it, on the revision-3 tree", sh2("bun", ["run", "docs/audit/guard.ts"], C2, { FPSLLC_BATCH: "0" }), "pass");
    const rv = sh2("bun", ["run", "scripts/audit-review.ts", "0", "--no-serve"], join(C2, "webapp"));
    const pkgLine = rv.out.split("\n").find((l) => /^review package:/.test(l)) ?? "";
    const pkgDir = pkgLine.replace(/^review package:\s*/, "").trim();
    const pkgId = existsSync(join(pkgDir, "package.json")) ? (JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { packageId?: string; partial?: unknown }).packageId ?? "" : "";
    parsed("M4", "M: the review package for the exact revision-3 commit is built with NO acceptance on file, every mandatory check run from an isolated checkout", "Ready for Adam, a full package with an id", /Ready for Adam/.test(rv.out) && pkgId !== "", (rv.out.split("\n").filter((l) => /passed|FAILED|Ready|NOT READY|kept in the package/.test(l)).join(" / ")).slice(0, 400));
    g2("checkout", "-q", "-B", "main", X3);
    record("M5", "M: publication of revision 3 against main's real baseline, with no acceptance", sh2("git", ["push", "origin", "main"]), /no acceptance from Adam/);
    const acc = sh2("bun", ["run", "docs/audit/accept.ts", "accept", "0", "3", X3, "--package", pkgId]);
    parsed("M6", "M: a simulated acceptance of exactly that package and commit", "recorded, naming the package", acc.code === 0, acc.out.trim().split("\n").pop() ?? "");
    record("M7", "M: publication permitted only now, under the established rules (real checks, real package, no fixtures)", sh2("git", ["push", "origin", "main"]), "pass");
    const rel = sh2("bun", ["run", "docs/audit/batch.ts", "released", "0", X3, "--deployed", "not deployed: demonstration remote", "--documents", "none changed"]);
    record("M8", "M: the release recorded against that acceptance, with the remote's answer", rel, "pass");
    g2("add", "-A"); g2("commit", "-q", "--no-verify", "-m", "record the release (records only)");
    record("M9", "M: the records-only bookkeeping push after release", sh2("git", ["push", "origin", "main"]), "pass");
    if (existsSync(pkgDir)) { for (const f of ["package.json", "files.txt"]) if (existsSync(join(pkgDir, f))) copyFileSync(join(pkgDir, f), join(ROOT, "docs/audit/batches/0/evidence", `demo-M-${f}`)); }
  });

  tryRow("C14", "Codex 12: a server assertion satisfied by a walk result", () => {
    const a = join(tmp, "wrong-suite.json"), res = join(tmp, "walk-only.jsonl");
    writeFileSync(a, JSON.stringify([{ kind: "check", suite: "server", label: "a label that exists only in the walk" }]));
    writeFileSync(res, JSON.stringify({ suite: "walk", label: "a label that exists only in the walk", ok: true, run: "demo", commit: R }) + "\n");
    record("C14", "Codex 12: a SERVER assertion, when only a WALK result carries that label", sh("bun", ["run", "scripts/audit-assert.ts", "--results", res, "--extra", a, "--commit", R, "--run", "demo"], join(COPY, "webapp")), /missing from the server results/);
  });
  const PROVEN = "demo: the health report carries the planted field", UNPROVEN = "fresh database: server boots";
  mkBatch("bug", [{ id: "24", part: "all", scope: "A planted behaviour defect: the health report lacks a field.", assertions: [{ kind: "check", suite: "server", label: PROVEN }, { kind: "check", suite: "server", label: UNPROVEN }] }],
    [{ path: "webapp/server/routes-payments.ts", mode: "code", why: "the planted fix" }, { path: E2E, mode: "code", control: true, why: "the check that proves it" }, { path: "webapp/server/e2e-demo-helper.ts", mode: "new", control: true, why: "a new helper the new check imports" }, { path: "webapp/api/index.mjs", mode: "generated", why: "rebuilt bundle" }],
    { testSupport: ["webapp/server/e2e-demo-helper.ts"] });
  batchCmd("authorize", "bug"); commit("authorize batch bug (records only)"); g("push", "-q", "origin", "main");
  g("checkout", "-q", "-b", "audit/batch-bug");
  edit("webapp/server/routes-payments.ts", "return c.json({ data: { ok: ordering, database: true, ordering } }", "return c.json({ data: { ok: ordering, database: true, ordering, ledgerDemo: true } }");
  writeFileSync(join(COPY, "webapp/server/e2e-demo-helper.ts"), "export const planted = (body: unknown): boolean => (body as { data?: { ledgerDemo?: boolean } } | null)?.data?.ledgerDemo === true;\n");
  edit(E2E, "const testEmail =", `{ const h = await fetch(BASE + "/api/health").then((r) => r.json()).catch(() => null); check(${JSON.stringify(PROVEN)}, planted(h), { got: h }); }\nconst testEmail =`);
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
  {
    const kept = (rv.out.match(/before-fix output kept: (\S+)/) ?? [])[1];
    const retained = join(ROOT, "docs/audit/batches/0/evidence/before-fix-demo.log");
    if (kept && existsSync(kept)) writeFileSync(retained, `# the before-fix run's complete output, copied out of the review package before the disposable copy is removed\n# the red line the review printed:\n# ${has(/red, as required: "demo/)}\n\n${readFileSync(kept, "utf8")}`);
    const detailOk = /what it got: \{"got"/.test(has(/red, as required: "demo/));
    parsed("C15", "Codex 13: the new check imports a NEW helper file; it is carried onto the before-fix tree; that run's full output and the failing check's detail are kept in evidence/before-fix-demo.log", "red is proven despite the new import; the retained log exists with content; the red line shows what the check got", has(/red, as required: "demo/) !== "" && existsSync(retained) && statSync(retained).size > 1000 && detailOk, (has(/red, as required: "demo/) || has(/NOT PROVEN: "demo|could not run/) || "(nothing)").slice(0, 300) + (existsSync(retained) ? ` | retained ${statSync(retained).size} bytes` : " | NOT RETAINED"));
  }
  record("27", "a named check that also passes BEFORE the fix proves nothing, so the review ends NOT READY", rv, /NOT PROVEN: "fresh database: server boots" PASSES on the tree before the fix/);
}

/* ---- the report ---- */
const failed = rows.filter((r) => !r.ok);
const md = [
  "# Batch zero — the demonstrations", "",
  `Run ${new Date().toISOString()} in a disposable copy with a throwaway remote, a fake Dropbox folder and a simulated acceptance file. Nothing here touched the real repository, GitHub, Dropbox or Adam's acceptances. Setup commits in the copy skip the commit step (no installed packages there); the guard is run directly, exactly as the commit step runs it. Pushes that skipped the push hook — ${bypass.length}, every one a fixture setup or reset, never a row under test: ${bypass.join("; ")}. Every push that a row measures went through the hook.`, "",
  `**${rows.length - failed.length} of ${rows.length} as required.** Rows C1–C20 are Codex's reproductions from its review of revision 1; rows R, A, B, C, D, E, F, G, H and M are revision 3's, from its review of revision 2 and the approved plan.`, "",
  "How each row is measured: **exit** = the real exit code of the real command, and a fault passes only if it exits non-zero AND prints its own reason. **parsed** = read from output or files; the row has no exit code of its own, so none is shown. **simulated** = a real push through the real hook, but the review package's check results are fixtures written by the script: it proves the gate's branching, not that those checks ran.", "",
  "| # | What was tried | Required | Measured | Exit | What it printed |", "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.n} | ${r.what} | ${r.expect.replace(/\|/g, "\\|")} | ${r.kind} | ${r.exit === null ? "—" : r.exit} | ${r.ok ? "" : "**NOT AS REQUIRED** "}${r.line.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`), "",
].join("\n");
mkdirSync(join(ROOT, "docs/audit/batches/0/evidence"), { recursive: true });
writeFileSync(join(ROOT, "docs/audit/batches/0/evidence", outName), md + "\n");
rmSync(tmp, { recursive: true, force: true });
{ const E = join(ROOT, "docs/audit/batches/0/evidence"); const want = ["before-fix-demo.log", "browser-isolation-probes.json"].filter(() => process.argv.includes("--with-behaviour"));
  const present = want.filter((f) => existsSync(join(E, f)) && statSync(join(E, f)).size > 0);
  if (want.length) { parsed("Z", "retained evidence still exists after the disposable copy was removed", want.join(", "), present.length === want.length, present.length === want.length ? `present: ${present.join(", ")}` : `missing: ${want.filter((f) => !present.includes(f)).join(", ")}`); writeFileSync(join(E, outName), md.replace(/\n$/, "") + "\n" + rows.slice(-1).map((r) => `| ${r.n} | ${r.what} | ${r.expect} | ${r.kind} | — | ${r.ok ? "" : "**NOT AS REQUIRED** "}${r.line} |`).join("\n") + "\n"); } }
console.log(`\n${rows.filter((r) => r.ok).length} of ${rows.length} as required → docs/audit/batches/0/evidence/${outName}`);
process.exit(rows.some((r) => !r.ok) ? 1 : 0);
