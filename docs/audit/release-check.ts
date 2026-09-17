/**
 * The release gate. One check, consulted by every path that publishes:
 * the push hook (.githooks/pre-push — Claude, Codex or a terminal alike) and
 * the Dropbox copy (docs/audit/publish-docs.ts).
 *
 * A push made only of record files (FAILURES.md, the ledger, rulings, batch
 * folders) passes, provided it rewrites no history and changes no accepted
 * fix. Anything else is a product change, audit or not, and is refused unless:
 *   - Adam accepted this exact batch, revision and commit, and has not
 *     rejected it since;
 *   - the review package he was shown is for this commit, was cut from what
 *     is live now (so nothing unreviewed rides along and main has not moved),
 *     and the complete difference being pushed hashes to the one he reviewed;
 *   - every required check ran for this commit and passed — a check that is
 *     missing or skipped counts as failed;
 *   - the generated Word documents are byte-for-byte the reviewed ones.
 *
 * Procedural, not absolute: `git push --no-verify`, or a session using
 * Adam's administrator login, goes around it. The GitHub workflow runs the
 * guard on every push so a bypass shows up red — detection, not prevention.
 *
 *   (stdin from git) bun run docs/audit/release-check.ts --pre-push
 *   bun run docs/audit/release-check.ts --range <live> <pushing>
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REVIEWS, git, gitBytes, sha256, loadLedger, ledgerRegressions, frozenHashOf, isRecordPath, acceptances, type BatchFile,
} from "./ledger-lib";

export interface ReviewPackage {
  batch: string; revision: number; base: string; commit: string; diffSha: string; createdAt: string;
  required: string[];
  checks: { name: string; command: string; exit: number | null; skipped: boolean; log: string }[];
  docs: { path: string; sha: string }[];
}

const ZERO = /^0+$/;

export function checkRange(live: string, pushing: string): { ok: boolean; why: string[]; note: string } {
  const why: string[] = [];
  const files = git(["diff", "--name-only", "--no-renames", live, pushing]).split("\n").filter(Boolean);
  if (files.length === 0) return { ok: true, why, note: "nothing changes" };

  if (files.every(isRecordPath)) {
    const before = git(["show", `${live}:docs/audit/ledger.json`], { allowFail: true });
    const after = git(["show", `${pushing}:docs/audit/ledger.json`], { allowFail: true });
    if (before && after) {
      why.push(...ledgerRegressions(loadLedger(before), loadLedger(after)));
      for (const b of loadLedger(before).batches.filter((x) => ["accepted", "released"].includes(x.status))) {
        const t = git(["show", `${pushing}:docs/audit/batches/${b.id}/batch.json`], { allowFail: true });
        if (!t || frozenHashOf(JSON.parse(t) as BatchFile) !== b.frozenHash) why.push(`batch ${b.id} r${b.revision}: an accepted batch's file was changed`);
      }
    }
    return { ok: why.length === 0, why, note: `records only (${files.length} file(s)) — no acceptance needed` };
  }

  const product = files.filter((f) => !isRecordPath(f));
  const all = acceptances();
  const mine = all.filter((a) => a.kind === "accept" && a.commit && pushing.startsWith(a.commit.toLowerCase())).pop();
  if (!mine) {
    why.push(`no acceptance from Adam names commit ${pushing.slice(0, 7)}. This push changes ${product.length} product or control file(s) (${product.slice(0, 4).join(", ")}${product.length > 4 ? ", …" : ""}). Go authorizes the work; release needs "Accept <batch>, revision <n>, ${pushing.slice(0, 7)}".`);
    return { ok: false, why, note: "" };
  }
  const later = all.slice(all.indexOf(mine) + 1).find((a) => a.kind === "reject" && a.batch === mine.batch && (a.revision === null || a.revision === mine.revision));
  if (later) why.push(`batch ${mine.batch} revision ${mine.revision} was rejected by Adam on ${later.at.slice(0, 10)}${later.note ? ` (${later.note})` : ""} — nothing in it is released; issue the next revision`);

  const want = `${mine.batch}-r${mine.revision}-${pushing.slice(0, 7)}`.toLowerCase();
  const found = existsSync(REVIEWS) ? readdirSync(REVIEWS).find((d) => d.toLowerCase() === want) : undefined;
  const dir = join(REVIEWS, found ?? want);
  if (!existsSync(join(dir, "package.json"))) { why.push(`no review package for batch ${mine.batch} r${mine.revision} at ${pushing.slice(0, 7)} — the review command builds it, with the checks, before Adam is asked`); return { ok: false, why, note: "" }; }
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as ReviewPackage;
  if (pkg.commit !== pushing) why.push(`the review package is for ${pkg.commit.slice(0, 7)}, the push is ${pushing.slice(0, 7)} — a change after acceptance voids it`);
  if (pkg.base !== live) why.push(`Adam reviewed a change cut from ${pkg.base.slice(0, 7)}; what is live is ${live.slice(0, 7)} — main has moved, or other commits would ride along`);
  if (sha256(git(["diff", "--no-renames", live, pushing])) !== pkg.diffSha) why.push("the complete difference being pushed is not the one in the package Adam reviewed");

  const batchText = git(["show", `${pushing}:docs/audit/batches/${mine.batch}/batch.json`], { allowFail: true });
  const required = new Set([...(pkg.required ?? []), ...(batchText ? (JSON.parse(batchText) as BatchFile).requiredChecks : [])]);
  if (required.size === 0) why.push("the batch names no required checks");
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
      let live = remoteSha;
      if (ZERO.test(remoteSha)) live = git(["merge-base", localSha, "origin/main"], { allowFail: true }).trim() || git(["hash-object", "-t", "tree", "/dev/null"]).trim();
      pairs.push([remoteRef, live, localSha]);
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
