/**
 * The commit-time guard. FAILS CLOSED: a ledger that existed and is gone is a
 * refusal, not "nothing to guard" (Codex's review of revision 1, finding 1).
 * Refuses, naming the item or file, when:
 *   1. the ledger is missing, lost a record, rewrote item or batch history,
 *      changed a protected field (identity, parts, waits, links, an accepted
 *      fix's assertions) outside a declared migration, moved a batch other
 *      than by its transition table, or carries a ruling or a decision that
 *      has no record from Adam (ledger-lib.ts, ledgerRegressions);
 *   2. a fix Adam accepted no longer holds — its wording is gone, or a retired
 *      wording is back anywhere in the product (files discovered fresh);
 *   3. the readable list differs from the ledger;
 *   4. a batch file is not the one frozen at Go, or a revision's retained
 *      snapshot is missing or changed (ledger-lib.ts, frozenFileProblems);
 *  and, for a batch (the branch audit/batch-<id>, or FPSLLC_BATCH=<id> in the
 *  review's detached checkout):
 *   5. a file was changed — staged, unstaged or brand new — that the batch did
 *      not declare, or a control was changed without being declared as one;
 *   6. a "replace" file differs from what the declared replacements produce;
 *   7. a check disappeared from a check suite and the batch did not name it;
 *   8. a part is unassigned, belongs to a defect another batch is working on,
 *      waits on a ruling, has no assertion, leaves a second sighting of its
 *      defect behind, or records words that are not the approved batch
 *      file's words.
 *
 * In a code file the guard cannot tell an authorized change from an unrelated
 * one; that is left, in those words, to Adam's complete-diff review. This
 * guard does NOT check Adam's acceptance of a release — the push hook does,
 * on his Mac. A Go-authorized migration (a migration file plus the ruling
 * naming it) is permitted here so it can be committed and tested; the release
 * gate still refuses it without Adam's acceptance.
 *
 *   bun run docs/audit/guard.ts --staged              (the commit step: the index)
 *   bun run docs/audit/guard.ts                       (the working tree, new files included)
 *   bun run docs/audit/guard.ts --against <a>..<b>    (GitHub: the ledger at <b> against the ledger at <a>;
 *                                                     the checks that need Adam's records are reported as not
 *                                                     available there, never assumed)
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, BATCHES, git, gitOk, loadLedger, loadBatch, frozenHashOf, productFiles, ledgerRegressions, frozenFileProblems, linkProblems, replayStatic,
  isRecordPath, isControlPath, count, defectGroup, familyClaim, unmetWaits, checkLabels, readAt, type Ledger, type BatchFile,
} from "./ledger-lib";
import { renderList } from "./ledger-print";

const staged = process.argv.includes("--staged");
const againstArg = process.argv.includes("--against") ? process.argv[process.argv.indexOf("--against") + 1] ?? "" : null;
const refusals: string[] = [];
const notes: string[] = [];
const done = () => {
  for (const n of notes) console.log(`guard: note — ${n}`);
  if (refusals.length > 0) { console.error(`guard: REFUSED — ${refusals.length} problem(s):\n` + refusals.map((r) => `  - ${r}`).join("\n")); process.exit(1); }
};

/* ---- GitHub: two commits, no working tree, no records from Adam ---- */
if (againstArg !== null) {
  const m = /^([^.]+)\.\.([^.]+)$/.exec(againstArg);
  if (!m) { console.error("guard: --against needs <before>..<after>"); process.exit(1); }
  const [beforeRev, afterRev] = [m[1], m[2]];
  for (const r of [beforeRev, afterRev]) if (!gitOk(["cat-file", "-e", `${r}^{commit}`])) { console.error(`guard: REFUSED — the commit ${r.slice(0, 12)} is not available here, so the ledger's transition check cannot run. It is not replaced by a guess.`); process.exit(1); }
  const readB = readAt(beforeRev), readA = readAt(afterRev);
  const beforeText = readB("docs/audit/ledger.json"), afterText = readA("docs/audit/ledger.json");
  if (beforeText && afterText === null) refusals.push("docs/audit/ledger.json is missing — the ledger existed and is gone");
  if (afterText) {
    const after = loadLedger(afterText);
    if (beforeText) refusals.push(...ledgerRegressions(loadLedger(beforeText), after, { read: readA, external: "skip" }));
    else refusals.push(...linkProblems(after));
    refusals.push(...frozenFileProblems(after, readA));
    const files = git(["ls-tree", "-r", "--name-only", afterRev]).split("\n").filter((f) => /^(webapp\/(src|server|index\.html|vercel\.json)|docs\/)/.test(f) && /\.(tsx?|md|json|html)$/.test(f) && !/\.test\.tsx?$|^webapp\/server\/e2e\.ts$|^docs\/(audit|source|word)\//.test(f) && !(/^docs\//.test(f) && !/\.md$/.test(f)));
    refusals.push(...replayStatic(after, readA, files));
    if (readA("docs/audit/findings-open.md") !== renderList(after)) refusals.push("docs/audit/findings-open.md differs from the ledger at that commit");
    notes.push(`compared the ledger at ${afterRev.slice(0, 7)} with the ledger at ${beforeRev.slice(0, 7)}${beforeText ? "" : " (none there: every record is new)"}; Adam's acceptance, rejection, ruling and migration records are on his Mac and were not checked here`);
  } else notes.push(`no ledger at ${afterRev.slice(0, 7)}`);
  done();
  console.log("guard: ok");
  process.exit(0);
}

const read = (file: string): string | null => {
  if (staged) {
    const inIndex = git(["ls-files", "--error-unmatch", "--", file], { allowFail: true });
    if (inIndex) { try { return git(["show", `:${file}`]); } catch { return null; } }
    return null; // staged mode judges what is being committed, and an unstaged new file is not
  }
  const p = join(ROOT, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

const ledgerText = read("docs/audit/ledger.json");
if (ledgerText === null) {
  const had = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true }) || git(["show", "origin/main:docs/audit/ledger.json"], { allowFail: true });
  if (had) { refusals.push("docs/audit/ledger.json is missing — the ledger existed and is gone. Deleting the record is never a records change; restore it."); done(); }
  console.log("guard: first install — no ledger here, at HEAD or on main");
  process.exit(0);
}
const ledger: Ledger = loadLedger(ledgerText);

/* 1 — against the last committed ledger; Adam's records are read here */
const headText = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true });
if (headText) refusals.push(...ledgerRegressions(loadLedger(headText), ledger, { read, external: "required" }));
else refusals.push(...linkProblems(ledger));

