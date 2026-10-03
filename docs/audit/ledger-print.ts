/**
 * Prints what people read, from the ledger — nobody edits these by hand.
 *
 *   bun run docs/audit/ledger-print.ts list          → writes docs/audit/findings-open.md
 *   bun run docs/audit/ledger-print.ts order <batch> → the work order for whoever does the batch
 *   bun run docs/audit/ledger-print.ts rulings       → what waits on Adam, most-blocking first
 */
import { writeFileSync } from "node:fs";
import ts from "../../webapp/node_modules/typescript";
import { join } from "node:path";
import { combinedPartPublished, ROOT, loadLedger, loadBatch, unmetWaits, type Ledger, type Item, type Assertion } from "./ledger-lib";

const AREAS = ["Public pages, Terms and Privacy", "Order form and payment", "Client portal", "Office", "Emails and jobs", "Agreements and guidance"];

const statusOf = (it: Item): string => {
  if (it.verdict === "dropped") return "dropped";
  const s = it.parts.map((p) => p.status);
  const one = s.every((x) => x === s[0]) ? s[0] : it.parts.map((p) => `${p.key}: ${p.status}`).join("; ");
  return it.verdict === "optional" ? `optional — ${one}` : one;
};

export const LIST_RENDER_VERSION = 2;
/** Archived commits retain the renderer version recorded in their source. */
export function listRenderVersion(source: string | null): 1 | 2 {
  const file=ts.createSourceFile('ledger-print.ts',source??'',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const declarations: ts.VariableDeclaration[]=[];
  let mentions=0;
  const visit=(node:ts.Node)=>{
    if(ts.isIdentifier(node)&&node.text==='LIST_RENDER_VERSION')mentions++;
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='LIST_RENDER_VERSION')declarations.push(node);
    ts.forEachChild(node,visit);
  };
  visit(file);
  if(!mentions)return 1;
  const declaration=declarations[0], list=declaration?.parent, statement=list?.parent;
  if(declarations.length!==1 || !list || !ts.isVariableDeclarationList(list) || !(list.flags&ts.NodeFlags.Const)
    || !statement || !ts.isVariableStatement(statement) || statement.parent!==file
    || !statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
    || !declaration.initializer || !ts.isNumericLiteral(declaration.initializer)
    || !['1','2'].includes(declaration.initializer.text))throw Error('Malformed or unsupported LIST_RENDER_VERSION declaration');
  return Number(declaration.initializer.text) as 1|2;
}

