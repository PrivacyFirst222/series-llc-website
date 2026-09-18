/**
 * Adam's decisions, recorded OUTSIDE the repository (~/.fpsllc/) where a
 * commit cannot rewrite them. Go authorizes work; these record its outcome.
 *
 *   bun run docs/audit/accept.ts accept <batch> <revision> <commit> [--package <id>]
 *   bun run docs/audit/accept.ts reject <batch> [--revision <n>] --reason "<text>"
 *   bun run docs/audit/accept.ts ruling <item> "<text>" [--part <key>]
 *   bun run docs/audit/accept.ts approve-migration <id>
 *   bun run docs/audit/accept.ts list
 *
 * The chat hook (.claude/hooks/accept-prompt.sh) calls these same commands,
 * so the record does not depend on which tool Adam is in.
 *
 * accept: the commit Adam types may be short; it is resolved HERE to the one
 * full commit it names. The acceptance is of ONE review package — the one he
 * was shown. With exactly one full package for that batch, revision and
 * commit it is named automatically; with several, nothing is recorded and
 * the exact command with --package <id> is printed; a partial package is
 * refused (Codex's review of revision 2, H).
 * reject: named arguments (Codex, G). "Reject A: 2" is batch A, no revision,
 * reason "2"; "Reject A, revision 2: x" is revision 2 only.
 * ruling / approve-migration: Adam's own record, which batch.ts and the
 * gates require before a ruling or a migration enters the ledger (Codex, B).
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { HOME, ACCEPTANCES, RULINGS_FILE, acceptances, rulingRecords, resolvePackage, packageProblems, loadMigration, git, now } from "./ledger-lib";

const argv = process.argv.slice(2);
const take = (name: string): string | null => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1] ?? null; argv.splice(i, 2); return v; };
const source = take("--source") ?? "terminal";
const packageId = take("--package");
const revisionOpt = take("--revision");
const reason = take("--reason");
const partOpt = take("--part");
const [cmd, a, b, c] = argv;
function refuse(m: string): never { console.log(`NOT RECORDED: ${m}`); process.exit(1); }
const write = (file: string, rec: Record<string, unknown>) => { mkdirSync(HOME, { recursive: true }); appendFileSync(file, JSON.stringify({ ...rec, at: now(), source }) + "\n"); };

if (cmd === "list") { for (const x of acceptances()) console.log(JSON.stringify(x)); for (const x of rulingRecords()) console.log(JSON.stringify(x)); process.exit(0); }
if (cmd === "accept") {
  if (!a || !/^\d+$/.test(b ?? "") || !/^[0-9a-f]{7,40}$/i.test(c ?? "")) refuse("usage: accept <batch> <revision> <commit> [--package <id>] — the commit and package id are the ones the review printed");
  const full = git(["rev-parse", "--verify", "--quiet", `${c}^{commit}`], { allowFail: true }).trim();
  if (!/^[0-9a-f]{40}$/.test(full)) refuse(`"${c}" does not name exactly one commit in this repository`);
  const found = resolvePackage({ batch: a, revision: Number(b), commit: full, ...(packageId ? { packageId } : {}) });
  if ("error" in found) refuse(`${found.error} — an acceptance is of something that was put in front of you`);
  const bad = packageProblems(found);
  if (bad.length) refuse(bad.join("; "));
  write(ACCEPTANCES, { kind: "accept", batch: found.pkg.batch, revision: found.pkg.revision, commit: full, packageId: found.pkg.packageId });
  console.log(`accepted: batch ${found.pkg.batch}, revision ${found.pkg.revision}, commit ${full}, package ${found.pkg.packageId}`);
} else if (cmd === "reject") {
  if (!a || a.startsWith("--")) refuse('usage: reject <batch> [--revision <n>] --reason "<text>"');
  if (revisionOpt !== null && !/^\d+$/.test(revisionOpt)) refuse(`"${revisionOpt}" is not a revision number`);
  if (reason === null) refuse("a rejection records Adam's reason (--reason); it may be one word");
  if (argv.length > 2) refuse(`unexpected arguments: ${argv.slice(2).join(" ")} — the reason goes after --reason`);
  write(ACCEPTANCES, { kind: "reject", batch: a, revision: revisionOpt === null ? null : Number(revisionOpt), commit: null, note: reason });
  console.log(`rejected: batch ${a}${revisionOpt !== null ? `, revision ${revisionOpt}` : " (every revision)"} — nothing in it can be released`);
} else if (cmd === "ruling") {
  if (!a || !b || argv.length > 3) refuse('usage: ruling <item> "<text>" [--part <key>]');
  write(RULINGS_FILE, { kind: "ruling", item: a, ...(partOpt ? { part: partOpt } : {}), text: b.trim() });
  console.log(`ruling recorded on item ${a}${partOpt ? ` (${partOpt})` : ""}: ${b.trim()}`);
} else if (cmd === "approve-migration") {
  if (!a || argv.length > 2) refuse("usage: approve-migration <id>");
  const f = loadMigration(a);
  if (!f) refuse(`there is no docs/audit/migrations/${a}.json in this working tree`);
  write(RULINGS_FILE, { kind: "migration", migration: a, hash: f.hash });
  console.log(`migration ${a} approved as the file hashing to ${f.hash} — a different file is a different migration`);
} else refuse("usage: accept | reject | ruling | approve-migration | list");