/* 2 — every accepted fix, replayed */
const files = productFiles().filter((f) => read(f) !== null);
refusals.push(...replayStatic(ledger, read, files));

/* 3 — the readable list */
if (read("docs/audit/findings-open.md") !== renderList(ledger)) refusals.push("docs/audit/findings-open.md differs from the ledger — run: bun run docs/audit/ledger-print.ts list");

/* 4 — every batch file frozen at Go; every revision's snapshot retained */
refusals.push(...frozenFileProblems(ledger, read));

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

    /* 8 — the parts */
    const others = existsSync(BATCHES) ? readdirSync(BATCHES).filter((x) => x !== id && existsSync(join(BATCHES, x, "batch.json"))) : [];
    for (const bi of batch.items) {
      const it = ledger.items.find((i) => i.id === bi.id);
      const part = it?.parts.find((p) => p.key === bi.part);
      const name = `item ${bi.id}${bi.part === "all" ? "" : ` (${bi.part})`}`;
      if (!it || !part) { refusals.push(`${name}: not in the ledger`); continue; }
      if (it.verdict === "dropped") refusals.push(`${name}: was dropped — ${it.verdictReason}`);
      if (part.batch !== id) refusals.push(`${name}: not assigned to batch ${id} in the ledger — assignment is recorded before work starts`);
      const claim = familyClaim(ledger, { item: bi.id, part: bi.part }, id);
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
      // Every place the same defect was seen is fixed together: the other parts of its defect group.
      for (const g of defectGroup(ledger, { item: bi.id, part: bi.part })) {
        if (g.item.id === it.id && g.part.key === part.key) continue;
        if (g.item.verdict !== "open" || g.part.status !== "open" || unmetWaits(ledger, g.item, g.part).length > 0) continue;
        if (!batch.items.some((x) => x.id === g.item.id && x.part === g.part.key)) refusals.push(`${name}: item ${g.item.id}${g.part.key === "all" ? "" : ` (${g.part.key})`} is the same defect seen in another place and is not in this batch — every place is fixed together`);
      }
    }
  }
}

done();
console.log(`guard: ok — ${ledger.items.length} records, ${ledger.items.flatMap((i) => i.parts).filter((p) => p.fix).length} recorded fix(es) replayed across ${files.length} product files${id ? `, batch ${id} within its declared scope` : ""}`);
