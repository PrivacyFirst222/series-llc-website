/**
 * The only thing that copies Word documents into Adam's Dropbox. The
 * generator (.claude/hooks/update-word-docs.sh) used to do it on every commit
 * that touched a master — before anyone had reviewed the change. It now
 * writes docs/word/ only, and this runs at release.
 *
 * It copies the COMMITTED docs/word files — the reviewed artifacts, never a
 * fresh regeneration (the generator is not byte-stable) — and there is NO
 * exception (Codex's review of revision 1, finding 3; revision 1 published
 * anything older than the gate with no acceptance at all):
 *   - a document whose bytes already equal the destination's is not written;
 *   - if any document differs, the newest commit that changed docs/word must
 *     sit inside a commit Adam accepted, on origin/main, and that commit must
 *     pass the same release check the push hook uses. Otherwise NOTHING is
 *     written.
 *
 *   bun run docs/audit/publish-docs.ts            copy what differs, if accepted
 *   bun run docs/audit/publish-docs.ts --snapshot print the Dropbox folder: path, content hash, time
 */
import { readdirSync, readFileSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, git, gitOk, gitBytes, sha256, acceptances, standingAcceptance, packageDir } from "./ledger-lib";
import { checkRange, type ReviewPackage } from "./release-check";

export const DROPBOX = process.env.FPSLLC_DROPBOX || "/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement";

/** Every file under the Dropbox folder: relative path, content hash, time.
 *  Contents prove "unchanged"; the times are supplemental. */
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
  const refuse = (m: string): never => { console.error(`publish: REFUSED — ${m}. Nothing was written.`); process.exit(1); };
  if (!existsSync(DROPBOX)) { console.log("publish: the Dropbox folder is not present on this machine — nothing to write"); process.exit(0); }
  if (git(["status", "--porcelain", "--", "docs/word"]).trim()) refuse("docs/word has uncommitted changes; only committed, reviewed documents are published");
  const names = readdirSync(join(ROOT, "docs/word")).filter((f) => f.endsWith(".docx"));
  const differs = names.filter((n) => {
    const committed = gitBytes(`HEAD:docs/word/${n}`);
    if (!committed) refuse(`docs/word/${n} is not committed`);
    const dest = join(DROPBOX, n);
    return !existsSync(dest) || sha256(readFileSync(dest)) !== sha256(committed as Buffer);
  });
  if (differs.length === 0) { console.log(`publish: nothing to write — Dropbox already holds exactly these ${names.length} documents`); process.exit(0); }

  const head = git(["rev-parse", "HEAD"]).trim();
  if (!gitOk(["merge-base", "--is-ancestor", head, "origin/main"])) refuse(`${head.slice(0, 7)} is not on origin/main; documents are published at release, not before`);
  const last = git(["log", "-1", "--format=%H", "--", "docs/word"]).trim();
  const candidates = acceptances().filter((a) => a.kind === "accept" && a.commit && /^[0-9a-f]{40}$/.test(a.commit) && gitOk(["cat-file", "-e", `${a.commit}^{commit}`]) && gitOk(["merge-base", "--is-ancestor", last, a.commit]) && gitOk(["merge-base", "--is-ancestor", a.commit, head]));
  const ok = candidates.map((a) => ({ a, standing: standingAcceptance(a.commit as string, a.batch, a.revision ?? undefined) })).filter((x) => x.standing.acc).pop();
  if (!ok) refuse(`${differs.length} document(s) differ from Dropbox, they last changed in ${last.slice(0, 7)}, and no commit Adam accepted contains that change`);
  const dir = packageDir((ok as NonNullable<typeof ok>).a.batch, (ok as NonNullable<typeof ok>).a.revision as number, (ok as NonNullable<typeof ok>).a.commit as string);
  if (!dir) refuse("the accepted commit has no review package");
  const pkg = JSON.parse(readFileSync(join(dir as string, "package.json"), "utf8")) as ReviewPackage;
  const r = checkRange(pkg.base, pkg.commit);
  if (!r.ok) refuse(r.why.join("; "));
  for (const n of differs) {
    const reviewed = pkg.docs.find((d) => d.path === `docs/word/${n}`);
    const committed = gitBytes(`HEAD:docs/word/${n}`) as Buffer;
    if (!reviewed || reviewed.sha !== sha256(committed)) refuse(`docs/word/${n} is not the document in the package Adam reviewed`);
    if (sha256(readFileSync(join(ROOT, "docs/word", n))) !== sha256(committed)) refuse(`docs/word/${n} on disk is not the committed document`);
  }
  for (const n of differs) copyFileSync(join(ROOT, "docs/word", n), join(DROPBOX, n));
  console.log(`publish: ${r.note}\npublish: copied ${differs.length} reviewed Word document(s) to Dropbox; ${names.length - differs.length} already matched`);
}
