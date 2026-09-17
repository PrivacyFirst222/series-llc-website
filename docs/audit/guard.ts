/**
 * The commit-time guard. Refuses, naming the item or file, when:
 *   1. the ledger lost a record, rewrote history, or changed an accepted fix;
 *   2. a fix Adam accepted no longer holds — its wording is gone, or a retired
 *      wording is back anywhere in the product (files discovered fresh);
 *   3. the readable list differs from the ledger;
 *  and, on a batch branch (audit/batch-<id>):
 *   4. the batch file is not the one frozen at Adam's Go;
 *   5. a file was changed that the batch did not declare, or a check, hook or
 *      publishing control was changed without being declared as one;
 *   6. a "replace" file differs from what the declared replacements produce;
 *   7. an item is unassigned, claimed by another batch, waits on a ruling, has
 *      no assertion, leaves a second sighting behind, or records words that
 *      are not the approved batch file's words.
 *
 *   bun run docs/audit/guard.ts --staged     (the commit step)
 *   bun run docs/audit/guard.ts              (the working tree; CI)
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, BATCHES, git, loadLedger, loadBatch, frozenHashOf, productFiles, ledgerRegressions, replayStatic,
  isRecordPath, isControlPath, count, type Ledger, type BatchFile,
} from "./ledger-lib";
import { renderList } from "./ledger-print";

const staged = process.argv.includes("--staged");
const refusals: string[] = [];
const notes: string[] = [];

const read = (file: string): string | null => {
  if (staged) {
    const inIndex = git(["ls-files", "--error-unmatch", "--", file], { allowFail: true });
    if (inIndex) { try { return git(["show", `:${file}`]); } catch { return null; } }
  }
  const p = join(ROOT, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

const ledgerText = read("docs/audit/ledger.json");
if (ledgerText === null) { console.log("guard: no ledger yet — nothing to guard"); process.exit(0); }
const ledger: Ledger = loadLedger(ledgerText);

/* 1 — against the last committed ledger */
const headText = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true });
if (headText) refusals.push(...ledgerRegressions(loadLedger(headText), ledger));

/* 2 — every accepted fix, replayed */
const files = productFiles().filter((f) => read(f) !== null);
refusals.push(...replayStatic(ledger, read, files));

/* 3 — the readable list */
if (read("docs/audit/findings-open.md") !== renderList(ledger)) refusals.push("docs/audit/findings-open.md differs from the ledger — run: bun run docs/audit/ledger-print.ts list");

/* accepted batches' files never change; a change is a new revision */
for (const b of ledger.batches) {
  if (!["accepted", "released"].includes(b.status)) continue;
  const t = read(`docs/audit/batches/${b.id}/batch.json`);
  if (t === null || frozenHashOf(JSON.parse(t) as BatchFile) !== b.frozenHash) refusals.push(`batch ${b.id} r${b.revision} was ${b.status}; its batch file changed — issue a new revision instead`);
}

