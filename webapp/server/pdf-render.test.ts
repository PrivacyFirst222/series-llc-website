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
const hasPypdfRules = (() => { try { execSync("python3 -c \"import pypdf\"", { stdio: "ignore" }); return true; } catch { return false; } })();
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

// 4b. The signature page for a couple and a solo owner (Adam, 9 Sep 2026):
// preamble to the dates below; each signer a line, name, and Date; the
// couple headed by both names and their holding, each spouse on their own.
if (hasPdftotext) {
  const inputs = {
    ...base,
    version: "member",
    professional: false,
    members: [
      { name: "Casey Gatecheck", address: "100 Ocean Dr, Miami, FL 33139", share: { kind: "percent", value: 51 }, todBeneficiary: "", contribution: "$1,000" },
      { name: "Blair Gatecheck and Drew Gatecheck", address: "100 Ocean Dr, Miami, FL 33139", share: { kind: "percent", value: 49 }, todBeneficiary: "", contribution: "$1,000", jointHolding: "tenants by the entirety", signatories: ["Blair Gatecheck", "Drew Gatecheck"] },
    ],
  } as unknown as OaInputs;
  const { markdown, title } = assembleOa(inputs);
  const bytes = await renderMarkdownPdf({ markdown, watermark: null, title });
  const file = join(outDir, "signatures.pdf");
  writeFileSync(file, bytes);
  const text = execSync(`pdftotext -layout "${file}" -`).toString();
  const sig = text.slice(text.indexOf("SIGNATURES"), text.indexOf("EXHIBIT A"));
  const lines = sig.split("\n").map((l) => l.trim()).filter(Boolean);
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  check("signatures: the preamble refers to the dates set forth below", /effective as of the date\(s\)\s+set\s+forth\s+below/.test(sig), sig.slice(0, 200));
  // The rules are drawn, so the text holds no underscores: name, then "Date:".
  const solo = at(/^Casey Gatecheck$/);
  check("signatures: the solo owner's name, then Date", solo >= 0 && /^Date:$/.test(lines[solo + 1] ?? ""), lines.slice(solo, solo + 2));
  check("signatures: no typed underscores remain", !/_{3,}/.test(sig));
  const heading = at(/^Blair Gatecheck and Drew Gatecheck$/);
  check("signatures: the couple is headed by both names and their holding", heading >= 0 && lines[heading + 1] === "as Tenants by the Entirety", lines.slice(heading, heading + 2));
  check("signatures: each spouse then signs on their own line with a Date", lines[heading + 2] === "Blair Gatecheck" && /^Date:$/.test(lines[heading + 3] ?? "") && lines[heading + 4] === "Drew Gatecheck" && /^Date:$/.test(lines[heading + 5] ?? ""), lines.slice(heading + 2, heading + 6));
  check("signatures: no 'entireties'", !/entireties/i.test(sig));
  // The rules themselves, measured from the page's drawing: every signature
  // rule is SIG_W long from the margin, and every rule — signature or date —
  // ends at the same right edge (Adam, 10 Sep 2026).
  if (hasPypdfRules) {
    const rules = execSync(`python3 - "${file}" <<'PY'
import re, sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
out = []
for p in r.pages:
    if "SIGNATURES" not in p.extract_text():
        continue
    c = p.get_contents()
    data = c.get_data().decode("latin1") if c is not None else ""
    for m in re.finditer(r"([\\d.]+)\\s+([\\d.]+)\\s+m\\s+([\\d.]+)\\s+([\\d.]+)\\s+l", data):
        x1, y1, x2, y2 = map(float, m.groups())
        if abs(y1 - y2) < 0.01 and x2 > x1:
            out.append((round(x1, 1), round(x2, 1)))
print(";".join(f"{a},{b}" for a, b in out))
PY`).toString().trim();
    const segs = rules ? rules.split(";").map((s) => s.split(",").map(Number) as [number, number]) : [];
    const horizontal = segs.filter(([a, b]) => b - a > 100);
    const rightEdges = new Set(horizontal.map(([, b]) => b));
    check("signatures: every rule ends at one right edge", horizontal.length >= 6 && rightEdges.size === 1 && [...rightEdges][0] === 72 + 252, { count: horizontal.length, edges: [...rightEdges] });
    check("signatures: every signature rule is three and a half inches from the margin", horizontal.filter(([a]) => a === 72).every(([a, b]) => b - a === 252) && horizontal.some(([a]) => a === 72), horizontal.slice(0, 6));
  }
}

