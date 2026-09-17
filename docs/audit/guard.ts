/**
 * The commit-time guard. FAILS CLOSED: a ledger that existed and is gone is a
 * refusal, not "nothing to guard" (Codex's review of revision 1, finding 1).
 * Refuses, naming the item or file, when:
 *   1. the ledger is missing, lost a record, rewrote item or batch history,
 *      or changed an accepted fix without a ruling that says what it supersedes;
 *   2. a fix Adam accepted no longer holds — its wording is gone, or a retired
 *      wording is back anywhere in the product (files discovered fresh);
 *   3. the readable list differs from the ledger;
 *   4. a frozen batch's file changed (frozen from Adam's Go, not only after
 *      acceptance);
 *  and, for a batch (the branch audit/batch-<id>, or FPSLLC_BATCH=<id> in the
 *  review's detached checkout):
 *   5. a file was changed — staged, unstaged or brand new — that the batch did
 *      not declare, or a control was changed without being declared as one;
 *   6. a "replace" file differs from what the declared replacements produce;
 *   7. a check disappeared from a check suite and the batch did not name it;
 *   8. an item is unassigned, belongs to a defect another batch is working on,
 *      waits on a ruling, has no assertion, leaves a second sighting behind,
 *      or records words that are not the approved batch file's words.
 *
 * In a code file the guard cannot tell an authorized change from an unrelated
 * one; that is left, in those words, to Adam's complete-diff review. This
 * guard does NOT check Adam's acceptance — the push hook does, on his Mac.
 *
 *   bun run docs/audit/guard.ts --staged     (the commit step: the index)
 *   bun run docs/audit/guard.ts              (the working tree, new files included)
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, BATCHES, FROZEN_STATES, git, loadLedger, loadBatch, frozenHashOf, productFiles, ledgerRegressions, replayStatic,
  isRecordPath, isControlPath, count, familyOf, familyClaim, unmetWaits, checkLabels, type Ledger, type BatchFile,
} from "./ledger-lib";
import { renderList } from "./ledger-print";

const staged = process.argv.includes("--staged");
const refusals: string[] = [];
const notes: string[] = [];

const read = (file: string): string | null => {
  if (staged) {
    const inIndex = git(["ls-files", "--error-unmatch", "--", file], { allowFail: true });
    if (inIndex) { try { return git(["show", `:${file}`]); } catch { return null; } }
    return null; // staged mode judges what is being committed, and an unstaged new file is not
  }
  const p = join(ROOT, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const done = () => {
  for (const n of notes) console.log(`guard: note — ${n}`);
  if (refusals.length > 0) { console.error(`guard: REFUSED — ${refusals.length} problem(s):\n` + refusals.map((r) => `  - ${r}`).join("\n")); process.exit(1); }
};

const ledgerText = read("docs/audit/ledger.json");
if (ledgerText === null) {
  const had = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true }) || git(["show", "origin/main:docs/audit/ledger.json"], { allowFail: true });
  if (had) { refusals.push("docs/audit/ledger.json is missing — the ledger existed and is gone. Deleting the record is never a records change; restore it."); done(); }
  console.log("guard: first install — no ledger here, at HEAD or on main");
  process.exit(0);
}
const ledger: Ledger = loadLedger(ledgerText);

/* 1 — against the last committed ledger */
const headText = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true });
if (headText) refusals.push(...ledgerRegressions(loadLedger(headText), ledger));

/* 2 — every accepted fix, replayed */
const files = productFiles().filter((f) => read(f) !== null);
refusals.push(...replayStatic(ledger, read, files));

/* 3 — the readable list */
if (read("docs/audit/findings-open.md") !== renderList(ledger)) refusals.push("docs/audit/findings-open.md differs from the ledger — run: bun run docs/audit/ledger-print.ts list");

