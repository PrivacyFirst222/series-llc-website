/**
 * Moves a batch through its states. Every step appends history; nothing is
 * overwritten. The ledger never says "accepted" on a session's word: release
 * is recorded only against Adam's STANDING acceptance of the exact commit —
 * the same lookup the release gate uses, so a later rejection stops this too
 * (Codex's review of revision 1, finding 16).
 *
 *   bun run docs/audit/batch.ts authorize <id>            after Adam's Go: freeze the batch file, assign its items
 *   bun run docs/audit/batch.ts implemented <id>          the fixes are in: record the approved words as each fix
 *   bun run docs/audit/batch.ts released <id> <commit> [--deployed "<evidence>"] [--documents "<evidence>"]
 *   bun run docs/audit/batch.ts reject <id> "<reason>"    Adam rejected it: every item back to open, reason kept
 *   bun run docs/audit/batch.ts ruling <item> "<text>" [--part key] [--supersedes "<old text>"]
 *
 * "released" records three different things separately: that the commit is on
 * the remote's main (asked of the remote, not of a local tracking ref), what
 * is known about the live site, and what is known about the Dropbox copies.
 * What is not given is recorded as not recorded, never assumed.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, git, gitOk, loadLedger, saveLedger, loadBatch, frozenHashOf, standingAcceptance, familyClaim, unmetWaits, count, now, type Ledger } from "./ledger-lib";
import { renderList } from "./ledger-print";

const [cmd, id, ...rest] = process.argv.slice(2);
const l: Ledger = loadLedger();
function die(m: string): never { console.error(`batch: REFUSED — ${m}`); process.exit(1); }
const finish = (msg: string) => { saveLedger(l); writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(l)); console.log(msg); };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const opt = (name: string): string | null => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] ?? null : null; };

if (cmd === "ruling") {
  const text = rest[0] ?? die("a ruling needs its text");
  if (!l.items.some((i) => i.id === id)) die(`item ${id} does not exist`);
  const part = opt("--part"), sup = opt("--supersedes");
  l.rulings.push({ date: today(), item: id, text, ...(part ? { part } : {}), ...(sup ? { supersedes: sup } : {}) });
  finish(`ruling recorded on item ${id}`);
  process.exit(0);
}

const b = loadBatch(id ?? die("which batch?"));
const parts = b.items.map((bi) => {
  const it = l.items.find((i) => i.id === bi.id) ?? die(`item ${bi.id} is not in the ledger`);
  const part = it.parts.find((p) => p.key === bi.part) ?? die(`item ${bi.id} has no part "${bi.part}"`);
  return { bi, it, part };
});
const idx = () => l.batches.find((x) => x.id === b.id && x.revision === b.revision);

if (cmd === "authorize") {
  if (idx()) die(`batch ${b.id} revision ${b.revision} is already authorized; a changed batch is the next revision`);
  const earlier = l.batches.filter((x) => x.id === b.id && x.revision < b.revision);
  if (b.revision > 1 && !earlier.some((x) => x.revision === b.revision - 1)) die(`revision ${b.revision} needs revision ${b.revision - 1} on record`);
  if (!git(["cat-file", "-t", b.base], { allowFail: true }).startsWith("commit")) die(`base ${b.base} is not a commit`);
  for (const { bi, it, part } of parts) {
    const name = `item ${bi.id}${bi.part === "all" ? "" : ` (${bi.part})`}`;
    if (it.verdict === "dropped") die(`${name} was dropped: ${it.verdictReason}`);
    if (part.status !== "open" && part.batch !== b.id) die(`${name} is ${part.status} in batch ${part.batch} — it cannot be claimed twice`);
    const claim = familyClaim(l, bi.id, b.id);
    if (claim) die(`${name} is the same defect as work already under way — ${claim}. A defect is claimed once, whatever numbers it was seen under`);
    for (const w of unmetWaits(l, it, part)) die(`${name} waits on ${w.startsWith("ruling:") ? `Adam's ruling on item ${w.slice(7)}` : `item ${w}`}`);
    if (bi.assertions.length === 0) die(`${name} has no assertion`);
    for (const a of bi.assertions) if (a.kind === "replace") {
      const was = git(["show", `${b.base}:${a.file}`], { allowFail: true });
      const n = count(was, a.before);
      if (n !== (a.count ?? 1)) die(`${name}: the words to replace are in ${a.file} ${n}× at ${b.base.slice(0, 7)}, the batch says ${a.count ?? 1}: "${a.before.slice(0, 90)}" — the "before" words must be proven present, exactly, before Go`);
    }
  }
  for (const { part } of parts) { part.status = "assigned"; part.batch = b.id; part.history.push({ at: now(), event: "assigned", batch: b.id, revision: b.revision }); }
  l.batches.push({ id: b.id, revision: b.revision, frozenHash: frozenHashOf(b), status: "authorized", model: b.model, base: b.base, history: [{ at: now(), event: "authorized by Adam's Go; batch file frozen" }] });
  finish(`batch ${b.id} r${b.revision} authorized: ${parts.length} item(s) assigned, batch file frozen as ${frozenHashOf(b).slice(0, 12)}`);
} else if (cmd === "implemented") {
  const x = idx() ?? die("not authorized");
  if (x.frozenHash !== frozenHashOf(b)) die("the batch file is not the one frozen at Go");
  for (const { bi, part } of parts) {
    part.status = "implemented";
    part.fix = { batch: b.id, revision: b.revision, commit: "", doneBy: b.model, assertions: bi.assertions };
    part.history.push({ at: now(), event: "implemented", batch: b.id, revision: b.revision, note: `by ${b.model}` });
  }
  x.status = "implemented"; x.history.push({ at: now(), event: "implemented" });
  finish(`batch ${b.id} r${b.revision}: ${parts.length} fix(es) recorded with the approved words`);
} else if (cmd === "released") {
  const commit = git(["rev-parse", "--verify", `${rest[0] ?? die("which commit?")}^{commit}`]).trim();
  const x = idx() ?? die("not authorized");
  const { acc, why } = standingAcceptance(commit, b.id, b.revision);
  if (!acc) die(why);
  const remoteMain = git(["ls-remote", "origin", "refs/heads/main"], { allowFail: true }).split(/\s+/)[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(remoteMain)) die("could not ask the remote what its main is");
  if (!gitOk(["merge-base", "--is-ancestor", commit, remoteMain])) die(`the remote's main (${remoteMain.slice(0, 7)}) does not contain ${commit.slice(0, 7)} — it has not been pushed`);
  const a = acc as NonNullable<typeof acc>;
  for (const { part } of parts) {
    if (part.fix) part.fix.commit = commit;
    part.status = "released";
    part.history.push({ at: a.at, event: "accepted by Adam", batch: b.id, revision: b.revision, note: `commit ${commit}, by ${a.source}` }, { at: now(), event: "released", batch: b.id, revision: b.revision });
  }
  const dep = opt("--deployed"), docs = opt("--documents");
  x.release = { git: { at: now(), remoteMain }, deployment: dep ? { at: now(), evidence: dep } : null, documents: docs ? { at: now(), evidence: docs } : null };
  x.status = "released";
  x.history.push({ at: a.at, event: `accepted by Adam at ${commit} (${a.source})` }, { at: now(), event: `pushed: the remote's main is ${remoteMain.slice(0, 7)} and contains the accepted commit; live site: ${dep ?? "not recorded"}; Dropbox copies: ${docs ?? "not recorded"}` });
  finish(`batch ${b.id} r${b.revision} recorded as pushed at ${commit.slice(0, 7)}; live site: ${dep ?? "not recorded"}; Dropbox copies: ${docs ?? "not recorded"}`);
} else if (cmd === "reject") {
  const reason = rest[0] ?? die("a rejection records Adam's reason");
  const x = idx() ?? die("not authorized");
  if (x.status === "released") die("a released batch is not rejected; it is corrected by a later batch");
  for (const { part } of parts) {
    part.history.push({ at: now(), event: `rejected r${b.revision}`, batch: b.id, revision: b.revision, note: reason });
    part.status = "open"; delete part.batch; delete part.fix;
  }
  x.status = "rejected"; x.history.push({ at: now(), event: "rejected by Adam", note: reason });
  finish(`batch ${b.id} r${b.revision} rejected — nothing in it is released; ${parts.length} item(s) back to open`);
} else die("usage: authorize | implemented | released | reject | ruling");
