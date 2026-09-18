/**
 * Seeds docs/audit/ledger.json, once, from the auditors' own files — never by
 * hand: the 267 items of the 16 Sep working list (kept unchanged under
 * sources/), Codex's four reports (its 67 new findings and its verdict on
 * each of the 267), and verdicts.json (Claude's check of Codex's disputes).
 * Refuses unless it ends with exactly the expected ids, each once.
 *
 *   bun run docs/audit/ledger-build.ts                 (refuses if a ledger exists)
 *   bun run docs/audit/ledger-build.ts --migrate <id>  apply docs/audit/migrations/<id>.json, checked
 *
 * A MIGRATION (revision 3) is the one way a protected relationship changes
 * after work has begun. It reads the committed ledger, applies exactly what
 * the file declares, and refuses unless everything else — every id, text,
 * verdict, history, wait, batch record and ruling — is identical afterwards.
 * It prints the difference it made. The ledger records the migration as a
 * ruling carrying the file's hash, so the gates can check the same thing.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ROOT, LEDGER, git, saveLedger, now, unmetWaits, loadMigration, ledgerRegressions, linkProblems, migrationPath, type Item, type Ledger, type Part, type RetiredPart } from "./ledger-lib";
import { renderList } from "./ledger-print";

/* ---- a checked migration ---- */
function migrate(id: string): never {
  const fail = (m: string): never => { console.error(`migration not applied — ${m}`); process.exit(1); };
  const f = loadMigration(id) ?? fail(`there is no ${migrationPath(id)}`);
  const beforeText = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true }) || fail("no committed ledger to migrate");
  const before = JSON.parse(beforeText) as Ledger;
  if (before.rulings.some((r) => r.kind === "migration" && r.migration === id)) fail(`migration ${id} is already recorded in the ledger`);
  if (f.m.schema && before.version !== f.m.schema.from) fail(`the file migrates version ${f.m.schema.from}; the ledger is version ${before.version}`);
  const after = JSON.parse(beforeText) as Ledger;
  const delta: string[] = [];
  const legacy = new Map<string, string>();
  for (const it of after.items) { const c = (it as Item & { canonical?: string }).canonical; if (c) legacy.set(it.id, c); delete (it as Item & { canonical?: string }).canonical; }
  for (const [itemId, d] of Object.entries(f.m.items)) {
    const it = after.items.find((i) => i.id === itemId) ?? fail(`the file names item ${itemId}, which does not exist`);
    const newKeys = (d.split ?? []).map((p) => p.key);
    for (const key of d.retire ?? []) {
      const at = it.parts.findIndex((p) => p.key === key);
      if (at < 0) fail(`item ${itemId}: cannot retire part ${key}, it does not exist`);
      if (it.parts[at].status !== "open") fail(`item ${itemId}: part ${key} is ${it.parts[at].status}; only an open part is retired`);
      if (newKeys.length === 0) fail(`item ${itemId}: retiring ${key} with nothing to replace it`);
      const kept: RetiredPart = { ...it.parts[at], migratedTo: newKeys, retiredBy: id };
      it.retiredParts = [...(it.retiredParts ?? []), kept];
      it.parts.splice(at, 1);
      delta.push(`item ${itemId}: part ${key} retired, replaced by ${newKeys.join(", ")}`);
    }
    for (const p of d.split ?? []) {
      if (it.parts.some((x) => x.key === p.key)) fail(`item ${itemId}: part ${p.key} already exists`);
      const part: Part = { key: p.key, scope: p.scope, status: "open", waitsOn: p.waitsOn ?? [], history: [{ at: now(), event: `recorded by migration ${id}` }], ...(p.canonical ? { canonical: p.canonical } : {}) };
      it.parts.push(part);
      delta.push(`item ${itemId}: part ${p.key} added${p.canonical ? ` → ${p.canonical.item}:${p.canonical.part}` : ""}`);
    }
    for (const [key, ref] of Object.entries(d.link ?? {})) {
      const part = it.parts.find((x) => x.key === key) ?? fail(`item ${itemId}: cannot link part ${key}, it does not exist`);
      part.canonical = ref;
      delta.push(`item ${itemId}: part ${key} → ${ref.item}:${ref.part}${legacy.get(itemId) === ref.item ? " (was the item-level link)" : ""}`);
    }
    if (d.related) { it.related = d.related; delta.push(`item ${itemId}: related to ${d.related.join(", ")}${legacy.has(itemId) ? " (was an item-level link)" : ""}`); }
  }
  for (const [itemId, target] of legacy) {
    const d = f.m.items[itemId];
    const kept = !!d && (Object.values(d.link ?? {}).some((r) => r.item === target) || (d.split ?? []).some((p) => p.canonical?.item === target) || (d.related ?? []).includes(target));
    if (!kept) fail(`item ${itemId} was linked to ${target} and the file neither keeps that link on a part nor records it as related`);
  }
  if (f.m.schema) after.version = f.m.schema.to as Ledger["version"];
  after.rulings.push({ date: f.m.date, kind: "migration", text: f.m.title, migration: id, migrationHash: f.hash });

  /* nothing undeclared may differ */
  const strip = (l: Ledger) => l.items.map((i) => { const c = { ...i } as Item & { canonical?: string }; delete c.canonical; delete c.related; delete c.retiredParts; c.parts = c.parts.map((p) => { const q = { ...p }; delete q.canonical; return q; }); return c; });
  const declared = new Set(Object.keys(f.m.items));
  const b = strip(before), a = strip(after);
  if (b.length !== a.length) fail("the number of items changed");
  for (let i = 0; i < b.length; i++) {
    const bi = b[i], ai = a[i];
    if (bi.id !== ai.id) fail(`item order changed at ${bi.id}`);
    const bp = JSON.stringify(bi.parts), ap = JSON.stringify(ai.parts);
    const bx = JSON.stringify({ ...bi, parts: undefined }), ax = JSON.stringify({ ...ai, parts: undefined });
    if (bx !== ax) fail(`item ${bi.id}: something other than its parts and links differs`);
    if (bp !== ap) {
      if (!declared.has(bi.id)) fail(`item ${bi.id}: its parts differ and the file does not name it`);
      for (const p of bi.parts) { const q = ai.parts.find((x) => x.key === p.key) ?? (after.items[i].retiredParts ?? []).find((x) => x.key === p.key); if (!q || JSON.stringify({ ...q, migratedTo: undefined, retiredBy: undefined, canonical: undefined }) !== JSON.stringify({ ...p, migratedTo: undefined, retiredBy: undefined, canonical: undefined })) fail(`item ${bi.id}: part ${p.key} was altered, not just moved`); }
    }
  }
  for (const it of after.items) for (const p of it.parts) { const was = before.items.find((i) => i.id === it.id)?.parts.find((q) => q.key === p.key); const d = f.m.items[it.id]; if (p.canonical && !(d?.link?.[p.key] || (d?.split ?? []).some((s) => s.key === p.key && s.canonical)) && JSON.stringify(was?.canonical) !== JSON.stringify(p.canonical)) fail(`item ${it.id} part ${p.key}: carries a link the file does not declare`); }
  if (JSON.stringify(before.batches) !== JSON.stringify(after.batches)) fail("the batch records differ");
  if (JSON.stringify(before.rulings) !== JSON.stringify(after.rulings.slice(0, -1))) fail("the rulings differ");
  const problems = [...linkProblems(after), ...ledgerRegressions(before, after, { external: "skip" }).filter((w) => !/cannot be read here/.test(w))];
  if (problems.length) fail(`the gates would refuse the result:\n  - ${problems.join("\n  - ")}`);
  saveLedger(after);
  writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(after));
  console.log(`migration ${id} applied (${f.hash.slice(0, 12)}): version ${before.version} → ${after.version}; ${delta.length} declared change(s):\n  - ${delta.join("\n  - ")}`);
  process.exit(0);
}
if (process.argv[2] === "--migrate") migrate(process.argv[3] ?? "");