export function renderList(l: Ledger, version: 1 | 2 = LIST_RENDER_VERSION): string {
  const out: string[] = [];
  const tracked = l.dispositions !== undefined || l.implementations !== undefined || l.combinedReleases !== undefined || l.auditAdjudications !== undefined;
  const live = l.items.filter((i) => i.verdict !== "dropped");
  const done = (i: Item) => i.parts.every((p) => p.status === "released" || combinedPartPublished(l,i.id,p));
  out.push("# Every audit item and what has been done about it");
  out.push("");
  out.push("GENERATED from docs/audit/ledger.json by `bun run docs/audit/ledger-print.ts list`. Do not edit: the commit step refuses a copy that differs from the ledger. The auditors' original files are unchanged under docs/audit/sources/ and docs/audit/runs/.");
  out.push("");
  const sightings = live.flatMap((i) => i.parts.filter((p) => p.canonical));
  const imported = l.items.filter(i => i.id.startsWith("AUD-")).length;
  out.push(`${l.items.length} records: 267 from the 16 Sep working list and 67 from Codex's audit (N1.01–N4.11)${imported ? `, plus ${imported} from later checked audit intakes` : ""}. ${l.items.filter((i) => i.verdict === "dropped").length} dropped after Codex's review, ${l.items.filter((i) => i.verdict === "optional").length} optional wording, ${sightings.length} second sightings of another item's part. ${tracked ? "Published (individual or combined receipt)" : "Released"}: ${live.filter(done).length} of ${live.length}.`);
  out.push("");
  if (tracked) out.push("Combined publication is shown separately from individual lifecycle states. A combined receipt does not invent separate historical acceptances.");
  out.push("A status reads: open → assigned (to a batch) → implemented → accepted (by Adam, by exact commit) → released.");
  if (l.batches.some(b => b.id === "audit-mechanism") || imported) out.push("For the next whole-product audit, use docs/audit/AUDIT-WORKFLOW.md and audit-session.ts. The historical coverage-check.ts alone does not establish complete prior-item reconciliation. Audit completion does not approve repairs or publication.");
  for (const area of AREAS) {
    const inArea = l.items.filter((i) => i.area === area);
    if (inArea.length === 0) continue;
    out.push("", `## ${area} — ${inArea.filter((i) => i.verdict !== "dropped" && !done(i)).length} open of ${inArea.length}`, "");
    for (const it of inArea) {
      const link = (p: { key: string; canonical?: { item: string; part: string } }) => (p.canonical ? `same defect as ${p.canonical.item}${p.canonical.part === "all" ? "" : ` (${p.canonical.part})`}` : "");
      const flags = [
        it.housekeeping ? "housekeeping" : "",
        it.parts.length === 1 ? link(it.parts[0]) : "",
        it.related?.length ? `related: ${it.related.join(", ")}` : "",
        ...it.waitsOn.filter(w => version === 1 || !tracked || it.parts.some(p => unmetWaits(l, it, p).includes(w))).map((w) => (w.startsWith("ruling:") ? (w.slice(7) === it.id ? "waits on Adam's ruling" : `waits on Adam's ruling on item ${w.slice(7)}`) : `waits on ${w}`)),
      ].filter(Boolean).join("; ");
      out.push(`- **${it.id}. [${it.tag}]** — **${statusOf(it)}**${flags ? ` — ${flags}` : ""}`);
      for (const line of it.text.split("\n")) out.push(version === 2 && !line ? "" : `  - ${line}`);
      if (it.codex && it.codex.status !== "confirmed") out.push(`  - Codex (${it.codex.status}): ${it.codex.evidence}`);
      if (it.codex?.replacementOk === false) out.push(`  - **Codex rejected the proposed replacement:** ${it.codex.replacementNote || "(no note given)"}`);
      if (it.verdictReason) out.push(`  - Outcome: ${it.verdictReason}`);
      if (it.correctedReplacement) out.push(`  - Corrected after Codex's review: ${it.correctedReplacement}`);
      for (const r of l.rulings.filter((x) => (x.kind ?? "ruling") === "ruling" && x.item === it.id)) out.push(`  - Ruling, ${r.date}${r.part ? ` (${r.part})` : ""}: ${r.text}`);
      for (const p of it.parts) {
        const displayedWaits = p.waitsOn.filter(w => version === 1 || !tracked || unmetWaits(l, it, p).includes(w));
        if (it.parts.length > 1) out.push(`  - Part "${p.key}" — ${p.status}: ${p.scope}${displayedWaits.length ? ` (waits on ${displayedWaits.join(", ")})` : ""}${link(p) ? ` — ${link(p)}` : ""}`);
        for (const s of p.supersessions ?? []) out.push(`  - Previous fix${it.parts.length > 1 ? ` (${p.key})` : ""}: ${s.prior.batch} r${s.prior.revision}, ${tracked ? `release commit ${s.prior.commit || "not recorded"}` : `commit ${s.prior.commit}`}; ${s.prior.assertions.length} assertion(s) retained. Replacement attempt: ${s.batch} r${s.revision}, work order ${s.hash}.`);
        if (p.fix && !tracked) out.push(`  - Fixed${it.parts.length > 1 ? ` (${p.key})` : ""}: batch ${p.fix.batch} revision ${p.fix.revision}, commit ${p.fix.commit.slice(0, 7)}, by ${p.fix.doneBy}; protected by ${p.fix.assertions.length} assertion(s).`);
        if (p.fix && tracked) out.push(`  - Implemented protections${it.parts.length > 1 ? ` (${p.key})` : ""}: batch ${p.fix.batch} revision ${p.fix.revision}, release commit ${p.fix.commit ? p.fix.commit.slice(0, 7) : "not recorded"}, by ${p.fix.doneBy}; protected by ${p.fix.assertions.length} assertion(s).`);
        const retained = l.dispositions?.find(d => d.item === it.id && d.part === p.key);
        if (retained) out.push(`  - **Owner retained the wording${it.parts.length > 1 ? ` (${p.key})` : ""}.** Technical lifecycle: ${p.status}; protections do not mean the proposed wording change was made. Ruling: ${retained.ruling.text}`);
        for (const receipt of (l.implementations ?? []).filter(r => r.batch === p.fix?.batch && r.revision === p.fix?.revision)) out.push(`  - Implementation evidence: commit ${receipt.commit}, batch ${receipt.batch} revision ${receipt.revision}, package ${receipt.packageId}. This records implementation, not acceptance or publication.`);
        if (tracked && p.fix && !(l.implementations ?? []).some(r => r.batch === p.fix?.batch && r.revision === p.fix?.revision)) out.push("  - Implementation receipt: not yet recorded; no commit identity is implied.");
        for (const receipt of l.combinedReleases ?? []) for (const batch of receipt.manifest.batches) for (const ref of batch.parts.filter(x => x.item === it.id && x.part === p.key)) out.push(`  - Included in combined publication ${receipt.commit.slice(0, 7)}, package ${receipt.packageId}: batch ${batch.batch} revision ${batch.revision}, ${ref.state}. This is the combined release, not a separate earlier acceptance.`);
        for (const h of p.history.filter((x) => /^(rejected|reopened|superseded)/.test(x.event))) out.push(`  - ${h.at.slice(0, 10)} ${h.event}${h.note ? `: ${h.note}` : ""}`);
      }
      for (const p of it.retiredParts ?? []) out.push(`  - Former part "${p.key}" (retired by ${p.retiredBy}, now ${p.migratedTo.join(", ")}): ${p.scope}`);
    }
  }
  if (l.auditAdjudications?.length) {
    out.push("", "## Cross-review adjudications — informational, not repair tasks", "");
    for (const a of l.auditAdjudications) out.push(`- **${a.sourceId} — ${a.verdict}.** ${a.reason} Proposed replacement: ${a.replacementVerdict}. Source: ${a.source}. No code removal is approved; this is the cross-review's conclusion, not a new owner ruling.`);
  }
  return out.join("\n") + "\n";
}

