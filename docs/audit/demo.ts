/**
 * The demonstrations batch zero owes (Codex, rounds 2–4): before the fix
 * ledger is trusted, show that a valid authorized change PASSES and that each
 * planted fault FAILS for its own stated reason — not that it refuses
 * everything. All of it runs in a DISPOSABLE COPY of the repository with its
 * own throwaway remote and a SIMULATED acceptance file (FPSLLC_HOME), so
 * nothing here touches the real repository, GitHub, or Adam's real
 * acceptances. Setup commits in the copy use --no-verify (the copy has no
 * installed packages for lint and typecheck); every push in the copy goes
 * through the real push hook, and the guard is run exactly as the commit step
 * runs it.
 *
 *   bun run docs/audit/demo.ts        → docs/audit/batches/0/evidence/demo.md
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "./ledger-lib";

const tmp = mkdtempSync(join(tmpdir(), "fix-ledger-demo-"));
const COPY = join(tmp, "copy"), REMOTE = join(tmp, "remote.git"), HOME = join(tmp, "home");
const env = { ...process.env, FPSLLC_HOME: HOME, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@example.com" };
const S = "Drawn from real client questions about Florida's Protected Series LLC statute.";
const T = "The questions people ask before forming a Florida Protected Series LLC, answered.";
const FAQ = "webapp/src/pages/FAQ.tsx", CONTACT = "webapp/src/pages/Contact.tsx", HOW = "webapp/src/pages/HowItWorks.tsx";

const rows: { n: string; what: string; expect: string; exit: number; line: string; ok: boolean }[] = [];
const sh = (cmd: string, args: string[], cwd = COPY): { code: number; out: string } => {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const g = (...args: string[]) => { const r = sh("git", args); if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.out}`); return r.out.trim(); };
const guard = () => sh("bun", ["run", "docs/audit/guard.ts", "--staged"]);
const edit = (file: string, from: string, to: string) => { const p = join(COPY, file); const s = readFileSync(p, "utf8"); if (!s.includes(from)) throw new Error(`${file} lacks: ${from}`); writeFileSync(p, s.split(from).join(to)); };
const reset = (to?: string) => { g("reset", "-q", "--hard", ...(to ? [to] : [])); g("clean", "-fdq"); };
function record(n: string, what: string, r: { code: number; out: string }, want: "pass" | RegExp) {
  const passWanted = want === "pass";
  const line = passWanted ? (r.out.trim().split("\n").filter((l) => /ok|passed|accepted|records only|authorized|recorded/.test(l)).pop() ?? r.out.trim().split("\n").pop() ?? "") : (r.out.split("\n").find((l) => (want as RegExp).test(l)) ?? "");
  const ok = passWanted ? r.code === 0 : r.code !== 0 && line !== "";
  rows.push({ n, what, expect: passWanted ? "passes" : `refused, for this reason: ${String(want)}`, exit: r.code, line: line.trim().slice(0, 400), ok });
  console.log(`${ok ? "✅" : "❌"} ${n} ${what}${ok ? "" : `\n${r.out}`}`);
}

/* ---- the disposable copy: the committed tree plus this working tree ---- */
execFileSync("git", ["clone", "-q", ROOT, COPY]);
const dirty = execFileSync("git", ["ls-files", "-m", "-o", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").concat(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" }).split("\n")).filter(Boolean);
for (const f of new Set(dirty)) { if (!existsSync(join(ROOT, f))) continue; mkdirSync(dirname(join(COPY, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(COPY, f)); }
execFileSync("git", ["init", "-q", "--bare", REMOTE]);
g("remote", "remove", "origin"); g("remote", "add", "origin", REMOTE); g("config", "core.hooksPath", ".githooks");
g("checkout", "-q", "-B", "main");
appendFileSync(join(COPY, CONTACT), `\n// demo: ${S}\n`); // the same defect, seen in a second file
g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "baseline for the demonstrations");
g("push", "-q", "--no-verify", "origin", "main"); // setup only: creating the throwaway remote
const B0 = g("rev-parse", "HEAD");

const batch = {
  id: "demo", revision: 1, title: "Demonstration: the FAQ sentence, in both places it appears", model: "demo", base: B0,
  items: [{ id: "1", part: "all", scope: "Replace the FAQ page's 'real client questions' sentence, everywhere it appears.", assertions: [
    { kind: "replace", file: FAQ, before: S, after: T },
    { kind: "replace", file: CONTACT, before: `// demo: ${S}`, after: `// demo: ${T}` },
  ] }],
  files: [{ path: FAQ, mode: "replace", why: "the sentence" }, { path: CONTACT, mode: "replace", why: "its second copy" }],
  requiredChecks: ["typecheck", "lint", "unit", "facts", "guard", "documents", "server", "walk", "assertions"],
};
mkdirSync(join(COPY, "docs/audit/batches/demo"), { recursive: true });
const BATCH = join(COPY, "docs/audit/batches/demo/batch.json");
writeFileSync(BATCH, JSON.stringify(batch, null, 2) + "\n");

/* ---- before Go: what cannot even be authorized ---- */
mkdirSync(join(COPY, "docs/audit/batches/waits"), { recursive: true });
writeFileSync(join(COPY, "docs/audit/batches/waits/batch.json"), JSON.stringify({ ...batch, id: "waits", items: [{ id: "12", part: "all", scope: "an item that waits on Adam's ruling", assertions: [{ kind: "absent", text: "x" }] }], files: [] }, null, 2));
record("1", "an item that waits on Adam's ruling cannot be put in a batch", sh("bun", ["run", "docs/audit/batch.ts", "authorize", "waits"]), /waits on Adam's ruling on item 12/);
rmSync(join(COPY, "docs/audit/batches/waits"), { recursive: true });
mkdirSync(join(COPY, "docs/audit/batches/wrongwords"), { recursive: true });
writeFileSync(join(COPY, "docs/audit/batches/wrongwords/batch.json"), JSON.stringify({ ...batch, id: "wrongwords", items: [{ ...batch.items[0], assertions: [{ kind: "replace", file: FAQ, before: "Drawn from real customer questions.", after: T }] }] }, null, 2));
record("2", "a 'before' sentence that is not in the file, word for word, cannot be authorized", sh("bun", ["run", "docs/audit/batch.ts", "authorize", "wrongwords"]), /must be proven present/);
rmSync(join(COPY, "docs/audit/batches/wrongwords"), { recursive: true });

record("3", "the valid batch is authorized: frozen and assigned", sh("bun", ["run", "docs/audit/batch.ts", "authorize", "demo"]), "pass");
g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "authorize batch demo (records only)");
record("4", "a push made only of record files needs no acceptance", sh("git", ["push", "origin", "main"]), "pass");
const B1 = g("rev-parse", "HEAD");

mkdirSync(join(COPY, "docs/audit/batches/second"), { recursive: true });
writeFileSync(join(COPY, "docs/audit/batches/second/batch.json"), JSON.stringify({ ...batch, id: "second" }, null, 2));
record("5", "a second batch cannot claim an item already assigned", sh("bun", ["run", "docs/audit/batch.ts", "authorize", "second"]), /cannot be claimed twice/);
rmSync(join(COPY, "docs/audit/batches/second"), { recursive: true });

/* ---- on the batch branch: planted faults, each reset afterwards ---- */
g("checkout", "-q", "-b", "audit/batch-demo");
const applyBoth = () => { edit(FAQ, S, T); edit(CONTACT, `// demo: ${S}`, `// demo: ${T}`); };

applyBoth(); edit(FAQ, "Questions, answered", "Questions and answers"); g("add", "-A");
record("6", "an unrelated edit INSIDE a declared file", guard(), /differs from what the declared replacements produce/);
reset();
applyBoth(); edit(HOW, "It saves as you go", "It saves as you type"); g("add", "-A");
record("7", "an edit to a file the batch did not declare", guard(), /HowItWorks\.tsx: changed, but batch demo does not declare it/);
reset();
applyBoth(); edit("webapp/server/e2e.ts", 'check("the client signs in"', '// check("the client signs in"'); g("add", "-A");
record("8", "a check switched off inside the check suite", guard(), /e2e\.ts: changed, but batch demo does not declare it/);
reset();
applyBoth(); writeFileSync(BATCH, JSON.stringify({ ...batch, items: [{ ...batch.items[0], assertions: [{ ...batch.items[0].assertions[0], after: `${T} (edited after Go)` }, batch.items[0].assertions[1]] }] }, null, 2)); g("add", "-A");
record("9", "the batch file changed after Go", guard(), /not the one frozen at Go/);
reset();
edit(FAQ, S, T); sh("bun", ["run", "docs/audit/batch.ts", "implemented", "demo"]); g("add", "-A");
record("10", "a missed copy: one place fixed, the second left", guard(), /retired wording is back in webapp\/src\/pages\/Contact\.tsx/);
reset();

applyBoth(); sh("bun", ["run", "docs/audit/batch.ts", "implemented", "demo"]); g("add", "-A");
record("11", "THE VALID CHANGE: both declared replacements, nothing else", guard(), "pass");
g("commit", "-q", "--no-verify", "-m", "batch demo: the FAQ sentence, both places");
const X = g("rev-parse", "HEAD");

/* ---- release: the push hook ---- */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const diffOf = (a: string, b: string) => execFileSync("git", ["diff", "--no-renames", a, b], { cwd: COPY, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const pkg = (commit: string, base: string, mutate: (c: { name: string; command: string; exit: number | null; skipped: boolean; log: string }[]) => typeof c = (c) => c) => {
  const d = join(HOME, "reviews", `demo-r1-${commit.slice(0, 7)}`); mkdirSync(d, { recursive: true });
  const checks = mutate([...batch.requiredChecks, "dropbox-unchanged"].map((name) => ({ name, command: "(simulated in the demonstration)", exit: 0, skipped: false, log: "" })));
  writeFileSync(join(d, "package.json"), JSON.stringify({ batch: "demo", revision: 1, base, commit, diffSha: sha(diffOf(base, commit)), createdAt: new Date().toISOString(), required: [...batch.requiredChecks, "dropbox-unchanged"], checks, docs: [] }, null, 2));
};
const accept = (commit: string) => sh("bun", ["run", "docs/audit/accept.ts", "accept", "demo", "1", commit.slice(0, 7)]);
const remoteMain = () => execFileSync("git", ["rev-parse", "main"], { cwd: REMOTE, encoding: "utf8" }).trim();

g("checkout", "-q", "main"); g("merge", "-q", "--ff-only", "audit/batch-demo");
record("12", "release with NO acceptance from Adam", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
rows.push({ n: "12a", what: "…and the remote is unchanged by the refused push", expect: `remote main is still ${B1.slice(0, 7)}`, exit: 0, line: `remote main = ${remoteMain().slice(0, 7)}`, ok: remoteMain() === B1 });

accept(X);
pkg(X, B1, (c) => c.filter((x) => x.name !== "walk"));
record("13", "accepted, but a required check never ran", sh("git", ["push", "origin", "main"]), /required check "walk" did not run for this commit — missing counts as failed/);
pkg(X, B1, (c) => c.map((x) => (x.name === "walk" ? { ...x, skipped: true } : x)));
record("14", "accepted, but a required check was skipped", sh("git", ["push", "origin", "main"]), /required check "walk" was skipped — skipped counts as failed/);
pkg(X, B1, (c) => c.map((x) => (x.name === "server" ? { ...x, exit: 1 } : x)));
record("15", "accepted, but a required check failed", sh("git", ["push", "origin", "main"]), /required check "server" failed/);
pkg(X, B1);

edit(FAQ, T, `${T} `); g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "a change made after Adam accepted");
record("16", "a change AFTER acceptance voids it", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
reset(X);

g("reset", "-q", "--hard", B1); edit(HOW, "It saves as you go", "It saves as you type"); g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "an earlier change nobody reviewed");
const U = g("rev-parse", "HEAD"); g("cherry-pick", "--no-edit", X); const X2 = g("rev-parse", "HEAD");
accept(X2); { const d = join(HOME, "reviews", `demo-r1-${X2.slice(0, 7)}`); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "package.json"), JSON.stringify({ batch: "demo", revision: 1, base: U, commit: X2, diffSha: sha(diffOf(U, X2)), createdAt: new Date().toISOString(), required: batch.requiredChecks, checks: batch.requiredChecks.map((name) => ({ name, command: "", exit: 0, skipped: false, log: "" })), docs: [] })); }
record("17", "an earlier, unreviewed commit riding along with an accepted one", sh("git", ["push", "origin", "main"]), /main has moved, or other commits would ride along/);
reset(X);

record("18", "THE VALID RELEASE: accepted commit, complete package, nothing riding along", sh("git", ["push", "origin", "main"]), "pass");
rows.push({ n: "18a", what: "…and only now is the remote at the accepted commit", expect: `remote main is ${X.slice(0, 7)}`, exit: 0, line: `remote main = ${remoteMain().slice(0, 7)}`, ok: remoteMain() === X });

record("19", "the release is recorded against Adam's acceptance", sh("bun", ["run", "docs/audit/batch.ts", "released", "demo", X]), "pass");
edit(HOW, "It saves as you go", "It saves as you type"); g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "records, with a page change slipped in");
record("20", "a 'records' push that also touches a page", sh("git", ["push", "origin", "main"]), /no acceptance from Adam names commit/);
g("reset", "-q", "--soft", "HEAD~1"); g("restore", "--staged", HOW); g("checkout", "--", HOW); g("commit", "-q", "--no-verify", "-m", "record the release (records only)");
record("21", "the same push without the page change", sh("git", ["push", "origin", "main"]), "pass");