const SNAPSHOT = "docs/audit/sources/findings-open-2026-09-16.md";
const CODEX = [1, 2, 3, 4].map((n) => `docs/audit/runs/2026-09-16-codex/bucket-${n}.json`);
const CODEX_NEW_COUNTS = [16, 27, 13, 11];

// Seeded once. It may be rebuilt only while NOTHING has been accepted: then
// no fix or acceptance can be lost, and the batch index and rulings carry over.
let carried: Pick<Ledger, "rulings" | "batches"> = { rulings: [], batches: [] };
if (existsSync(LEDGER)) {
  const old = JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
  const touched = old.items.some((i) => i.parts.some((p) => p.status !== "open")) || old.batches.some((b) => ["authorized", "implemented", "accepted", "released"].includes(b.status));
  if (!process.argv.includes("--rebuild") || touched) {
    console.error(touched ? "ledger.json holds work in progress or accepted fixes; it is never rebuilt after that. A structural change is a migration: --migrate <id>." : "ledger.json already exists. Pass --rebuild to reseed it (allowed only while nothing has been authorized or accepted).");
    process.exit(1);
  }
  carried = { rulings: old.rulings, batches: old.batches };
}
// History is append-only even across a reseed: a part that already existed in
// the last committed ledger keeps the history it had there.
const committed = ((): Ledger | null => { const t = git(["show", "HEAD:docs/audit/ledger.json"], { allowFail: true }); return t ? (JSON.parse(t) as Ledger) : null; })();

