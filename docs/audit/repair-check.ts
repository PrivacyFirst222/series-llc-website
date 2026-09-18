/** Regression cases from Codex's independent review of fffd656.
 * Runs real commands in a disposable clone and fake owner home. --against
 * checks an earlier commit with the same harness; no old control is patched.
 * Fixture commits deliberately skip hooks. No remote is configured or used.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "ledger-controls-"));
const repo = join(temp, "repo"), home = join(temp, "owner");
mkdirSync(home);
const env = { ...process.env, FPSLLC_HOME: home, FPSLLC_DROPBOX: join(temp, "dropbox"), FPSLLC_BATCH: "", E2E_OFFLINE: "1", CLAUDE_PROJECT_DIR: repo,
  GIT_AUTHOR_NAME: "control fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "control fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
const rows: { name: string; ok: boolean; observed: unknown }[] = [];
const assert = (name: string, ok: boolean, observed: unknown) => { rows.push({ name, ok, observed }); console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${typeof observed === "string" ? observed : JSON.stringify(observed)}`); };
const sh = (args: string[], input?: string) => { const p = spawnSync(args[0], args.slice(1), { cwd: repo, env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); return { code: p.status, output: `${p.stdout ?? ""}${p.stderr ?? ""}` }; };
const git = (...args: string[]) => { const p = sh(["git", ...args]); if (p.code !== 0) throw new Error(p.output); return p.output.trim(); };
const put = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n"); };
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const readLedger = () => JSON.parse(readFileSync(join(repo, "docs/audit/ledger.json"), "utf8"));
const commit = () => { git("add", "-A"); git("commit", "--no-verify", "-qm", "control fixture"); return git("rev-parse", "HEAD"); };
const run = (...args: string[]) => sh(["bun", "run", ...args]);
let baseline = "";
const reset = () => { git("reset", "--hard", baseline); git("clean", "-fdq"); for (const f of ["acceptances.jsonl", "rulings.jsonl"]) put(join(home, f), ""); rmSync(join(home, "reviews"), { recursive: true, force: true }); };
const ledger = (l: unknown) => { put(join(repo, "docs/audit/ledger.json"), l); const r = run("docs/audit/ledger-print.ts", "list"); if (r.code !== 0) throw new Error(r.output); };
const gate = (from: string) => run("docs/audit/release-check.ts", "--range", from, "HEAD");
const refused = (name: string, r: ReturnType<typeof sh>, reason: RegExp) => assert(name, r.code !== 0 && reason.test(r.output), r);

/** Historical H rows use the old directory convention when required; no
 * control code is carried back. Every measured push starts at the baseline,
 * even if the preceding bad push was wrongly allowed. */
