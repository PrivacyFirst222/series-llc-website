/**
 * S Corporation Election Package: fills the official IRS Form 2553 from the
 * client's details and prepends a plain-English instruction sheet and a cover
 * letter. The client signs and mails the package themselves — we never take
 * custody of the signed form.
 *
 * Filing destination for Florida entities (verified against the Form 2553
 * instructions at irs.gov/instructions/i2553, 2026-08-06):
 *   Department of the Treasury, Internal Revenue Service Center, Ogden, UT 84201
 *   Fax: 855-214-7520. There is no IRS filing fee.
 */
import { PDFDocument } from "@cantoo/pdf-lib";
import f2553Base64 from "./assets/f2553-b64";
import { renderMarkdownPdf } from "./pdf-render";

export const IRS_MAIL_ADDRESS = "Department of the Treasury, Internal Revenue Service Center, Ogden, UT 84201";
export const IRS_FAX = "855-214-7520";

export interface SElectionShareholder {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string; // YYYY-MM-DD
  ssn: string; // 9 digits — decrypted only for draft generation
}

export interface SElectionDetails {
  llcName: string;
  principalAddress: string; // "street, city, ST zip"
  ein: string; // 9 digits, or "" if pending
  dateIncorporated: string; // YYYY-MM-DD (Articles filing date)
  effectiveDate: string; // YYYY-MM-DD (item E)
  officerName: string;
  officerTitle: string;
  phone: string;
  shareholders: SElectionShareholder[];
}

const F = "topmostSubform[0].Page1[0]";
const P2 = "topmostSubform[0].Page2[0]";
/** Row field-number offsets: J name/address, K sig, K date, L shares/%, L date acquired, M SSN, N year end. */
const ROW_FIELDS = [3, 4, 5, 6, 7, 8, 9] as const;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtEin(ein: string): string {
  return ein ? `${ein.slice(0, 2)}-${ein.slice(2)}` : "";
}

/** Filing deadline: 2 months and 15 days after the start of the first tax
 *  year — the numerically corresponding day two months out, plus 14 days
 *  (the 2-month period ends the day BEFORE the corresponding day). */
export function electionDeadline(startIso: string): string {
  const [y, m, d] = startIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + 2);
  dt.setUTCDate(dt.getUTCDate() + 14);
  return dt.toISOString().slice(0, 10);
}

/** Split "street, city, ST zip" into the form's two address lines as best we
 *  can; a one-line fallback goes entirely on the street line. */
function splitAddress(addr: string): { street: string; cityStateZip: string } {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { street: parts.slice(0, parts.length - 2).join(", ") || parts[0], cityStateZip: parts.slice(-2).join(", ") };
  }
  return { street: addr, cityStateZip: "" };
}

async function fillForm2553(d: SElectionDetails): Promise<PDFDocument> {
  const bytes = Uint8Array.from(atob(f2553Base64), (ch) => ch.charCodeAt(0));
  const doc = await PDFDocument.load(bytes, { updateMetadata: false }); // drops XFA; AcroForm remains
  const form = doc.getForm();
  const setText = (name: string, value: string) => {
    if (!value) return;
    const field = form.getTextField(name);
    field.setText(value);
  };
  const addr = splitAddress(d.principalAddress);

  // Part I — Election Information
  setText(`${F}.NameAddress[0].f1_01[0]`, d.llcName);
  setText(`${F}.NameAddress[0].f1_02[0]`, addr.street);
  setText(`${F}.NameAddress[0].f1_03[0]`, addr.cityStateZip);
  setText(`${F}.f1_04[0]`, fmtEin(d.ein)); // A — EIN
  setText(`${F}.f1_05[0]`, fmtDate(d.dateIncorporated)); // B — date incorporated
  setText(`${F}.f1_06[0]`, "Florida"); // C — state
  setText(`${F}.f1_07[0]`, fmtDate(d.effectiveDate)); // E — effective date
  form.getCheckBox(`${F}.c1_3[0]`).check(); // F(1) — calendar year
  setText(`${F}.f1_10[0]`, `${d.officerName}, ${d.officerTitle}`); // H — contact
  setText(`${F}.f1_11[0]`, d.phone);
  setText(`${F}.f1_21[0]`, d.officerTitle); // Sign Here — title (signature + date are handwritten)

  // Page 2 header + Part I consent table (7 rows on the official form)
  setText(`${P2}.f2_01[0]`, d.llcName);
  setText(`${P2}.f2_02[0]`, fmtEin(d.ein));
  d.shareholders.slice(0, 7).forEach((sh, i) => {
    const base = i * 7;
    const fieldNum = (col: number) => String(ROW_FIELDS[col] + base).padStart(2, "0");
    const row = `${P2}.Table_Part1[0].Row${i + 1}[0]`;
    setText(`${row}.f2_${fieldNum(0)}[0]`, `${sh.name}\n${sh.address}`); // J
    // K signature + date stay blank — each shareholder signs by hand
    setText(`${row}.f2_${fieldNum(3)}[0]`, `${sh.percentage}%`); // L — percentage of ownership
    setText(`${row}.f2_${fieldNum(4)}[0]`, fmtDate(sh.dateAcquired)); // L — date(s) acquired
    setText(`${row}.f2_${fieldNum(5)}[0]`, `${sh.ssn.slice(0, 3)}-${sh.ssn.slice(3, 5)}-${sh.ssn.slice(5)}`); // M
    setText(`${row}.f2_${fieldNum(6)}[0]`, "12/31"); // N — shareholder tax year end
  });

  form.updateFieldAppearances();
  // Bake values into the page content: copying pages into the merged package
  // doesn't carry the AcroForm along, so unflattened values could vanish.
  form.flatten();
  return doc;
}

