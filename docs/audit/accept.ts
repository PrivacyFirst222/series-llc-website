/**
 * Adam's acceptance or rejection of a finished batch. Go authorizes the work;
 * this accepts the result — of one exact commit.
 *
 *   bun run docs/audit/accept.ts accept <batch> <revision> <commit>
 *   bun run docs/audit/accept.ts reject <batch> [revision] "<reason>"
 *   bun run docs/audit/accept.ts list
 *
 * The chat hook (.claude/hooks/accept-prompt.sh) calls this same command, so
 * the record does not depend on which tool Adam is in. Revision 2 (Codex's
 * review of revision 1, findings 2 and 18): the commit Adam types may be
 * short, but it is resolved HERE, at once, to the one full commit it names;
 * if it names none, or more than one, or no review package exists for that
 * batch, revision and commit, NOTHING is recorded and the reason is printed.
 * The full commit is what is stored and what the release gate compares.
 */
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, ACCEPTANCES, acceptances, packageDir, git, now } from "./ledger-lib";

const argv = process.argv.slice(2);
const si = argv.indexOf("--source");
const source = si >= 0 ? argv.splice(si, 2)[1] : "terminal";
const [cmd, batch, a, b] = argv;
function refuse(m: string): never { console.log(`NOT RECORDED: ${m}`); process.exit(1); }

if (cmd === "list") { for (const x of acceptances()) console.log(JSON.stringify(x)); process.exit(0); }
if (cmd === "accept") {
  if (!batch || !/^\d+$/.test(a ?? "") || !/^[0-9a-f]{7,40}$/i.test(b ?? "")) refuse("usage: accept <batch> <revision> <commit> — the commit is the one shown in the review package");
  const full = git(["rev-parse", "--verify", "--quiet", `${b}^{commit}`], { allowFail: true }).trim();
  if (!/^[0-9a-f]{40}$/.test(full)) refuse(`"${b}" does not name exactly one commit in this repository`);
  const dir = packageDir(batch, Number(a), full);
  if (!dir) refuse(`there is no review package for batch ${batch}, revision ${a}, at commit ${full.slice(0, 7)} — an acceptance is of something that was put in front of you`);
  const pkg = JSON.parse(readFileSync(join(dir as string, "package.json"), "utf8")) as { batch: string; revision: number; commit: string };
  if (pkg.commit !== full || pkg.revision !== Number(a)) refuse("the review package found does not match that revision and commit");
  mkdirSync(HOME, { recursive: true });
  appendFileSync(ACCEPTANCES, JSON.stringify({ kind: "accept", batch: pkg.batch, revision: pkg.revision, commit: full, at: now(), source }) + "\n");
  console.log(`accepted: batch ${pkg.batch}, revision ${pkg.revision}, commit ${full}`);
} else if (cmd === "reject") {
  if (!batch) refuse("usage: reject <batch> [revision] \"<reason>\"");
  const hasRev = /^\d+$/.test(a ?? "");
  mkdirSync(HOME, { recursive: true });
  appendFileSync(ACCEPTANCES, JSON.stringify({ kind: "reject", batch, revision: hasRev ? Number(a) : null, commit: null, note: ((hasRev ? b : a) ?? "").slice(0, 500), at: now(), source }) + "\n");
  console.log(`rejected: batch ${batch}${hasRev ? `, revision ${a}` : ""} — nothing in it can be released`);
} else refuse("usage: accept | reject | list");