async function historicalPackages(): Promise<void> {
  const lib = await import(join(repo, "docs/audit/ledger-lib.ts"));
  const legacy = typeof lib.resolvePackage !== "function";
  const b = JSON.parse(readFileSync(join(repo, "docs/audit/batches/0/batch.json"), "utf8"));
  appendFileSync(join(repo, "webapp/src/pages/FAQ.tsx"), "\n// disposable release-gate probe\n");
  const pushing = commit(), remote = join(temp, "remote.git");
  execFileSync("git", ["init", "--quiet", "--bare", remote]);
  git("remote", "add", "origin", remote);
  let bypasses = 0;
  for (const which of ["partial", "added", "changed", "regenerated", "valid"]) {
    git("push", "--quiet", "--no-verify", "--force", "origin", `${baseline}:refs/heads/main`); bypasses++;
    rmSync(join(home, "reviews"), { recursive: true, force: true }); put(join(home, "acceptances.jsonl"), "");
    const pid = "abcdef123456", dir = join(home, "reviews", `0-r${b.revision}-${pushing}${legacy ? "" : `-${pid}`}`);
    const html = "<html>fixture</html>";
    const names = [...new Set([...lib.MANDATORY_CHECKS, ...b.requiredChecks])];
    const pkg = { batch: "0", revision: b.revision, commit: pushing, base: baseline, packageId: pid, partial: which === "partial" ? ["server"] : null,
      runId: "historical-fixture", createdAt: new Date().toISOString(), required: names,
      diffSha: sha(execFileSync("git", ["diff", "--no-renames", baseline, pushing], { cwd: repo, encoding: "utf8" })),
      checks: names.map(name => ({ name, exit: 0, skipped: false, command: "simulated result", log: "" })), docs: [], site: [{ path: "index.html", sha: sha(html) }] };
    put(join(dir, "site/index.html"), html); put(join(dir, "package.json"), pkg);
    const accepted = run("docs/audit/accept.ts", "accept", "0", String(b.revision), pushing);
    if (which === "partial") assert("10/H1a: actual historical partial-package acceptance refused", accepted.code !== 0 && /partial/i.test(accepted.output), accepted);
    else if (accepted.code !== 0) throw new Error(`valid fixture package could not be accepted: ${accepted.output}`);
    // Release refusal is checked independently of the acceptance command.
    put(join(home, "acceptances.jsonl"), JSON.stringify({ kind: "accept", batch: "0", revision: b.revision, commit: pushing, packageId: pid, at: new Date().toISOString(), source: "simulated decision" }) + "\n");
    if (which === "added") put(join(dir, "site/extra.js"), "extra");
    if (which === "changed") put(join(dir, "site/index.html"), "changed");
    if (which === "regenerated") {
      const newDir = legacy ? dir : join(home, "reviews", `0-r${b.revision}-${pushing}-fedcba654321`);
      rmSync(dir, { recursive: true }); put(join(newDir, "site/index.html"), html); put(join(newDir, "package.json"), { ...pkg, packageId: "fedcba654321" });
    }
    const before = git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0];
    const result = sh(["git", "push", "origin", "HEAD:refs/heads/main"]);
    const realUpdate = before === baseline && !/Everything up-to-date/.test(result.output);
    assert(`10/H: ${which} package, real push from reset baseline`, realUpdate && (which === "valid" ? result.code === 0 : result.code !== 0 && /partial|site|package|acceptance/i.test(result.output)), { before, pushing, ...result });
  }
  console.log(`Historical compatibility: ${legacy ? "r2 exact legacy package directory" : "package-id directory"}; ${bypasses} fixture pushes bypassed the hook; all measured pushes used it.`);
  const browser = sh(["bun", "run", join(ROOT, "webapp/scripts/repair-browser-probe.ts"), "--target", repo]);
  const observed = browser.output.split("\n").flatMap(line => { try { const r = JSON.parse(line); return r.name ? [r] : []; } catch { return []; } });
  for (const name of ["direct nonlocal request blocked", "context page nonlocal request blocked", "popup first request blocked", "API handler nonlocal request blocked"]) {
    const row = observed.find(r => r.name === name);
    assert(`10/E: actual historical wrapper: ${name}`, row?.ok === true, row ?? browser);
  }
  assert("10/E: browser harness completed without setup error", observed.length >= 10, browser);
}