/* 4 — a frozen batch's file never changes; a change is the next revision */
for (const b of ledger.batches) {
  if (!FROZEN_STATES.includes(b.status)) continue;
  const newer = ledger.batches.some((x) => x.id === b.id && x.revision > b.revision);
  if (newer) continue; // its file on disk is now the later revision's
  const t = read(`docs/audit/batches/${b.id}/batch.json`);
  if (t === null || frozenHashOf(JSON.parse(t) as BatchFile) !== b.frozenHash) refusals.push(`batch ${b.id} r${b.revision} is ${b.status}; its batch file is missing or changed — a changed batch is the next revision, approved again`);
}

/* 5–8 — for a batch */
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const id = process.env.FPSLLC_BATCH || /^audit\/batch-(.+)$/.exec(branch)?.[1];
if (id) {
  const bt = read(`docs/audit/batches/${id}/batch.json`);
  if (bt === null) refusals.push(`batch ${id} has no docs/audit/batches/${id}/batch.json — the batch file is written before Go`);
  else {
    const batch = JSON.parse(bt) as BatchFile;
    const idx = ledger.batches.find((x) => x.id === id && x.revision === batch.revision);
    if (!idx) refusals.push(`batch ${id} r${batch.revision} is not in the ledger's batch index — it has not been authorized`);
    else if (idx.frozenHash !== frozenHashOf(batch)) refusals.push(`batch ${id} r${batch.revision}: the batch file is not the one frozen at Go (a changed batch is revision ${batch.revision + 1}, approved again)`);

    /* 5 — everything changed since the batch was cut: staged, unstaged, and new */
    const base = batch.base;
    const names = (args: string[]) => git(args).split("\n").filter(Boolean).map((l) => l.split("\t").pop() as string);
    const changed = new Set(names(staged ? ["diff", "--cached", "--name-status", "--no-renames", base] : ["diff", "--name-status", "--no-renames", base]));
    if (!staged) for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) changed.add(f);
    const declared = new Map(batch.files.map((f) => [f.path, f]));
    for (const p of changed) {
      if (p.startsWith(`docs/audit/batches/${id}/`)) continue;
      const d = declared.get(p);
      if (isRecordPath(p) && !d) continue;
      if (!d) { refusals.push(`${p}: changed, but batch ${id} does not declare it`); continue; }
      if (isControlPath(p) && !d.control) refusals.push(`${p}: a check, hook, setting or publishing control — batch ${id} must declare it as one (control: true)`);
    }

    /* 6 — inside a "replace" file, only the declared replacements */
    for (const f of batch.files.filter((x) => x.mode === "replace")) {
      const was = git(["show", `${base}:${f.path}`], { allowFail: true });
      const is = read(f.path);
      if (!was || is === null) { refusals.push(`${f.path}: a "replace" file must exist before and after`); continue; }
      let expected = was;
      for (const a of batch.items.flatMap((i) => i.assertions)) {
        if (a.kind !== "replace" || a.file !== f.path) continue;
        const n = count(was, a.before);
        if (n !== (a.count ?? 1)) { refusals.push(`${f.path}: the text to replace occurs ${n}× at the batch's base, the batch says ${a.count ?? 1}: "${a.before.slice(0, 80)}"`); continue; }
        if (is.includes(a.after) && count(is.split(a.after).join(""), a.before) === 0) expected = expected.split(a.before).join(a.after);
      }
      if (expected !== is) {
        const e = expected.split("\n"), g = is.split("\n");
        const extra = g.filter((x) => !e.includes(x)).slice(0, 6), missing = e.filter((x) => !g.includes(x)).slice(0, 6);
        refusals.push(`${f.path}: differs from what the declared replacements produce.${extra.length ? `\n      undeclared lines now in the file:\n${extra.map((x) => `        + ${x.trim().slice(0, 140)}`).join("\n")}` : ""}${missing.length ? `\n      lines that should still be there:\n${missing.map((x) => `        - ${x.trim().slice(0, 140)}`).join("\n")}` : ""}`);
      }
    }
    const codeFiles = batch.files.filter((x) => x.mode === "code" || x.mode === "new").map((x) => x.path);
    if (codeFiles.length) notes.push(`${codeFiles.length} code file(s) are not judged line by line — that is left to Adam's complete-diff review`);

    /* 7 — a check that disappears from a suite must be named by the batch */
    for (const suite of ["webapp/server/e2e.ts", "webapp/scripts/behavioral.ts"]) {
      if (!changed.has(suite)) continue;
      const was = checkLabels(git(["show", `${base}:${suite}`], { allowFail: true }));
      const is = checkLabels(read(suite) ?? "");
      const gone = was.labels.filter((l) => !is.labels.includes(l) && !(batch.removedChecks ?? []).includes(l));
      for (const l of [...new Set(gone)]) refusals.push(`${suite}: the check "${l.slice(0, 100)}" was removed or switched off, and batch ${id} does not name it in removedChecks`);
      if (gone.length === 0 && is.calls < was.calls - (batch.removedChecks ?? []).length) refusals.push(`${suite}: fewer checks than at the batch's base (${is.calls} call sites, was ${was.calls}) — a check disappeared that batch ${id} does not name`);
    }

    /* 8 — the items */
    const others = existsSync(BATCHES) ? readdirSync(BATCHES).filter((x) => x !== id && existsSync(join(BATCHES, x, "batch.json"))) : [];
    for (const bi of batch.items) {
      const it = ledger.items.find((i) => i.id === bi.id);
      const part = it?.parts.find((p) => p.key === bi.part);
      const name = `item ${bi.id}${bi.part === "all" ? "" : ` (${bi.part})`}`;
      if (!it || !part) { refusals.push(`${name}: not in the ledger`); continue; }
      if (it.verdict === "dropped") refusals.push(`${name}: was dropped — ${it.verdictReason}`);
      if (part.batch !== id) refusals.push(`${name}: not assigned to batch ${id} in the ledger — assignment is recorded before work starts`);
      const claim = familyClaim(ledger, bi.id, id);
      if (claim) refusals.push(`${name}: the same defect is already being worked on — ${claim}`);
      for (const o of others) {
        const ob = loadBatch(o);
        const oi = ledger.batches.find((x) => x.id === o && x.revision === ob.revision);
        if (oi && oi.status !== "rejected" && oi.status !== "released" && ob.items.some((x) => x.id === bi.id && x.part === bi.part)) refusals.push(`${name}: already claimed by batch ${o}`);
      }
      for (const w of unmetWaits(ledger, it, part)) refusals.push(`${name}: waits on ${w.startsWith("ruling:") ? `Adam's ruling on item ${w.slice(7)}` : `item ${w}`}`);
      if (bi.assertions.length === 0) refusals.push(`${name}: no assertion — a deletion records what must stay absent; an empty list does not switch verification off`);
      for (const a of bi.assertions) if (a.kind === "check") {
        const suite = checkLabels(read(a.suite === "server" ? "webapp/server/e2e.ts" : "webapp/scripts/behavioral.ts") ?? "");
        if (a.suite === "server" && !suite.labels.includes(a.label)) refusals.push(`${name}: the server checks have no live check labelled "${a.label}"`);
      }
      if (part.fix && JSON.stringify(part.fix.assertions) !== JSON.stringify(bi.assertions)) refusals.push(`${name}: the recorded fix's words are not the approved batch file's words`);
      for (const s of familyOf(ledger, bi.id).filter((x) => x.id !== it.id && x.verdict === "open")) {
        for (const p of s.parts.filter((q) => q.status === "open" && unmetWaits(ledger, s, q).length === 0)) {
          if (!batch.items.some((x) => x.id === s.id && x.part === p.key)) refusals.push(`${name}: item ${s.id}${p.key === "all" ? "" : ` (${p.key})`} is the same defect seen in another place and is not in this batch — every place is fixed together`);
        }
      }
    }
  }
}

done();
console.log(`guard: ok — ${ledger.items.length} records, ${ledger.items.flatMap((i) => i.parts).filter((p) => p.fix).length} recorded fix(es) replayed across ${files.length} product files${id ? `, batch ${id} within its declared scope` : ""}`);
