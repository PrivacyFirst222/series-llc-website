/**
 * Renders the Owner's Manual (docs/owners-manual.md) to the client-facing
 * PDF. The markdown master is the single source; this renderer understands
 * the master's own conventions:
 *   - the `<!-- titlepage ... -->` block: cover lines as `size|text[|flags]`,
 *     flags `after=N` (docx twentieths of a point of space after) and
 *     `accent` (brand color);
 *   - `<!-- page-header: ... -->`: the running header on body pages;
 *   - `[[contents]]`: the table of contents, filled with real page numbers;
 *   - #/##/### headings, tables, `- ` bullets, `1.` numbered items,
 *     `> ` display quotes, and `☐ ` checklist lines.
 * Typography follows the operating-agreement PDFs (Times, justified body).
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "@cantoo/pdf-lib";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const BODY = 10.5;
const GAP = 3.2;
const INK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.55, 0.57, 0.6);
const NAVY = rgb(0.09, 0.2, 0.33);
const ACCENT = rgb(0.78, 0.33, 0.16);

interface Seg { text: string; bold: boolean; italic: boolean }
interface Fonts { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }

function sanitize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/✓|✔/g, "*")
    .replace(/☐/g, "[ ]")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF–—•]/g, "?");
}

function parseInline(line: string): Seg[] {
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) return { text: sanitize(p.slice(2, -2)), bold: true, italic: false };
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return { text: sanitize(p.slice(1, -1)), bold: false, italic: true };
    return { text: sanitize(p), bold: false, italic: false };
  });
}

interface CoverLine { size: number; text: string; after: number; accent: boolean }

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; segs: Seg[] }
  | { kind: "quote"; segs: Seg[] }
  | { kind: "item"; segs: Seg[]; marker: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "contents" };

interface ManualDoc { cover: CoverLine[]; header: string; blocks: Block[] }

export function parseManual(md: string): ManualDoc {
  const cover: CoverLine[] = [];
  let header = "";
  // titlepage block
  const tp = md.match(/<!--\s*titlepage\n([\s\S]*?)-->/);
  if (tp) {
    for (const raw of tp[1].split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split("|");
      const size = Number(parts[0]);
      if (!Number.isFinite(size)) continue;
      const text = sanitize(parts[1] ?? "");
      let after = 0;
      let accent = false;
      for (const f of parts.slice(2)) {
        const m = f.match(/^after=(\d+)$/);
        if (m) after = Number(m[1]) / 20; // docx twentieths of a point
        if (f.trim() === "accent") accent = true;
      }
      cover.push({ size, text, after, accent });
    }
  }
  const ph = md.match(/<!--\s*page-header:\s*(.*?)\s*-->/);
  if (ph) header = sanitize(ph[1]);

  const body = md.replace(/<!--[\s\S]*?-->/g, "");
  const blocks: Block[] = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const t = line.trim();
    if (!t || t === "---") { i++; continue; }
    if (t === "[[contents]]") { blocks.push({ kind: "contents" }); i++; continue; }
    if (t.startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { tbl.push(lines[i].trim()); i++; }
      const rows = tbl
        .filter((r) => !/^\|[\s\-|]+\|?$/.test(r))
        .map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      if (rows.length > 0) blocks.push({ kind: "table", rows });
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) { blocks.push({ kind: "heading", level: h[1].length, text: sanitize(h[2].replace(/\*\*/g, "")) }); i++; continue; }
    if (t.startsWith("> ")) { blocks.push({ kind: "quote", segs: parseInline(t.slice(2)) }); i++; continue; }
    const li = t.match(/^([-•]|\d+\.|☐)\s+(.*)$/);
    if (li) {
      const marker = li[1] === "-" || li[1] === "•" ? "•" : li[1] === "☐" ? "[ ]" : li[1];
      blocks.push({ kind: "item", segs: parseInline(li[2]), marker });
      i++;
      continue;
    }
    blocks.push({ kind: "para", segs: parseInline(t) });
    i++;
  }
  return { cover, header, blocks };
}