// 6. The licensed (encrypted) agreement with one series: the blank-space
// notice, the Asset Schedule's typeable fields, and — read back the way a
// compliant reader reads it — field names, appearance settings, and the
// title all decrypt cleanly (9 Sep 2026: the library left strings in the
// clear, so readers turned them to garbage).
{
  const inputs = {
    ...base,
    members: base.members.slice(0, 1),
    version: "member-single",
    professional: false,
    series: [{ name: "E2E Coastal Holdings, LLC - PS 1", purpose: "Rental real estate", contribution: "$2,000" }],
  } as OaInputs;
  const { markdown, title } = assembleOa(inputs);
  check("Exhibit A lists the capital the Company allocated to the series and what it kept", /\| Capital allocated by the Company to Protected Series \| E2E Coastal Holdings, LLC - PS 1: \$2,000 \|/.test(markdown) && /\| Retained by the Company \| [^|\n]+\|/.test(markdown), markdown.match(/Retained by the Company[^\n]*/)?.[0]);
  const bytes = await renderMarkdownPdf({ markdown, watermark: { name: "Casey Gatecheck", email: "casey@example.com" }, title });
  check("licensed agreement renders", new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-");
  const file = join(outDir, "licensed-with-series.pdf");
  writeFileSync(file, bytes);
  if (hasPdftotext) {
    const text = execSync(`pdftotext -layout "${file}" -`).toString();
    check("the blank space before a forced break carries the notice", /\[INTENTIONALLY LEFT BLANK\]/.test(text), (text.match(/INTENTIONALLY LEFT BLANK/g) ?? []).length);
    check("the encrypted text still reads (streams decrypt)", /Asset description/.test(text) && /Company as Owner/.test(text));
  }
  const hasPypdf = (() => { try { execSync("python3 -c 'import pypdf, cryptography'", { stdio: "ignore" }); return true; } catch { return false; } })();
  if (hasPypdf) {
    // The field tree is walked by hand: pypdf's flattened listing drops a
    // leaf's own /DA, which is where the auto-size setting lives.
    const py = `
import json, sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
r.decrypt("")
fields = {}
def walk(node, prefix):
    o = node.get_object()
    t = o.get("/T")
    name = (prefix + "." if prefix else "") + str(t) if t is not None else prefix
    kids = o.get("/Kids")
    if kids and any(k.get_object().get("/T") is not None for k in kids):
        for k in kids: walk(k, name)
    else:
        fields[name] = {"DA": str(o.get("/DA")), "Ff": o.get("/Ff")}
af = r.trailer["/Root"].get("/AcroForm")
for f in (af["/Fields"] if af else []): walk(f, "")
out = {"encrypted": r.is_encrypted, "title": (r.metadata or {}).get("/Title"), "fields": fields, "acroDA": str(af.get("/DA")) if af else None, "drFonts": list(af["/DR"]["/Font"].keys()) if af and "/DR" in af else []}
print(json.dumps(out))
`;
    const raw = execSync(`python3 -c '${py.replace(/'/g, "'\\''")}' "${file}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const parsed = JSON.parse(raw) as { encrypted: boolean; title: string | null; fields: Record<string, { DA: string; Ff: number | null }>; acroDA: string | null; drFonts: string[] };
    check("the form declares its font where readers look (DR) and a document default appearance", parsed.drFonts.includes("/Times-Roman") && /0 Tf/.test(parsed.acroDA ?? ""), { dr: parsed.drFonts, da: parsed.acroDA });
    // The reader lists the field tree: asset-schedule → 1 → rowN → colN.
    // The twenty leaves are the cells; their parents carry no appearance.
    const leaves = Object.keys(parsed.fields).filter((n) => /^asset-schedule\.1\.row\d\.col\d$/.test(n));
    check("the licensed agreement is encrypted", parsed.encrypted === true);
    check("the title decrypts cleanly for a compliant reader", parsed.title === title, parsed.title);
    check("the Asset Schedule has 20 typeable fields for one series (5 rows × 4 columns)", leaves.length === 20, Object.keys(parsed.fields).slice(0, 6));
    check("every cell's appearance string decrypts and auto-sizes (0 Tf)", leaves.length > 0 && leaves.every((n) => /\b0 Tf\b/.test(parsed.fields[n].DA)), leaves.map((n) => parsed.fields[n].DA).slice(0, 3));
    check("every cell is multiline (wraps)", leaves.length > 0 && leaves.every((n) => ((parsed.fields[n].Ff ?? 0) & 4096) === 4096), leaves.map((n) => parsed.fields[n].Ff).slice(0, 3));
  } else {
    console.log("(pypdf not installed here — the encrypted read-back checks ran 0 of 5)");
  }
}

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