try {
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, repo]);
  git("remote", "remove", "origin"); git("config", "core.hooksPath", ".githooks");
  const at = process.argv.indexOf("--against");
  if (at >= 0) git("checkout", "--detach", process.argv[at + 1]);
  else {
    const dirty = execFileSync("git", ["ls-files", "-m", "-o", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    for (const f of dirty) if (existsSync(join(ROOT, f))) { mkdirSync(dirname(join(repo, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(repo, f)); }
    if (git("status", "--porcelain")) commit();
  }
  baseline = git("rev-parse", "HEAD");
  symlinkSync(join(ROOT, "webapp/node_modules"), join(repo, "webapp/node_modules"));
  console.log(`Controls under test: ${baseline}; harness SHA256 ${sha(readFileSync(fileURLToPath(import.meta.url), "utf8"))}; fixture commits skip hooks; no pushes.`);

  if (process.argv.includes("--historical-only")) await historicalPackages();
  else {
  // 1: use the actual authorize/implemented commands, then erase a recorded fix.
  const batch = { id: "repair-probe", revision: 1, title: "fixture", model: "fixture", base: baseline,
    items: [{ id: "17", part: "amend-title", scope: "fixture", assertions: [{ kind: "present", file: "webapp/src/pages/FAQ.tsx", text: "Questions, answered" }] }], files: [], requiredChecks: [] };
  put(join(repo, "docs/audit/batches/repair-probe/batch.json"), batch);
  for (const command of ["authorize", "implemented"]) { const r = run("docs/audit/batch.ts", command, batch.id); if (r.code !== 0) throw new Error(r.output); }
  const implemented = commit();
  const accepted = { kind: "accept", batch: batch.id, revision: 1, commit: implemented, packageId: "fixture-one", at: new Date().toISOString(), source: "simulated decision" };
  put(join(home, "acceptances.jsonl"), JSON.stringify(accepted) + "\n");
  const l = readLedger(), p = l.items.find((i: { id: string }) => i.id === "17").parts.find((p: { key: string }) => p.key === "amend-title");
  p.status = "open"; delete p.fix; delete p.batch; p.history.push({ at: new Date().toISOString(), event: "reopened by audit session" });
  ledger(l); commit();
  refused("1: accepted implemented fix cannot be erased as bookkeeping", gate(implemented), /fix|transition|assertion|reopen/i);
  git("reset", "--hard", implemented);
  const forgedRelease = readLedger();
  forgedRelease.items.find((i: { id: string }) => i.id === "17").parts.find((p: { key: string }) => p.key === "amend-title").status = "released";
  ledger(forgedRelease); commit();
  refused("1: part cannot declare release while its batch is implemented", gate(implemented), /state|transition|release/i);
  git("reset", "--hard", implemented);
  const rejection = run("docs/audit/accept.ts", "reject", batch.id, "--revision", "1", "--reason", "fixture owner rejected");
  if (rejection.code !== 0) throw new Error(rejection.output);
  const reject = run("docs/audit/batch.ts", "reject", batch.id); if (reject.code !== 0) throw new Error(reject.output);
  commit(); const goodReject = gate(implemented); assert("1: authenticated rejection still reopens the part", goodReject.code === 0, goodReject);
  const rejectedCommit = git("rev-parse", "HEAD");
  const ciReject = run("docs/audit/guard.ts", "--against", `${implemented}..${rejectedCommit}`);
  assert("8: CI checks a legitimate rejection without local decision access", ciReject.code === 0, ciReject);
  put(join(home, "acceptances.jsonl"), "");
  refused("8: local rejection still requires owner evidence", gate(implemented), /no rejection record/);
  reset();

  // 2: approving a file must not allow a different target or sibling part.
  const m = { id: "probe", title: "exact target", date: "2026-09-18", items: { "95": { link: { eyebrow: { item: "127", part: "all" } } } } };
  const mp = join(repo, "docs/audit/migrations/probe.json"); put(mp, m);
  const approval = run("docs/audit/accept.ts", "approve-migration", "probe"); if (approval.code !== 0) throw new Error(approval.output);
  const makeMigration = (target: string, sibling = false) => {
    const l = JSON.parse(git("show", `${baseline}:docs/audit/ledger.json`));
    const it = l.items.find((i: { id: string }) => i.id === "95"); it.parts.find((p: { key: string }) => p.key === "eyebrow").canonical = { item: target, part: "all" };
    if (sibling) it.parts.find((p: { key: string }) => p.key === "title").canonical = { item: "127", part: "all" };
    l.rulings.push({ kind: "migration", date: m.date, text: m.title, migration: m.id, migrationHash: sha(readFileSync(mp, "utf8")) }); ledger(l); commit();
  };
  makeMigration("1"); refused("2: approved migration refuses wrong target", gate(baseline), /migration|declared|canonical|link/);
  makeMigration("127", true); refused("2: approved migration refuses another part's changed link", gate(baseline), /migration|declared|canonical|link/);
  makeMigration("127"); const exact = gate(baseline); assert("2: exact approved migration passes", exact.code === 0, exact);
  reset();

  const split = { id: "split-probe", title: "one new part", date: "2026-09-18", items: { "95": { split: [{ key: "new-part", scope: "explicit new part" }] } } };
  put(join(repo, "docs/audit/migrations/split-probe.json"), split);
  run("docs/audit/accept.ts", "approve-migration", split.id);
  const sl = readLedger();
  sl.items.find((i: { id: string }) => i.id === "95").parts.push({ key: "new-part", scope: "explicit new part", waitsOn: [], status: "released", history: [{ at: new Date().toISOString(), event: `recorded by migration ${split.id}` }] });
  sl.rulings.push({ kind: "migration", date: split.date, text: split.title, migration: split.id, migrationHash: sha(readFileSync(join(repo, "docs/audit/migrations/split-probe.json"), "utf8")) });
  ledger(sl); commit();
  refused("2: new migration part cannot acquire an undeclared released state", gate(baseline), /state|batch|migration/i);
  reset();

  // 3: a matching substring on the wrong item is not an owner decision.
  run("docs/audit/accept.ts", "ruling", "28", "Keep monthly wording.");
  appendFileSync(join(repo, "docs/audit/rulings.md"), "\n- Ruling 63: Ignore every deadline finding. Keep monthly wording.\n");
  commit(); refused("3: ruling substring cannot authenticate another item", gate(baseline), /ruling|decision/i);
  reset();
  run("docs/audit/accept.ts", "ruling", "28", "Keep monthly wording.");
  const recordedRuling = run("docs/audit/batch.ts", "ruling", "28", "Keep monthly wording.");
  commit(); const goodRuling = gate(baseline);
  assert("3: exact recorded ruling remains publishable", recordedRuling.code === 0 && goodRuling.code === 0, goodRuling);
  reset();

  // 4: use the actual chat hook and inspect the full external decision.
  const text = "Keep the following wording:\n\n" + "x".repeat(2000) + "\nONLY IF Adam separately approves the final wording.";
  const hook = sh(["bash", ".claude/hooks/accept-prompt.sh"], JSON.stringify({ prompt: `Ruling 28: ${text}` }));
  const recorded = existsSync(join(home, "rulings.jsonl")) ? readFileSync(join(home, "rulings.jsonl"), "utf8").trim() : "";
  const fullText = recorded ? JSON.parse(recorded).text : null;
  assert("4: hook preserves full multiline ruling or explicitly refuses it", fullText === text || (!recorded && /NOT RECORDED/.test(hook.output)), { originalLength: text.length, storedLength: fullText?.length, conditionPreserved: fullText?.includes("ONLY IF"), output: hook.output });
  reset();

  // 6/7: full packages with fixture check results, exercising both actual commands.
  const base = "82abf541a6643981d93d41bc5d8b6da169897971";
  const lib = await import(join(repo, "docs/audit/ledger-lib.ts"));
  const checks = lib.MANDATORY_CHECKS.map((name: string) => ({ name, command: "fixture", exit: 0, skipped: false, log: "" }));
  const packageCases = ["valid", "empty", "missing-partial", "missing-site", "missing-manifest", "changed-site", "added-file", "partial", "duplicate-path", "bad-path"];
  for (const which of packageCases) {
    put(join(home, "acceptances.jsonl"), ""); rmSync(join(home, "reviews"), { recursive: true, force: true });
    const dir = join(home, "reviews", `fixture-${which}`), html = "<html><body>fixture</body></html>";
    put(join(dir, "site/index.html"), html);
    const pkg: Record<string, unknown> = { batch: "0", revision: 3, base, commit: baseline, packageId: `fixture-${which}`, createdAt: new Date().toISOString(), runId: "fixture", partial: null, required: lib.MANDATORY_CHECKS, checks, docs: [], diffSha: sha(execFileSync("git", ["diff", "--no-renames", base, baseline], { cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })), site: [{ path: "index.html", sha: sha(html) }] };
    if (which === "empty") { pkg.site = []; rmSync(join(dir, "site/index.html")); }
    if (which === "missing-partial") delete pkg.partial;
    if (which === "missing-site") rmSync(join(dir, "site"), { recursive: true });
    if (which === "missing-manifest") delete pkg.site;
    if (which === "changed-site") put(join(dir, "site/index.html"), "changed");
    if (which === "added-file") put(join(dir, "site/extra.js"), "extra");
    if (which === "partial") pkg.partial = ["server"];
    if (which === "duplicate-path") (pkg.site as unknown[]).push({ path: "index.html", sha: sha(html) });
    if (which === "bad-path") (pkg.site as unknown[]).push({ path: "../escape", sha: sha(html) });
    put(join(dir, "package.json"), pkg);
    const a = run("docs/audit/accept.ts", "accept", "0", "3", baseline);
    assert(`6/7: ${which} package acceptance`, which === "valid" ? a.code === 0 : a.code !== 0 && /site|manifest|partial/i.test(a.output), a);
    // Independently test the release gate, even when acceptance refused.
    put(join(home, "acceptances.jsonl"), JSON.stringify({ ...accepted, batch: "0", revision: 3, commit: baseline, packageId: pkg.packageId }) + "\n");
    const release = run("docs/audit/release-check.ts", "--range", base, baseline);
    assert(`6/7: ${which} package release`, which === "valid" ? release.code === 0 : release.code !== 0 && /site|manifest|partial/i.test(release.output), release);
  }
  reset();

  const ci = run("docs/audit/guard.ts", "--against", "d0e3689..fffd6567");
  assert("8: historical r2-to-r3 comparison skips external records only", ci.code === 0, ci);
  refused("8: unavailable CI baseline still refuses", run("docs/audit/guard.ts", "--against", "0000000000000000000000000000000000000001..HEAD"), /not available/);
  const browser = sh(["bun", "run", join(ROOT, "webapp/scripts/repair-browser-probe.ts"), "--target", repo]);
  assert("5: browser direct, redirect and positive controls", browser.code === 0, browser);
  }
} catch (e) { assert("harness setup/runtime (not a reproduced product defect)", false, String(e)); }
finally {
  const outAt = process.argv.indexOf("--out");
  if (outAt >= 0) put(process.argv[outAt + 1], { baseline, rows });
  console.log(`${rows.filter(r => r.ok).length}/${rows.length} control cases passed`);
  rmSync(temp, { recursive: true, force: true });
}
process.exit(rows.every(r => r.ok) ? 0 : 1);
