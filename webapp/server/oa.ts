/**
 * Operating agreement assembly: transforms the master templates per client
 * inputs. The blank masters live server-side only; every transform asserts
 * its markers so a template drift fails loudly instead of generating a
 * defective legal document.
 */
import { readFileSync } from "node:fs";
import singleTemplateRaw from "./templates-oa-single.md";
import multiTemplateRaw from "./templates-oa-multi.md";
import sCorpTemplateRaw from "./templates-oa-s.md";
import memberTemplateRaw from "./templates-oa-member.md";
import memberSCorpTemplateRaw from "./templates-oa-member-s.md";
import singleSCorpTemplateRaw from "./templates-oa-single-s.md";
import memberSingleTemplateRaw from "./templates-oa-member-single.md";
import memberSingleSCorpTemplateRaw from "./templates-oa-member-single-s.md";
import { taxationLabel } from "./datetime";

/** esbuild bundles .md as text; Bun without the bunfig loader resolves the
 *  import to a file path instead — read it from disk in that case. */
function loadTemplate(v: string): string {
  return v.includes("OPERATING AGREEMENT") ? v : readFileSync(v, "utf8");
}
const singleTemplate = loadTemplate(singleTemplateRaw as string);
const multiTemplate = loadTemplate(multiTemplateRaw as string);
const sCorpTemplate = loadTemplate(sCorpTemplateRaw as string);
const memberTemplate = loadTemplate(memberTemplateRaw as string);
const memberSCorpTemplate = loadTemplate(memberSCorpTemplateRaw as string);
const singleSCorpTemplate = loadTemplate(singleSCorpTemplateRaw as string);
const memberSingleTemplate = loadTemplate(memberSingleTemplateRaw as string);
const memberSingleSCorpTemplate = loadTemplate(memberSingleSCorpTemplateRaw as string);

export const OA_TEMPLATE_VERSION = "First Edition — August 2026";

export interface OaMemberInput {
  name: string; // an individual, or a marital unit ("A and B") — the tenancy goes in jointHolding
  address: string;
  percentage: number; // 100 for single member
  /** How the interest reads in the document — "40%" or "1/3". Falls back to
   *  `percentage` + "%" when absent. */
  percentageLabel?: string;
  contribution: string; // free text, may be ""
  todBeneficiary: string; // "" = none
  /** Humans who sign for this interest — both spouses for a marital unit. */
  signatories?: string[];
  /** The tenancy alone when this interest is held jointly — "tenants by the
   *  entirety". The master's Exhibit A row supplies the words around it. */
  jointHolding?: string;
}

export interface OaSeriesInput {
  name: string; // full filed name
  purpose: string;
  /** Contribution made BY THE COMPANY — every Protected Series is wholly owned
   *  by the Company (ss. 605.2302(1), 605.2303(2), Fla. Stat.), so no member
   *  holds a series-level interest. */
  contribution: string;
}

export interface OaInputs {
  /** Management structure × tax posture. "s" forms are the S corporation
   *  masters and serve any member count; "member*" are member-managed. */
  version:
    | "single" | "single-s" | "member-single" | "member-single-s"
    | "multi" | "s" | "member" | "member-s";
  companyName: string;
  principalAddress: string;
  /** Every person serving as Manager. s. 5.1 makes them act by majority. */
  managerNames: string[];
  effectiveDate: string; // human format e.g. "August 5, 2026"
  amendedRestated: boolean;
  priorAgreementDate: string | null; // known prior generation date, else null
  members: OaMemberInput[];
  series: OaSeriesInput[];
  // multi-member options
  includeCapitalCalls?: boolean;
  capitalCallCap?: number; // dollars
  competition?: "A" | "B";
  includeShotgun?: boolean;
  borrowingThreshold?: number; // dollars
  contributionToCompany?: string; // single-member Exhibit A line
  /** 1-based sequence for this client, so successive drafts are tellable apart. */
  generationNumber?: number;
}

