/**
 * Moves a batch through its states, by the events of the transition table
 * (ledger-lib.ts, EVENT). Every step appends history; nothing is overwritten.
 * The ledger never says "accepted" or "rejected" on a session's word: both
 * are recorded only against Adam's OWN record outside the repository — the
 * same lookups the gates use, so a later rejection stops a release too
 * (Codex's review of revision 1, finding 16; of revision 2, A and G).
 *
 *   bun run docs/audit/batch.ts authorize <id>            after Adam's Go: freeze the batch file, keep its snapshot, assign its items
 *   bun run docs/audit/batch.ts implemented <id>          the fixes are in: record the approved words as each fix
 *   bun run docs/audit/batch.ts released <id> <commit> [--deployed "<evidence>"] [--documents "<evidence>"]
 *   bun run docs/audit/batch.ts reject <id> ["<note>"]    copies Adam's rejection record into the ledger; every item back to open
 *   bun run docs/audit/batch.ts ruling <item> "<text>" [--part key]
 *                                                         copies a ruling Adam recorded (accept.ts ruling, or his message) into the ledger
 *
 * "released" records three different things separately: that the commit is on
 * the remote's main (asked of the remote, not of a local tracking ref), what
 * is known about the live site, and what is known about the Dropbox copies.
 * What is not given is recorded as not recorded, never assumed.
 */
import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, BATCHES, EVENT, git, gitOk, loadLedger, saveLedger, loadBatch, frozenHashOf, standingAcceptance, resolvePackage, packageProblems, familyClaim, unmetWaits, acceptances, rulingRecords, rulingLine, hasReplacementApproval, count, now, type Ledger } from "./ledger-lib";
import { renderList } from "./ledger-print";

const [cmd, id, ...rest] = process.argv.slice(2);
const l: Ledger = loadLedger();
function die(m: string): never { console.error(`batch: REFUSED — ${m}`); process.exit(1); }
const finish = (msg: string) => { saveLedger(l); writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(l)); console.log(msg); };
const opt = (name: string): string | null => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] ?? null : null; };

if (cmd === "ruling") {
  const text = rest[0] ?? die("a ruling needs its text");
  if (!l.items.some((i) => i.id === id)) die(`item ${id} does not exist`);
  const part = opt("--part"), sup = opt("--supersedes");
  if (sup !== null) die("--supersedes does not authorize a replacement; declare replaces in a new batch and obtain Approve replacement <batch>, revision <n>");
  if (part && !l.items.find((i) => i.id === id)?.parts.some((p) => p.key === part)) die(`item ${id} has no part "${part}"`);
  const rec = rulingRecords().find((r) => r.kind === "ruling" && r.item === id && (r.part ?? "") === (part ?? "") && (r.text ?? "").trim() === text.trim());
  if (!rec) die(`no record from Adam says this on item ${id}${part ? ` (${part})` : ""}. A ruling is copied from his record, never written first: his whole message "Ruling ${id}${part ? `, part ${part}` : ""}: <text>", or  bun run docs/audit/accept.ts ruling ${id} "<text>"${part ? ` --part ${part}` : ""}`);
  l.rulings.push({ date: rec.at.slice(0, 10), kind: "ruling", item: id, text: rec.text as string, ...(part ? { part } : {}), ...(sup ? { supersedes: sup } : {}) });
  const auditRules = join(ROOT, "docs/audit/rulings.md");
  const entry = rulingLine(rec);
  if (!readFileSync(auditRules, "utf8").split("\n").includes(entry)) appendFileSync(auditRules, `\n${entry}\n`);
  finish(`ruling recorded on item ${id}${part ? ` (${part})` : ""}, from Adam's record of ${rec.at.slice(0, 16)} (${rec.source})`);
  process.exit(0);
}

const b = loadBatch(id ?? die("which batch?"));
const parts = b.items.map((bi) => {
  const it = l.items.find((i) => i.id === bi.id) ?? die(`item ${bi.id} is not in the ledger`);
  const part = it.parts.find((p) => p.key === bi.part) ?? die(`item ${bi.id} has no part "${bi.part}"`);
  return { bi, it, part };
});
const idx = () => l.batches.find((x) => x.id === b.id && x.revision === b.revision);
const name = ({ bi }: { bi: { id: string; part: string } }) => `item ${bi.id}${bi.part === "all" ? "" : ` (${bi.part})`}`;