const describe = (a: Assertion): string =>
  a.kind === "replace" ? `in ${a.file}: "${a.before}" → "${a.after}"`
    : a.kind === "absent" ? `nowhere in the product: "${a.text}"`
    : a.kind === "present" ? `in ${a.file}: "${a.text}"`
    : a.kind === "page" ? `on the page ${a.path}: shows ${JSON.stringify(a.present ?? [])}, never ${JSON.stringify(a.absent ?? [])}`
    : a.kind === "document" ? `in ${a.master} and ${a.word}`
    : `the ${a.suite} check "${a.label}" runs and passes`;

export function renderOrder(l: Ledger, batchId: string): string {
  const b = loadBatch(batchId);
  const out: string[] = [`# Work order — batch ${b.id}, revision ${b.revision}: ${b.title}`, ""];
  out.push(`Model: ${b.model}. Cut from ${b.base.slice(0, 7)} on main. Work on the local branch audit/batch-${b.id}; do not push it.`);
  out.push("STOP AT THIS SCOPE. A file not listed below cannot be committed. In a \"replace\" file the commit step rebuilds the file from the replacements below and refuses any other difference. A change to a check, hook or publishing control must be declared here first.", "");
  const files = new Set(b.files.map((f) => f.path));
  for (const bi of b.items) {
    const it = l.items.find((i) => i.id === bi.id);
    out.push(`## Item ${bi.id}${bi.part !== "all" ? ` — part "${bi.part}"` : ""}`, "", `Scope: ${bi.scope}`, "", "The finding:", ...(it?.text.split("\n").map((x) => `> ${x}`) ?? []), "");
    if (it?.codex?.replacementOk === false) out.push(`**Codex rejected the proposed replacement above. Do not apply it as written.** Codex's correction: ${it.codex.replacementNote || "(no note given)"}`, "");
    if (it?.correctedReplacement) out.push(`Corrected after Codex's review: ${it.correctedReplacement}`, "");
    const part = it?.parts.find((p) => p.key === bi.part);
    if (part?.canonical) out.push(`This is a second sighting of item ${part.canonical.item}${part.canonical.part === "all" ? "" : ` (part "${part.canonical.part}")`}: the same defect in another place. Every place is fixed in the same batch.`, "");
    if (it?.related?.length) out.push(`Related findings, not the same defect: ${it.related.join(", ")}.`, "");
    if (bi.replaces) out.push(`This replaces batch ${bi.replaces.batch} revision ${bi.replaces.revision}, commit ${bi.replaces.commit}. Its prior assertions:`, ...bi.replaces.assertions.map(a => `- ${describe(a)}`), "", `Adam must approve this exact replacement work order before authorization. Its history stays intact. Publication still needs acceptance of the complete new package.`, "");
    out.push("What must be true afterwards:", ...bi.assertions.map((a) => `- ${describe(a)}`), "");
    if (bi.assertions.some((a) => a.kind === "check")) out.push("This is a behaviour fix: its check is run on the tree BEFORE the fix and must FAIL for the reported reason, then after and must pass. Both runs are captured by the review command.", "");
  }
  out.push("## Files this batch may touch", "", ...b.files.map((f) => `- ${f.path} (${f.mode}${f.control ? ", control" : ""}) — ${f.why}`), "");
  const earlier = l.items.flatMap((it) => it.parts.filter((p) => p.fix && p.fix.batch !== b.id).flatMap((p) => (p.fix?.assertions ?? []).filter((a) => "file" in a && files.has((a as { file: string }).file)).map((a) => `- item ${it.id} (batch ${p.fix?.batch}): ${describe(a)}`)));
  out.push("## Earlier fixes in these files — DO NOT DISTURB", "", ...(earlier.length ? earlier : ["- none yet"]), "");
  out.push(`Required checks before review: ${b.requiredChecks.join(", ")}. A check that is skipped or missing counts as failed.`);
  return out.join("\n") + "\n";
}

