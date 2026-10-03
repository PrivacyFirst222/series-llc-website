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
import { isValidEin } from "../src/lib/ein";
import { form2553Deadline, FORM2553_DEADLINE_NOTICE } from "../src/lib/form2553Timing";
import { type JointKind, columnJText, isJoint, jointDisplayName, ssnColumnText } from "../src/lib/jointOwner";
import { PDFDocument, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import f2553Base64 from "./assets/f2553-b64";
import { renderMarkdownPdf } from "./pdf-render";

export const IRS_MAIL_ADDRESS = "Department of the Treasury, Internal Revenue Service Center, Ogden, UT 84201";
export const IRS_FAX = "855-214-7520";

export interface SElectionShareholder {
  name: string;
  address: string;
  percentage: number;
  dateAcquired: string; // YYYY-MM-DD
  /** 9 digits, or the last 4 alone on a record copy. */
  ssn: string;
  /** A jointly held interest (Adam, 6 Sep 2026): the co-owner's name and
   *  number; column J names both, column M lists both. */
  joint?: JointKind;
  name2?: string;
  ssn2?: string;
  /** The co-owner's own address when they live apart. */
  address2?: string;
}

export interface SElectionDetails {
  llcName: string;
  principalAddress: string; // legacy display address
  principalAddressParts?: { address1?: string; address2?: string; city?: string; state?: string; zip?: string };
  ein: string; // issued EIN: 9 digits
  dateIncorporated: string; // YYYY-MM-DD (Articles filing date)
  effectiveDate: string; // YYYY-MM-DD (item E)
  officerName: string;
  officerTitle: string;
  phone: string;
  shareholders: SElectionShareholder[];
  /** Record copy: the Social Security numbers are gone for good, so the form
   *  shows only their last four digits and every page is stamped unfileable.
   *  An election with incomplete SSNs is invalid, and a client who mailed one
   *  would lose the election — the stamp is the whole point. */
  recordCopy?: boolean;
}

const F = "topmostSubform[0].Page1[0]";
const P2 = "topmostSubform[0].Page2[0]";
/** Row field-number offsets: J name/address, K sig, K date, L shares/%, L date acquired, M SSN, N year end. */
const ROW_FIELDS = [3, 4, 5, 6, 7, 8, 9] as const;

/** Ten stored digits as (xxx) xxx-xxxx; anything else as given. */
export function fmtPhone(digits: string): string {
  const d = (digits ?? "").replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : digits;
}

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

/** Adam, Batch 13: filing packages require an issued EIN. */
function fmtEin(ein: string): string {
  return `${ein.slice(0, 2)}-${ein.slice(2)}`;
}

/** Filing deadline: 2 months and 15 days after the election's effective
 *  date, by the IRS's own rule (Instructions for Form 2553, "When To Make
 *  the Election"). The earlier version here added two months by calendar
 *  overflow and 14 days, which put a December 31 formation at March 17; the
 *  IRS says March 15. One rule now, shared with the portal's timing gate. */
export function electionDeadline(startIso: string): string {
  return form2553Deadline(startIso);
}

/** Prefer the saved address fields. Legacy comma-separated addresses have two
 * supported endings: "city, ST ZIP" and "city, ST, ZIP". Unknown layouts
 * stay intact on the street line; do not guess away an address component. */
function splitAddress(addr: string, fields?: SElectionDetails["principalAddressParts"]): { street: string; cityStateZip: string } {
  if (fields?.address1?.trim() && fields.city?.trim() && fields.state?.trim() && fields.zip?.trim()) {
    return { street: [fields.address1, fields.address2].map(s => s?.trim()).filter(Boolean).join(", "),
      cityStateZip: `${fields.city.trim()}, ${fields.state.trim()} ${fields.zip.trim()}` };
  }
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  const last = parts.at(-1) ?? "";
  if (parts.length >= 4 && /^\d{5}(?:-\d{4})?$/.test(last) && /^[A-Za-z]{2}$/.test(parts.at(-2) ?? "")) {
    return { street: parts.slice(0, -3).join(", "), cityStateZip: `${parts.at(-3)}, ${parts.at(-2)} ${last}` };
  }
  if (parts.length >= 3 && /^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/.test(last)) {
    return { street: parts.slice(0, -2).join(", "), cityStateZip: `${parts.at(-2)}, ${last}` };
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
    // Allow longer values where the original form field limit is too small.
    const max = field.getMaxLength();
    if (max !== undefined && value.length > max) field.setMaxLength(undefined);
    field.setText(value);
  };
  const addr = splitAddress(d.principalAddress, d.principalAddressParts);

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
  setText(`${F}.f1_11[0]`, fmtPhone(d.phone)); // H — telephone as (xxx) xxx-xxxx (Adam, 7 Sep 2026)
  setText(`${F}.f1_21[0]`, d.officerTitle); // Sign Here — title (signature + date are handwritten)

  // Page 2 header + Part I consent table (7 rows on the official form)
  setText(`${P2}.f2_01[0]`, d.llcName);
  setText(`${P2}.f2_02[0]`, fmtEin(d.ein));
  d.shareholders.slice(0, 7).forEach((sh, i) => {
    const base = i * 7;
    const fieldNum = (col: number) => String(ROW_FIELDS[col] + base).padStart(2, "0");
    const row = `${P2}.Table_Part1[0].Row${i + 1}[0]`;
    setText(`${row}.f2_${fieldNum(0)}[0]`, columnJText(sh)); // J
    // K signature + date stay blank — each shareholder signs by hand
    setText(`${row}.f2_${fieldNum(3)}[0]`, `${sh.percentage}%`); // L — percentage of ownership
    setText(`${row}.f2_${fieldNum(4)}[0]`, fmtDate(sh.dateAcquired)); // L — date(s) acquired
    // M — a joint row stacks both numbers on two lines, as on Adam's sample;
    // the cell is single-line and narrow, so it is opened up and set smaller.
    const mField = `${row}.f2_${fieldNum(5)}[0]`;
    if (isJoint(sh.joint) && sh.ssn2) {
      const f = form.getTextField(mField);
      f.enableMultiline();
      f.setFontSize(7);
    }
    setText(mField, ssnColumnText(sh.ssn, sh.ssn2, sh.joint, Boolean(d.recordCopy)));
    setText(`${row}.f2_${fieldNum(6)}[0]`, "12/31"); // N — shareholder tax year end
  });

  form.updateFieldAppearances();
  // Bake values into the page content: copying pages into the merged package
  // doesn't carry the AcroForm along, so unflattened values could vanish.
  form.flatten();
  return doc;
}

/** Part I's consent columns, continued past the form's seven rows. */
function continuationMarkdown(d: SElectionDetails, extra: SElectionShareholder[]): string {
  const cell = (s: string) => s.replace(/\s*\n\s*/g, "; ").replace(/\|/g, "/");
  const rows = extra.map((sh, i) => `| ${i + 8} | ${cell(columnJText(sh))} | | ${sh.percentage}%; ${fmtDate(sh.dateAcquired)} | ${cell(ssnColumnText(sh.ssn, sh.ssn2, sh.joint, Boolean(d.recordCopy)))} | 12/31 |`).join("\n");
  return `# FORM 2553 — CONTINUATION OF PART I, SHAREHOLDERS' CONSENT STATEMENT

**${d.llcName}**${d.ein ? ` · EIN ${fmtEin(d.ein)}` : ""}

The official form lists seven shareholders on page 2. The shareholders below are listed in the same columns and each must sign and date column K here, exactly as on page 2.

| | J — Name and address of each shareholder | K — Signature and date | L — Stock owned or percentage; date(s) acquired | M — Social security number | N — Tax year ends |
|---|---|---|---|---|---|
${rows}
`;
}

function instructionsMarkdown(d: SElectionDetails): string {
  const einLine = `The form is completed with your EIN, **${fmtEin(d.ein)}**.`;
  if (d.recordCopy) {
    return `# S CORPORATION ELECTION PACKAGE — RECORD COPY

**${d.llcName}**

## DO NOT FILE THIS COPY

The two-week period for changing this package has passed, and every Social Security number has been permanently deleted from our systems, as we said it would be. The Form 2553 in this copy shows only the last four digits of each number.

**An election filed with incomplete Social Security numbers is invalid.** Do not sign or mail this copy. It is here so you keep a record of what was prepared for ${d.llcName} — the election to be taxed as an S corporation effective ${fmtDateLong(d.effectiveDate)}, prepared with ${d.ein ? `EIN **${fmtEin(d.ein)}**` : "no EIN on file"}.

If you still need to file, contact us and we will prepare a new package.

## WHAT IS IN THIS COPY

1. This notice.
2. The cover letter as it was prepared.
3. **IRS Form 2553 as it was completed**, with the Social Security numbers removed.

${FORM2553_DEADLINE_NOTICE} If the deadline has passed, discuss late-election relief with your tax professional.
`;
  }
  return `# S CORPORATION ELECTION PACKAGE

**${d.llcName}**

*Prepared by MyFloridaSeriesLLC — please read this page before signing anything.*

## WHAT IS IN THIS PACKAGE

1. This instruction sheet — keep it.
2. A cover letter to the IRS — fax or mail it with the form.
3. **IRS Form 2553, completed and ready to sign** — the election by ${d.llcName} to be taxed as an S corporation effective ${fmtDateLong(d.effectiveDate)}.

${einLine}

## STEP 1 — CHECK THE FORM

Review every entry, especially the company name and address, the EIN, the effective date in item E, and each owner's name, ownership percentage, and Social Security number on page 2. If anything is wrong, contact us before filing.

## STEP 2 — SIGN

- **Officer signature (page 1, bottom):** ${d.officerName}, ${d.officerTitle}, signs and dates the "Sign Here" line. The title is already filled in.
- **Every owner signs page 2:** each shareholder listed in column J must sign and date column K. For an interest held jointly — tenants by the entirety or joint tenants with right of survivorship — **both co-owners sign** that row's line; both are named in column J and both Social Security numbers appear in column M, because each is a shareholder who must consent.${d.shareholders.some((s) => isJoint(s.joint)) ? `\n\n  Jointly held on this form: ${d.shareholders.filter((s) => isJoint(s.joint)).map((s) => jointDisplayName(s.name, s.name2, s.joint)).join("; ")}.` : ""}

${d.shareholders.length > 7 ? `- **Owners eight onward sign the continuation sheet** at the back of this package: the form holds seven, so ${d.shareholders.length - 7} owner${d.shareholders.length - 7 === 1 ? " is" : "s are"} listed there in the same columns, and each signs and dates column K on that sheet. File it with the form.\n\n` : ""}An election without every required signature is invalid. Do not leave any consent line blank.

## STEP 3 — FILE IT

${FORM2553_DEADLINE_NOTICE} File as soon as the form is signed; do not wait for the deadline.

Choose ONE of the following. There is no IRS filing fee.

- **Fax (recommended):** ${IRS_FAX}. Keep the fax transmission confirmation with your records — it is your proof of filing.
- **Mail:** ${IRS_MAIL_ADDRESS}. Send it by **certified mail, return receipt requested**, and keep the receipt — a timely postmark by U.S. mail counts as timely filing.

Keep a complete copy of the signed form for the company's records.

## STEP 4 — WATCH FOR THE IRS RESPONSE

The IRS generally sends an acceptance or nonacceptance notice within about 60 days. Keep the notice with your permanent records. If you have not received a notice within two months of the date you faxed or mailed Form 2553, call the IRS Business line at 800-829-4933. The IRS instructions allow five months if box Q1 in Part II is checked; this package selects a calendar tax year and does not check Q1.

## IMPORTANT REMINDERS

- If this package was prepared close to the deadline above, **file it immediately** — a late election requires a separate IRS relief procedure that is not part of this service.
- The S election changes how the company files and pays federal tax (Form 1120-S, owner payroll, quarterly filings). Work with a tax professional on what comes next.
- This package is document preparation based on the information you provided. It is not legal or tax advice.
`;
}

function coverLetterMarkdown(d: SElectionDetails): string {
  const addr = splitAddress(d.principalAddress, d.principalAddressParts);
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

Please direct any questions regarding this election to ${d.officerName}, ${d.officerTitle}${d.phone ? `, at ${fmtPhone(d.phone)}` : ""}.

Respectfully,

_____________________________
${d.officerName}, ${d.officerTitle}
${d.llcName}
`;
}

/** The full package: instructions + cover letter + filled Form 2553. The
 *  instruction sheet and cover letter are rendered as separate documents so
 *  the letter always starts on its own page — it gets mailed with the form. */
/** Marks every page of a record copy so it cannot be mistaken for the filing
 *  copy: a red line across the top and a diagonal across the middle. */
async function stampRecordCopy(doc: PDFDocument): Promise<void> {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.72, 0.11, 0.11);
  const top = "RECORD COPY — SOCIAL SECURITY NUMBERS REMOVED — DO NOT FILE THIS COPY WITH THE IRS";
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = 7.5;
    const w = bold.widthOfTextAtSize(top, size);
    page.drawText(top, { x: Math.max(6, (width - w) / 2), y: height - 12, size, font: bold, color: red });
    page.drawText("RECORD COPY", {
      x: width * 0.16,
      y: height * 0.34,
      size: 54,
      font: bold,
      color: red,
      opacity: 0.12,
      rotate: degrees(32),
    });
  }
}

export async function buildSElectionPackage(d: SElectionDetails): Promise<Uint8Array> {
  if (!isValidEin(d.ein)) throw new Error("An issued EIN is required before preparing Form 2553.");
  // Retain validation of the formation effective date even though no due date is printed.
  electionDeadline(d.effectiveDate);
  const title = `S Corporation Election Package — ${d.llcName}`;
  const instructions = await renderMarkdownPdf({
    markdown: instructionsMarkdown(d),
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
  // The IRS form's page 2 holds seven consent rows; owners eight onward go on
  // a continuation sheet in the same columns (Adam, 14 Sep 2026: up to the
  // 100 the IRS allows).
  const extra = d.shareholders.slice(7);
  const continuation = extra.length > 0
    ? await PDFDocument.load(await renderMarkdownPdf({ markdown: continuationMarkdown(d, extra), watermark: null, title: `Form 2553 continuation — ${d.llcName}` }))
    : null;

  const out = await PDFDocument.create();
  for (const part of [await PDFDocument.load(instructions), await PDFDocument.load(letter), filled, ...(continuation ? [continuation] : [])]) {
    for (const p of await out.copyPages(part, part.getPageIndices())) out.addPage(p);
  }
  if (d.recordCopy) await stampRecordCopy(out);
  out.setTitle(`S Corporation Election Package — ${d.llcName}`);
  out.setAuthor("MyFloridaSeriesLLC");
  out.setProducer("MyFloridaSeriesLLC document engine");
  return out.save();
}
