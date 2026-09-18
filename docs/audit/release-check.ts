/**
 * The release gate. One check, consulted by every path that publishes: the
 * push hook (.githooks/pre-push — Claude, Codex or a terminal alike) and the
 * Dropbox copy (docs/audit/publish-docs.ts).
 *
 * RECORDS ONLY. A push made only of record files passes without acceptance —
 * but only if it obeys the records rules, each of which FAILS CLOSED (Codex's
 * reviews of revisions 1 and 2):
 *   R1 FAILURES.md is append-only: its prior content is an unchanged prefix
 *      and the addition comes after it. That is all this proves — the file
 *      is read by no script and controls nothing, and what an appended entry
 *      says is not checked. A narrow, informational exception, stated as such.
 *   R2 docs/audit/findings-open.md equals what the ledger in the same push
 *      renders to.
 *   R3 docs/audit/rulings.md is an audit control (a ruling there suppresses
 *      findings): a line may be added only if it carries a ruling Adam
 *      recorded himself (accept.ts ruling, or his whole message
 *      "Ruling <item>: <text>"); nothing may be removed or changed.
 *   R4 docs/audit/ledger.json obeys every invariant in strict mode: no
 *      protected field changes except by a migration Adam approved by
 *      record; batches move only by the transition table, with his record
 *      for the events that stand for his decision; an accepted fix is never
 *      weakened or reopened.
 *   R5 docs/audit/batches/<id>/: batch.json is replaced only by the valid
 *      next revision; every revision's snapshot is retained and matches its
 *      frozen hash. batch.md, evidence/* and codex-*.md are informational.
 *   R6 Nothing else is a record path (ledger-lib.ts, RECORD_PATHS).
 * A push that breaks a rule is treated as a product change and needs
 * acceptance.
 *
 * EVERYTHING ELSE is a product change, audit or not, and is refused unless:
 *   - Adam accepted this exact batch, revision and FULL commit, naming the
 *     review package, and has not rejected it since;
 *   - that package exists, is a full run, is for this commit, was cut from
 *     what is live now (so nothing unreviewed rides along and main has not
 *     moved), its complete difference hashes to the one being pushed, and
 *     the site kept in it is exactly its manifest;
 *   - every MANDATORY check, plus whatever the batch added, ran for this
 *     commit and passed — missing or skipped counts as failed, and a batch
 *     cannot shorten the mandatory list;
 *   - the generated Word documents are byte-for-byte the reviewed ones.
 *
 * Procedural, not absolute: `git push --no-verify`, or a session using Adam's
 * administrator login, goes around it, and nothing on GitHub checks Adam's
 * acceptance. It stops a careless session, not a determined one.
 *
 *   (stdin from git) bun run docs/audit/release-check.ts --pre-push
 *   bun run docs/audit/release-check.ts --range <live> <pushing>
 */
import { readFileSync } from "node:fs";
import {
  MANDATORY_CHECKS, git, gitBytes, sha256, loadLedger, ledgerRegressions, frozenFileProblems, linkProblems, isRecordPath, readAt,
  standingAcceptance, resolvePackage, packageProblems, rulingRecords, rulingLine, type BatchFile,
} from "./ledger-lib";
import { renderList } from "./ledger-print";

const ZERO = /^0+$/;

/** What a push may not do to the records, whoever accepted what (R1–R5). */
function recordProblems(live: string, pushing: string, strict: boolean, files: string[]): string[] {
  const readL = readAt(live), readP = readAt(pushing);
  const why: string[] = [];

  /* R4, R5 — the ledger and the batch files */
  const before = readL("docs/audit/ledger.json"), after = readP("docs/audit/ledger.json");
  if (before && after === null) why.push("docs/audit/ledger.json is missing from what is being pushed — the ledger existed and is gone");
  if (after !== null) {
    const afterLedger = loadLedger(after);
    if (before) why.push(...ledgerRegressions(loadLedger(before), afterLedger, { strict, read: readP, external: "required" }));
    else why.push(...linkProblems(afterLedger));
    why.push(...frozenFileProblems(afterLedger, readP));
    /* R2 */
    if (files.includes("docs/audit/findings-open.md") || files.includes("docs/audit/ledger.json")) {
      if (readP("docs/audit/findings-open.md") !== renderList(afterLedger)) why.push("docs/audit/findings-open.md is not what the ledger being pushed renders to — it is generated, never edited");
    }
  }
  if (!strict) return why;

  /* R1 — FAILURES.md: the prior content is an unchanged prefix */
  if (files.includes("FAILURES.md")) {
    const was = readL("FAILURES.md") ?? "", is = readP("FAILURES.md");
    if (is === null) why.push("FAILURES.md was deleted");
    else if (!is.startsWith(was)) {
      const wl = was.split("\n"), il = is.split("\n");
      let k = 0; while (k < wl.length && k < il.length && wl[k] === il[k]) k++;
      why.push(`FAILURES.md: its prior content is not an unchanged prefix of the new file (first difference at line ${k + 1}${k < wl.length ? `: "${wl[k].slice(0, 80)}" was there` : ""}) — the file is append-only; an entry is added after everything already written, and nothing already written is deleted or changed in the middle`);
    }
  }

  /* R3 — rulings.md: only lines Adam ruled may be added; nothing removed */
  if (files.includes("docs/audit/rulings.md")) {
    const was = readL("docs/audit/rulings.md") ?? "", is = readP("docs/audit/rulings.md");
    if (is === null || !is.startsWith(was)) { why.push("docs/audit/rulings.md: existing content changed or removed; rulings are append-only"); return why; }
    const added = is.slice(was.length).split("\n").filter(l => l.trim());
    const records = rulingRecords().filter((r) => r.kind === "ruling");
    for (const line of added) {
      const hit = records.some((r) => line === rulingLine(r));
      if (!hit) why.push(`docs/audit/rulings.md: a line was added that carries no ruling Adam recorded (his whole message "Ruling <item>: <text>", or accept.ts ruling) — rulings.md is an audit control: "${line.slice(0, 100)}"`);
    }
  }
  return why;
}

