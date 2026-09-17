/**
 * The only thing that copies Word documents into Adam's Dropbox
 * (17 Sep 2026). The generator (.claude/hooks/update-word-docs.sh) used to do
 * it on every commit that touched a master — before anyone had reviewed the
 * change. It now writes to docs/word/ only, and this runs at release.
 *
 * It copies the COMMITTED docs/word files — the reviewed artifacts themselves,
 * never a fresh regeneration — and only when the commit they belong to is on
 * origin/main and passes the same release check the push hook uses.
 *
 *   bun run docs/audit/publish-docs.ts            copy, if HEAD is released and accepted
 *   bun run docs/audit/publish-docs.ts --snapshot print the Dropbox folder: path, content hash, time
 */
import { readdirSync, readFileSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, REVIEWS, git, gitOk, gitBytes, sha256, acceptances } from "./ledger-lib";
import { checkRange, type ReviewPackage } from "./release-check";

export const DROPBOX = process.env.FPSLLC_DROPBOX || "/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement";

/** Every file under the Dropbox folder: relative path, content hash, time.
 *  Contents prove "unchanged"; the times are supplemental (Codex, round 4). */
export function snapshot(dir = DROPBOX): { path: string; sha: string; mtime: string }[] | null {
  if (!existsSync(dir)) return null;
  const out: { path: string; sha: string; mtime: string }[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push({ path: relative(dir, p), sha: sha256(readFileSync(p)), mtime: st.mtime.toISOString() });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

if (import.meta.main) {
  if (process.argv.includes("--snapshot")) { console.log(JSON.stringify(snapshot(), null, 2)); process.exit(0); }
  const head = git(["rev-parse", "HEAD"]).trim();
  if (git(["status", "--porcelain", "--", "docs/word"]).trim()) { console.error("publish: REFUSED — docs/word has uncommitted changes; only committed, reviewed documents are published"); process.exit(1); }
  if (!git(["branch", "-r", "--contains", head], { allowFail: true }).includes("origin/main")) { console.error(`publish: REFUSED — ${head.slice(0, 7)} is not on origin/main; documents are published at release, not before`); process.exit(1); }
  // The newest commit that changed a Word document must be inside a commit
  // Adam accepted. Documents committed before this gate existed are what
  // Dropbox already holds, and pass.
  const last = git(["log", "-1", "--format=%H", "--", "docs/word"]).trim();
  const born = git(["log", "--diff-filter=A", "--format=%H", "--", "docs/audit/release-check.ts"]).trim().split("\n").pop() ?? "";
  const predates = born !== "" && last !== born && gitOk(["merge-base", "--is-ancestor", last, born]);
  if (!predates) {
    const acc = acceptances()
      .filter((a) => a.kind === "accept" && a.commit)
      .map((a) => ({ a, full: git(["rev-parse", "--verify", "--quiet", `${a.commit}^{commit}`], { allowFail: true }).trim() }))
      .filter((x) => x.full && gitOk(["merge-base", "--is-ancestor", last, x.full]) && gitOk(["merge-base", "--is-ancestor", x.full, head]))
      .pop();
    if (!acc) { console.error(`publish: REFUSED — the Word documents last changed in ${last.slice(0, 7)}, and no commit Adam accepted contains it`); process.exit(1); }
    const dirName = `${acc.a.batch}-r${acc.a.revision}-${acc.full.slice(0, 7)}`.toLowerCase();
    const found = existsSync(REVIEWS) ? readdirSync(REVIEWS).find((d) => d.toLowerCase() === dirName) : undefined;
    if (!found) { console.error(`publish: REFUSED — no review package for ${dirName}`); process.exit(1); }
    const pkg = JSON.parse(readFileSync(join(REVIEWS, found, "package.json"), "utf8")) as ReviewPackage;
    const r = checkRange(pkg.base, acc.full);
    if (!r.ok) { console.error("publish: REFUSED:\n" + r.why.map((w) => `  - ${w}`).join("\n")); process.exit(1); }
    console.log(`publish: ${r.note}`);
  }
  if (!existsSync(DROPBOX)) { console.log("publish: the Dropbox folder is not present on this machine — nothing copied"); process.exit(0); }
  let n = 0;
  for (const name of readdirSync(join(ROOT, "docs/word")).filter((f) => f.endsWith(".docx"))) {
    const committed = gitBytes(`HEAD:docs/word/${name}`);
    if (!committed || sha256(committed) !== sha256(readFileSync(join(ROOT, "docs/word", name)))) { console.error(`publish: REFUSED — docs/word/${name} on disk is not the committed document`); process.exit(1); }
    copyFileSync(join(ROOT, "docs/word", name), join(DROPBOX, name));
    n++;
  }
  console.log(`publish: copied ${n} reviewed Word documents to Dropbox`);
}
