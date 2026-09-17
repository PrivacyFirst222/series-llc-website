/**
 * Adam's acceptance, from a terminal — the same record the chat hook writes
 * (.claude/hooks/accept-prompt.sh), so it does not matter which tool he is in.
 * Go authorizes the work; this accepts the finished result, by exact commit.
 *
 *   bun run docs/audit/accept.ts accept <batch> <revision> <commit>
 *   bun run docs/audit/accept.ts reject <batch> [revision] "<reason>"
 *   bun run docs/audit/accept.ts list
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { HOME, ACCEPTANCES, acceptances, now } from "./ledger-lib";

const [cmd, batch, a, b] = process.argv.slice(2);
if (cmd === "list") { for (const x of acceptances()) console.log(JSON.stringify(x)); process.exit(0); }
if (cmd === "accept") {
  if (!batch || !/^\d+$/.test(a ?? "") || !/^[0-9a-f]{7,40}$/i.test(b ?? "")) { console.error('usage: accept <batch> <revision> <commit> — the commit is the one shown in the review package'); process.exit(1); }
  mkdirSync(HOME, { recursive: true });
  appendFileSync(ACCEPTANCES, JSON.stringify({ kind: "accept", batch, revision: Number(a), commit: b.toLowerCase(), at: now(), source: "terminal" }) + "\n");
  console.log(`accepted: batch ${batch}, revision ${a}, commit ${b}`);
} else if (cmd === "reject") {
  const hasRev = /^\d+$/.test(a ?? "");
  mkdirSync(HOME, { recursive: true });
  appendFileSync(ACCEPTANCES, JSON.stringify({ kind: "reject", batch, revision: hasRev ? Number(a) : null, commit: null, note: (hasRev ? b : a) ?? "", at: now(), source: "terminal" }) + "\n");
  console.log(`rejected: batch ${batch}`);
} else { console.error("usage: accept | reject | list"); process.exit(1); }
