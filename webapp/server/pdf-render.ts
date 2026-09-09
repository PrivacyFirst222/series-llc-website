/**
 * Renders the markdown subset used by the OA templates (headings, **bold**,
 * *italic*, tables, paragraphs) into a paginated, watermarked PDF, and stamps
 * existing PDFs (the manual library) with the same watermark. Pure JS —
 * @cantoo/pdf-lib is an API-compatible pdf-lib fork that adds encryption, so
 * the output can allow printing while restricting copy/edit.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFStream, PDFString, PDFTextField, type PDFObject } from "@cantoo/pdf-lib";

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

export interface Seg {
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
      // Drop the |---|---| separator only. A row of empty cells (| | | |) is
      // a real row — the Asset Schedule's blank lines — and was being
      // dropped with it, so the schedule rendered as a header alone.
      const rows = tbl
        .filter((t) => !/^\|[\s|]*-[\s\-|]*\|?$/.test(t))
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

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

/** Width of `text` as pdf-lib DRAWS it: one Tj operator advances by the sum
 *  of the glyph widths and applies no kerning. `widthOfTextAtSize` on a whole
 *  string applies the font's kerning pairs ("AV", "Te"), so it comes out
 *  short — by 1.8pt over one preamble line — and every segment drawn after a
 *  measured one landed early. That is how "of " and a bold company name
 *  became "ofE2E" on the amended agreement's first page (audit, 8 Sep 2026,
 *  DOC-SPACING-001). Measuring glyph by glyph makes measured == drawn, so
 *  wrapping, justification, and segment joins all agree with the page. */
const glyphWidthCache = new Map<PDFFont, Map<string, number>>();
export function drawnWidth(font: PDFFont, text: string, size: number): number {
  let cache = glyphWidthCache.get(font);
  if (!cache) { cache = new Map(); glyphWidthCache.set(font, cache); }
  let total = 0;
  for (const ch of text) {
    let w = cache.get(ch);
    if (w === undefined) {
      try { w = font.widthOfTextAtSize(ch, 1000); } catch { w = 500; }
      cache.set(ch, w);
    }
    total += w;
  }
  return (total * size) / 1000;
}

function fontFor(f: Fonts, seg: Seg): PDFFont {
  if (seg.bold && seg.italic) return f.boldItalic;
  if (seg.bold) return f.bold;
  if (seg.italic) return f.italic;
  return f.regular;
}

/** A subsection label standing as its own paragraph: one bold run such as
 *  "3.6 Company as Owner." — a heading in all but markup. */
export function isLabelParagraph(segs: Seg[]): boolean {
  return segs.length === 1 && segs[0].bold && !segs[0].italic && /^\d+\.\d+ .*\.$/.test(segs[0].text.trim());
}

