/**
 * The PDF renderer, checked against the audit of 8 Sep 2026:
 *
 *  - DOC-SPACING-001: text is measured the way it is drawn (glyph by glyph,
 *    no kerning), so a bold company name never lands on the word before it.
 *  - DOC-PAG-001: a subsection label standing as its own paragraph is kept
 *    with the text that follows it.
 *  - Every one of the sixteen agreement variants — eight masters, each as a
 *    standard and as a professional company — renders to a real PDF.
 *  - The preamble is body copy, full-width and justified, while the title
 *    lines above it stay centered (Adam, 8 Sep 2026).
 *
 * Where `pdftotext` is installed (it is on Adam's Mac; not on the CI runner)
 * the rendered pages are read back: the preamble's "of E2E" join, no
 * template marker, and no page ending on a bare subsection label.
 */
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawnWidth, isLabelParagraph, parseMarkdown, renderMarkdownPdf, wrapSegs, type Fonts } from "./pdf-render";
import { assembleOa, type OaInputs } from "./oa";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, got?: unknown): void {
  checks++;
  if (ok) console.log(`✅ ${name}`);
  else { failures++; console.log(`❌ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 200)}` : ""}`); }
}

const doc = await PDFDocument.create();
const fonts: Fonts = {
  regular: await doc.embedFont(StandardFonts.TimesRoman),
  bold: await doc.embedFont(StandardFonts.TimesRomanBold),
  italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
};

// 1. Measurement equals the sum of the glyphs — no kerning pair shortens it.
const av = drawnWidth(fonts.regular, "AV", 11);
const a = drawnWidth(fonts.regular, "A", 11);
const v = drawnWidth(fonts.regular, "V", 11);
check("drawnWidth: 'AV' measures as A + V (no kerning)", Math.abs(av - (a + v)) < 1e-9, { av, a, v });
check("drawnWidth: a whole string is not shorter than its glyphs", drawnWidth(fonts.regular, "AGREEMENT", 11) >= fonts.regular.widthOfTextAtSize("AGREEMENT", 11));
check("drawnWidth: a trailing space counts", drawnWidth(fonts.regular, "of ", 11) > drawnWidth(fonts.regular, "of", 11));

// 2. The amended preamble's first line keeps the space before the bold name.
const preamble = parseMarkdown('THIS AMENDED AND RESTATED OPERATING AGREEMENT (this "Agreement") of **E2E Coastal Holdings, LLC**, a Florida protected series limited liability company (the "Company").');
const para = preamble[0];
check("preamble parses as one paragraph", para?.kind === "para");
if (para?.kind === "para") {
  const lines = wrapSegs(fonts, para.segs.map((s) => ({ ...s })), 468, 11);
  const first = lines[0];
  const regularSeg = first.find((s) => !s.bold);
  const boldSeg = first.find((s) => s.bold);
  check("first line: the regular run ends with the space before the name", regularSeg?.text.endsWith("of ") === true, regularSeg?.text.slice(-12));
  check("first line: the bold name follows on the same line", boldSeg?.text.startsWith("E2E") === true, boldSeg?.text);
}

// 3. The label rule fires for a bare subsection label and for nothing else.
check("label: '3.6 Company as Owner.' is a label paragraph", isLabelParagraph([{ text: "3.6 Company as Owner.", bold: true, italic: false }]));
check("label: a bold lead-in with body text is not", !isLabelParagraph([{ text: "3.1 Establishment.", bold: true, italic: false }, { text: " With the consent of the Member…", bold: false, italic: false }]));
check("label: a heading-shaped plain paragraph is not", !isLabelParagraph([{ text: "3.6 Company as Owner.", bold: false, italic: false }]));

// 4. Sixteen variants render.
const versions: OaInputs["version"][] = ["single", "single-s", "member-single", "member-single-s", "multi", "s", "member", "member-s"];
const base = {
  companyName: "E2E Coastal Holdings, LLC",
  principalAddress: "200 Biscayne Blvd, Miami, FL 33131",
  managerNames: ["Casey Gatecheck"],
  effectiveDate: "September 7, 2026",
  amendedRestated: true,
  priorAgreementDate: "August 26, 2026",
  members: [
    { name: "Casey Gatecheck", address: "100 Ocean Dr, Miami, FL 33139", share: { kind: "percent", value: 60 }, todBeneficiary: "Jordan Heir", contribution: "$1,000 cash" },
    { name: "Blair Gatecheck", address: "100 Ocean Dr, Miami, FL 33139", share: { kind: "percent", value: 40 }, todBeneficiary: "", contribution: "$500 cash" },
  ],
  series: [],
  contributionToCompany: "$1,000 cash",
  generationNumber: 2,
  // The multi-member chassis needs its choices made; none is defaulted.
  borrowingThreshold: 25000,
  competition: "A",
  includeCapitalCalls: true,
  capitalCallCap: 10000,
  includeShotgun: false,
} as unknown as Omit<OaInputs, "version" | "professional">;
const hasPdftotext = (() => { try { execSync("pdftotext -v", { stdio: "ignore" }); return true; } catch { return false; } })();
const outDir = mkdtempSync(join(tmpdir(), "pdf-render-test-"));
let rendered = 0;
for (const version of versions) {
  const single = version.includes("single");
  const members = single ? base.members.slice(0, 1) : base.members;
  for (const professional of [false, true]) {
    const inputs = { ...base, members, version, professional } as OaInputs;
    const { markdown, title } = assembleOa(inputs);
    const bytes = await renderMarkdownPdf({ markdown, watermark: null, title });
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    check(`renders: ${version}${professional ? " (professional)" : ""} is a PDF`, head === "%PDF-", head);
    rendered++;
    if (hasPdftotext) {
      const file = join(outDir, `${version}-${professional ? "pro" : "std"}.pdf`);
      writeFileSync(file, bytes);
      const text = execSync(`pdftotext -layout "${file}" -`).toString();
      check(`read back: ${version}${professional ? " (professional)" : ""} preamble reads "of E2E Coastal"`, /\) of E2E Coastal/.test(text), text.split("\n").find((l) => l.includes('"Agreement")'))?.trim().slice(0, 120));
      check(`read back: ${version}${professional ? " (professional)" : ""} has no template marker`, !/\[\[|\*\*|\[COMPANY NAME\]/.test(text));
      // Alignment on page 1, from the layout text: a centered line is indented
      // from the left margin; a justified body line starts at it. The preamble
      // must start where Recital A starts, and the title lines must not.
      const page1 = text.split("\f")[0].split("\n");
      const indent = (l: string) => l.length - l.trimStart().length;
      const preambleLine = page1.find((l) => /THIS (AMENDED AND RESTATED )?OPERATING AGREEMENT/.test(l)) ?? "";
      const recitalA = page1.find((l) => /^\s*A\. The Company was formed/.test(l)) ?? "";
      const titleLine = page1.find((l) => /OPERATING AGREEMENT\s*$/.test(l) && !/THIS/.test(l)) ?? "";
      check(`read back: ${version}${professional ? " (professional)" : ""} preamble starts at the body margin, like Recital A`, preambleLine !== "" && recitalA !== "" && indent(preambleLine) === indent(recitalA), { preamble: indent(preambleLine), recital: indent(recitalA) });
      check(`read back: ${version}${professional ? " (professional)" : ""} title line stays centered`, titleLine !== "" && indent(titleLine) > indent(recitalA) + 10, { title: indent(titleLine), recital: indent(recitalA) });
      // A page that ends on a bare subsection label has stranded it.
      const label = /^\d+\.\d+ [A-Z][^.]*\.$/;
      const stranded = text.split("\f").map((p, i) => {
        // The last body line of the page: the footer (page number, license
        // line) is whatever follows the final blank gap, so drop trailing
        // lines that are a bare number or hold no letters.
        const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
        while (lines.length > 0 && (/^\d+$/.test(lines[lines.length - 1]) || /^Page \d+/.test(lines[lines.length - 1]) || /Generated|Licensed|©/.test(lines[lines.length - 1]))) lines.pop();
        return { page: i + 1, last: lines[lines.length - 1] ?? "" };
      }).filter((p) => label.test(p.last));
      check(`read back: ${version}${professional ? " (professional)" : ""} no page ends on a bare subsection label`, stranded.length === 0, stranded);
    }
  }
}
check("all 16 variants rendered", rendered === 16, rendered);

// 5. The S election instruction sheet's shape: a title, a bold name, an italic
// line, then section headings and body. Only the first three are title.
if (hasPdftotext) {
  const sheet = "# S CORPORATION ELECTION PACKAGE\n\n**E2E Coastal Holdings, LLC**\n\n*Prepared by MyFloridaSeriesLLC — please read this page before signing anything.*\n\n## WHAT IS IN THIS PACKAGE\n\n1. This instruction sheet — keep it.\n\n2. A cover letter to the IRS — mail it with the form.\n\n## STEP 1 — CHECK THE FORM\n\nRead every line of the form against your records before you sign it, and tell us at once about anything that is wrong.";
  const bytes = await renderMarkdownPdf({ markdown: sheet, watermark: null, title: "sheet" });
  const file = join(outDir, "sheet.pdf");
  writeFileSync(file, bytes);
  const lines = execSync(`pdftotext -layout "${file}" -`).toString().split("\n");
  const indent = (l: string) => l.length - l.trimStart().length;
  const title = lines.find((l) => /S CORPORATION ELECTION PACKAGE/.test(l)) ?? "";
  const name = lines.find((l) => /E2E Coastal Holdings, LLC/.test(l)) ?? "";
  const section = lines.find((l) => /WHAT IS IN THIS PACKAGE/.test(l)) ?? "";
  const item = lines.find((l) => /This instruction sheet/.test(l)) ?? "";
  const body = lines.find((l) => /Read every line of the form/.test(l)) ?? "";
  check("instruction sheet: the title and the company name are centered", indent(title) > 10 && indent(name) > 10, { title: indent(title), name: indent(name) });
  check("instruction sheet: the first section heading is at the margin, not centered", section !== "" && indent(section) === indent(body), { section: indent(section), body: indent(body) });
  check("instruction sheet: list items and body are at the margin", item !== "" && indent(item) === indent(body), { item: indent(item), body: indent(body) });
}
if (!hasPdftotext) console.log("(pdftotext not installed here — the read-back checks ran 0 of 48; they run on a machine with poppler)");

console.log(`\n${checks} checks, ${failures} failures${hasPdftotext ? "" : " (read-back skipped)"}`);
if (failures > 0) process.exit(1);
