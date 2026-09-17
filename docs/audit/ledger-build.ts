/**
 * Seeds docs/audit/ledger.json, once, from the auditors' own files — never by
 * hand: the 267 items of the 16 Sep working list (kept unchanged under
 * sources/), Codex's four reports (its 67 new findings and its verdict on
 * each of the 267), and verdicts.json (Claude's check of Codex's disputes).
 * Refuses unless it ends with exactly the expected ids, each once.
 *
 *   bun run docs/audit/ledger-build.ts          (refuses if a ledger exists)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, LEDGER, saveLedger, now, type Item, type Ledger, type Part } from "./ledger-lib";

const SNAPSHOT = "docs/audit/sources/findings-open-2026-09-16.md";
const CODEX = [1, 2, 3, 4].map((n) => `docs/audit/runs/2026-09-16-codex/bucket-${n}.json`);
const CODEX_NEW_COUNTS = [16, 27, 13, 11];

if (existsSync(LEDGER) && !process.argv.includes("--demo-rebuild")) {
  console.error("ledger.json already exists. It is seeded once; after that it changes only through batches and rulings.");
  process.exit(1);
}

const problems: string[] = [];
const verdicts = JSON.parse(readFileSync(join(ROOT, "docs/audit/verdicts.json"), "utf8")) as {
  dropped: Record<string, string>; optional: Record<string, string>; corrected: Record<string, string>;
  disputeRejected: Record<string, string>; duplicates: Record<string, string>; duplicateNotes: Record<string, string>;
  newRulingNeeded: string[]; newNotes: Record<string, string>;
  parts: Record<string, { key: string; scope: string; waitsOn?: string[] }[]>;
};

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
  else if (it) it.canonical = target;
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
    it.codex = { status: p.status, note: `${p.evidence}${p.replacementNote ? ` — Replacement: ${p.replacementNote}` : ""}` };
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
  it.canonical = target;
  if (verdicts.duplicateNotes[id]) it.correctedReplacement = verdicts.duplicateNotes[id];
}
for (const it of items) if (it.codex?.status === "duplicate" && !dupIds.includes(it.id)) problems.push(`Codex marked item ${it.id} duplicate; verdicts.json does not link it`);
for (const [id, note] of Object.entries(verdicts.newNotes)) {
  const it = items.find((i) => i.id === id);
  if (!it) problems.push(`newNotes names ${id}, which does not exist`); else it.correctedReplacement = note;
}
for (const id of verdicts.newRulingNeeded) if (!items.some((i) => i.id === id)) problems.push(`newRulingNeeded names ${id}, which does not exist`);

/* ---- parts ---- */
for (const it of items) {
  const split = verdicts.parts[it.id];
  const mk = (key: string, scope: string, waitsOn: string[] = []): Part => ({ key, scope, status: "open", waitsOn, history: [{ at: now(), event: "recorded" }] });
  it.parts = split ? split.map((p) => mk(p.key, p.scope, p.waitsOn ?? [])) : [mk("all", "The whole finding.")];
}
for (const id of Object.keys(verdicts.parts)) if (!items.some((i) => i.id === id)) problems.push(`parts names item ${id}, which does not exist`);
// A chain of "same defect as" ends at one main record.
for (const it of items) {
  let hops = 0;
  while (it.canonical && items.find((i) => i.id === it.canonical)?.canonical && hops++ < 5) it.canonical = items.find((i) => i.id === it.canonical)?.canonical;
  if (it.canonical === it.id) problems.push(`item ${it.id} is linked to itself`);
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

const ledger: Ledger = { version: 1, builtFrom: [SNAPSHOT, ...CODEX, "docs/audit/verdicts.json"], items, rulings: [], batches: [] };
if (!process.argv.includes("--dry")) saveLedger(ledger);
const n = (f: (i: Item) => boolean) => items.filter(f).length;
console.log(`ledger: ${items.length} of ${expected.length} records (267 + 67), each id once`);
console.log(`  dropped ${n((i) => i.verdict === "dropped")}, optional ${n((i) => i.verdict === "optional")}, corrected replacement ${Object.keys(verdicts.corrected).length}, Codex dispute not adopted ${Object.keys(verdicts.disputeRejected).length}`);
console.log(`  second sightings linked to a main record: ${n((i) => !!i.canonical)} (${dupIds.length} of them from Codex)`);
console.log(`  waiting on Adam's ruling: ${n((i) => i.verdict === "open" && i.waitsOn.some((w) => w.startsWith("ruling:")))}`);