/** Wrap inline segments into lines that fit `width` at `size`. */
export function wrapSegs(f: Fonts, segs: Seg[], width: number, size: number): Seg[][] {
  const lines: Seg[][] = [];
  let cur: Seg[] = [];
  let curW = 0;
  for (const seg of segs) {
    const words = seg.text.split(/(\s+)/).filter((w) => w.length > 0);
    for (const word of words) {
      const font = fontFor(f, seg);
      const w = drawnWidth(font, word, size);
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
  const TEXT_H = PAGE_H - 2 * MARGIN;
  const BLANK_NOTICE = "[INTENTIONALLY LEFT BLANK]";
  /** Called just before a forced page break: if the rest of this page is a
   *  large blank, print the notice in the middle of it. */
  const markBlankSpace = () => {
    const remaining = y - MARGIN;
    if (remaining <= TEXT_H / 3) return;
    const size = BODY_SIZE;
    const w = drawnWidth(fonts.regular, BLANK_NOTICE, size);
    page.drawText(BLANK_NOTICE, { x: MARGIN + (width - w) / 2, y: MARGIN + remaining / 2 - size / 2, size, font: fonts.regular, color: rgb(0.1, 0.12, 0.16) });
    y = MARGIN; // the space is spoken for
  };

  const segWidth = (seg: Seg, size: number): number => drawnWidth(fontFor(fonts, seg), seg.text, size);

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
  // Whether a paragraph has been drawn inside the title block. A heading that
  // comes AFTER one is a section heading, not a title line — "WHAT IS IN THIS
  // PACKAGE" on the S election instruction sheet — and ends the block. The
  // agreements' own title headings (OF, the company, its type) all come
  // before their first paragraph, so they stay centered.
  let titleSawParagraph = false;
  // Which Asset Schedule the fields belong to, so names are unique per series.
  let assetScheduleNo = 0;

  // Keep-tail-together: a forced [[pagebreak]] (the signature page, an
  // exhibit) can leave the last few lines before it stranded alone on an
  // otherwise blank page — s. 13.10 of the member-managed single-member form
  // sat as three lines on its own page (Codex PDF-002). When the remaining
  // blocks before a nearby pagebreak are one small unit that will not fit on
  // the current page, break early so the unit lands together with company.
  const TAIL_MAX_LINES = 16;
  const tailHeightBeforeBreak = (from: number): number | null => {
    let h = 0;
    for (let k = from; k < blocks.length && k < from + 6; k++) {
      const b = blocks[k];
      if (b.kind === "para" && b.segs.length === 1 && b.segs[0].text.trim() === "[[pagebreak]]") {
        return h;
      }
      if (b.kind === "para") {
        const t = b.segs[0]?.text.trim();
        if (t === "[[left]]") continue;
        const ls = wrapSegs(fonts, b.segs.map((sg) => ({ ...sg })), width, BODY_SIZE);
        h += ls.length * (BODY_SIZE + LINE_GAP) + 6;
        if (h > TAIL_MAX_LINES * (BODY_SIZE + LINE_GAP)) return null;
      } else if (b.kind === "heading") {
        h += (b.level === 1 ? 16 : b.level === 2 ? 13 : 12) + LINE_GAP + 8 + 4;
      } else {
        return null; // tables are their own problem — never pull those
      }
    }
    return null;
  };
  let tailPulled = false;

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.kind === "para" && !tailPulled) {
      const t0 = block.segs[0]?.text.trim();
      if (t0 !== "[[pagebreak]]" && t0 !== "[[left]]") {
        const tail = tailHeightBeforeBreak(bi);
        if (tail !== null && tail > 0 && y - tail < MARGIN && tail <= TAIL_MAX_LINES * (BODY_SIZE + LINE_GAP)) {
          newPage();
          tailPulled = true;
        }
      }
    }
    if (block.kind === "para" && block.segs.length === 1 && block.segs[0].text.trim() === "[[pagebreak]]") {
      tailPulled = false;
    }
    if (block.kind === "heading") {
      const isPart = /^(ARTICLE|RECITALS|SIGNATURES|EXHIBIT|SERIES EXHIBIT|ASSET SCHEDULE)/.test(block.text.trim());
      if (isPart || titleSawParagraph) inTitle = false;
      const size = block.level === 1 ? 16 : block.level === 2 ? 13 : 12;
      const lineH = size + LINE_GAP;
      const lines = wrapSegs(fonts, [{ text: block.text, bold: true, italic: false }], width, size);
      // keep heading with at least two body lines
      need(lines.length * lineH + 2 * (BODY_SIZE + LINE_GAP) + 10);
      y -= 8;
      for (const ln of lines) {
        const textW = ln.reduce((acc, s) => acc + drawnWidth(fonts.bold, s.text, size), 0);
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
      // A break that leaves more than a third of the page's text area empty
      // says so, centered in the space, so a reader knows nothing is missing
      // (Adam, 9 Sep 2026: "[INTENTIONALLY LEFT BLANK] … centered in the
      // middle of the blank space").
      if (block.segs.length === 1 && block.segs[0].text.trim() === "[[pagebreak]]") {
        markBlankSpace();
        newPage();
        continue;
      }
      const size = BODY_SIZE;
      const lineH = size + LINE_GAP;
      const lines = wrapSegs(fonts, block.segs.map((s) => ({ ...s })), width, size);
      // Signature blocks (Adam, 9 Sep 2026): a line of underscores is a
      // signature line, and the name beneath it and the "Date:" line beneath
      // that sit tight, with no paragraph gap between them; the gap goes
      // before the signature line instead, so signers are set apart.
      const plainText = block.segs.map((s) => s.text).join("").trim();
      const isSignatureLine = /^_{5,}$/.test(plainText);
      const nextBlock = blocks[bi + 1];
      const nextIsDate = nextBlock?.kind === "para" && /^Date:/.test(nextBlock.segs.map((s) => s.text).join("").trim());
      if (isSignatureLine) y -= 10;
      // The title block is the short centered lines at the top — the title,
      // "OF", the company, its type, the management line. It ends at the
      // preamble ("THIS OPERATING AGREEMENT…"), which every master begins with
      // THIS, or at any paragraph that runs past two lines; those are body
      // copy and set full-width, justified (Adam, 8 Sep 2026: the first
      // paragraph was centered because RECITALS, the first part heading, sits
      // after it).
      const paraText = block.segs.map((s) => s.text).join("");
      if (inTitle && (/^THIS\b/.test(paraText.trim()) || lines.length > 2)) inTitle = false;
      const centered = inTitle;
      if (centered) titleSawParagraph = true;
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
      // Label control: a subsection label that stands as its own paragraph
      // ("**3.6 Company as Owner.**") is a heading in all but markup, so it is
      // kept with two lines of what follows, as headings are. Three of eight
      // agreements had it alone at a page foot (audit, 8 Sep 2026, DOC-PAG-001).
      const isLabel = lines.length === 1 && isLabelParagraph(block.segs);
      if (leadIn || isLabel) need(lines.length * lineH + 2 * lineH + 6);
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
      y -= isSignatureLine || nextIsDate ? 0 : 6;
      if (!centered) inTitle = false;
      continue;
    }
    if (block.kind === "table") {
      const cols = Math.max(...block.rows.map((r) => r.length));
      const colW = width / cols;
      const size = 9.5;
      const lineH = size + 2.5;
      const pad = 4;
      // The Asset Schedule's empty rows are the client's to fill in the PDF
      // itself (Adam, 9 Sep 2026): each empty cell is a typeable field that
      // wraps and auto-sizes its text — the PDF's own "0 Tf" rule, which
      // readers apply as "as large as fits, shrinking as the text grows".
      const isAssetSchedule = /^Asset description/i.test(block.rows[0]?.[0] ?? "");
      const FILL_LINES = 4;
      if (isAssetSchedule) assetScheduleNo++;
      for (let ri = 0; ri < block.rows.length; ri++) {
        const row = block.rows[ri];
        const fillable = isAssetSchedule && ri > 0 && row.every((c) => c.trim() === "");
        const cellLines = row.map((cell) =>
          wrapSegs(fonts, parseInline(cell).map((s) => (ri === 0 ? { ...s, bold: true } : s)), colW - 2 * pad, size),
        );
        const rowH = (fillable ? FILL_LINES : Math.max(1, ...cellLines.map((c) => c.length))) * lineH + 2 * pad;
        need(rowH);
        if (fillable) {
          const form = doc.getForm();
          for (let ci = 0; ci < cols; ci++) {
            const field = form.createTextField(`asset-schedule.${assetScheduleNo}.row${ri}.col${ci + 1}`);
            field.enableMultiline();
            field.addToPage(page, {
              x: MARGIN + ci * colW + 1,
              y: y - rowH + 1,
              width: colW - 2,
              height: rowH - 2,
              borderWidth: 0,
              font: fonts.regular,
            });
            field.setFontSize(0);
          }
        }
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
  return finishWithPermissions(doc, opts.title, opts.watermark, fonts.regular);
}

function stampPageNumbers(doc: PDFDocument, font: PDFFont): void {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    const pn = `Page ${i + 1} of ${pages.length}`;
    const w = drawnWidth(font, pn, 7.5);
    p.drawText(pn, { x: width - MARGIN - w, y: FOOTER_Y, size: 7.5, font, color: rgb(0.55, 0.57, 0.6) });
  });
}

function stampFooters(doc: PDFDocument, font: PDFFont, wm: WatermarkInfo): void {
  const pages = doc.getPages();
  const total = pages.length;
  const text = sanitize(`Copyright FLORIDA PROTECTED SERIES, LLC - PS 1${wm.note ? ", " + wm.note.replace(/\s+\u2014\s+/g, ", ") : ""}`);
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
    const w = drawnWidth(font, pn, 7.5);
    p.drawText(pn, { x: width - MARGIN - w, y: FOOTER_Y, size: 7.5, font, color: grey });
  });
}

