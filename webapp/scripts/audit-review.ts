/**
 * Builds the review package for a batch, at the exact commit on its branch,
 * and then opens the isolated site so Adam can look at the finished result.
 *
 *   cd webapp && bun run scripts/audit-review.ts <batch>              checks + package + site
 *   cd webapp && bun run scripts/audit-review.ts <batch> --no-serve   checks + package only
 *   cd webapp && bun run scripts/audit-review.ts --serve-only         just the proven-offline site
 *
 * Every required check is RUN HERE, for this commit, with its command, exit
 * code and full output captured — a session does not get to report its own
 * results. A behaviour fix's named check is also run against the tree BEFORE
 * the fix and must fail there, at that label. The package is written outside
 * the repository (~/.fpsllc/reviews/), where the release gate reads it. The
 * Dropbox folder is hashed before and after, file by file.
 */
import { spawn } from "bun";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ROOT, REVIEWS, git, gitBytes, sha256, loadBatch, loadLedger, type BatchFile } from "../../docs/audit/ledger-lib";
import { snapshot } from "../../docs/audit/publish-docs";
import { startIsolatedStack } from "./isolated-stack";

const argv = process.argv.slice(2);
if (argv.includes("--serve-only")) {
  const s = await startIsolatedStack({ apiPort: 3199, webPort: 8199 });
  console.log(`\nThe review site is open at ${s.web} — press Ctrl-C to close it.`);
  await new Promise(() => {});
}

const id = argv.find((a) => !a.startsWith("--")) ?? "";
const batch: BatchFile = loadBatch(id);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
if (branch !== `audit/batch-${id}`) { console.error(`review: be on the branch audit/batch-${id} (this is ${branch})`); process.exit(1); }
if (git(["status", "--porcelain"]).trim()) { console.error("review: the working tree has uncommitted changes — the package is for an exact commit"); process.exit(1); }
const commit = git(["rev-parse", "HEAD"]).trim();
git(["fetch", "--quiet", "origin", "main"], { allowFail: true });
const live = git(["rev-parse", "origin/main"]).trim();
const ledger = loadLedger();
const notDone = batch.items.filter((bi) => ledger.items.find((i) => i.id === bi.id)?.parts.find((p) => p.key === bi.part)?.status !== "implemented");
if (notDone.length) { console.error(`review: not every item is recorded as implemented: ${notDone.map((x) => x.id).join(", ")}`); process.exit(1); }

