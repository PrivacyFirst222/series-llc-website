/**
 * Prints what people read, from the ledger — nobody edits these by hand.
 *
 *   bun run docs/audit/ledger-print.ts list          → writes docs/audit/findings-open.md
 *   bun run docs/audit/ledger-print.ts order <batch> → the work order for whoever does the batch
 *   bun run docs/audit/ledger-print.ts rulings       → what waits on Adam, most-blocking first
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadLedger, loadBatch, type Ledger, type Item, type Assertion } from "./ledger-lib";

const AREAS = ["Public pages, Terms and Privacy", "Order form and payment", "Client portal", "Office", "Emails and jobs", "Agreements and guidance"];

const statusOf = (it: Item): string => {
  if (it.verdict === "dropped") return "dropped";
  const s = it.parts.map((p) => p.status);
  const one = s.every((x) => x === s[0]) ? s[0] : it.parts.map((p) => `${p.key}: ${p.status}`).join("; ");
  return it.verdict === "optional" ? `optional — ${one}` : one;
};

export function renderList(l: Ledger): string {
  const out: string[] = [];
  const live = l.items.filter((i) => i.verdict !== "dropped");
  const done = (i: Item) => i.parts.every((p) => p.status === "released");
  out.push("# Every audit item and what has been done about it");
  out.push("");
  out.push("GENERATED from docs/audit/ledger.json by `bun run docs/audit/ledger-print.ts list`. Do not edit: the commit step refuses a copy that differs from the ledger. The auditors' original files are unchanged under docs/audit/sources/ and docs/audit/runs/.");
  out.push("");
  out.push(`${l.items.length} records: 267 from the 16 Sep working list and 67 from Codex's audit (N1.01–N4.11). ${l.items.filter((i) => i.verdict === "dropped").length} dropped after Codex's review, ${l.items.filter((i) => i.verdict === "optional").length} optional wording, ${live.filter((i) => i.canonical).length} second sightings of another item. Released: ${live.filter(done).length} of ${live.length}.`);
  out.push("");
  out.push("A status reads: open → assigned (to a batch) → implemented → accepted (by Adam, by exact commit) → released.");
  for (const area of AREAS) {
    const inArea = l.items.filter((i) => i.area === area);
    if (inArea.length === 0) continue;
    out.push("", `## ${area} — ${inArea.filter((i) => i.verdict !== "dropped" && !done(i)).length} open of ${inArea.length}`, "");
    for (const it of inArea) {
      const flags = [
        it.housekeeping ? "housekeeping" : "",
        it.canonical ? `same defect as ${it.canonical}` : "",
        ...it.waitsOn.map((w) => (w.startsWith("ruling:") ? (w.slice(7) === it.id ? "waits on Adam's ruling" : `waits on Adam's ruling on item ${w.slice(7)}`) : `waits on ${w}`)),
      ].filter(Boolean).join("; ");
      out.push(`- **${it.id}. [${it.tag}]** — **${statusOf(it)}**${flags ? ` — ${flags}` : ""}`);
      for (const line of it.text.split("\n")) out.push(`  - ${line}`);
      if (it.codex && it.codex.status !== "confirmed") out.push(`  - Codex (${it.codex.status}): ${it.codex.evidence}`);
      if (it.codex?.replacementOk === false) out.push(`  - **Codex rejected the proposed replacement:** ${it.codex.replacementNote || "(no note given)"}`);
      if (it.verdictReason) out.push(`  - Outcome: ${it.verdictReason}`);
      if (it.correctedReplacement) out.push(`  - Corrected after Codex's review: ${it.correctedReplacement}`);
      for (const r of l.rulings.filter((x) => x.item === it.id)) out.push(`  - Ruling, ${r.date}${r.part ? ` (${r.part})` : ""}: ${r.text}`);
      for (const p of it.parts) {
        if (it.parts.length > 1) out.push(`  - Part "${p.key}" — ${p.status}: ${p.scope}${p.waitsOn.length ? ` (waits on ${p.waitsOn.join(", ")})` : ""}`);
        if (p.fix) out.push(`  - Fixed${it.parts.length > 1 ? ` (${p.key})` : ""}: batch ${p.fix.batch} revision ${p.fix.revision}, commit ${p.fix.commit.slice(0, 7)}, by ${p.fix.doneBy}; protected by ${p.fix.assertions.length} assertion(s).`);
        for (const h of p.history.filter((x) => /^(rejected|reopened|superseded)/.test(x.event))) out.push(`  - ${h.at.slice(0, 10)} ${h.event}${h.note ? `: ${h.note}` : ""}`);
      }
    }
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
    if (it?.canonical) out.push(`This is a second sighting of item ${it.canonical}: the same defect in another place. Every place is fixed in the same batch.`, "");
    out.push("What must be true afterwards:", ...bi.assertions.map((a) => `- ${describe(a)}`), "");
    if (bi.assertions.some((a) => a.kind === "check")) out.push("This is a behaviour fix: its check is run on the tree BEFORE the fix and must FAIL for the reported reason, then after and must pass. Both runs are captured by the review command.", "");
  }
  out.push("## Files this batch may touch", "", ...b.files.map((f) => `- ${f.path} (${f.mode}${f.control ? ", control" : ""}) — ${f.why}`), "");
  const earlier = l.items.flatMap((it) => it.parts.filter((p) => p.fix && p.fix.batch !== b.id).flatMap((p) => (p.fix?.assertions ?? []).filter((a) => "file" in a && files.has((a as { file: string }).file)).map((a) => `- item ${it.id} (batch ${p.fix?.batch}): ${describe(a)}`)));
  out.push("## Earlier fixes in these files — DO NOT DISTURB", "", ...(earlier.length ? earlier : ["- none yet"]), "");
  out.push(`Required checks before review: ${b.requiredChecks.join(", ")}. A check that is skipped or missing counts as failed.`);
  return out.join("\n") + "\n";
}

export function renderRulings(l: Ledger): string {
  const waits = new Map<string, string[]>();
  for (const it of l.items) if (it.verdict !== "dropped") for (const w of [...it.waitsOn, ...it.parts.flatMap((p) => p.waitsOn)]) {
    if (!w.startsWith("ruling:") || l.rulings.some((r) => r.item === w.slice(7))) continue;
    waits.set(w.slice(7), [...(waits.get(w.slice(7)) ?? []), it.id]);
  }
  const rows = [...waits.entries()].sort((a, b) => b[1].length - a[1].length);
  return [`# Waiting on Adam's ruling — ${rows.length}`, "", ...rows.map(([id, blocked]) => `- ${id} — unblocks ${[...new Set(blocked)].join(", ")}: ${(l.items.find((i) => i.id === id)?.text ?? "").split("\n")[0].slice(0, 200)}`)].join("\n") + "\n";
}

if (import.meta.main) {
  const l = loadLedger();
  const cmd = process.argv[2];
  if (cmd === "list") { writeFileSync(join(ROOT, "docs/audit/findings-open.md"), renderList(l)); console.log("wrote docs/audit/findings-open.md"); }
  else if (cmd === "order") console.log(renderOrder(l, process.argv[3]));
  else if (cmd === "rulings") console.log(renderRulings(l));
  else { console.error("usage: ledger-print.ts list | order <batch> | rulings"); process.exit(1); }
}