function setMeta(doc: PDFDocument, title: string, wm: WatermarkInfo): void {
  doc.setTitle(title);
  doc.setAuthor("MyFloridaSeriesLLC");
  doc.setSubject(`Copyright FLORIDA PROTECTED SERIES, LLC - PS 1${wm.note ? ", " + wm.note.replace(/\s+\u2014\s+/g, ", ") : ""}`);
  doc.setProducer("MyFloridaSeriesLLC document engine");
  doc.setCreationDate(new Date());
}

/** PDF 32000-1 s. 7.6.1: in an encrypted document every string is encrypted
 *  with the key of the indirect object that holds it (the Encrypt dictionary
 *  excepted). The library leaves strings alone, so this walks every indirect
 *  object after encryption is set up and replaces each string with its
 *  encrypted hex form. Streams are the writer's own job and are not touched. */
function encryptStrings(doc: PDFDocument): void {
  const encryptRef = doc.context.trailerInfo.Encrypt;
  const done = new WeakSet<object>();
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (encryptRef instanceof PDFRef && ref === encryptRef) continue;
    encryptStringsIn(doc, ref, object, done);
  }
}

/** `done` remembers every container and every string already handled: a
 *  dictionary the library shares between two indirect objects, or a string
 *  reached twice, must not be encrypted twice — the second pass turns it to
 *  garbage. */