const dir = join(REVIEWS, `${id}-r${batch.revision}-${commit.slice(0, 7)}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "checks"), { recursive: true });
const dropboxBefore = snapshot();

interface Check { name: string; command: string; exit: number | null; skipped: boolean; log: string; seconds: number }
const checks: Check[] = [];
async function run(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<number | null> {
  const started = Date.now();
  const log = join(dir, "checks", `${name}.log`);
  process.stdout.write(`  ${name} … `);
  const p = spawn(cmd, { cwd: opts.cwd ?? join(ROOT, "webapp"), env: { ...process.env, ...opts.env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  writeFileSync(log, `$ ${cmd.join(" ")}\n(exit ${exit})\n\n${out}\n${err}`);
  checks.push({ name, command: cmd.join(" "), exit, skipped: false, log, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(exit === 0 ? `passed (${checks[checks.length - 1].seconds}s)` : `FAILED, exit ${exit} — see ${log}`);
  return exit;
}

console.log(`review: batch ${id} revision ${batch.revision} at ${commit.slice(0, 7)} (live main is ${live.slice(0, 7)})`);
const serverResults = join(dir, "checks", "server-results.jsonl");
const walkResults = join(dir, "checks", "walk-results.jsonl");
const DOC_GATES = "python3 docs/provision-map.py && python3 docs/coverage-605.py && python3 docs/event-map.py && python3 docs/docs-consistency.py && python3 docs/structure.py && python3 docs/drafting-lint.py webapp/server/templates-oa-*.md && python3 docs/format-check.py docs/word/*.docx";
const wants = (n: string) => batch.requiredChecks.includes(n);

if (wants("typecheck")) await run("typecheck", ["bun", "run", "typecheck"]);
if (wants("lint")) await run("lint", ["bun", "run", "lint"]);
if (wants("unit")) await run("unit", ["bun", "run", "test"]);
if (wants("facts")) await run("facts", ["bun", "run", "../docs/facts-check.ts"]);
if (wants("guard")) await run("guard", ["bun", "run", "../docs/audit/guard.ts"]);
if (wants("documents")) await run("documents", ["bash", "-c", DOC_GATES], { cwd: ROOT });
if (wants("server")) {
  const s = await startIsolatedStack({ apiPort: 3140 + Math.floor(Math.random() * 40), webPort: 0, apiOnly: true, quiet: true });
  try { await run("server", ["bun", "run", "server/e2e.ts"], { env: { E2E_BASE_URL: s.api, CHECK_RESULTS_FILE: serverResults } }); } finally { s.stop(); }
}
if (wants("walk")) await run("walk", ["bun", "run", "behavioral"], { env: { CHECK_RESULTS_FILE: walkResults } });
if (wants("assertions")) {
  const extra = existsSync(join(ROOT, `docs/audit/batches/${id}/extra-assertions.json`)) ? ["--extra", join(ROOT, `docs/audit/batches/${id}/extra-assertions.json`)] : [];
  await run("assertions", ["bun", "run", "scripts/audit-assert.ts", "--results", serverResults, "--results", walkResults, ...extra]);
}

/* A behaviour fix: its check must FAIL on the tree before the fix — at its own label. */
const named = batch.items.flatMap((bi) => bi.assertions.flatMap((a) => (a.kind === "check" ? [a] : [])));
if (named.length > 0) {
  const started = Date.now();
  const wt = mkdtempSync(join(tmpdir(), "before-fix-"));
  const log = join(dir, "checks", "red-before-fix.log");
  let exit = 0; const lines: string[] = [];
  try {
    git(["worktree", "add", "--detach", wt, batch.base]);
    for (const f of ["webapp/server/e2e.ts", "webapp/scripts/behavioral.ts"]) { const b = gitBytes(`${commit}:${f}`); if (b) writeFileSync(join(wt, f), b); }
    symlinkSync(join(ROOT, "webapp/node_modules"), join(wt, "webapp/node_modules"));
    for (const suite of [...new Set(named.map((a) => a.suite))]) {
      const res = join(dir, "checks", `before-${suite}-results.jsonl`);
      if (suite === "server") {
        const s = await startIsolatedStack({ apiPort: 3180 + Math.floor(Math.random() * 15), webPort: 0, apiOnly: true, quiet: true, cwd: join(wt, "webapp") });
        try { await spawn(["bun", "run", "server/e2e.ts"], { cwd: join(wt, "webapp"), env: { ...process.env, E2E_BASE_URL: s.api, CHECK_RESULTS_FILE: res }, stdout: "ignore", stderr: "ignore" }).exited; } finally { s.stop(); }
      } else {
        await spawn(["bun", "run", "behavioral"], { cwd: join(wt, "webapp"), env: { ...process.env, CHECK_RESULTS_FILE: res }, stdout: "ignore", stderr: "ignore" }).exited;
      }
      const got = new Map<string, boolean[]>();
      if (existsSync(res)) for (const l of readFileSync(res, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l) as { label: string; ok: boolean }; got.set(r.label, [...(got.get(r.label) ?? []), r.ok]); }
      for (const a of named.filter((x) => x.suite === suite)) {
        const g = got.get(a.label);
        if (!g) { exit = 1; lines.push(`NOT PROVEN: "${a.label}" never ran on the tree before the fix — the suite stopped earlier, so the failure shown is not this defect`); }
        else if (g.every(Boolean)) { exit = 1; lines.push(`NOT PROVEN: "${a.label}" PASSES on the tree before the fix — it does not detect the defect`); }
        else lines.push(`red, as required: "${a.label}" fails on ${batch.base.slice(0, 7)}, before the fix`);
      }
    }
  } catch (e) { exit = 1; lines.push(`could not run the before-fix tree: ${String(e)}`); } finally { git(["worktree", "remove", "--force", wt], { allowFail: true }); }
  writeFileSync(log, lines.join("\n") + "\n");
  checks.push({ name: "red-before-fix", command: `the named checks, run on ${batch.base.slice(0, 7)}`, exit, skipped: false, log, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`  red-before-fix … ${exit === 0 ? "proven" : "NOT PROVEN"}\n${lines.map((l) => `    ${l}`).join("\n")}`);
}

/* Dropbox, by content */
const dropboxAfter = snapshot();
const strip = (s: ReturnType<typeof snapshot>) => JSON.stringify((s ?? []).map((x) => [x.path, x.sha]));
const same = strip(dropboxBefore) === strip(dropboxAfter);
writeFileSync(join(dir, "dropbox-before.json"), JSON.stringify(dropboxBefore, null, 2));
writeFileSync(join(dir, "dropbox-after.json"), JSON.stringify(dropboxAfter, null, 2));
checks.push({ name: "dropbox-unchanged", command: "every file's path and content hash, before and after the run", exit: same ? 0 : 1, skipped: false, log: join(dir, "dropbox-after.json"), seconds: 0 });
console.log(`  dropbox-unchanged … ${dropboxBefore === null ? "the folder is not readable from this process — nothing could have been written to it" : same ? `${dropboxBefore.length} files, identical paths and contents` : "CHANGED"}`);

const diff = git(["diff", "--no-renames", live, commit]);
const docs = readdirSync(join(ROOT, "docs/word")).filter((f) => f.endsWith(".docx")).map((f) => ({ path: `docs/word/${f}`, sha: sha256(gitBytes(`${commit}:docs/word/${f}`) ?? Buffer.alloc(0)) }));
const required = [...batch.requiredChecks, ...(named.length ? ["red-before-fix"] : []), "dropbox-unchanged"];
writeFileSync(join(dir, "diff.patch"), diff);
writeFileSync(join(dir, "files.txt"), git(["diff", "--stat", "--no-renames", live, commit]));
writeFileSync(join(dir, "package.json"), JSON.stringify({ batch: id, revision: batch.revision, base: live, commit, diffSha: sha256(diff), createdAt: new Date().toISOString(), required, checks, docs }, null, 2));
const failed = required.filter((n) => checks.find((c) => c.name === n)?.exit !== 0);
console.log(`\nreview package: ${dir}`);
console.log(failed.length ? `NOT READY for Adam: ${failed.join(", ")} did not pass.` : `Ready for Adam. To accept exactly this version he says:  Accept ${id}, revision ${batch.revision}, ${commit.slice(0, 7)}`);
if (failed.length) process.exit(1);
if (!argv.includes("--no-serve")) {
  const s = await startIsolatedStack({ apiPort: 3199, webPort: 8199 });
  console.log(`\nThe review site is open at ${s.web} — press Ctrl-C to close it.`);
  await new Promise(() => {});
}