/** What waits on Adam: every unmet wait on a ruling, over every part of every
 *  live item that is not released — its own waits and the ones it inherits
 *  through its main record — each (item, part) counted once. */
export function renderRulings(l: Ledger): string {
  const waits = new Map<string, Set<string>>();
  for (const it of l.items) {
    if (it.verdict === "dropped") continue;
    for (const p of it.parts) {
      if (p.status === "released") continue;
      for (const w of unmetWaits(l, it, p)) {
        if (!w.startsWith("ruling:")) continue;
        const id = w.slice(7);
        waits.set(id, (waits.get(id) ?? new Set()).add(`${it.id}${it.parts.length > 1 ? ` (${p.key})` : ""}`));
      }
    }
  }
  const rows = [...waits.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], undefined, { numeric: true }));
  const unfinished = l.items.filter((i) => i.verdict !== "dropped").flatMap((i) => i.parts.filter((p) => p.status !== "released")).length;
  return [
    `# Waiting on Adam's ruling — ${rows.length}`,
    "",
    `Every part of every live item that is not released was checked — ${unfinished} parts — for a wait on a ruling, its own or inherited through its main record. Nothing unfinished is outside this queue.`,
    "",
    ...rows.map(([id, blocked]) => `- ${id} — unblocks ${[...blocked].join(", ")}: ${(l.items.find((i) => i.id === id)?.text ?? "").split("\n")[0].slice(0, 200)}`),
  ].join("\n") + "\n";
}

if (import.meta.main) {
  const l = loadLedger();
  const cmd = process.argv[2];
  if (cmd === "list") { writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(l)); console.log("wrote docs/audit/findings-open.md"); }
  else if (cmd === "order") console.log(renderOrder(l, process.argv[3]));
  else if (cmd === "rulings") console.log(renderRulings(l));
  else { console.error("usage: ledger-print.ts list | order <batch> | rulings"); process.exit(1); }
}