function must(haystack: string, needle: string | RegExp, label: string): void {
  const found = typeof needle === "string" ? haystack.includes(needle) : needle.test(haystack);
  if (!found) throw new Error(`OA template marker missing: ${label}`);
}

function replaceOnce(s: string, from: string | RegExp, to: string, label: string): string {
  must(s, from, label);
  return typeof from === "string" ? s.replace(from, to) : s.replace(from, to);
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Fill slots inside ONE section, leaving every word of the master intact.
 *
 *  This is what replaceSection should always have been. Every sentence a client
 *  receives has to come from a master: the generator may put a value into a
 *  marked slot, choose between alternatives the master spells out, delete an
 *  omitted provision, or repeat a marked block — and nothing else. It may not
 *  compose a sentence. Exhibit A was built from a TypeScript template literal
 *  until 16 August, which is how the S corporation masters' eligible-shareholder
 *  restriction stayed in the master and never reached a signed document.
 *
 *  A missing slot throws rather than passing silently: a slot that is not there
 *  is a master and a generator that disagree about the document's shape. */
function fillSection(
  s: string,
  heading: string,
  slots: Record<string, string>,
  label: string,
): string {
  const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\n## |$)`);
  const m = s.match(re);
  if (!m) throw new Error(`OA template section missing: ${label}`);
  let sec = m[0];
  for (const [slot, val] of Object.entries(slots)) {
    if (!sec.includes(slot)) throw new Error(`OA slot missing in ${label}: ${slot}`);
    sec = sec.split(slot).join(val);
  }
  return s.replace(re, () => sec);
}

/** Repeat a `<!-- repeat:KEY -->…<!-- /repeat -->` block once per row.
 *
 *  Repetition is why Exhibit A was built in code: a table needs one row per
 *  member and a markdown master has a fixed number of them. The master now
 *  carries ONE specimen row inside the marker and this repeats it, so the row a
 *  client sees is the row that was drafted and reviewed. md-to-docx.py strips
 *  HTML comments, so the markers leave no trace in the Word masters. */
function expandRepeat(
  s: string,
  key: string,
  rows: Array<Record<string, string>>,
  label: string,
): string {
  const re = new RegExp(
    `[ \\t]*<!--\\s*repeat:${key}\\s*-->[ \\t]*\\n([\\s\\S]*?)[ \\t]*<!--\\s*/repeat\\s*-->[ \\t]*\\n?`,
  );
  // Every block with this key, not the first: Exhibit A has two — the schedule
  // of interests and the TOD designations — and expanding one of them would
  // leave the other's marker in the delivered document.
  let count = 0;
  while (re.test(s)) {
    const body = (s.match(re) as RegExpMatchArray)[1];
    const out = rows
      .map((r) => {
        // `<!-- if:KEY -->…<!-- /if -->` keeps its contents for a row that
        // supplies a value for KEY and drops them for one that does not. It is
        // how " as tenants by the entirety" can live in the master rather than
        // be pasted on in code: the words are the master's, and the row
        // supplies only the tenancy, or nothing at all.
        let b = body.replace(
          /<!--\s*if:([A-Za-z]+)\s*-->([\s\S]*?)<!--\s*\/if\s*-->/g,
          (_m, key: string, inner: string) => (r[`[${key.toUpperCase()}]`] ? inner : ""),
        );
        for (const [slot, val] of Object.entries(r)) b = b.split(slot).join(val);
        return b;
      })
      // The master decides the spacing, not this function. A table row's block
      // ends in a single newline so the rows stay contiguous — a blank line
      // between them would end the table; a signature block's ends in a blank
      // line so the lines are separated. Joining on "\n" here instead ran every
      // signature together.
      .join("");
    s = s.replace(re, () => out);
    count += 1;
    if (count > 50) throw new Error(`OA repeat:${key} did not terminate (${label})`);
  }
  if (count === 0) throw new Error(`OA template marker missing: repeat:${key} (${label})`);
  return s;
}

/** Choose between the singular and plural wordings the master spells out.
 *
 *  `<!-- one:KEY -->…<!-- /one -->` and `<!-- many:KEY -->…<!-- /many -->` are a
 *  pair of alternatives, exactly like the two competition alternatives in s. 4.7
 *  that this generator has always selected between correctly. One survives; the
 *  other is deleted. Neither is written here.
 *
 *  Throws when a key appears with no pair — a master and a generator that
 *  disagree about which wordings exist should fail the build, not ship whichever
 *  half happens to be present. */
function chooseNumber(s: string, key: string, singular: boolean): string {
  const keep = new RegExp(`<!--\\s*${singular ? "one" : "many"}:${key}\\s*-->([\\s\\S]*?)<!--\\s*/${singular ? "one" : "many"}\\s*-->`, "g");
  const drop = new RegExp(`<!--\\s*${singular ? "many" : "one"}:${key}\\s*-->[\\s\\S]*?<!--\\s*/${singular ? "many" : "one"}\\s*-->`, "g");
  if (!keep.test(s) || !drop.test(s)) {
    throw new Error(`OA template marker missing: one:${key} / many:${key}`);
  }
  keep.lastIndex = 0;
  return s.replace(drop, "").replace(keep, (_m, inner: string) => inner);
}

/** Replace a whole `## HEADING` section (through the next ## or end). */
function replaceSection(s: string, heading: string, replacement: string, label: string): string {
  const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\n## |$)`);
  must(s, re, label);
  return s.replace(re, replacement);
}

function extractSection(s: string, heading: string, label: string): { doc: string; section: string } {
  const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\n## |$)`);
  const m = s.match(re);
  if (!m) throw new Error(`OA template section missing: ${label}`);
  return { doc: s.replace(re, ""), section: m[0] };
}

/** Remove standalone italic instruction notes like *(To omit this provision, ...)* */
function stripInstructionNotes(s: string): string {
  return s
    .replace(/\s*\*\((To omit|Retain the selected|If this Section is omitted)[\s\S]*?\)\*/g, "")
    .replace(/\s*\*\[include only if[\s\S]*?\]\*/g, "")
    .replace(/ \[OPTIONAL PROVISION[\s\S]*?\](?=\*\*|$)/gm, "")
    .replace(/ \[SELECT ONE ALTERNATIVE[\s\S]*?\](?=\*\*|$)/gm, "");
}

export function assembleOa(inputs: OaInputs): { markdown: string; title: string } {
  const TEMPLATES = {
    single: singleTemplate,
    multi: multiTemplate,
    s: sCorpTemplate,
    member: memberTemplate,
    "member-s": memberSCorpTemplate,
    "single-s": singleSCorpTemplate,
    "member-single": memberSingleTemplate,
    "member-single-s": memberSingleSCorpTemplate,
  } as const;
  let s = TEMPLATES[inputs.version];
  /** Every form except the single-member ones shares the multi chassis. */
  const isSingle =
    inputs.version === "single" || inputs.version === "single-s" ||
    inputs.version === "member-single" || inputs.version === "member-single-s";
  const isMulti = !isSingle;
  /** The S corporation forms hardwire identical ownership across all series. */
  const isSCorp =
    inputs.version === "s" || inputs.version === "member-s" ||
    inputs.version === "single-s" || inputs.version === "member-single-s";
  /** Member-managed forms have no Manager to name. */
  const isMemberManaged =
    inputs.version === "member" || inputs.version === "member-s" ||
    inputs.version === "member-single" || inputs.version === "member-single-s";
  const co = inputs.companyName;

  // ---- global fields ----
  must(s, "[COMPANY NAME], LLC", "company name");
  s = s.split("[COMPANY NAME], LLC").join(co);
  s = s.split("[COMPANY NAME]").join(co); // any stragglers
  s = replaceOnce(s, "effective as of [DATE] (the \"Effective Date\")", `effective as of ${inputs.effectiveDate} (the "Effective Date")`, "effective date");
  s = s.split("[PRINCIPAL ADDRESS]").join(inputs.principalAddress);
  // Managers are almost always the members themselves, and there is often more
  // than one of them. The appointment sentence and the signature block are built
  // from the list; s. 5.1's majority rule then governs every later reference to
  // "the Manager" without pluralising each one.
  const managerNames = (inputs.managerNames ?? []).map((n) => n.trim()).filter(Boolean);
  const managerList = managerNames.join(", ");
  // Member-managed masters name no Manager at all.
  if (!isMemberManaged) {
    if (managerNames.length === 0) throw new Error("OA: at least one manager is required");
    // Both numbers are written out in the master and one is chosen here. Until
    // 17 August this sentence — "The initial Managers are X and Y." — was
    // composed in TypeScript, along with the signature label, the
    // acknowledgment heading and the Series Exhibit adoption line. They were
    // the last legal text in a delivered agreement that Adam could not find by
    // reading a master.
    s = chooseNumber(s, "manager", managerNames.length === 1);
    const bold = managerNames.map((n) => `**${n}**`);
    s = s.split("[MANAGER NAMES]").join(
      bold.length === 1 ? bold[0] : `${bold.slice(0, -1).join(", ")} and ${bold[bold.length - 1]}`,
    );
    s = expandRepeat(
      s,
      "manager",
      managerNames.map((n) => ({ "[MANAGER NAME]": n })),
      "manager signatures",
    );
  }

  // A borrowing threshold belongs to an "Actions Requiring Member Approval"
  // provision, and every form has one EXCEPT the member-managed single-member
  // agreement: there the Member manages, so an approval gate would be the Member
  // consenting to themselves and the provision does not exist. Making this
  // unconditional on 16 August was right for the five forms that existed then and
  // wrong the moment a form without the gate was added. Derived from the two
  // predicates rather than listed by name, so the next member-managed
  // single-member form is covered without anyone remembering to add it.
  const hasBorrowingThreshold = !(isMemberManaged && isSingle);
  if (hasBorrowingThreshold) {
    must(s, "$[THRESHOLD]", "threshold");
    // No default. A number governing when the Manager needs the Member's
    // written consent is not something to supply on the client's behalf; a
    // missing one fails here rather than printing $25,000 into a signed
    // instrument that nobody chose.
    if (inputs.borrowingThreshold === undefined) {
      throw new Error("OA: this form has a Section 5.4 approval gate and no borrowing limit was given");
    }
    s = s.split("$[THRESHOLD]").join(money(inputs.borrowingThreshold));
  }

  // ---- multi-member options (every form but the single-member one) ----
  if (isMulti) {

    // Capital calls
    if (inputs.includeCapitalCalls) {
      // No default, for the same reason as the borrowing threshold: an annual
      // per-owner capital-call ceiling is the client's decision. This one is
      // unreachable today — the server requires a cap whenever capital calls
      // are included — but a default that is safe only because of a condition
      // somewhere else is a default waiting for that condition to move.
      if (inputs.capitalCallCap === undefined) {
        throw new Error("OA: capital calls are included but no annual cap was given");
      }
      s = s.split("$[CAP]").join(money(inputs.capitalCallCap));
    } else {
      s = replaceSectionBody(s, /\*\*6\.2 Additional Capital Contributions\.[^\n]*\n[\s\S]*?(?=\n\*\*6\.3)/, "**6.2 Additional Capital Contributions.** [Reserved.]\n\n", "6.2 omit");
      s = replaceSectionBody(s, /\*\*6\.3 Failure to Contribute\.\*\*[\s\S]*?(?=\n\*\*6\.4)/, "**6.3 Failure to Contribute.** [Reserved.]\n\n", "6.3 omit");
      s = replaceSectionBody(s, /\(a\) \*\[include only if optional Section 6\.2[\s\S]*?\]\*[\s\S]*?; \(b\)/, "(a) [Reserved.]; (b)", "11.1(a) reserve");
    }

    // Competition alternative
    const altA = s.match(/\*\*\[ \] Alternative A — Noncompetition\.\*\*([\s\S]*?)(?=\n\*\*\[ \] Alternative B)/);
    const altB = s.match(/\*\*\[ \] Alternative B — Competition Permitted\.\*\*([\s\S]*?)(?=\n\n\*\*4\.8)/);
    if (!altA || !altB) throw new Error("OA template marker missing: 4.7 alternatives");
    const chosen = (inputs.competition === "B" ? altB[1] : altA[1]).trim();
    s = replaceSectionBody(
      s,
      /\*\*4\.7 Competition\.[^\n]*\n[\s\S]*?(?=\n\n\*\*4\.8)/,
      `**4.7 Competition.** ${chosen}\n`,
      "4.7 rebuild",
    );
    if (inputs.competition === "B") {
      s = replaceSectionBody(s, /\(c\) \*\[include only if Section 4\.7 Alternative A[\s\S]*?\]\*[\s\S]*?; \(d\)/, "(c) [Reserved.]; (d)", "11.1(c) reserve");
    }

    // The Manager's parallel provision takes the SAME answer — the questionnaire
    // asks once, and a delivered agreement must never carry both alternatives.
    // Present only in the manager-managed masters that have a s. 4.7; the
    // single-member master's s. 4.5 already covers the Member and the Manager.
    const mgr = s.match(/\*\*(5\.\d+) Competition; Other Activities of the Manager\./);
    if (mgr) {
      const mA = s.match(/\*\*\[ \] Alternative A — Noncompetition\.\*\* Before the dissolution of the Company, the Manager([\s\S]*?)(?=\n\*\*\[ \] Alternative B)/);
      const mB = s.match(/\*\*\[ \] Alternative B — Competition Permitted\.\*\* The Manager([\s\S]*?)(?=\n---|\n## ARTICLE 6)/);
      if (!mA || !mB) throw new Error("OA template marker missing: manager competition alternatives");
      const pick =
        inputs.competition === "B"
          ? `The Manager${mB[1]}`.replace(/\s*\*\(Retain the Alternative[^)]*\)\*/, "")
          : `Before the dissolution of the Company, the Manager${mA[1]}`;
      s = replaceSectionBody(
        s,
        new RegExp(`\\*\\*${mgr[1]} Competition; Other Activities of the Manager\\.[^\\n]*\\n[\\s\\S]*?(?=\\n---|\\n## ARTICLE 6)`),
        `**${mgr[1]} Competition; Other Activities of the Manager.** ${pick.trim()}\n`,
        "manager competition rebuild",
      );
    }

    // Shotgun
    if (!inputs.includeShotgun) {
      s = replaceSectionBody(s, /\*\*13\.2 Deadlock; Buy-Sell Election\.[^\n]*\*\*[\s\S]*?(?=\n---|\n## ARTICLE 14)/, "**13.2 Deadlock; Buy-Sell Election.** [Reserved.]\n\n", "13.2 omit");
    }
  }

  s = stripInstructionNotes(s);

  // ---- Amended & Restated ----
  let titleName = "OPERATING AGREEMENT";
  if (inputs.amendedRestated) {
    titleName = "AMENDED AND RESTATED OPERATING AGREEMENT";
    s = replaceOnce(s, "# OPERATING AGREEMENT", "# AMENDED AND RESTATED\n# OPERATING AGREEMENT", "title");
    s = replaceOnce(s, "THIS OPERATING AGREEMENT (this \"Agreement\")", "THIS AMENDED AND RESTATED OPERATING AGREEMENT (this \"Agreement\")", "preamble");
    const supersede = inputs.priorAgreementDate
      ? `the Operating Agreement of the Company dated ${inputs.priorAgreementDate}`
      : "any and all prior operating agreements of the Company, whether written or oral";
    s = replaceOnce(
      s,
      "NOW, THEREFORE,",
      `D. This Agreement amends, restates, and supersedes in its entirety ${supersede}, which shall be of no further force or effect from the Effective Date.\n\nNOW, THEREFORE,`,
      "supersede recital",
    );
  }

  // ---- Exhibit A ----
  // Slots only. The master's Exhibit A is its own drafting — including the
  // sentence about who may inherit, and in the S corporation forms the
  // restriction that the beneficiary be an eligible shareholder. A sole member
  // needs no repetition: one member, one row, so every word here is the
  // master's and the generator supplies four values.
  if (isSingle) {
    const m = inputs.members[0];
    s = fillSection(
      s,
      "EXHIBIT A — MEMBER; CONTRIBUTIONS; TOD DESIGNATION",
      {
        "$[AMOUNT] [and/or described property]":
          inputs.contributionToCompany || m.contribution || "—",
        "[DATE]": inputs.effectiveDate,
        // The master's own sentence carries the fallback: "…shall pass to:
        // **X**, or if none is designated or the designation fails, the
        // Membership Interest passes as provided by law." So an absent
        // beneficiary is a value, not a different sentence.
        "[TOD BENEFICIARY NAME(S)]": m.todBeneficiary || "None",
      },
      "Exhibit A single",
    );
  } else {
    // The master carries ONE specimen row inside a repeat marker for each of
    // the two tables; this fills it once per member. Every heading, every
    // column, the Total row and the sentence about a failed designation are the
    // master's own words — the generator supplies five values per member and
    // nothing else.
    const pctOf = (m: OaMemberInput) => m.percentageLabel ?? `${m.percentage}%`;
    const rows = inputs.members.map((m) => ({
      "[MEMBER NAME]": m.name,
      "[MEMBER ADDRESS]": m.address,
      "[MEMBER SHARE]": pctOf(m),
      "[MEMBER CONTRIBUTION]": m.contribution || "—",
      "[MEMBER DATE]": inputs.effectiveDate,
      "[MEMBER TOD]": m.todBeneficiary || "None",
      // Empty for an individual, which drops the master's " as […]" fragment.
      // The name matches the marker that guards it — <!-- if:holding --> looks
      // up [HOLDING] — so a renamed slot cannot silently stop guarding.
      "[HOLDING]": m.jointHolding ?? "",
    }));
    s = expandRepeat(s, "member", rows, "Exhibit A multi");
  }

  // ---- Series Exhibits + Asset Schedules ----
  const ex1 = extractSection(s, "SERIES EXHIBIT PS-[N]", "series exhibit template");
  s = ex1.doc;
  const ex2 = extractSection(s, "ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N]", "asset schedule template");
  s = ex2.doc;

  const exhibits: string[] = [];
  inputs.series.forEach((ser, idx) => {
    const n = idx + 1;
    let ex = ex1.section;
    ex = ex.replace("## SERIES EXHIBIT PS-[N]", `## SERIES EXHIBIT ${n}`);
    ex = ex.replace(/\*\*Protected Series name \(exactly as filed with the Department\):\*\*\n\*\*[^\n]+\*\*/, `**Protected Series name (exactly as filed with the Department):**\n**${ser.name}**`);
    ex = ex.replace(/\| Purpose of this Protected Series \|[^\n]*\|/, `| Purpose of this Protected Series | ${ser.purpose || "Any lawful business, purpose, or activity"} |`);
    // Member-managed Series Exhibits carry a fixed "Managed by" row instead.
    if (!isMemberManaged) {
      ex = ex.replace(/\| Protected Series Manager \|[^\n]*\|/, `| Protected Series Manager | ${managerList} |`);
    }
    ex = ex.replace(/\| Contributions to this Protected Series \|[^\n]*\|/, `| Contributions to this Protected Series | ${ser.contribution || "—"} |`);
    ex = ex.replace(/\| Special terms \(if any\) \|[^\n]*\|/, "| Special terms (if any) | None |");
    ex = ex.replace(/\| Dissolution events[^\n]*\|[^\n]*\|/, "| Dissolution events specific to this Protected Series (if any) | None |");
    // Each Protected Series is owned by the Company, so the Series Exhibit is
    // adopted by whoever acts for the Company — the Manager, or all Members in
    // a member-managed company.
    // Whoever adopts it signs on the master's own line: every Member in a
    // member-managed company, every Manager otherwise. The line, its rule and
    // its ", Member" / ", Protected Series Manager" suffix are all the master's.
    const adopters = isMemberManaged
      ? inputs.members.flatMap((m) => m.signatories ?? [m.name])
      : managerNames;
    ex = expandRepeat(
      ex,
      "adopter",
      adopters.map((n) => ({ "[ADOPTER NAME]": n })),
      "series exhibit adoption",
    );
    ex = ex
      .replace(
        "Adopted effective [DATE] by the Company, acting through its Manager:",
        `Adopted effective [DATE] by the Company, acting through its ${managerNames.length > 1 ? "Managers" : "Manager"}:`,
      )
      .split("effective [DATE]").join(`effective ${inputs.effectiveDate}`);
    let sched = ex2.section.replace(
      "## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N]",
      `## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT ${n} (${ser.name})`,
    );
    exhibits.push("[[pagebreak]]\n\n" + ex.trim() + "\n\n[[pagebreak]]\n\n" + sched.trim());
  });

  // ---- signatures ----
  if (isSingle) {
    s = s.split("[MEMBER NAME]").join(inputs.members[0].name);
    s = s.split("[ADDRESS]").join(inputs.members[0].address);
  } else {
    // One line per human who signs — both spouses for a marital unit — and the
    // line is the master's own. signatureBlock() used to build a heading here
    // ("**A and B, husband and wife, as tenants by the entirety:**"), which was
    // prose composed in TypeScript AND a second statement of a fact Exhibit A
    // already carries in the member-name cell. Deleted on both counts.
    s = expandRepeat(
      s,
      "signatory",
      inputs.members.flatMap((m) => (m.signatories ?? [m.name]).map((n) => ({ "[SIGNATORY NAME]": n }))),
      "member signatures",
    );
  }

  // Signatures start a fresh page — it is the page people detach, sign, and
  // scan back, and it should never begin halfway down a page of Article 16.
  s = s.replace(/\n## SIGNATURES/, "\n[[pagebreak]]\n\n## SIGNATURES");


  // append instantiated series exhibits
  s = s.trimEnd() + "\n\n" + exhibits.join("\n\n") + `\n\n*${titleName} of ${co} — generated by MyFloridaSeriesLLC · Master ${OA_TEMPLATE_VERSION}*\n`;

  // Strip the internal draft footer from the FINISHED document. It cannot be
  // done earlier: the Asset Schedule is the master's last section, so pulling
  // it out as a template carries the footer with it, and every instantiated
  // copy keeps one. A client's signed agreement said "v1 draft" because of it.
  s = s.replace(/\*Form document —[\s\S]*?\*(?=\s*(\n|$))/g, "").replace(/\n{3,}/g, "\n\n");

  if (/Form document —|v1 draft/.test(s)) {
    throw new Error("OA assembly leaked the internal draft footer into the client document");
  }

  // The exhibit templates end with their own page break and the assembler adds
  // one between exhibits, so a run of them would print a blank page.
  s = s.replace(/(\[\[pagebreak\]\]\s*){2,}/g, "[[pagebreak]]\n\n");

  const seq = inputs.generationNumber ? ` (No. ${inputs.generationNumber})` : "";
  // The taxation designation leads the name: a client holding three PDFs should
  // be able to tell the S corporation form from the partnership form without
  // opening any of them.
  const tax = taxationLabel(inputs.version);
  return {
    markdown: s,
    title: `${inputs.amendedRestated ? "Amended and Restated " : ""}${tax} Operating Agreement${seq} — ${co}`,
  };
}

/** Signature lines, with jointly-held interests grouped under a heading so a
 *  married couple reads as one owner signing together rather than two owners. */

function replaceSectionBody(s: string, re: RegExp, replacement: string, label: string): string {
  if (!re.test(s)) throw new Error(`OA template marker missing: ${label}`);
  return s.replace(re, replacement);
}
