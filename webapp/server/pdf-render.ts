/**
 * Renders the markdown subset used by the OA templates (headings, **bold**,
 * *italic*, tables, paragraphs) into a paginated, watermarked PDF, and stamps
 * existing PDFs (the manual library) with the same watermark. Pure JS —
 * @cantoo/pdf-lib is an API-compatible pdf-lib fork that adds encryption, so
 * the output can allow printing while restricting copy/edit.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "@cantoo/pdf-lib";

const PAGE_W = 612; // Letter
const PAGE_H = 792;
const MARGIN = 72;
const BODY_SIZE = 11;
const LINE_GAP = 3.2;
const FOOTER_Y = 40;

export interface WatermarkInfo {
  name: string;
  email: string;
  note?: string;
  /** "August 9, 2026 at 4:12 PM ET" — printed on every page, so a paper copy
   *  identifies which generation it is without the portal. */
  generatedAt?: string;
}

interface Seg {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** WinAnsi-safe text: swap characters the standard fonts cannot encode. */
function sanitize(s: string): string {
  return s
    .replace(/—/g, "—") // em dash is WinAnsi-safe; keep
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/✓|✔/g, "*")
    .replace(/☐/g, "[ ]")
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

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; segs: Seg[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "pagebreak" };

export function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim() || line.trim() === "---") {
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tbl.push(lines[i].trim());
        i++;
      }
      const rows = tbl
        .filter((t) => !/^\|[\s\-|]+\|?$/.test(t))
        .map((t) => t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      if (rows.length > 0) blocks.push({ kind: "table", rows });
      continue;
    }
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) {
      blocks.push({ kind: "heading", level: m[1].length, text: sanitize(m[2].replace(/\*\*/g, "")) });
      i++;
      continue;
    }
    blocks.push({ kind: "para", segs: parseInline(line.trim()) });
    i++;
  }
  return blocks;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function fontFor(f: Fonts, seg: Seg): PDFFont {
  if (seg.bold && seg.italic) return f.boldItalic;
  if (seg.bold) return f.bold;
  if (seg.italic) return f.italic;
  return f.regular;
}