const problems: string[] = [];
const verdicts = JSON.parse(readFileSync(join(ROOT, "docs/audit/verdicts.json"), "utf8")) as {
  dropped: Record<string, string>; optional: Record<string, string>; corrected: Record<string, string>;
  disputeRejected: Record<string, string>; duplicates: Record<string, string>; duplicateNotes: Record<string, string>;
  newRulingNeeded: string[]; newNotes: Record<string, string>;
  parts: Record<string, { key: string; scope: string; waitsOn?: string[] }[]>;
  extraWaits: Record<string, string[]>;
};

type LegacyItem = Item & { canonical?: string };
const legacyLink = (it: Item, target: string) => { (it as LegacyItem).canonical = target; };
const legacyOf = (it: Item | undefined): string | undefined => (it as LegacyItem | undefined)?.canonical;

/* ---- the 267 ---- */
const lines = readFileSync(join(ROOT, SNAPSHOT), "utf8").split("\n");
const items: Item[] = [];
const tagToId = new Map<string, string>();
const sameAsTag = new Map<string, string>();
let area = "";
let housekeeping = false;
let cur: Item | null = null;
for (const line of lines) {
  const h2 = /^## (.+?) — \d+ to fix/.exec(line);
  if (h2) { area = h2[1]; housekeeping = false; cur = null; continue; }
  if (/^### Housekeeping/.test(line)) { housekeeping = true; cur = null; continue; }
  const m = /^- \*\*(\d+)\. \[([^\]]+)\]\*\*(.*)$/.exec(line);
  if (m) {
    let rest = m[3];
    const same = /\(same defect as ([^)]+)\)/.exec(rest);
    if (same) { sameAsTag.set(m[1], same[1].trim()); rest = rest.replace(same[0], ""); }
    const ruling = /\*\*— ruling needed\*\*/.test(rest);
    rest = rest.replace(/\*\*— ruling needed\*\*/, "").replace(/^\s*—\s*/, "").replace(/^\s*—\s*/, "").trim();
    cur = {
      id: m[1], tag: m[2], area, housekeeping, source: `${SNAPSHOT} item ${m[1]}`, text: rest,
      verdict: "open", waitsOn: ruling ? [`ruling:${m[1]}`] : [], parts: [],
    };
    items.push(cur);
    tagToId.set(m[2], m[1]);
    continue;
  }
  if (cur && /^ {2}- /.test(line)) {
    if (/^ {2}- Ruling:\s*$/.test(line)) continue;
    cur.text += "\n" + line.replace(/^ {2}- /, "");
  }
}

for (const [id, tag] of sameAsTag) {
  const target = tagToId.get(tag);
  const it = items.find((i) => i.id === id);
  if (!target) problems.push(`item ${id}: "same defect as ${tag}" names no item`);
  else if (it) legacyLink(it, target);
}

