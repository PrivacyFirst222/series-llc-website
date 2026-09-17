/**
 * Builds the review package for a batch and opens the site for Adam.
 *
 *   cd webapp && bun run scripts/audit-review.ts <batch>              checks + package + site
 *   cd webapp && bun run scripts/audit-review.ts <batch> --no-serve   checks + package only
 *   cd webapp && bun run scripts/audit-review.ts --serve <batch>      the newest package's preserved site
 *
 * Revision 2 (Codex's review of revision 1, findings 5, 7, 11, 13). Revision 1
 * checked the working tree once and then tested, built and served whatever
 * that folder held for the next ten minutes, while the package named a
 * commit. Now the exact commit is CHECKED OUT INTO ITS OWN FOLDER and
 * everything — every check, the build, the site — runs from there; at the
 * end that folder must still be at that commit, unmodified. The built site is
 * PRESERVED in the package, and --serve later serves those same bytes beside
 * an API started from a checkout of that same commit.
 *
 * Every mandatory check is RUN HERE with its command, exit code and full
 * output captured — a session does not report its own results, and a batch
 * cannot shorten the list (MANDATORY_CHECKS). A behaviour fix's named check is
 * also run on the tree BEFORE the fix, with the test-only files the batch
 * declares carried over, and must fail there at its own label; that run's
 * complete output is kept. All builds and servers share one sanitized
 * environment and a throwaway database; uploaded test files land inside the
 * isolated checkout, which is deleted at the end.
 * The package is written outside the repository (~/.fpsllc/reviews/).
 */
import { spawn } from "bun";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, rmSync, mkdtempSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { ROOT, REVIEWS, MANDATORY_CHECKS, git, gitBytes, sha256, type BatchFile, type Ledger } from "../../docs/audit/ledger-lib";
import { snapshot } from "../../docs/audit/publish-docs";
import { startIsolatedStack, buildSite, SANITIZED } from "./isolated-stack";

const argv = process.argv.slice(2);
const worktrees: string[] = [];
const checkout = (rev: string, label: string): string => {
  const wt = mkdtempSync(join(tmpdir(), `${label}-`));
  git(["worktree", "add", "--detach", wt, rev]);
  symlinkSync(join(ROOT, "webapp/node_modules"), join(wt, "webapp/node_modules"));
  worktrees.push(wt);
  return wt;
};
const dropCheckouts = () => { for (const wt of worktrees.splice(0)) git(["worktree", "remove", "--force", wt], { allowFail: true }); };
process.on("SIGINT", () => { dropCheckouts(); process.exit(130); });

if (argv[0] === "--serve") {
  const want = (argv[1] ?? "").toLowerCase();
  const dirs = existsSync(REVIEWS) ? readdirSync(REVIEWS).filter((d) => d.toLowerCase().startsWith(`${want}-r`) && existsSync(join(REVIEWS, d, "site/index.html"))) : [];
  const newest = dirs.sort((a, b) => statSync(join(REVIEWS, b)).mtimeMs - statSync(join(REVIEWS, a)).mtimeMs)[0];
  if (!newest) { console.error(`no review package with a preserved site for batch "${argv[1]}"`); process.exit(1); }
  const pkg = JSON.parse(readFileSync(join(REVIEWS, newest, "package.json"), "utf8")) as { commit: string; batch: string; revision: number };
  const wt = checkout(pkg.commit, "serve-commit");
  console.log(`serving batch ${pkg.batch} revision ${pkg.revision}: the site preserved in the package, and an API checked out at ${pkg.commit}`);
  const s = await startIsolatedStack({ webPort: 8199, cwd: join(wt, "webapp"), serveDir: join(REVIEWS, newest, "site") });
  console.log(`\nThe review site is open at ${s.web} — press Ctrl-C to close it.`);
  await new Promise(() => {});
}

