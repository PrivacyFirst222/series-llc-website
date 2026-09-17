/**
 * The release gate. One check, consulted by every path that publishes: the
 * push hook (.githooks/pre-push — Claude, Codex or a terminal alike) and the
 * Dropbox copy (docs/audit/publish-docs.ts).
 *
 * RECORDS ONLY. A push made only of record files (FAILURES.md, the ledger,
 * rulings, batch folders) passes without acceptance — but only if it is
 * nothing more than records. It FAILS CLOSED otherwise (Codex's review of
 * revision 1, finding 1): the ledger may not disappear; no item or batch
 * history may be rewritten; no batch file may change from Adam's Go onward;
 * and an accepted fix's assertions may not change or be reopened. A push
 * that does any of those is treated as a product change and needs acceptance.
 *
 * EVERYTHING ELSE is a product change, audit or not, and is refused unless:
 *   - Adam accepted this exact batch, revision and FULL commit, and has not
 *     rejected it since;
 *   - the review package he was shown is for this commit, was cut from what
 *     is live now (so nothing unreviewed rides along and main has not moved),
 *     and the complete difference being pushed hashes to the one he reviewed;
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
import { join } from "node:path";
import {
  FROZEN_STATES, MANDATORY_CHECKS, git, gitBytes, sha256, loadLedger, ledgerRegressions, frozenHashOf, isRecordPath,
  standingAcceptance, packageDir, type BatchFile,
} from "./ledger-lib";

export interface ReviewPackage {
  batch: string; revision: number; base: string; commit: string; diffSha: string; createdAt: string;
  required: string[];
  checks: { name: string; command: string; exit: number | null; skipped: boolean; log: string }[];
  docs: { path: string; sha: string }[];
}

const ZERO = /^0+$/;
const ledgerAt = (rev: string) => git(["show", `${rev}:docs/audit/ledger.json`], { allowFail: true });

/** What a push may not do to the records, whoever accepted what. */
function recordProblems(live: string, pushing: string, strict: boolean): string[] {
  const before = ledgerAt(live), after = ledgerAt(pushing);
  if (!before) return [];
  if (!after) return ["docs/audit/ledger.json is missing from what is being pushed — the ledger existed and is gone"];
  const why = ledgerRegressions(loadLedger(before), loadLedger(after), { strict });
  const afterLedger = loadLedger(after);
  for (const b of loadLedger(before).batches.filter((x) => FROZEN_STATES.includes(x.status))) {
    if (afterLedger.batches.some((x) => x.id === b.id && x.revision > b.revision)) continue; // superseded by a later revision
    if (afterLedger.batches.find((x) => x.id === b.id && x.revision === b.revision)?.status === "rejected") continue;
    const t = git(["show", `${pushing}:docs/audit/batches/${b.id}/batch.json`], { allowFail: true });
    if (!t || frozenHashOf(JSON.parse(t) as BatchFile) !== b.frozenHash) why.push(`batch ${b.id} r${b.revision} is ${b.status}: its batch file was changed or removed — a changed batch is the next revision, approved again`);
  }
  return why;
}

export function checkRange(live: string, pushing: string): { ok: boolean; why: string[]; note: string } {
  const files = git(["diff", "--name-only", "--no-renames", live, pushing]).split("\n").filter(Boolean);
  if (files.length === 0) return { ok: true, why: [], note: "nothing changes" };

  let weakened: string[] = [];
  if (files.every(isRecordPath)) {
    weakened = recordProblems(live, pushing, true);
    if (weakened.length === 0) return { ok: true, why: [], note: `records only (${files.length} file(s)) — no acceptance needed` };
    // Not "only records": it removes or weakens something. Adam's acceptance is needed, like any product change.
  }

  const why: string[] = [];
  const product = files.filter((f) => !isRecordPath(f));
  const { acc: mine, why: noAcc } = standingAcceptance(pushing);
  if (!mine) {
    why.push(...weakened.map((w) => `not a records-only push: ${w}`));
    why.push(`${noAcc}. ${product.length ? `This push changes ${product.length} product or control file(s) (${product.slice(0, 4).join(", ")}${product.length > 4 ? ", …" : ""}).` : "This push weakens the records."} Go authorizes the work; release needs the whole message "Accept <batch>, revision <n>, ${pushing.slice(0, 7)}".`);
    return { ok: false, why, note: "" };
  }

  const dir = packageDir(mine.batch, mine.revision as number, pushing);
  if (!dir) { why.push(`no review package for batch ${mine.batch} r${mine.revision} at ${pushing.slice(0, 7)} — the review command builds it, with the checks, before Adam is asked`); return { ok: false, why, note: "" }; }
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as ReviewPackage;
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
  why.push(...recordProblems(live, pushing, false));
  return { ok: why.length === 0, why, note: `accepted by Adam: batch ${mine.batch}, revision ${mine.revision}, commit ${pushing.slice(0, 7)} (${mine.source}, ${mine.at.slice(0, 16)})` };
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
