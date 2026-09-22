# Batch32 — five approved document-output fixes

Adam approved all five proposed fixes: “Go. Approve all.” Normal implementation and review only; no acceptance, integration or publication.

## 1. render-word-alternatives-glued
Separate and label editable Word alternatives; preserve every drafting choice, legal sentence, table and indent.

Source before edit: `docs/md-to-docx.py:345`

Historical reads:     md = re.sub(r"<!--.*?-->", "", md, flags=re.S)

## 2. render-2553-address-split
Use structured principal address for Form2553 and cover letter, with lossless legacy fallback.

Source before edit: `webapp/server/s-election.ts:97`

Historical reads: function splitAddress(addr: string): { street: string; cityStateZip: string } {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { street: parts.slice(0, parts.length - 2).join(", ") || parts[0], cityStateZip: parts.slice(-2).join(", ") };
  }

## 3. render-manual-double-page-numbers
Preserve Manual pagination on portal download, including unnumbered cover/contents, while retaining licensing and encryption.

Source before edit: `webapp/server/pdf-render.ts:619`

Historical reads: function stampFooters(doc: PDFDocument, font: PDFFont, wm: WatermarkInfo): void {
  const pages = doc.getPages();
  const total = pages.length;
  const text = sanitize(`Copyright FLORIDA PROTECTED SERIES, LLC - PS 1${wm.note ? ", " + wm.note.replace(/\s+\u2014\s+/g, ", ") : ""}`);

## 4. render-capital-equal-couple-wording
Show exact equal fractions per ownership unit, identify joint units explicitly, preserve all calculations.

Source before edit: `webapp/server/oa-capital.ts:82`

Historical reads:           : `${joinNames(unitNames)}, equally`;

## 5. render-wrap-line-starts-with-punctuation
Keep closing punctuation with its preceding word across styled segments, measured within margins.

Source before edit: `webapp/server/pdf-render.ts:153`

Historical reads:       if (curW + w > width && cur.length > 0 && word.trim() !== "") {

Verification: real Word XML/outputs; real Form2553 and letter; actual stamped Manual; contribution calculations and assembled PDF; style-boundary wrapping measured and rendered. Preserve prior checks, update only the old equal-contribution wording expectation and authorize a generator-change proof that preserves baseline content after removing exact drafting labels.

## Revision 2
Declare the existing API equal-contribution cell expectation update; preserve the row amounts, allocations and check label. Advanced under Adam’s standing authorization to handle necessary revisions.

Drafting annotations are italic, bracketed, and explicitly delimited. Longer alternatives are separate paragraphs. The downloaded generated Manual keeps its own numbers; uploaded Manual pagination is preserved as supplied. Unknown legacy address layouts remain intact on the street line rather than losing components.