const id = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--only") ?? "";
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
if (branch !== `audit/batch-${id}`) { console.error(`review: be on the branch audit/batch-${id} (this is ${branch})`); process.exit(1); }
const commit = git(["rev-parse", "HEAD"]).trim();
if (git(["status", "--porcelain"]).trim()) console.log("review: NOTE — this folder has uncommitted changes. They are NOT part of the review: the committed version is what gets checked out, tested, built and shown.");
git(["fetch", "--quiet", "origin", "main"], { allowFail: true });
const live = git(["rev-parse", "origin/main"]).trim();

const WT = checkout(commit, "review-commit");
const W = join(WT, "webapp");
const batch = JSON.parse(readFileSync(join(WT, `docs/audit/batches/${id}/batch.json`), "utf8")) as BatchFile;
const ledger = JSON.parse(readFileSync(join(WT, "docs/audit/ledger.json"), "utf8")) as Ledger;
const notDone = batch.items.filter((bi) => ledger.items.find((i) => i.id === bi.id)?.parts.find((p) => p.key === bi.part)?.status !== "implemented");
if (notDone.length) { dropCheckouts(); console.error(`review: not every item is recorded as implemented in the commit: ${notDone.map((x) => x.id).join(", ")}`); process.exit(1); }

const dir = join(REVIEWS, `${id}-r${batch.revision}-${commit}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "checks"), { recursive: true });
const dropboxBefore = snapshot();
const runId = `${id}-r${batch.revision}-${Date.now()}`;
const baseEnv = { ...SANITIZED, FPSLLC_BATCH: id, CHECK_COMMIT: commit, CHECK_RUN_ID: runId };

interface Check { name: string; command: string; cwd: string; exit: number | null; skipped: boolean; log: string; seconds: number }
const checks: Check[] = [];
async function run(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<number | null> {
  if (only && !only.includes(name)) return null;
  const started = Date.now();
  const log = join(dir, "checks", `${name}.log`);
  const cwd = opts.cwd ?? W;
  process.stdout.write(`  ${name} … `);
  const p = spawn(cmd, { cwd, env: { ...process.env, ...baseEnv, ...opts.env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  writeFileSync(log, `$ ${cmd.join(" ")}\n(in ${cwd}, checked out at ${commit}; exit ${exit})\n\n${out}\n${err}`);
  checks.push({ name, command: cmd.join(" "), cwd, exit, skipped: false, log, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(exit === 0 ? `passed (${checks[checks.length - 1].seconds}s)` : `FAILED, exit ${exit} — see ${log}`);
  return exit;
}

console.log(`review: batch ${id} revision ${batch.revision}; checked out ${commit} in ${WT} — every check, the build and the site run from there (live main is ${live.slice(0, 7)})`);
const serverResults = join(dir, "checks", "server-results.jsonl");
const walkResults = join(dir, "checks", "walk-results.jsonl");
const DOC_GATES = "python3 docs/provision-map.py && python3 docs/coverage-605.py && python3 docs/event-map.py && python3 docs/docs-consistency.py && python3 docs/structure.py && python3 docs/drafting-lint.py webapp/server/templates-oa-*.md && python3 docs/format-check.py docs/word/*.docx";

await run("typecheck", ["bun", "run", "typecheck"]);
await run("lint", ["bun", "run", "lint"]);
await run("unit", ["bun", "run", "test"]);
await run("facts", ["bun", "run", "../docs/facts-check.ts"]);
await run("guard", ["bun", "run", "../docs/audit/guard.ts"]);
await run("documents", ["bash", "-c", DOC_GATES], { cwd: WT });
if (!only || only.includes("server")) {
  const s = await startIsolatedStack({ apiOnly: true, quiet: true, cwd: W });
  try { await run("server", ["bun", "run", "server/e2e.ts"], { env: { E2E_BASE_URL: s.api, CHECK_RESULTS_FILE: serverResults } }); } finally { s.stop(); }
}
await run("walk", ["bun", "run", "behavioral"], { env: { CHECK_RESULTS_FILE: walkResults } });
{
  const extraFile = join(WT, `docs/audit/batches/${id}/extra-assertions.json`);
  await run("assertions", ["bun", "run", "scripts/audit-assert.ts", "--results", serverResults, "--results", walkResults, "--commit", commit, ...(existsSync(extraFile) ? ["--extra", extraFile] : [])]);
}

/* A behaviour fix: its check must FAIL on the tree before the fix — at its own label. */
const named = batch.items.flatMap((bi) => bi.assertions.flatMap((a) => (a.kind === "check" ? [a] : [])));
if (named.length > 0 && (!only || only.includes("server") || only.includes("red-before-fix"))) {
  const started = Date.now();
  const log = join(dir, "checks", "red-before-fix.log");
  let exit = 0; const lines: string[] = [];
  try {
    const before = checkout(batch.base, "before-fix");
    // The new check, and the test-only files it needs — never the product fix.
    for (const f of ["webapp/server/e2e.ts", "webapp/scripts/behavioral.ts", ...(batch.testSupport ?? [])]) {
      const b = gitBytes(`${commit}:${f}`);
      if (b) { mkdirSync(dirname(join(before, f)), { recursive: true }); writeFileSync(join(before, f), b); }
    }
    for (const suite of [...new Set(named.map((a) => a.suite))]) {
      const res = join(dir, "checks", `before-${suite}-results.jsonl`);
      const out = join(dir, "checks", `before-${suite}.log`);
      const envB = { ...process.env, ...baseEnv, CHECK_COMMIT: batch.base, CHECK_RESULTS_FILE: res };
      let text = "";
      if (suite === "server") {
        const s = await startIsolatedStack({ apiOnly: true, quiet: true, cwd: join(before, "webapp") });
        try { const p = spawn(["bun", "run", "server/e2e.ts"], { cwd: join(before, "webapp"), env: { ...envB, E2E_BASE_URL: s.api }, stdout: "pipe", stderr: "pipe" }); text = `${await new Response(p.stdout).text()}\n${await new Response(p.stderr).text()}\n(exit ${await p.exited})`; } finally { s.stop(); }
      } else {
        const p = spawn(["bun", "run", "behavioral"], { cwd: join(before, "webapp"), env: envB, stdout: "pipe", stderr: "pipe" });
        text = `${await new Response(p.stdout).text()}\n${await new Response(p.stderr).text()}\n(exit ${await p.exited})`;
      }
      writeFileSync(out, `the ${suite} checks of ${commit.slice(0, 7)}, run on the tree BEFORE the fix (${batch.base})\n\n${text}`);
      lines.push(`before-fix output kept: ${out} (${text.length} characters)`);
      const got = new Map<string, { ok: boolean; detail?: unknown }[]>();
      if (existsSync(res)) for (const l of readFileSync(res, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l) as { suite: string; label: string; ok: boolean; detail?: unknown }; if (r.suite === suite) got.set(r.label, [...(got.get(r.label) ?? []), { ok: r.ok === true, detail: r.detail }]); }
      for (const a of named.filter((x) => x.suite === suite)) {
        const g = got.get(a.label);
        if (!g) { exit = 1; lines.push(`NOT PROVEN: "${a.label}" never ran on the tree before the fix — the suite stopped earlier, so whatever failed is not shown to be this defect. Read ${out}`); }
        else if (g.every((x) => x.ok)) { exit = 1; lines.push(`NOT PROVEN: "${a.label}" PASSES on the tree before the fix — it does not detect the defect`); }
        else lines.push(`red, as required: "${a.label}" fails on ${batch.base.slice(0, 7)}, before the fix — what it got: ${JSON.stringify(g.find((x) => !x.ok)?.detail ?? "(no detail recorded)").slice(0, 300)}. Whether that is the reported defect is for the reviewer to read.`);
      }
    }
  } catch (e) { exit = 1; lines.push(`could not run the before-fix tree: ${String(e).split("\n")[0]}`); }
  writeFileSync(log, lines.join("\n") + "\n");
  checks.push({ name: "red-before-fix", command: `the named checks, run on ${batch.base.slice(0, 7)}`, cwd: "(a checkout of the batch's base)", exit, skipped: false, log, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`  red-before-fix … ${exit === 0 ? "proven" : "NOT PROVEN"}\n${lines.map((l) => `    ${l}`).join("\n")}`);
}

/* The site Adam will look at: built once, from the checkout, and kept. */
if (!only) { process.stdout.write("  building the review site from the checkout … "); await buildSite(W, join(dir, "site")); console.log("kept in the package"); }

/* Dropbox, by content */
const dropboxAfter = snapshot();
const strip = (s: ReturnType<typeof snapshot>) => JSON.stringify((s ?? []).map((x) => [x.path, x.sha]));
const same = strip(dropboxBefore) === strip(dropboxAfter);
writeFileSync(join(dir, "dropbox-before.json"), JSON.stringify(dropboxBefore, null, 2));
writeFileSync(join(dir, "dropbox-after.json"), JSON.stringify(dropboxAfter, null, 2));
checks.push({ name: "dropbox-unchanged", command: "every file's path and content hash, before and after the run", cwd: "", exit: same ? 0 : 1, skipped: false, log: join(dir, "dropbox-after.json"), seconds: 0 });
console.log(`  dropbox-unchanged … ${dropboxBefore === null ? "the folder is not readable from this process — nothing could have been written to it" : same ? `${dropboxBefore.length} files, identical paths and contents` : "CHANGED"}`);

/* The checkout must still be the commit, untouched. */
const drift = git(["-C", WT, "rev-parse", "HEAD"]).trim() !== commit || git(["-C", WT, "status", "--porcelain", "--untracked-files=no"]).trim() !== "";
checks.push({ name: "checkout-unchanged", command: `the checkout is still ${commit}, with no tracked file modified`, cwd: WT, exit: drift ? 1 : 0, skipped: false, log: "", seconds: 0 });
console.log(`  checkout-unchanged … ${drift ? "THE CHECKOUT CHANGED DURING THE REVIEW" : `still ${commit.slice(0, 7)}, no tracked file modified`}`);

const diff = git(["diff", "--no-renames", live, commit]);
const docs = readdirSync(join(WT, "docs/word")).filter((f) => f.endsWith(".docx")).map((f) => ({ path: `docs/word/${f}`, sha: sha256(gitBytes(`${commit}:docs/word/${f}`) ?? Buffer.alloc(0)) }));
const required = [...new Set([...MANDATORY_CHECKS, ...batch.requiredChecks, ...(named.length ? ["red-before-fix"] : []), "checkout-unchanged"])];
writeFileSync(join(dir, "diff.patch"), diff);
writeFileSync(join(dir, "files.txt"), git(["diff", "--stat", "--no-renames", live, commit]));
writeFileSync(join(dir, "package.json"), JSON.stringify({ batch: id, revision: batch.revision, base: live, commit, diffSha: sha256(diff), createdAt: new Date().toISOString(), runId, partial: only, required, checks, docs }, null, 2));
const failed = required.filter((n) => checks.find((c) => c.name === n)?.exit !== 0);
console.log(`\nreview package: ${dir}`);
console.log(failed.length ? `NOT READY for Adam: ${failed.join(", ")} did not pass${only ? " (a partial run can never be released)" : ""}.` : `Ready for Adam. To accept exactly this version, his whole message is:  Accept ${id}, revision ${batch.revision}, ${commit.slice(0, 7)}`);
if (failed.length || argv.includes("--no-serve")) { dropCheckouts(); process.exit(failed.length ? 1 : 0); }
const s = await startIsolatedStack({ webPort: 8199, cwd: W, serveDir: join(dir, "site") });
console.log(`\nThe review site is open at ${s.web}: the build kept in the package, and an API checked out at ${commit.slice(0, 7)} — press Ctrl-C to close it.`);
await new Promise(() => {});