export async function renderManualPdf(md: string): Promise<{ pdf: Uint8Array; pages: number; edition: string }> {
  const manual = parseManual(md);
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const width = PAGE_W - 2 * MARGIN;
  const fontFor = (s: Seg) => (s.bold && s.italic ? fonts.boldItalic : s.bold ? fonts.bold : s.italic ? fonts.italic : fonts.regular);
  const segW = (s: Seg, size: number) => { try { return fontFor(s).widthOfTextAtSize(s.text, size); } catch { return s.text.length * size * 0.5; } };

  const wrap = (segs: Seg[], w: number, size: number): Seg[][] => {
    const out: Seg[][] = [];
    let cur: Seg[] = [];
    let curW = 0;
    for (const seg of segs) {
      for (const word of seg.text.split(/(?<= )/)) {
        const piece = { ...seg, text: word };
        const pw = segW(piece, size);
        if (curW + pw > w && cur.length > 0) {
          // trim trailing space of the line
          const last = cur[cur.length - 1];
          last.text = last.text.trimEnd();
          out.push(cur);
          cur = [];
          curW = 0;
        }
        const clean = cur.length === 0 ? { ...piece, text: piece.text.trimStart() } : piece;
        if (clean.text) { cur.push(clean); curW += segW(clean, size); }
      }
    }
    if (cur.length > 0) { const last = cur[cur.length - 1]; last.text = last.text.trimEnd(); out.push(cur); }
    return out.length ? out : [[{ text: "", bold: false, italic: false }]];
  };

  const drawLine = (p: PDFPage, segs: Seg[], x: number, yy: number, size: number, justifyTo?: number, color = INK) => {
    let extra = 0;
    if (justifyTo) {
      const natural = segs.reduce((a, s) => a + segW(s, size), 0);
      const gaps = segs.reduce((a, s) => a + (s.text.match(/ /g)?.length ?? 0), 0);
      if (gaps > 0 && justifyTo > natural && justifyTo - natural < width * 0.25) extra = (justifyTo - natural) / gaps;
    }
    let cx = x;
    for (const seg of segs) {
      const font = fontFor(seg);
      if (extra > 0 && seg.text.includes(" ")) {
        const parts = seg.text.split(" ");
        parts.forEach((word, wi) => {
          if (word) { p.drawText(word, { x: cx, y: yy, size, font, color }); cx += segW({ ...seg, text: word }, size); }
          if (wi < parts.length - 1) cx += segW({ ...seg, text: " " }, size) + extra;
        });
      } else {
        p.drawText(seg.text, { x: cx, y: yy, size, font, color });
        cx += segW(seg, size);
      }
    }
  };

  // ---- cover ----
  const coverPage = doc.addPage([PAGE_W, PAGE_H]);
  let cy = PAGE_H - 160;
  for (const line of manual.cover) {
    const seg: Seg = { text: line.text, bold: line.size >= 14, italic: false };
    for (const ln of wrap([seg], width, line.size)) {
      const w = ln.reduce((a, s) => a + segW(s, line.size), 0);
      drawLine(coverPage, ln, MARGIN + (width - w) / 2, cy - line.size, line.size, undefined, line.accent ? NAVY : INK);
      cy -= line.size * 1.25;
    }
    cy -= line.after;
  }
  coverPage.drawLine({
    start: { x: MARGIN + width * 0.25, y: 120 },
    end: { x: MARGIN + width * 0.75, y: 120 },
    color: ACCENT,
    thickness: 1.2,
  });

  // ---- TOC reservation ----
  const tocEntries = manual.blocks
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level <= 2)
    .map((b) => ({ text: b.text, level: b.level, page: 0 }));
  const tocLineH = 15;
  const tocPerPage = Math.floor((PAGE_H - 2 * MARGIN - 50) / tocLineH);
  const tocPageCount = Math.max(1, Math.ceil(tocEntries.length / tocPerPage));
  const tocPages: PDFPage[] = [];
  for (let p = 0; p < tocPageCount; p++) tocPages.push(doc.addPage([PAGE_W, PAGE_H]));

  // ---- body ----
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const pageNo = () => doc.getPageCount() - 1 - tocPageCount; // body page ordinal, 1-based
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const need = (h: number) => { if (y - h < MARGIN + 14) newPage(); };
  let heIdx = 0;

  for (const block of manual.blocks) {
    if (block.kind === "contents") continue; // rendered into the reserved pages
    if (block.kind === "heading") {
      if (block.level === 1) {
        if (y < PAGE_H - MARGIN - 1) newPage();
        const size = 17;
        const lines = wrap([{ text: block.text, bold: true, italic: false }], width, size);
        y -= 26;
        for (const ln of lines) {
          const w = ln.reduce((a, s) => a + segW(s, size), 0);
          drawLine(page, ln, MARGIN + (width - w) / 2, y - size, size, undefined, NAVY);
          y -= size + 6;
        }
        page.drawLine({ start: { x: MARGIN + width * 0.35, y: y - 2 }, end: { x: MARGIN + width * 0.65, y: y - 2 }, color: ACCENT, thickness: 1 });
        y -= 18;
        if (heIdx < tocEntries.length && tocEntries[heIdx].text === block.text) tocEntries[heIdx++].page = pageNo();
        continue;
      }
      const size = block.level === 2 ? 13 : 11.5;
      const lines = wrap([{ text: block.text, bold: true, italic: false }], width, size);
      need(lines.length * (size + GAP) + 2 * (BODY + GAP) + 12);
      y -= block.level === 2 ? 12 : 8;
      for (const ln of lines) {
        drawLine(page, ln, MARGIN, y - size, size, undefined, block.level === 2 ? NAVY : INK);
        y -= size + GAP;
      }
      y -= 4;
      if (block.level === 2 && heIdx < tocEntries.length && tocEntries[heIdx].text === block.text) tocEntries[heIdx++].page = pageNo();
      continue;
    }
    if (block.kind === "para" || block.kind === "quote" || block.kind === "item") {
      const size = BODY;
      const lineH = size + GAP;
      const indent = block.kind === "quote" ? 24 : block.kind === "item" ? 16 : 0;
      const w = width - indent - (block.kind === "quote" ? 10 : 0);
      const lines = wrap(block.segs.map((s) => ({ ...s })), w, size);
      if (lines.length > 2 && y - 2 * lineH < MARGIN + 14) newPage();
      const leadIn = block.segs.map((s) => s.text).join("").trimEnd().endsWith(":");
      if (leadIn) need(lines.length * lineH + 2 * lineH + 6);
      for (let li = 0; li < lines.length; li++) {
        if (li === lines.length - 2 && y - 2 * lineH < MARGIN + 14) newPage();
        need(lineH);
        if (block.kind === "item" && li === 0) {
          page.drawText(block.marker, { x: MARGIN + 2, y: y - size, size: size - (block.marker === "•" ? 0 : 1.5), font: fonts.regular, color: INK });
        }
        if (block.kind === "quote" && li === 0) {
          // a quiet rule marks the display block
          page.drawLine({
            start: { x: MARGIN + 10, y: y - size - (lines.length - 1) * lineH - 2 },
            end: { x: MARGIN + 10, y: y + 2 },
            color: rgb(0.75, 0.77, 0.8),
            thickness: 1.5,
          });
        }
        const isLast = li === lines.length - 1;
        drawLine(page, lines[li], MARGIN + indent, y - size, size, block.kind === "para" && !isLast ? width : undefined);
        y -= lineH;
      }
      y -= block.kind === "item" ? 3 : 6;
      continue;
    }
    if (block.kind === "table") {
      const cols = Math.max(...block.rows.map((r) => r.length));
      const colW = width / cols;
      const size = 9.5;
      const lineH = size + 2.5;
      const pad = 4;
      for (let ri = 0; ri < block.rows.length; ri++) {
        const row = block.rows[ri];
        const cellLines = row.map((cell) =>
          wrap(parseInline(cell).map((s) => (ri === 0 ? { ...s, bold: true } : s)), colW - 2 * pad, size),
        );
        const rowH = Math.max(1, ...cellLines.map((c) => c.length)) * lineH + 2 * pad;
        need(rowH);
        page.drawRectangle({ x: MARGIN, y: y - rowH, width, height: rowH, borderColor: rgb(0.6, 0.62, 0.66), borderWidth: 0.5 });
        for (let ci = 1; ci < cols; ci++) {
          page.drawLine({ start: { x: MARGIN + ci * colW, y }, end: { x: MARGIN + ci * colW, y: y - rowH }, color: rgb(0.6, 0.62, 0.66), thickness: 0.5 });
        }
        for (let ci = 0; ci < row.length; ci++) {
          let cellY = y - pad;
          for (const ln of cellLines[ci]) { drawLine(page, ln, MARGIN + ci * colW + pad, cellY - size, size); cellY -= lineH; }
        }
        y -= rowH;
      }
      y -= 8;
      continue;
    }
  }

  // ---- fill the reserved TOC pages ----
  let tp = 0;
  let ty = PAGE_H - MARGIN - 30;
  tocPages[0].drawText("CONTENTS", { x: MARGIN, y: PAGE_H - MARGIN - 8, size: 14, font: fonts.bold, color: NAVY });
  for (const entry of tocEntries) {
    if (ty < MARGIN + 20 && tp < tocPages.length - 1) { tp++; ty = PAGE_H - MARGIN - 10; }
    const p = tocPages[tp];
    const size = entry.level === 1 ? 10.5 : 9.5;
    const font = entry.level === 1 ? fonts.bold : fonts.regular;
    const x = MARGIN + (entry.level === 1 ? 0 : 14);
    const num = String(entry.page);
    const numW = fonts.regular.widthOfTextAtSize(num, size);
    // Truncate by measured width so a long title never collides with its
    // page number or the dot leader.
    const maxLabelW = PAGE_W - MARGIN - numW - 24 - x;
    let label = entry.text;
    while (label.length > 8 && font.widthOfTextAtSize(label + "...", size) > maxLabelW) {
      label = label.slice(0, -1).trimEnd();
    }
    if (label !== entry.text) label += "...";
    p.drawText(label, { x, y: ty, size, font, color: entry.level === 1 ? NAVY : INK });
    const labelW = font.widthOfTextAtSize(label, size);
    // dot leader
    const dotsStart = x + labelW + 4;
    const dotsEnd = PAGE_W - MARGIN - numW - 6;
    if (dotsEnd > dotsStart + 10) {
      const dot = ". ";
      const dotW = fonts.regular.widthOfTextAtSize(dot, size);
      let dx = dotsStart;
      let dots = "";
      while (dx + dotW < dotsEnd) { dots += dot; dx += dotW; }
      p.drawText(dots, { x: dotsStart, y: ty, size, font: fonts.regular, color: GRAY });
    }
    p.drawText(num, { x: PAGE_W - MARGIN - numW, y: ty, size, font: fonts.regular, color: INK });
    ty -= tocLineH;
  }

  // ---- running header + page numbers (all pages after the cover) ----
  const pages = doc.getPages();
  const bodyStart = 1 + tocPageCount;
  // Body pages carry the numbers the TOC points at; cover and TOC pages
  // are unnumbered so "Page 12" in the footer IS the TOC's "12".
  const bodyTotal = pages.length - bodyStart;
  pages.forEach((p, idx) => {
    if (idx < bodyStart) return;
    const n = idx - tocPageCount;
    const label = `Page ${n} of ${bodyTotal}`;
    const w = fonts.regular.widthOfTextAtSize(label, 7.5);
    p.drawText(label, { x: PAGE_W - MARGIN - w, y: 40, size: 7.5, font: fonts.regular, color: GRAY });
    if (manual.header) {
      const hw = fonts.regular.widthOfTextAtSize(manual.header, 7.5);
      p.drawText(manual.header, { x: (PAGE_W - hw) / 2, y: PAGE_H - 42, size: 7.5, font: fonts.regular, color: GRAY });
    }
  });

  const edition = manual.cover.find((c) => /edition/i.test(c.text))?.text ?? "Current Edition";
  doc.setTitle("The Florida Series LLC Owner's Manual");
  doc.setAuthor("MyFloridaSeriesLLC");
  doc.setProducer("MyFloridaSeriesLLC document engine");
  doc.setCreationDate(new Date());
  const pdf = await doc.save();
  return { pdf, pages: doc.getPageCount(), edition };
}
