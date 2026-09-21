/** B5-MANUAL-TABLE-HEADER-PAGINATION: actual Manual and adversarial PDF tables. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MANUAL_RENDERER_VERSION, parseManual, renderManualPdf } from "../server/manual-pdf";

const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\*/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->").replace(/✓|✔/g, "*").replace(/☐/g, "[ ]").replace(/…/g, "...").replace(/\s+/g, " ").trim();
const compact = (s: string) => s.replace(/\s+/g, " ").trim();
async function extract(pdf: Uint8Array, bbox = false) {
  const p = Bun.spawn(["pdftotext", bbox ? "-bbox" : "-raw", "-", "-"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  p.stdin.write(pdf); p.stdin.end();
  const [text, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(`PDF extraction failed: ${err}`);
  return text;
}

export async function batch25ManualCheck(check: (ok: boolean, label: string, detail?: unknown) => void, output = process.env.BATCH25_MANUAL_EVIDENCE) {
  const emit = (label: string, ok: boolean, detail?: unknown) => check(ok, `batch25 manual ${label}`, detail);
  const save = (name: string, pdf: Uint8Array, text: string) => {
    if (!output) return;
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, name + ".pdf"), pdf);
    writeFileSync(resolve(output, name + ".txt"), text);
  };
  const md = readFileSync(new URL("../../docs/owners-manual.md", import.meta.url), "utf8");
  const actual = await renderManualPdf(md), raw = await extract(actual.pdf);
  save("owners-manual", actual.pdf, raw);
  const pages = raw.split("\f").filter(p => p.trim()).map(compact);
  const tables = parseManual(md).blocks.filter(b => b.kind === "table");
  const missing: unknown[] = [], orphaned: unknown[] = [], withoutHeader: unknown[] = [];
  for (const [ti, table] of tables.entries()) {
    const header = table.rows[0].map(plain).join(" ").trim();
    const locations = table.rows.slice(1).map((r, ri) => {
      const row = r.map(plain).join(" ").trim();
      const hits = pages.flatMap((p, pi) => p.includes(row) ? [pi] : []);
      if (hits.length !== 1 || pages.join(" ").split(row).length - 1 !== 1) missing.push({ table: ti + 1, row: ri + 1, hits, text: row });
      return hits[0];
    });
    const first = locations[0];
    const firstRow = table.rows[1]?.map(plain).join(" ").trim() ?? "";
    if (first === undefined || !pages[first].includes(header) || pages[first].indexOf(header) > pages[first].indexOf(firstRow)) orphaned.push(ti + 1);
    for (const pi of new Set(locations.filter((p): p is number => p !== undefined))) if (!pages[pi].includes(header)) withoutHeader.push({ table: ti + 1, page: pi + 1 });
  }
  emit("actual 9 tables and 53 source rows retained once", tables.length === 9 && tables.reduce((n, t) => n + t.rows.length - 1, 0) === 53 && missing.length === 0, missing);
  emit("actual first data rows have headings on same page", orphaned.length === 0, orphaned);
  emit("actual continued tables repeat headings", withoutHeader.length === 0, withoutHeader);
  const narrative = parseManual(md).blocks.flatMap(b => b.kind === "heading" ? [b.text] : b.kind === "para" || b.kind === "quote" || b.kind === "item" ? [b.segs.map(s => s.text).join("")] : []);
  const body = compact(raw.split("\f").slice(2).join(" ").replace(/Page \d+ of \d+/g, "").replaceAll("THE FLORIDA SERIES LLC OWNER'S MANUAL", ""));
  let cursor = 0;
  const absent = narrative.filter(text => { const found = body.indexOf(compact(text), cursor); if (found < 0) return true; cursor = found + compact(text).length; return false; });
  emit("all narrative blocks retained in source order", absent.length === 0, { blocks: narrative.length, absent });
  emit("table-only pages contribute to pagination accounting", actual.bodyPageLines.every(n => n >= 4), actual.bodyPageLines);
  emit("layout revision invalidates cached manual", MANUAL_RENDERER_VERSION >= 3, MANUAL_RENDERER_VERSION);

  const rows = Array.from({ length: 90 }, (_, i) => `| ROW${String(i).padStart(3, "0")} | VALUE${String(i).padStart(3, "0")} |`);
  const stress = await renderManualPdf("# Table continuation\n| IDENTIFIER | VALUE |\n|---|---|\n" + rows.join("\n"));
  const stressRaw = await extract(stress.pdf), stressPages = stressRaw.split("\f").filter(p => p.includes("ROW"));
  save("table-continuation", stress.pdf, stressRaw);
  emit("90-row table repeats headings on every page", stressPages.length > 2 && stressPages.every(p => compact(p).includes("IDENTIFIER VALUE")), { pages: stressPages.length });
  emit("90-row table preserves all rows once in order", JSON.stringify(stressRaw.match(/ROW\d{3}/g)) === JSON.stringify(rows.map((_, i) => `ROW${String(i).padStart(3, "0")}`)) && rows.every((_, i) => stressRaw.split(`VALUE${String(i).padStart(3, "0")}`).length - 1 === 1));

  const tokens = Array.from({ length: 850 }, (_, i) => `CELL${String(i).padStart(4, "0")}`);
  const tall = await renderManualPdf("# Tall row\n| KEY | DESCRIPTION |\n|---|---|\n| LONGROW | " + tokens.join(" ") + " |\n| ENDROW | ENDVALUE |\n");
  const tallRaw = await extract(tall.pdf), tallPages = tallRaw.split("\f").filter(p => p.includes("CELL"));
  save("overheight-row", tall.pdf, tallRaw);
  emit("overheight first row does not strand chapter heading", tallRaw.split("\f").some(p => p.includes("Tall row") && p.includes("CELL0000")));
  emit("overheight row preserves all cell words once in order", JSON.stringify(tallRaw.match(/CELL\d{4}/g)) === JSON.stringify(tokens) && tallRaw.split("LONGROW").length === 2 && tallRaw.split("ENDROW").length === 2);
  emit("overheight row continues with headers", tallPages.length > 2 && tallPages.every(p => compact(p).includes("KEY DESCRIPTION")), { pages: tallPages.length });
  const boxes = await extract(tall.pdf, true);
  const coordinates = [...boxes.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">(CELL\d{4}|LONGROW|ENDROW|ENDVALUE)<\/word>/g)];
  const clipped = coordinates.filter(m => Number(m[1]) < 72 || Number(m[3]) > 540 || Number(m[2]) < 72 || Number(m[4]) > 706);
  emit("overheight row stays inside body bounds", coordinates.length === tokens.length + 3 && clipped.length === 0, { count: coordinates.length, clipped: clipped.map(m => m[0]) });
  let rejected = false;
  try { await renderManualPdf("| " + tokens.join(" ") + " | TITLE |\n|---|---|\n| A | B |\n"); } catch (e) { rejected = String(e).includes("table header is too tall"); }
  emit("impossible table header fails clearly", rejected);
  const headerOnly = await renderManualPdf("| HEADERONLY | OTHER |\n|---|---|\n");
  const headerRaw = await extract(headerOnly.pdf);
  save("header-only", headerOnly.pdf, headerRaw);
  emit("header-only table remains supported", headerRaw.split("HEADERONLY").length === 2 && headerOnly.pages === 3);
}

if (import.meta.main) {
  let total = 0, failed = 0;
  await batch25ManualCheck((ok, label, detail) => { total++; if (!ok) failed++; console.log(JSON.stringify({ ok, label, detail: ok ? undefined : detail })); });
  console.log(`${total - failed}/${total} Batch25 Manual checks passed`);
  process.exit(failed ? 1 : 0);
}
