/**
 * Moves a batch through its states. Every step appends history; nothing is
 * overwritten. The ledger never says "accepted" on a session's word: release
 * is recorded only against an acceptance Adam made, by exact commit, in the
 * file outside the repository.
 *
 *   bun run docs/audit/batch.ts authorize <id>            after Adam's Go: freeze the batch file, assign its items
 *   bun run docs/audit/batch.ts implemented <id>          the fixes are in: record the approved words as each fix
 *   bun run docs/audit/batch.ts released <id> <commit>    after release: record Adam's acceptance and the commit
 *   bun run docs/audit/batch.ts reject <id> "<reason>"    Adam rejected it: every item back to open, reason kept
 *   bun run docs/audit/batch.ts ruling <item> "<text>" [--part key] [--supersedes "<old text>"]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, git, loadLedger, saveLedger, loadBatch, frozenHashOf, acceptances, count, now, type Ledger } from "./ledger-lib";
import { renderList } from "./ledger-print";

const [cmd, id, ...rest] = process.argv.slice(2);
const l: Ledger = loadLedger();
function die(m: string): never { console.error(`batch: REFUSED — ${m}`); process.exit(1); }
const finish = (msg: string) => { saveLedger(l); writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(l)); console.log(msg); };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

if (cmd === "ruling") {
  const text = rest[0] ?? die("a ruling needs its text");
  const pi = rest.indexOf("--part"), si = rest.indexOf("--supersedes");
  if (!l.items.some((i) => i.id === id)) die(`item ${id} does not exist`);
  l.rulings.push({ date: today(), item: id, text, ...(pi >= 0 ? { part: rest[pi + 1] } : {}), ...(si >= 0 ? { supersedes: rest[si + 1] } : {}) });
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
  if (!git(["cat-file", "-t", b.base], { allowFail: true }).startsWith("commit")) die(`base ${b.base} is not a commit`);
  for (const { bi, it, part } of parts) {
    if (it.verdict === "dropped") die(`item ${bi.id} was dropped: ${it.verdictReason}`);
    if (part.status !== "open" && part.batch !== b.id) die(`item ${bi.id} (${bi.part}) is ${part.status} in batch ${part.batch} — it cannot be claimed twice`);
    for (const w of [...it.waitsOn, ...part.waitsOn]) if (w.startsWith("ruling:") && !l.rulings.some((r) => r.item === w.slice(7))) die(`item ${bi.id} waits on Adam's ruling on item ${w.slice(7)}`);
    if (bi.assertions.length === 0) die(`item ${bi.id} has no assertion`);
    for (const a of bi.assertions) if (a.kind === "replace") {
      const was = git(["show", `${b.base}:${a.file}`], { allowFail: true });
      const n = count(was, a.before);
      if (n !== (a.count ?? 1)) die(`item ${bi.id}: the words to replace are in ${a.file} ${n}× at ${b.base.slice(0, 7)}, the batch says ${a.count ?? 1}: "${a.before.slice(0, 90)}" — the "before" words must be proven present, exactly, before Go`);
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
  const commit = git(["rev-parse", rest[0] ?? die("which commit?")]).trim();
  const x = idx() ?? die("not authorized");
  const acc = acceptances().filter((a) => a.kind === "accept" && a.batch.toLowerCase() === b.id.toLowerCase() && a.revision === b.revision && a.commit && commit.startsWith(a.commit.toLowerCase())).pop();
  if (!acc) die(`Adam has not accepted batch ${b.id} revision ${b.revision} at ${commit.slice(0, 7)}`);
  if (!git(["branch", "-r", "--contains", commit], { allowFail: true }).includes("origin/main")) die(`${commit.slice(0, 7)} is not on origin/main — it has not been released`);
  for (const { part } of parts) {
    if (part.fix) part.fix.commit = commit;
    part.status = "released";
    part.history.push({ at: acc.at, event: "accepted by Adam", batch: b.id, revision: b.revision, note: `commit ${commit.slice(0, 7)}, by ${acc.source}` }, { at: now(), event: "released", batch: b.id, revision: b.revision });
  }
  x.status = "released"; x.history.push({ at: acc.at, event: `accepted by Adam at ${commit.slice(0, 7)} (${acc.source})` }, { at: now(), event: "released" });
  finish(`batch ${b.id} r${b.revision} recorded as released at ${commit.slice(0, 7)}`);
} else if (cmd === "reject") {
  const reason = rest[0] ?? die("a rejection records Adam's reason");
  const x = idx() ?? die("not authorized");
  for (const { part } of parts) {
    part.history.push({ at: now(), event: `rejected r${b.revision}`, batch: b.id, revision: b.revision, note: reason });
    part.status = "open"; delete part.batch; delete part.fix;
  }
  x.status = "rejected"; x.history.push({ at: now(), event: "rejected by Adam", note: reason });
  finish(`batch ${b.id} r${b.revision} rejected — nothing in it is released; ${parts.length} item(s) back to open`);
} else die("usage: authorize | implemented | released | reject | ruling");