function encryptStringsIn(doc: PDFDocument, ref: unknown, object?: PDFObject, done: WeakSet<object> = new WeakSet()): void {
  if (!(ref instanceof PDFRef)) return;
  const security = (doc.context as unknown as { security?: { getEncryptFn: (obj: number, gen: number) => (b: Uint8Array) => Uint8Array } }).security;
  if (!security) return;
  const target = object ?? doc.context.lookup(ref);
  if (!target) return;
  const fn = security.getEncryptFn(ref.objectNumber, ref.generationNumber);
  const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const enc = (s: PDFString | PDFHexString) => {
    const out = PDFHexString.of(toHex(fn(s.asBytes())));
    done.add(out);
    return out;
  };
  const walk = (o: PDFObject): PDFObject => {
    if (done.has(o)) return o;
    if (o instanceof PDFString || o instanceof PDFHexString) return enc(o);
    if (o instanceof PDFStream) { walkDict(o.dict); return o; }
    if (o instanceof PDFDict) { walkDict(o); return o; }
    if (o instanceof PDFArray) {
      done.add(o);
      for (let i = 0; i < o.size(); i++) o.set(i, walk(o.get(i)));
      return o;
    }
    return o;
  };
  const walkDict = (d: PDFDict) => {
    if (done.has(d)) return;
    done.add(d);
    for (const [k, v] of d.entries()) d.set(k, walk(v));
  };
  walk(target);
}

/** Print allowed; copying/modifying restricted. Falls back to unencrypted if
 *  the encryption path fails — the watermark is the real deterrent. */
/** The typeable cells, made ready for a reader: appearance streams built
 *  once, every cell set back to auto-size (the library's appearance pass
 *  picks a size of its own), and the font registered where readers look for
 *  a field's font — the AcroForm's default resources — with a document-level
 *  default appearance as the fallback. */
function finishFields(doc: PDFDocument, font: PDFFont): void {
  const form = doc.getForm();
  const cells = form.getFields().filter((f): f is PDFTextField => f instanceof PDFTextField);
  if (cells.length === 0) return;
  form.updateFieldAppearances(font);
  for (const cell of cells) cell.setFontSize(0);
  const dr = doc.context.obj({ Font: doc.context.obj({ [font.name]: font.ref }) });
  form.acroForm.dict.set(PDFName.of("DR"), dr);
  form.acroForm.dict.set(PDFName.of("DA"), PDFString.of(`/${font.name} 0 Tf 0 g`));
}

async function finishWithPermissions(doc: PDFDocument, title: string, wm: WatermarkInfo, font: PDFFont): Promise<Uint8Array> {
  try {
    const anyDoc = doc as unknown as {
      encrypt?: (o: {
        ownerPassword: string;
        permissions: { printing?: string; modifying?: boolean; copying?: boolean; annotating?: boolean; fillingForms?: boolean };
      }) => Promise<void> | void;
    };
    if (typeof anyDoc.encrypt === "function") {
      // The library's writer encrypts STREAMS only, never strings, so any Info
      // metadata in an encrypted document is written plaintext into a file
      // that declares string encryption — and every reader "decrypts" it into
      // garbage (Codex PDF-001; confirmed against PDFWriter.encrypt, which
      // tests `object instanceof PDFStream`). No string we set can survive,
      // so the encrypted document carries NO Info dictionary: viewers then
      // fall back to the clean filename. The watermark on every page, not the
      // metadata, is what identifies the licensee.
      await anyDoc.encrypt({
        ownerPassword: `mfsl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        // Clients may print and add their own notes/signatures; the underlying
        // text stays locked against copying and editing.
        permissions: { printing: "highResolution", modifying: false, copying: false, annotating: true, fillingForms: true },
      });
      // The library encrypts streams only. Every STRING — field names, the
      // fields' appearance settings, typed values, the title — would be
      // written in the clear into a file that declares string encryption,
      // and a compliant reader "decrypts" each into garbage (pypdf read the
      // field names back as "", ".", ".." — 9 Sep 2026). Encrypt the strings
      // ourselves with the same per-object keys, and the document may carry
      // its Info dictionary again.
      await doc.flush();
      finishFields(doc, font);
      setMeta(doc, title, wm);
      encryptStrings(doc);
      // The library would rebuild every field's appearance during save — with
      // fresh, unencrypted strings and its own font size. The fields are
      // finished above; save must leave them alone.
      return await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
    }
    setMeta(doc, title, wm);
    return await doc.save({ useObjectStreams: false });
  } catch (e) {
    console.error("[pdf] permissions encryption failed; serving watermarked-only:", e);
    setMeta(doc, title, wm);
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
  return finishWithPermissions(doc, opts.title, opts.watermark, font);
}