/** Wrap inline segments into lines that fit `width` at `size`. */
function wrapSegs(f: Fonts, segs: Seg[], width: number, size: number): Seg[][] {
  const lines: Seg[][] = [];
  let cur: Seg[] = [];
  let curW = 0;
  for (const seg of segs) {
    const words = seg.text.split(/(\s+)/).filter((w) => w.length > 0);
    for (const word of words) {
      const font = fontFor(f, seg);
      let w: number;
      try {
        w = font.widthOfTextAtSize(word, size);
      } catch {
        w = word.length * size * 0.5;
      }
      if (curW + w > width && cur.length > 0 && word.trim() !== "") {
        lines.push(cur);
        cur = [];
        curW = 0;
        if (word.trim() === "") continue;
      }
      const last = cur[cur.length - 1];
      if (last && last.bold === seg.bold && last.italic === seg.italic) {
        last.text += word;
      } else {
        cur.push({ text: word, bold: seg.bold, italic: seg.italic });
      }
      curW += w;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines.map((ln) => {
    if (ln.length > 0) ln[0].text = ln[0].text.replace(/^\s+/, "");
    return ln;
  });
}

export async function renderMarkdownPdf(opts: {
  markdown: string;
  /** null renders a plain document — page numbers only, no license footer, no encryption
   *  (used for filing packages the client mails out, not licensed deliverables). */
  watermark: WatermarkInfo | null;
  title: string;
  /** Business letters set flush left throughout — no centered title block. */
  centerTitleBlock?: boolean;
}): Promise<Uint8Array> {
  const blocks = parseMarkdown(opts.markdown);
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const width = PAGE_W - 2 * MARGIN;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const need = (h: number) => {
    if (y - h < MARGIN) newPage();
  };

  const segWidth = (seg: Seg, size: number): number => {
    try {
      return fontFor(fonts, seg).widthOfTextAtSize(seg.text, size);
    } catch {
      return seg.text.length * size * 0.5;
    }
  };

  /** `justifyTo` stretches inter-word gaps to that width (full justification).
   *  Omitted, the line is drawn at its natural width. */
  const drawSegLine = (p: PDFPage, segs: Seg[], x: number, yy: number, size: number, justifyTo?: number) => {
    let extraPerGap = 0;
    if (justifyTo) {
      const natural = segs.reduce((acc, s) => acc + segWidth(s, size), 0);
      // Count the gaps we can stretch: spaces between words, across segments.
      const gaps = segs.reduce((acc, s) => acc + (s.text.match(/ /g)?.length ?? 0), 0);
      // Never stretch absurdly — a short last-ish line looks worse justified.
      if (gaps > 0 && justifyTo > natural && justifyTo - natural < width * 0.25) {
        extraPerGap = (justifyTo - natural) / gaps;
      }
    }
    let cx = x;
    for (const seg of segs) {
      const font = fontFor(fonts, seg);
      if (extraPerGap > 0 && seg.text.includes(" ")) {
        // Draw word by word so the added space lands in the gaps.
        const parts = seg.text.split(" ");
        parts.forEach((word, i) => {
          if (word) {
            p.drawText(word, { x: cx, y: yy, size, font, color: rgb(0.1, 0.12, 0.16) });
            cx += segWidth({ ...seg, text: word }, size);
          }
          if (i < parts.length - 1) cx += segWidth({ ...seg, text: " " }, size) + extraPerGap;
        });
      } else {
        p.drawText(seg.text, { x: cx, y: yy, size, font, color: rgb(0.1, 0.12, 0.16) });
        cx += segWidth(seg, size);
      }
    }
  };

  // Center the title block (everything before the first ARTICLE/RECITALS heading).
  let inTitle = opts.centerTitleBlock !== false;

  for (const block of blocks) {
    if (block.kind === "heading") {
      const isPart = /^(ARTICLE|RECITALS|SIGNATURES|EXHIBIT|SERIES EXHIBIT|ASSET SCHEDULE)/.test(block.text.trim());
      if (isPart) inTitle = false;
      const size = block.level === 1 ? 16 : block.level === 2 ? 13 : 12;
      const lineH = size + LINE_GAP;
      const lines = wrapSegs(fonts, [{ text: block.text, bold: true, italic: false }], width, size);
      // keep heading with at least two body lines
      need(lines.length * lineH + 2 * (BODY_SIZE + LINE_GAP) + 10);
      y -= 8;
      for (const ln of lines) {
        const textW = ln.reduce((acc, s) => acc + fonts.bold.widthOfTextAtSize(s.text, size), 0);
        const x = inTitle ? MARGIN + (width - textW) / 2 : MARGIN;
        drawSegLine(page, ln, x, y - size, size);
        y -= lineH;
      }
      y -= 4;
      continue;
    }
    if (block.kind === "para") {
      // Sentinel: a paragraph of exactly "[[left]]" ends the centered title
      // block (used by business letters, where no ARTICLE-style heading ever
      // appears). It renders nothing.
      if (block.segs.length === 1 && block.segs[0].text.trim() === "[[left]]") {
        inTitle = false;
        continue;
      }
      // Sentinel: force the next content onto a fresh page. Exhibits and
      // asset schedules get detached and handed to banks, so they start clean.
      if (block.segs.length === 1 && block.segs[0].text.trim() === "[[pagebreak]]") {
        newPage();
        continue;
      }
      const centered = inTitle;
      const size = BODY_SIZE;
      const lineH = size + LINE_GAP;
      const lines = wrapSegs(fonts, block.segs.map((s) => ({ ...s })), width, size);
      // Orphan control: never leave a single line of a multi-line paragraph
      // stranded at the foot of a page.
      if (lines.length > 2 && y - 2 * lineH < MARGIN) newPage();
      // Lead-in control: a paragraph ending in a colon introduces the list or
      // block that follows. The orphan rule above never catches it, because a
      // lead-in is usually one or two lines — so "each Protected Series:" could
      // sit alone at the foot with its list overleaf. Keep it with two lines of
      // whatever it introduces, as headings are kept.
      const leadIn = block.segs
        .map((s) => s.text)
        .join("")
        .trimEnd()
        .endsWith(":");
      if (leadIn) need(lines.length * lineH + 2 * lineH + 6);
      for (let li = 0; li < lines.length; li++) {
        const ln = lines[li];
        // Widow control: if breaking here would strand the final line alone on
        // the next page, take the previous line with it.
        const isSecondToLast = li === lines.length - 2;
        if (isSecondToLast && y - 2 * lineH < MARGIN) newPage();
        need(lineH);
        let x = MARGIN;
        const isLastLine = li === lines.length - 1;
        if (centered) {
          const textW = ln.reduce((acc, s) => acc + segWidth(s, size), 0);
          x = MARGIN + Math.max(0, (width - textW) / 2);
        }
        // Full justification for body copy; last lines and centered text stay natural.
        drawSegLine(page, ln, x, y - size, size, !centered && !isLastLine ? width : undefined);
        y -= lineH;
      }
      y -= 6;
      if (!centered) inTitle = false;
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
          wrapSegs(fonts, parseInline(cell).map((s) => (ri === 0 ? { ...s, bold: true } : s)), colW - 2 * pad, size),
        );
        const rowH = Math.max(1, ...cellLines.map((c) => c.length)) * lineH + 2 * pad;
        need(rowH);
        // grid
        page.drawRectangle({
          x: MARGIN,
          y: y - rowH,
          width: width,
          height: rowH,
          borderColor: rgb(0.6, 0.62, 0.66),
          borderWidth: 0.5,
        });
        for (let ci = 1; ci < cols; ci++) {
          page.drawLine({
            start: { x: MARGIN + ci * colW, y: y },
            end: { x: MARGIN + ci * colW, y: y - rowH },
            color: rgb(0.6, 0.62, 0.66),
            thickness: 0.5,
          });
        }
        for (let ci = 0; ci < row.length; ci++) {
          let cy = y - pad;
          for (const ln of cellLines[ci]) {
            drawSegLine(page, ln, MARGIN + ci * colW + pad, cy - size, size);
            cy -= lineH;
          }
        }
        y -= rowH;
      }
      y -= 8;
      continue;
    }
  }

  if (!opts.watermark) {
    stampPageNumbers(doc, fonts.regular);
    doc.setTitle(opts.title);
    doc.setAuthor("MyFloridaSeriesLLC");
    doc.setProducer("MyFloridaSeriesLLC document engine");
    doc.setCreationDate(new Date());
    return doc.save();
  }
  stampFooters(doc, fonts.regular, opts.watermark);
  setMeta(doc, opts.title, opts.watermark);
  return finishWithPermissions(doc);
}

