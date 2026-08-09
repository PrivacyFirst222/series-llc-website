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

export const OA_TEMPLATE_VERSION = "First Edition — August 2026";

export interface OaMemberInput {
  name: string; // an individual, or a marital unit ("A and B, husband and wife, as tenants by the entireties")
  address: string;
  percentage: number; // 100 for single member
  /** How the interest reads in the document — "40%" or "1/3". Falls back to
   *  `percentage` + "%" when absent. */
  percentageLabel?: string;
  contribution: string; // free text, may be ""
  todBeneficiary: string; // "" = none
  /** Humans who sign for this interest — both spouses for a marital unit. */
  signatories?: string[];
  /** Present when this interest is held jointly, e.g. "husband and wife, as
   *  tenants by the entireties" — drives the joint signature block. */
  jointHolding?: string;
}

export interface OaSeriesInput {
  name: string; // full filed name
  purpose: string;
  associated: {
    memberName: string;
    seriesPercentage: number;
    seriesPercentageLabel?: string;
    signatories?: string[];
    jointHolding?: string;
  }[]; // single-member: sole member 100
  contribution: string;
}

export interface OaInputs {
  /** Management structure × tax posture. "s" forms are the S corporation
   *  masters and serve any member count; "member*" are member-managed. */
  version: "single" | "multi" | "s" | "member" | "member-s";
  companyName: string;
  principalAddress: string;
  managerName: string;
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
  } as const;
  let s = TEMPLATES[inputs.version];
  /** Every form except the single-member one shares the multi chassis. */
  const isMulti = inputs.version !== "single";
  /** The S corporation forms hardwire identical ownership across all series. */
  const isSCorp = inputs.version === "s" || inputs.version === "member-s";
  /** Member-managed forms have no Manager to name. */
  const isMemberManaged = inputs.version === "member" || inputs.version === "member-s";
  const co = inputs.companyName;

  // ---- global fields ----
  must(s, "[COMPANY NAME], LLC", "company name");
  s = s.split("[COMPANY NAME], LLC").join(co);
  s = s.split("[COMPANY NAME]").join(co); // any stragglers
  s = replaceOnce(s, "effective as of [DATE] (the \"Effective Date\")", `effective as of ${inputs.effectiveDate} (the "Effective Date")`, "effective date");
  s = s.split("[PRINCIPAL ADDRESS]").join(inputs.principalAddress);
  // Member-managed masters name no Manager at all.
  if (!isMemberManaged) {
    s = s.split("**[MANAGER NAME]**").join(`**${inputs.managerName}**`);
    s = s.split("[MANAGER NAME], Manager").join(`${inputs.managerName}, Manager`);
    s = s.split("[MANAGER NAME]").join(inputs.managerName);
  }

  // ---- multi-member options (every form but the single-member one) ----
  if (isMulti) {
    must(s, "$[THRESHOLD]", "threshold");
    s = s.split("$[THRESHOLD]").join(money(inputs.borrowingThreshold ?? 25000));

    // Capital calls
    if (inputs.includeCapitalCalls) {
      s = s.split("$[CAP]").join(money(inputs.capitalCallCap ?? 25000));
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
  if (inputs.version === "single") {
    const m = inputs.members[0];
    const exhibitA = `## EXHIBIT A — MEMBER; CONTRIBUTIONS; TOD DESIGNATION

**Company:** ${co}

| Item | Information |
|---|---|
| Member name | ${m.name} |
| Member address | ${m.address} |
| Membership Interest | 100% (single class) |
| Initial contribution to the Company | ${inputs.contributionToCompany || m.contribution || "—"} |
| Date of contribution | ${inputs.effectiveDate} |

**Transfer on Death designation (ss. 711.50–711.512, Fla. Stat.):**

Upon the death of the Member, the Membership Interest shall pass to: **${m.todBeneficiary || "No beneficiary designated"}**${m.todBeneficiary ? "" : " — the Membership Interest passes as provided by law"}, subject in all events to this Agreement.
`;
    s = replaceSection(s, "EXHIBIT A — MEMBER; CONTRIBUTIONS; TOD DESIGNATION", "[[pagebreak]]\n\n" + exhibitA, "Exhibit A single");
  } else {
    const pctOf = (m: OaMemberInput) => m.percentageLabel ?? `${m.percentage}%`;
    const rows = inputs.members
      .map((m) => `| ${m.name} | ${m.address} | ${pctOf(m)} | ${m.contribution || "—"} | ${inputs.effectiveDate} |`)
      .join("\n");
    const todRows = inputs.members.map((m) => `| ${m.name} | ${m.todBeneficiary || "None"} |`).join("\n");
    const exhibitA = `## EXHIBIT A — MEMBERS; PERCENTAGE INTERESTS; CONTRIBUTIONS; TOD DESIGNATIONS

**Company:** ${co}

| Member name | Address | Percentage Interest | Initial contribution to the Company | Date |
|---|---|---|---|---|
${rows}
| **Total** | | **100%** | | |

**Transfer on Death designations (ss. 711.50–711.512, Fla. Stat.):**

| Designating Member | TOD beneficiary (any person or entity) |
|---|---|
${todRows}

If no beneficiary is designated, or a designation fails, the Member's interest passes as provided by law, subject to this Agreement.
`;
    s = replaceSection(s, "EXHIBIT A — MEMBERS; PERCENTAGE INTERESTS; CONTRIBUTIONS; TOD DESIGNATIONS", "[[pagebreak]]\n\n" + exhibitA, "Exhibit A multi");
  }

  // ---- Series Exhibits + Asset Schedules ----
  const ex1 = extractSection(s, "SERIES EXHIBIT PS-[N]", "series exhibit template");
  s = ex1.doc;
  const ex2 = extractSection(s, "ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N]", "asset schedule template");
  s = ex2.doc;

  const exhibits: string[] = [];
  inputs.series.forEach((ser, idx) => {
    const n = idx + 1;
    const assoc =
      ser.associated.length > 0
        ? ser.associated.map((a) => `${a.memberName} — ${a.seriesPercentageLabel ?? `${a.seriesPercentage}%`}`).join("; ")
        : "None — the Company is the deemed sole Associated Member";
    let ex = ex1.section;
    ex = ex.replace("## SERIES EXHIBIT PS-[N]", `## SERIES EXHIBIT ${n}`);
    ex = ex.replace(/\*\*Protected Series name \(exactly as filed with the Department\):\*\*\n\*\*[^\n]+\*\*/, `**Protected Series name (exactly as filed with the Department):**\n**${ser.name}**`);
    ex = ex.replace(/\| Purpose of this Protected Series \|[^\n]*\|/, `| Purpose of this Protected Series | ${ser.purpose || "Any lawful business, purpose, or activity"} |`);
    if (!isSCorp) {
      // the S corp forms' row is fixed text: all Members, identically to their Percentage Interests
      ex = ex.replace(/\| Associated Member\(s\)[^\n]*\|[^\n]*\|/, inputs.version === "single"
        ? `| Associated Member(s) | ${inputs.members[0].name} — 100% |`
        : `| Associated Member(s) and Series Percentages | ${assoc} |`);
    }
    // Member-managed Series Exhibits carry a fixed "Managed by" row instead.
    if (!isMemberManaged) {
      ex = ex.replace(/\| Protected Series Manager \|[^\n]*\|/, `| Protected Series Manager | ${inputs.managerName} |`);
    }
    ex = ex.replace(/\| Contributions to this Protected Series \|[^\n]*\|/, `| Contributions to this Protected Series | ${ser.contribution || "—"} |`);
    ex = ex.replace(/\| Special terms \(if any\) \|[^\n]*\|/, "| Special terms (if any) | None |");
    ex = ex.replace(/\| Dissolution events[^\n]*\|[^\n]*\|/, "| Dissolution events specific to this Protected Series (if any) | None |");
    // signature placeholders
    const adoptNames =
      ser.associated.length > 0
        ? ser.associated.flatMap((u) => u.signatories ?? [u.memberName])
        : inputs.members.flatMap((m) => m.signatories ?? [m.name]);
    const adoptSource =
      ser.associated.length > 0
        ? ser.associated.map((u) => ({ name: u.memberName, signatories: u.signatories, jointHolding: u.jointHolding }))
        : inputs.members.map((m) => ({ name: m.name, signatories: m.signatories, jointHolding: m.jointHolding }));
    const adoptLines = signatureBlock(adoptSource, ", Member");
    ex = ex.replace(
      /_+\n\[ASSOCIATED MEMBER 1\], Member[\s\S]*?_+\n\[ASSOCIATED MEMBER 2\], Member/,
      adoptLines,
    );
    ex = ex.replace(/_+\n\[MEMBER NAME\], Member/, adoptLines);
    ex = ex
      .split("[NAME], Protected Series Manager").join(`${inputs.managerName}, Protected Series Manager`)
      .split("[NAME], Associated Member").join(adoptNames[0] ?? "")
      .split("effective [DATE]").join(`effective ${inputs.effectiveDate}`);
    let sched = ex2.section.replace(
      "## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N]",
      `## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT ${n} (${ser.name})`,
    );
    exhibits.push("[[pagebreak]]\n\n" + ex.trim() + "\n\n[[pagebreak]]\n\n" + sched.trim());
  });

  // ---- signatures ----
  if (inputs.version === "single") {
    s = s.split("[MEMBER NAME]").join(inputs.members[0].name);
    s = s.split("[ADDRESS]").join(inputs.members[0].address);
  } else {
    const sigLines = signatureBlock(inputs.members, "");
    // The member-managed masters have no manager acknowledgment block, so the
    // members' signatures run to the end of the signature section instead.
    s = s.replace(
      isMemberManaged
        ? /\*\*MEMBERS:\*\*[\s\S]*?(?=\n---|\n## |$)/
        : /\*\*MEMBERS:\*\*[\s\S]*?(?=\*\*ACKNOWLEDGED AND AGREED BY MANAGER:\*\*)/,
      `**MEMBERS:**\n\n${sigLines}\n\n`,
    );
  }

  // Signatures start a fresh page — it is the page people detach, sign, and
  // scan back, and it should never begin halfway down a page of Article 16.
  s = s.replace(/\n## SIGNATURES/, "\n[[pagebreak]]\n\n## SIGNATURES");

  // strip the draft footer note
  s = s.replace(/\n\*Form document —[\s\S]*$/, "\n");

  // append instantiated series exhibits
  s = s.trimEnd() + "\n\n" + exhibits.join("\n\n") + `\n\n*${titleName} of ${co} — generated by MyFloridaSeriesLLC · Master ${OA_TEMPLATE_VERSION}*\n`;

  return { markdown: s, title: `${inputs.amendedRestated ? "Amended and Restated " : ""}Operating Agreement — ${co}` };
}

/** Signature lines, with jointly-held interests grouped under a heading so a
 *  married couple reads as one owner signing together rather than two owners. */
function signatureBlock(
  holders: { name: string; signatories?: string[]; jointHolding?: string }[],
  suffix: string,
): string {
  return holders
    .map((h) => {
      const names = h.signatories ?? [h.name];
      const lines = names.map((n) => `_____________________________\n${n}${suffix}`).join("\n\n");
      if (names.length > 1) {
        const heading = h.jointHolding
          ? `**${names.join(" and ")}, ${h.jointHolding}:**`
          : `**${names.join(" and ")}, jointly:**`;
        return `${heading}\n\n${lines}`;
      }
      return lines;
    })
    .join("\n\n");
}

function replaceSectionBody(s: string, re: RegExp, replacement: string, label: string): string {
  if (!re.test(s)) throw new Error(`OA template marker missing: ${label}`);
  return s.replace(re, replacement);
}