edit(FAQ, T, S); g("add", "-A");
record("22", "a LATER change restores the defect", guard(), /item 1: (the fixed wording is gone|retired wording is back)/);
reset();
{ const p = join(COPY, "docs/audit/ledger.json"); const l = JSON.parse(readFileSync(p, "utf8")); const part = l.items.find((i: { id: string }) => i.id === "1").parts[0]; part.fix.assertions = [part.fix.assertions[0]]; writeFileSync(p, JSON.stringify(l, null, 2) + "\n"); sh("bun", ["run", "docs/audit/ledger-print.ts", "list"]); g("add", "-A"); }
record("23", "an accepted fix's protection quietly removed from the ledger", guard(), /an accepted fix's assertions changed with no ruling/);
reset();

/* ---- a behaviour fix: its check must FAIL on the tree before the fix ---- */
if (process.argv.includes("--with-behaviour")) {
  appendFileSync(join(COPY, ".git/info/exclude"), "\nwebapp/node_modules\n");
  execFileSync("ln", ["-s", join(ROOT, "webapp/node_modules"), join(COPY, "webapp/node_modules")]);
  const R = g("rev-parse", "HEAD");
  const PROVEN = "demo: the health report carries the planted field", UNPROVEN = "fresh database: server boots";
  const bug = {
    id: "bug", revision: 1, title: "Demonstration: a behaviour fix and the check that proves it", model: "demo", base: R,
    items: [{ id: "24", part: "all", scope: "A planted behaviour defect: the health report lacks a field.", assertions: [
      { kind: "check", suite: "server", label: PROVEN }, { kind: "check", suite: "server", label: UNPROVEN },
    ] }],
    files: [{ path: "webapp/server/routes-payments.ts", mode: "code", why: "the planted fix" }, { path: "webapp/server/e2e.ts", mode: "code", control: true, why: "the check that proves it" }, { path: "webapp/api/index.mjs", mode: "generated", why: "rebuilt bundle" }],
    requiredChecks: ["server", "assertions"],
  };
  mkdirSync(join(COPY, "docs/audit/batches/bug"), { recursive: true });
  writeFileSync(join(COPY, "docs/audit/batches/bug/batch.json"), JSON.stringify(bug, null, 2) + "\n");
  sh("bun", ["run", "docs/audit/batch.ts", "authorize", "bug"]); g("add", "-A"); g("commit", "-q", "--no-verify", "-m", "authorize batch bug (records only)"); g("push", "-q", "origin", "main");
  g("checkout", "-q", "-b", "audit/batch-bug");
  edit("webapp/server/routes-payments.ts", "return c.json({ data: { ok: ordering, database: true, ordering } }", "return c.json({ data: { ok: ordering, database: true, ordering, ledgerDemo: true } }");
  edit("webapp/server/e2e.ts", "const testEmail =", `check(${JSON.stringify(PROVEN)}, (await fetch(BASE + "/api/health").then((r) => r.json()).catch(() => null))?.data?.ledgerDemo === true);\nconst testEmail =`);
  sh("bun", ["run", "docs/audit/batch.ts", "implemented", "bug"]); g("add", "-A");
  record("24", "a behaviour fix inside its declared files", guard(), "pass");
  g("commit", "-q", "--no-verify", "-m", "batch bug: the planted behaviour fix and its check");
  const rv = spawnSync("bun", ["run", "scripts/audit-review.ts", "bug", "--no-serve"], { cwd: join(COPY, "webapp"), env: { ...env, FPSLLC_DROPBOX: join(tmp, "no-dropbox-here") }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = { code: rv.status ?? -1, out: `${rv.stdout ?? ""}${rv.stderr ?? ""}` };
  record("25", "the fix's check passes on the fixed tree (the server checks, run by the review command)", { code: /server … passed/.test(out.out) ? 0 : 1, out: out.out.split("\n").filter((l) => /server … passed/.test(l)).join("\n") }, "pass");
  record("26", "…and FAILS on the tree before the fix, at its own label", { code: 1, out: out.out }, /red, as required: "demo: the health report carries the planted field" fails on/);
  record("27", "a named check that also passes BEFORE the fix proves nothing, and the batch is not ready", out, /NOT PROVEN: "fresh database: server boots" PASSES on the tree before the fix/);
}

/* ---- the report ---- */
const failed = rows.filter((r) => !r.ok);
const md = [
  "# Batch zero — the demonstrations", "",
  `Run ${new Date().toISOString()} in a disposable copy (${tmp}) with a throwaway remote and a simulated acceptance file. Nothing here touched the real repository, GitHub or Adam's acceptances.`, "",
  `${rows.length - failed.length} of ${rows.length} behaved as required. A row passes only when a valid step exits 0, or a planted fault exits non-zero AND prints its own stated reason.`, "",
  "| # | What was tried | Required | Exit | What it printed |", "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.n} | ${r.what} | ${r.expect.replace(/\|/g, "\\|")} | ${r.exit} | ${r.ok ? "" : "**NOT AS REQUIRED** "}${r.line.replace(/\|/g, "\\|")} |`), "",
].join("\n");
mkdirSync(join(ROOT, "docs/audit/batches/0/evidence"), { recursive: true });
writeFileSync(join(ROOT, "docs/audit/batches/0/evidence/demo.md"), md + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${rows.length - failed.length} of ${rows.length} as required → docs/audit/batches/0/evidence/demo.md`);
process.exit(failed.length ? 1 : 0);