/* ---- Codex: its verdict on each of the 267, and its 67 new findings ---- */
const areaOfPath = (p: string): string => {
  if (/src\/pages\/admin\/|server\/routes-admin/.test(p)) return "Office";
  if (/src\/pages\/portal\/|oaLearnMore|src\/lib\/(ownership|ssn)|server\/routes-portal/.test(p)) return "Client portal";
  if (/components\/forms\/|pages\/(OrderConfirmed|FormLLC)|server\/routes-payments/.test(p)) return "Order form and payment";
  if (/^webapp\/src\//.test(p)) return "Public pages, Terms and Privacy";
  if (/server\/(email|renewals|backup|dropbox|crypto)/.test(p)) return "Emails and jobs";
  return "Agreements and guidance";
};
const codexSeen = new Set<string>();
CODEX.forEach((path, bi) => {
  const rep = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as {
    priorFindings: { id: string; status: string; evidence: string; replacementOk: boolean; replacementNote: string }[];
    findings: { where: string; file: string; line: number | string; reads: string; claims: string; truth: string; replacement: string; severity: string }[];
  };
  for (const p of rep.priorFindings) {
    const it = items.find((i) => i.id === String(p.id));
    if (!it) { problems.push(`${path}: prior ${p.id} is not one of the 267`); continue; }
    if (codexSeen.has(it.id)) problems.push(`Codex assessed item ${it.id} twice`);
    codexSeen.add(it.id);
    // The defect's status and the replacement's verdict are two different facts (Codex, finding 8).
    it.codex = { status: p.status, evidence: p.evidence, replacementOk: typeof p.replacementOk === "boolean" ? p.replacementOk : null, replacementNote: p.replacementNote ?? "" };
  }
  if (rep.findings.length !== CODEX_NEW_COUNTS[bi]) problems.push(`${path}: ${rep.findings.length} new findings, expected ${CODEX_NEW_COUNTS[bi]}`);
  rep.findings.forEach((f, i) => {
    const id = `N${bi + 1}.${String(i + 1).padStart(2, "0")}`;
    items.push({
      id, tag: f.severity, area: areaOfPath(f.file), housekeeping: f.severity === "housekeeping",
      source: `${path} finding ${i + 1}`,
      text: `${f.where} — \`${f.file}:${f.line}\`\nReads: ${f.reads}\nClaims: ${f.claims}\nTrue: ${f.truth}\nReplace with: ${f.replacement}`,
      verdict: "open", waitsOn: verdicts.newRulingNeeded.includes(id) ? [`ruling:${id}`] : [], parts: [],
    });
  });
});
for (const it of items) if (/^\d+$/.test(it.id) && !codexSeen.has(it.id)) problems.push(`Codex's reports never assessed item ${it.id}`);

/* ---- Claude's check of Codex's 63 disputes and 11 duplicates ---- */
const groups = [verdicts.dropped, verdicts.optional, verdicts.corrected, verdicts.disputeRejected];
const all63 = groups.flatMap((g) => Object.keys(g));
if (all63.length !== 63 || new Set(all63).size !== 63) problems.push(`the four dispute groups hold ${all63.length} ids (${new Set(all63).size} distinct); Codex disputed exactly 63`);
for (const id of all63) {
  const it = items.find((i) => i.id === id);
  if (!it) { problems.push(`verdicts.json names item ${id}, which does not exist`); continue; }
  if (it.codex?.status !== "disputed") problems.push(`verdicts.json treats item ${id} as disputed; Codex marked it "${it.codex?.status}"`);
}
for (const it of items) if (it.codex?.status === "disputed" && !all63.includes(it.id)) problems.push(`Codex disputed item ${it.id}; verdicts.json gives it no outcome`);
for (const [id, why] of Object.entries(verdicts.dropped)) { const it = items.find((i) => i.id === id); if (it) { it.verdict = "dropped"; it.verdictReason = why; } }
for (const [id, why] of Object.entries(verdicts.optional)) { const it = items.find((i) => i.id === id); if (it) { it.verdict = "optional"; it.verdictReason = why; } }
for (const [id, note] of Object.entries(verdicts.corrected)) { const it = items.find((i) => i.id === id); if (it) it.correctedReplacement = note; }
for (const [id, note] of Object.entries(verdicts.disputeRejected)) { const it = items.find((i) => i.id === id); if (it) it.verdictReason = `Codex's dispute not adopted: ${note}`; }
const dupIds = Object.keys(verdicts.duplicates);
for (const [id, target] of Object.entries(verdicts.duplicates)) {
  const it = items.find((i) => i.id === id);
  if (!it || !items.some((i) => i.id === target)) { problems.push(`duplicate ${id} → ${target}: one of them does not exist`); continue; }
  if (it.codex?.status !== "duplicate") problems.push(`verdicts.json links item ${id} as a duplicate; Codex marked it "${it.codex?.status}"`);
  legacyLink(it, target);
  if (verdicts.duplicateNotes[id]) it.correctedReplacement = verdicts.duplicateNotes[id];
}
for (const it of items) if (it.codex?.status === "duplicate" && !dupIds.includes(it.id)) problems.push(`Codex marked item ${it.id} duplicate; verdicts.json does not link it`);
for (const [id, note] of Object.entries(verdicts.newNotes)) {
  const it = items.find((i) => i.id === id);
  if (!it) problems.push(`newNotes names ${id}, which does not exist`); else it.correctedReplacement = note;
}
for (const id of verdicts.newRulingNeeded) if (!items.some((i) => i.id === id)) problems.push(`newRulingNeeded names ${id}, which does not exist`);
for (const [id, waits] of Object.entries(verdicts.extraWaits ?? {})) {
  const it = items.find((i) => i.id === id);
  if (!it) { problems.push(`extraWaits names item ${id}, which does not exist`); continue; }
  for (const w of waits) {
    if (!items.some((i) => i.id === w.replace(/^ruling:/, ""))) problems.push(`item ${id} waits on ${w}, which does not exist`);
    if (!it.waitsOn.includes(w)) it.waitsOn.push(w);
  }
}
for (const split of Object.values(verdicts.parts)) for (const p of split) for (const w of p.waitsOn ?? []) if (!items.some((i) => i.id === w.replace(/^ruling:/, ""))) problems.push(`a part waits on ${w}, which does not exist`);

/* ---- parts ---- */
for (const it of items) {
  const split = verdicts.parts[it.id];
  const mk = (key: string, scope: string, waitsOn: string[] = []): Part => ({ key, scope, status: "open", waitsOn, history: [{ at: now(), event: "recorded" }] });
  it.parts = split ? split.map((p) => mk(p.key, p.scope, p.waitsOn ?? [])) : [mk("all", "The whole finding.")];
  for (const p of it.parts) { const was = committed?.items.find((i) => i.id === it.id)?.parts.find((q) => q.key === p.key); if (was) p.history = was.history; }
}
for (const id of Object.keys(verdicts.parts)) if (!items.some((i) => i.id === id)) problems.push(`parts names item ${id}, which does not exist`);
// A chain of "same defect as" ends at one main record. (The seed writes the
// version-1 item-level link; migration 001 moved every link to a part.)
for (const it of items) {
  let hops = 0;
  while (legacyOf(it) && legacyOf(items.find((i) => i.id === legacyOf(it)) as Item) && hops++ < 5) legacyLink(it, legacyOf(items.find((i) => i.id === legacyOf(it)) as Item) as string);
  if (legacyOf(it) === it.id) problems.push(`item ${it.id} is linked to itself`);
}

/* ---- the count, by exact id ---- */
const expected = [
  ...Array.from({ length: 267 }, (_, i) => String(i + 1)),
  ...CODEX_NEW_COUNTS.flatMap((n, b) => Array.from({ length: n }, (_, i) => `N${b + 1}.${String(i + 1).padStart(2, "0")}`)),
];
const got = items.map((i) => i.id);
for (const id of expected) if (got.filter((g) => g === id).length !== 1) problems.push(`id ${id} appears ${got.filter((g) => g === id).length} times; it must appear once`);
for (const id of got) if (!expected.includes(id)) problems.push(`unexpected id ${id}`);

if (problems.length > 0) {
  console.error(`ledger not built — ${problems.length} problem(s):\n` + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}

const ledger: Ledger = { version: 1, builtFrom: [SNAPSHOT, ...CODEX, "docs/audit/verdicts.json"], items, rulings: carried.rulings, batches: carried.batches };
if (!process.argv.includes("--dry")) saveLedger(ledger);
const n = (f: (i: Item) => boolean) => items.filter(f).length;
console.log(`ledger: ${items.length} of ${expected.length} records (267 + 67), each id once`);
console.log(`  dropped ${n((i) => i.verdict === "dropped")}, optional ${n((i) => i.verdict === "optional")}, corrected replacement ${Object.keys(verdicts.corrected).length}, Codex dispute not adopted ${Object.keys(verdicts.disputeRejected).length}`);
console.log(`  second sightings linked to a main record: ${n((i) => !!legacyOf(i))} (${dupIds.length} of them from Codex)`);
console.log(`  waiting on Adam's ruling, directly or through their main record: ${n((i) => i.verdict !== "dropped" && i.parts.some((p) => unmetWaits(ledger, i, p).some((w) => w.startsWith("ruling:"))))}`);
console.log(`  confirmed defects whose proposed replacement Codex rejected: ${n((i) => i.codex?.status === "confirmed" && i.codex.replacementOk === false)}`);