/* 4–7 — on a batch branch */
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const bm = /^audit\/batch-(.+)$/.exec(branch);
if (bm) {
  const id = bm[1];
  const bt = read(`docs/audit/batches/${id}/batch.json`);
  if (bt === null) refusals.push(`branch ${branch} has no docs/audit/batches/${id}/batch.json — the batch file is written before Go`);
  else {
    const batch = JSON.parse(bt) as BatchFile;
    const idx = ledger.batches.find((x) => x.id === id && x.revision === batch.revision);
    if (!idx) refusals.push(`batch ${id} r${batch.revision} is not in the ledger's batch index — it has not been authorized`);
    else if (idx.frozenHash !== frozenHashOf(batch)) refusals.push(`batch ${id} r${batch.revision}: the batch file is not the one frozen at Go (a changed batch is revision ${batch.revision + 1}, approved again)`);

    /* 5 — everything the branch changed since it was cut */
    const base = batch.base;
    const changed = git(staged ? ["diff", "--cached", "--name-status", "--no-renames", base] : ["diff", "--name-status", "--no-renames", base]).split("\n").filter(Boolean).map((l) => l.split("\t")).map(([st, p]) => ({ st, p }));
    const declared = new Map(batch.files.map((f) => [f.path, f]));
    for (const { p } of changed) {
      if (p.startsWith(`docs/audit/batches/${id}/`)) continue;
      const d = declared.get(p);
      if (isRecordPath(p) && !d) continue;
      if (!d) { refusals.push(`${p}: changed, but batch ${id} does not declare it`); continue; }
      if (isControlPath(p) && !d.control) refusals.push(`${p}: a check, hook or publishing control — batch ${id} must declare it as one (control: true)`);
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
    if (codeFiles.length) notes.push(`code files are not checked line by line — they are left to Adam's complete-diff review: ${codeFiles.join(", ")}`);

    /* 7 — the items */
    const others = existsSync(BATCHES) ? readdirSync(BATCHES).filter((x) => x !== id && existsSync(join(BATCHES, x, "batch.json"))) : [];
    for (const bi of batch.items) {
      const it = ledger.items.find((i) => i.id === bi.id);
      const part = it?.parts.find((p) => p.key === bi.part);
      const name = `item ${bi.id}${bi.part === "all" ? "" : ` (${bi.part})`}`;
      if (!it || !part) { refusals.push(`${name}: not in the ledger`); continue; }
      if (it.verdict === "dropped") refusals.push(`${name}: was dropped — ${it.verdictReason}`);
      if (part.batch !== id) refusals.push(`${name}: not assigned to batch ${id} in the ledger — assignment is recorded before work starts`);
      for (const o of others) {
        const ob = loadBatch(o);
        const oi = ledger.batches.find((x) => x.id === o && x.revision === ob.revision);
        if (oi?.status !== "rejected" && ob.items.some((x) => x.id === bi.id && x.part === bi.part)) refusals.push(`${name}: already claimed by batch ${o}`);
      }
      for (const w of [...it.waitsOn, ...part.waitsOn]) {
        const met = w.startsWith("ruling:") ? ledger.rulings.some((r) => r.item === w.slice(7)) : (ledger.items.find((i) => i.id === w)?.parts.every((p) => p.status === "released") ?? false);
        if (!met) refusals.push(`${name}: waits on ${w.startsWith("ruling:") ? `Adam's ruling on item ${w.slice(7)}` : `item ${w}`}`);
      }
      if (bi.assertions.length === 0) refusals.push(`${name}: no assertion — a deletion records what must stay absent; an empty list does not switch verification off`);
      for (const a of bi.assertions) if (a.kind === "check") {
        const suite = read(a.suite === "server" ? "webapp/server/e2e.ts" : "webapp/scripts/behavioral.ts") ?? "";
        if (!suite.includes(JSON.stringify(a.label).slice(1, -1))) refusals.push(`${name}: the ${a.suite} suite has no check labelled "${a.label}"`);
      }
      if (part.fix && JSON.stringify(part.fix.assertions) !== JSON.stringify(bi.assertions)) refusals.push(`${name}: the recorded fix's words are not the approved batch file's words`);
      for (const s of ledger.items.filter((x) => x.canonical === bi.id && x.verdict === "open")) {
        const openParts = s.parts.filter((p) => p.status === "open" && ![...s.waitsOn, ...p.waitsOn].some((w) => w.startsWith("ruling:") && !ledger.rulings.some((r) => r.item === w.slice(7))));
        for (const p of openParts) if (!batch.items.some((x) => x.id === s.id && x.part === p.key)) refusals.push(`${name}: item ${s.id}${p.key === "all" ? "" : ` (${p.key})`} is the same defect seen elsewhere and is not in this batch — a second sighting is fixed with its main record`);
      }
    }
  }
}

for (const n of notes) console.log(`guard: note — ${n}`);
if (refusals.length > 0) {
  console.error(`guard: REFUSED — ${refusals.length} problem(s):\n` + refusals.map((r) => `  - ${r}`).join("\n"));
  process.exit(1);
}
console.log(`guard: ok — ${ledger.items.length} records, ${ledger.items.flatMap((i) => i.parts).filter((p) => p.fix).length} recorded fix(es) replayed across ${files.length} product files${bm ? `, batch ${bm[1]} within its declared scope` : ""}`);