if (cmd === "authorize") {
  if (idx()) die(`batch ${b.id} revision ${b.revision} is already authorized; a changed batch is the next revision`);
  const prev = l.batches.find((x) => x.id === b.id && x.revision === b.revision - 1);
  if (b.revision > 1 && !prev) die(`revision ${b.revision} needs revision ${b.revision - 1} on record`);
  if (prev && prev.status !== "rejected") die(`revision ${b.revision - 1} is ${prev.status}, not rejected — a next revision follows Adam's rejection of the one before`);
  if (l.batches.some((x) => x.id === b.id && x.revision > b.revision)) die(`a later revision of batch ${b.id} already exists`);
  if (!gitOk(["cat-file", "-e", `${b.base}^{commit}`])) die(`base ${b.base} is not a commit`);
  const snap = join(BATCHES, b.id, "revisions", `r${b.revision}.json`);
  if (existsSync(snap)) die(`${snap} already exists — a snapshot is written once, at Go`);
  for (const x of parts) {
    const { bi, it, part } = x;
    if (it.verdict === "dropped") die(`${name(x)} was dropped: ${it.verdictReason}`);
    if (bi.replaces) {
      if (part.status !== "released" || !part.fix || JSON.stringify(bi.replaces) !== JSON.stringify(part.fix)) die(`${name(x)}: replacement does not name the exact released fix`);
      if (!hasReplacementApproval(b)) die(`${name(x)}: no owner approval names this exact replacement work order (Approve replacement ${b.id}, revision ${b.revision})`);
      if (part.fix.batch === b.id) die(`${name(x)}: a replacement uses a new batch id; the released batch remains final`);
    }
    if (!bi.replaces && part.status !== "open" && part.batch !== b.id) die(`${name(x)} is ${part.status} in batch ${part.batch} — it cannot be claimed twice`);
    const claim = familyClaim(l, { item: bi.id, part: bi.part }, b.id);
    if (claim) die(`${name(x)} is the same defect as work already under way — ${claim}. A defect is claimed once, whatever numbers it was seen under`);
    for (const w of unmetWaits(l, it, part)) die(`${name(x)} waits on ${w.startsWith("ruling:") ? `Adam's ruling on item ${w.slice(7)}` : `item ${w}`}`);
    if (bi.assertions.length === 0) die(`${name(x)} has no assertion`);
    for (const a of bi.assertions) if (a.kind === "replace") {
      const was = git(["show", `${b.base}:${a.file}`], { allowFail: true });
      const n = count(was, a.before);
      if (n !== (a.count ?? 1)) die(`${name(x)}: the words to replace are in ${a.file} ${n}× at ${b.base.slice(0, 7)}, the batch says ${a.count ?? 1}: "${a.before.slice(0, 90)}" — the "before" words must be proven present, exactly, before Go`);
    }
  }
  for (const { bi, part } of parts) {
    if (bi.replaces) {
      part.supersessions = [...(part.supersessions ?? []), { prior: structuredClone(bi.replaces), batch: b.id, revision: b.revision, hash: frozenHashOf(b) }];
      part.history.push({ at: now(), event: "superseded by approved replacement", batch: b.id, revision: b.revision, note: `prior fix ${bi.replaces.batch} r${bi.replaces.revision} at ${bi.replaces.commit}; approved work order ${frozenHashOf(b)}` });
      delete part.fix;
    }
    part.status = "assigned"; part.batch = b.id; part.history.push({ at: now(), event: "assigned", batch: b.id, revision: b.revision });
  }
  const hash = frozenHashOf(b);
  mkdirSync(join(BATCHES, b.id, "revisions"), { recursive: true });
  writeFileSync(snap, readFileSync(join(BATCHES, b.id, "batch.json")));
  l.batches.push({ id: b.id, revision: b.revision, frozenHash: hash, status: "authorized", model: b.model, base: b.base, history: [{ at: now(), event: EVENT.authorized, note: "Adam's Go; batch file frozen and its snapshot kept" }] });
  finish(`batch ${b.id} r${b.revision} authorized: ${parts.length} item(s) assigned, batch file frozen as ${hash.slice(0, 12)}, snapshot kept at revisions/r${b.revision}.json`);
} else if (cmd === "implemented") {
  const x = idx() ?? die("not authorized");
  if (x.status !== "authorized") die(`batch ${b.id} r${b.revision} is ${x.status}; only an authorized batch is implemented`);
  if (x.frozenHash !== frozenHashOf(b)) die("the batch file is not the one frozen at Go");
  for (const { bi, part } of parts) {
    part.status = "implemented";
    part.fix = { batch: b.id, revision: b.revision, commit: "", doneBy: b.model, assertions: bi.assertions };
    part.history.push({ at: now(), event: "implemented", batch: b.id, revision: b.revision, note: `by ${b.model}` });
  }
  x.status = "implemented"; x.history.push({ at: now(), event: EVENT.implemented });
  finish(`batch ${b.id} r${b.revision}: ${parts.length} fix(es) recorded with the approved words`);
} else if (cmd === "released") {
  const commit = git(["rev-parse", "--verify", `${rest[0] ?? die("which commit?")}^{commit}`]).trim();
  const x = idx() ?? die("not authorized");
  if (x.status !== "implemented") die(`batch ${b.id} r${b.revision} is ${x.status}; only an implemented batch is released`);
  const { acc, why } = standingAcceptance(commit, b.id, b.revision);
  if (!acc) die(why);
  const found = resolvePackage({ acceptance: acc });
  if ("error" in found) die(found.error);
  const bad = packageProblems(found);
  if (bad.length) die(bad.join("; "));
  const remoteMain = git(["ls-remote", "origin", "refs/heads/main"], { allowFail: true }).split(/\s+/)[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(remoteMain)) die("could not ask the remote what its main is");
  if (!gitOk(["merge-base", "--is-ancestor", commit, remoteMain])) die(`the remote's main (${remoteMain.slice(0, 7)}) does not contain ${commit.slice(0, 7)} — it has not been pushed`);
  for (const { part } of parts) {
    if (part.fix) part.fix.commit = commit;
    part.status = "released";
    part.history.push({ at: acc.at, event: "accepted by Adam", batch: b.id, revision: b.revision, note: `commit ${commit}, package ${acc.packageId}, by ${acc.source}` }, { at: now(), event: "released", batch: b.id, revision: b.revision });
  }
  const dep = opt("--deployed"), docs = opt("--documents");
  x.release = { git: { at: now(), remoteMain, commit, packageId: acc.packageId as string }, deployment: dep ? { at: now(), evidence: dep } : null, documents: docs ? { at: now(), evidence: docs } : null };
  x.status = "released";
  x.history.push({ at: acc.at, event: EVENT.accepted, note: `commit ${commit}, package ${acc.packageId} (${acc.source})` }, { at: now(), event: EVENT.released, note: `the remote's main is ${remoteMain.slice(0, 7)} and contains the accepted commit; live site: ${dep ?? "not recorded"}; Dropbox copies: ${docs ?? "not recorded"}` });
  finish(`batch ${b.id} r${b.revision} recorded as pushed at ${commit.slice(0, 7)} (package ${acc.packageId}); live site: ${dep ?? "not recorded"}; Dropbox copies: ${docs ?? "not recorded"}`);
} else if (cmd === "reject") {
  const x = idx() ?? die("not authorized");
  if (x.status === "released" || x.status === "rejected") die(`batch ${b.id} r${b.revision} is ${x.status}, which is final`);
  const authorizedAt = x.history[0]?.at ?? "";
  const rec = acceptances().filter((a) => a.kind === "reject" && a.batch.toLowerCase() === b.id.toLowerCase() && (a.revision === null || a.revision === b.revision) && a.at > authorizedAt).pop();
  if (!rec) die(`no rejection record from Adam names batch ${b.id} revision ${b.revision} since it was authorized. His whole message "Reject ${b.id}, revision ${b.revision}: <reason>" records one; nothing is manufactured here`);
  const note = [rec.note, rest[0]].filter(Boolean).join(" — ");
  for (const { part } of parts) {
    part.history.push({ at: now(), event: `rejected r${b.revision}`, batch: b.id, revision: b.revision, note });
    const previous = part.supersessions?.at(-1);
    if (previous && previous.batch === b.id && previous.revision === b.revision) {
      part.status = "released"; part.batch = previous.prior.batch; part.fix = structuredClone(previous.prior);
    } else { part.status = "open"; delete part.batch; delete part.fix; }
  }
  x.status = "rejected"; x.history.push({ at: now(), event: EVENT.rejected, note: `Adam's record of ${rec.at.slice(0, 16)} (${rec.source})${note ? `: ${note}` : ""}` });
  finish(`batch ${b.id} r${b.revision} rejected on Adam's record of ${rec.at.slice(0, 16)} — nothing in it is released; ${parts.filter(x => x.part.status === "open").length} item(s) back to open; ${parts.filter(x => x.part.status === "released").length} prior released fix(es) restored`);
} else die("usage: authorize | implemented | released | reject | ruling");