export function checkRange(live: string, pushing: string): { ok: boolean; why: string[]; note: string } {
  const files = git(["diff", "--name-only", "--no-renames", live, pushing]).split("\n").filter(Boolean);
  if (files.length === 0) return { ok: true, why: [], note: "nothing changes" };

  let broken: string[] = [];
  if (files.every(isRecordPath)) {
    broken = recordProblems(live, pushing, true, files);
    if (broken.length === 0) return { ok: true, why: [], note: `records only (${files.length} file(s)) — no acceptance needed` };
    // Not "only records": it breaks a records rule. Adam's acceptance is needed, like any product change.
  }

  const why: string[] = [];
  const product = files.filter((f) => !isRecordPath(f));
  const { acc: mine, why: noAcc } = standingAcceptance(pushing);
  if (!mine) {
    why.push(...broken.map((w) => `not a records-only push: ${w}`));
    why.push(`${noAcc}. ${product.length ? `This push changes ${product.length} product or control file(s) (${product.slice(0, 4).join(", ")}${product.length > 4 ? ", …" : ""}).` : "This push breaks a records rule."} Go authorizes the work; release needs the whole message "Accept <batch>, revision <n>, ${pushing.slice(0, 7)}".`);
    return { ok: false, why, note: "" };
  }

  const found = resolvePackage({ acceptance: mine });
  if ("error" in found) { why.push(`${found.error} — the review command builds a package, with the checks, before Adam is asked; an acceptance names that one package`); return { ok: false, why, note: "" }; }
  const { pkg } = found;
  why.push(...packageProblems(found));
  if (pkg.commit !== pushing) why.push(`the review package is for ${pkg.commit.slice(0, 7)}, the push is ${pushing.slice(0, 7)} — a change after acceptance voids it`);
  if (pkg.base !== live) why.push(`Adam reviewed a change cut from ${pkg.base.slice(0, 7)}; what is live is ${live.slice(0, 7)} — main has moved, or other commits would ride along`);
  if (sha256(git(["diff", "--no-renames", live, pushing])) !== pkg.diffSha) why.push("the complete difference being pushed is not the one in the package Adam reviewed");

  // What must have run is decided HERE and by the batch file in the commit — never by the package itself.
  const batchText = git(["show", `${pushing}:docs/audit/batches/${mine.batch}/batch.json`], { allowFail: true });
  const batch = batchText ? (JSON.parse(batchText) as BatchFile) : null;
  const required = new Set<string>([...MANDATORY_CHECKS, ...(batch?.requiredChecks ?? [])]);
  if (batch?.items.some((i) => i.assertions.some((a) => a.kind === "check"))) required.add("red-before-fix");
  for (const name of required) {
    const c = pkg.checks.find((x) => x.name === name);
    if (!c) why.push(`required check "${name}" did not run for this commit — missing counts as failed`);
    else if (c.skipped) why.push(`required check "${name}" was skipped — skipped counts as failed`);
    else if (c.exit !== 0) why.push(`required check "${name}" failed (exit ${c.exit})`);
  }
  for (const d of pkg.docs) {
    const bytes = gitBytes(`${pushing}:${d.path}`);
    if (!bytes) why.push(`${d.path}: reviewed, but not in the commit`);
    else if (sha256(bytes) !== d.sha) why.push(`${d.path}: not byte-for-byte the document Adam reviewed`);
  }
  why.push(...recordProblems(live, pushing, false, files));
  return { ok: why.length === 0, why, note: `accepted by Adam: batch ${mine.batch}, revision ${mine.revision}, commit ${pushing.slice(0, 7)}, package ${mine.packageId} (${mine.source}, ${mine.at.slice(0, 16)})` };
}

if (import.meta.main) {
  let pairs: [string, string, string][] = [];
  if (process.argv.includes("--pre-push")) {
    const input = readFileSync(0, "utf8");
    for (const line of input.split("\n").filter(Boolean)) {
      const [, localSha, remoteRef, remoteSha] = line.split(" ");
      if (ZERO.test(localSha)) {
        if (remoteRef === "refs/heads/main") { console.error("release gate: REFUSED — deleting main"); process.exit(1); }
        continue;
      }
      // A tag object is judged as the commit it points at.
      const pushing = git(["rev-parse", "--verify", "--quiet", `${localSha}^{commit}`], { allowFail: true }).trim() || localSha;
      let live = remoteSha;
      if (ZERO.test(remoteSha)) live = git(["rev-parse", "--verify", "--quiet", "origin/main"], { allowFail: true }).trim() || git(["hash-object", "-t", "tree", "/dev/null"]).trim();
      pairs.push([remoteRef, live, pushing]);
    }
  } else {
    const i = process.argv.indexOf("--range");
    if (i < 0) { console.error("usage: release-check.ts --pre-push | --range <live> <pushing>"); process.exit(1); }
    pairs = [["(range)", git(["rev-parse", process.argv[i + 1]]).trim(), git(["rev-parse", process.argv[i + 2]]).trim()]];
  }
  let refused = false;
  for (const [ref, live, pushing] of pairs) {
    const r = checkRange(live, pushing);
    if (r.ok) console.log(`release gate: ok for ${ref} — ${r.note}`);
    else { refused = true; console.error(`release gate: REFUSED for ${ref}:\n` + r.why.map((w) => `  - ${w}`).join("\n")); }
  }
  process.exit(refused ? 1 : 0);
}