function instructionsMarkdown(d: SElectionDetails, deadlineIso: string): string {
  const einLine = d.ein
    ? `The form is completed with your EIN, **${fmtEin(d.ein)}**.`
    : `**Your EIN was not yet available when this package was prepared.** Write it in item A on page 1 (and the box at the top of page 2) before filing — the IRS will not process the form without it.`;
  return `# S CORPORATION ELECTION PACKAGE

**${d.llcName}**

*Prepared by MyFloridaSeriesLLC — please read this page before signing anything.*

## WHAT IS IN THIS PACKAGE

1. This instruction sheet — keep it.
2. A cover letter to the IRS — mail it with the form.
3. **IRS Form 2553, completed and ready to sign** — the election by ${d.llcName} to be taxed as an S corporation effective ${fmtDateLong(d.effectiveDate)}.

${einLine}

## STEP 1 — CHECK THE FORM

Review every entry, especially the company name and address, the EIN, the effective date in item E, and each owner's name, ownership percentage, and Social Security number on page 2. If anything is wrong, contact us before filing.

## STEP 2 — SIGN

- **Officer signature (page 1, bottom):** ${d.officerName}, ${d.officerTitle}, signs and dates the "Sign Here" line. The title is already filled in.
- **Every owner signs page 2:** each shareholder listed in column J must sign and date column K. For an interest held jointly by spouses, **both spouses sign** — each spouse counts as a shareholder who must consent.

An election without every required signature is invalid. Do not leave any consent line blank.

## STEP 3 — FILE IT (DEADLINE: ${fmtDateLong(deadlineIso).toUpperCase()})

The IRS must receive Form 2553 **no later than 2 months and 15 days after the start of the company's first tax year** — for your company, that is **${fmtDateLong(deadlineIso)}**. File as soon as the form is signed; do not wait for the deadline.

Choose ONE of the following. There is no IRS filing fee.

- **Fax (recommended):** ${IRS_FAX}. Keep the fax transmission confirmation with your records — it is your proof of filing.
- **Mail:** ${IRS_MAIL_ADDRESS}. Send it by **certified mail, return receipt requested**, and keep the receipt — a timely postmark by U.S. mail counts as timely filing.

Keep a complete copy of the signed form for the company's records.

## STEP 4 — WATCH FOR THE IRS RESPONSE

The IRS normally mails an acceptance letter (Notice CP261) within about 60 days. Keep it with your permanent records — banks and accountants will ask for it. If you have heard nothing after 90 days, call the IRS Business line at 800-829-4933.

## IMPORTANT REMINDERS

- If this package was prepared close to the deadline above, **file it immediately** — a late election requires a separate IRS relief procedure that is not part of this service.
- The S election changes how the company files and pays federal tax (Form 1120-S, owner payroll, quarterly filings). Work with a tax professional on what comes next.
- This package is document preparation based on the information you provided. It is not legal or tax advice.
`;
}

function coverLetterMarkdown(d: SElectionDetails): string {
  const addr = splitAddress(d.principalAddress);
  return `# ${d.llcName.toUpperCase()}

${addr.street}

${addr.cityStateZip}

[[left]]

Date: _______________________

Department of the Treasury
Internal Revenue Service Center
Ogden, UT 84201

**Re: ${d.llcName}${d.ein ? ` — EIN ${fmtEin(d.ein)}` : ""} — Form 2553, Election by a Small Business Corporation**

To whom it may concern:

Enclosed for filing is Form 2553, electing S corporation status for ${d.llcName}, a Florida limited liability company, effective for the tax year beginning ${fmtDateLong(d.effectiveDate)}. The form has been signed by an officer of the company, and every shareholder has signed the consent statement in Part I.

Please direct any questions regarding this election to ${d.officerName}, ${d.officerTitle}${d.phone ? `, at ${d.phone}` : ""}.

Respectfully,

_____________________________
${d.officerName}, ${d.officerTitle}
${d.llcName}
`;
}

/** The full package: instructions + cover letter + filled Form 2553. The
 *  instruction sheet and cover letter are rendered as separate documents so
 *  the letter always starts on its own page — it gets mailed with the form. */
export async function buildSElectionPackage(d: SElectionDetails): Promise<Uint8Array> {
  const deadline = electionDeadline(d.effectiveDate);
  const title = `S Corporation Election Package — ${d.llcName}`;
  const instructions = await renderMarkdownPdf({
    markdown: instructionsMarkdown(d, deadline),
    watermark: null,
    title,
  });
  const letter = await renderMarkdownPdf({
    markdown: coverLetterMarkdown(d),
    watermark: null,
    title: `Cover Letter — ${d.llcName}`,
    // centered letterhead (name + two address lines); the [[left]] sentinel
    // in the markdown then switches the body to flush left
  });
  const filled = await fillForm2553(d);

  const out = await PDFDocument.create();
  for (const part of [await PDFDocument.load(instructions), await PDFDocument.load(letter), filled]) {
    for (const p of await out.copyPages(part, part.getPageIndices())) out.addPage(p);
  }
  out.setTitle(`S Corporation Election Package — ${d.llcName}`);
  out.setAuthor("MyFloridaSeriesLLC");
  out.setProducer("MyFloridaSeriesLLC document engine");
  return out.save();
}