function stampPageNumbers(doc: PDFDocument, font: PDFFont): void {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    const pn = `Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(pn, 7.5);
    p.drawText(pn, { x: width - MARGIN - w, y: FOOTER_Y, size: 7.5, font, color: rgb(0.55, 0.57, 0.6) });
  });
}

function stampFooters(doc: PDFDocument, font: PDFFont, wm: WatermarkInfo): void {
  const pages = doc.getPages();
  const total = pages.length;
  const text = sanitize(`Licensed to ${wm.name} (${wm.email}) - MyFloridaSeriesLLC${wm.note ? " - " + wm.note : ""}`);
  const stamp = wm.generatedAt ? sanitize(`Generated ${wm.generatedAt}`) : "";
  const grey = rgb(0.55, 0.57, 0.6);
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    // The generated stamp sits on its own line above the license line so it
    // can never collide with the page number on the right.
    if (stamp) {
      p.drawText(stamp, { x: MARGIN, y: FOOTER_Y + 10, size: 7.5, font, color: grey });
    }
    p.drawText(text, { x: MARGIN, y: FOOTER_Y, size: 7.5, font, color: grey });
    const pn = `Page ${i + 1} of ${total}`;
    const w = font.widthOfTextAtSize(pn, 7.5);
    p.drawText(pn, { x: width - MARGIN - w, y: FOOTER_Y, size: 7.5, font, color: grey });
  });
}

function setMeta(doc: PDFDocument, title: string, wm: WatermarkInfo): void {
  doc.setTitle(title);
  doc.setAuthor("MyFloridaSeriesLLC");
  doc.setSubject(`Licensed to ${wm.name} <${wm.email}>${wm.note ? " — " + wm.note : ""}`);
  doc.setProducer("MyFloridaSeriesLLC document engine");
  doc.setCreationDate(new Date());
}

/** Print allowed; copying/modifying restricted. Falls back to unencrypted if
 *  the encryption path fails — the watermark is the real deterrent. */
async function finishWithPermissions(doc: PDFDocument): Promise<Uint8Array> {
  try {
    const anyDoc = doc as unknown as {
      encrypt?: (o: {
        ownerPassword: string;
        permissions: { printing?: string; modifying?: boolean; copying?: boolean; annotating?: boolean };
      }) => Promise<void> | void;
    };
    if (typeof anyDoc.encrypt === "function") {
      await anyDoc.encrypt({
        ownerPassword: `mfsl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        // Clients may print and add their own notes/signatures; the underlying
        // text stays locked against copying and editing.
        permissions: { printing: "highResolution", modifying: false, copying: false, annotating: true },
      });
    }
    return await doc.save({ useObjectStreams: false });
  } catch (e) {
    console.error("[pdf] permissions encryption failed; serving watermarked-only:", e);
    return await doc.save({ useObjectStreams: false });
  }
}

/** Stamp an existing PDF (the manual library) with the client watermark. */
export async function stampExistingPdf(opts: {
  bytes: Uint8Array | ArrayBuffer;
  watermark: WatermarkInfo;
  title: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(opts.bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  stampFooters(doc, font, opts.watermark);
  setMeta(doc, opts.title, opts.watermark);
  return finishWithPermissions(doc);
}
