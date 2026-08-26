/**
 * Does every sentence a client receives come from a master?
 *
 * Adam's rule: the generator may put a value into a slot, choose between
 * alternatives the master spells out, delete an omitted provision, or repeat a
 * marked block. It may not compose a sentence. Until 16 August it composed the
 * whole of Exhibit A, which is how an S corporation restriction stayed in the
 * master and never reached a signed document; until 17 August it composed the
 * footer line under the last exhibit.
 *
 * The check: generate each form with sentinel inputs chosen so every substituted
 * value is reversible, put the placeholders back, and require every remaining
 * paragraph to appear in the master. Anything left over was written in
 * TypeScript. Exits nonzero on any violation, so a gate can run it.
 *
 * Design rule learned from this file's own first version: every normalisation
 * must be applied to BOTH sides or to neither. Its first version rewrote the
 * output's literal "100%" to [PCT] but not the master's, and 8 of its 70
 * reports were that asymmetry.
 *
 *     bun run server/provenance.ts
 */
import { assembleOa, OA_TEMPLATE_VERSION, type OaInputs } from "./oa";
import { readFileSync } from "node:fs";

const MASTERS: Record<OaInputs["version"], string> = {
  single: "templates-oa-single.md",
  "single-s": "templates-oa-single-s.md",
  "member-single": "templates-oa-member-single.md",
  "member-single-s": "templates-oa-member-single-s.md",
  multi: "templates-oa-multi.md",
  s: "templates-oa-s.md",
  member: "templates-oa-member.md",
  "member-s": "templates-oa-member-s.md",
};

/** Sentinels, not realistic values: each must be reversible without ambiguity,
 *  so a leftover paragraph is proof of composition rather than of a value I
 *  failed to unwind. */
const S = {
  company: "ZQCOMPANYQZ",
  principal: "ZQPRINCIPALQZ",
  date: "ZQDATEQZ",
  mgr1: "ZQMANAGERONEQZ",
  mgr2: "ZQMANAGERTWOQZ",
  m1: "ZQMEMBERONEQZ",
  m2: "ZQMEMBERTWOQZ",
  addr1: "ZQADDRONEQZ",
  addr2: "ZQADDRTWOQZ",
  contrib1: "ZQCONTRIBONEQZ",
  contrib2: "ZQCONTRIBTWOQZ",
  tod1: "ZQTODONEQZ",
  tod2: "ZQTODTWOQZ",
  ser1: "ZQSERIESONEQZ",
  ser2: "ZQSERIESTWOQZ",
  purpose1: "ZQPURPOSEONEQZ",
  purpose2: "ZQPURPOSETWOQZ",
  serContrib: "ZQSERCONTRIBQZ",
};

function inputsFor(v: OaInputs["version"]): OaInputs {
  const single = v.includes("single");
  const memberManaged = v.startsWith("member");
  return {
    version: v,
    companyName: S.company,
    principalAddress: S.principal,
    managerNames: memberManaged ? [] : [S.mgr1, S.mgr2],
    effectiveDate: S.date,
    amendedRestated: false,
    priorAgreementDate: null,
    members: single
      ? [{ name: S.m1, address: S.addr1, percentage: 100, contribution: S.contrib1, todBeneficiary: S.tod1 }]
      : [
          { name: S.m1, address: S.addr1, percentage: 60, contribution: S.contrib1, todBeneficiary: S.tod1 },
          { name: S.m2, address: S.addr2, percentage: 40, contribution: S.contrib2, todBeneficiary: S.tod2 },
        ],
    series: [
      { name: S.ser1, purpose: S.purpose1, contribution: S.serContrib },
      { name: S.ser2, purpose: S.purpose2, contribution: S.serContrib },
    ],
    competition: "A",
    includeCapitalCalls: true,
    capitalCallCap: 25000,
    includeShotgun: true,
    borrowingThreshold: 25000,
    contributionToCompany: S.contrib1,
  };
}

/** Applied identically to master text and to unwound output — the symmetric
 *  half of the vocabulary. Anything here that ran on only one side would
 *  manufacture false reports (see the header). */
function normalize(s: string): string {
  return s
    // Literal percentages appear in master prose ("one hundred percent (100%)",
    // "twenty-five percent (25%)") AND as filled share values. Same token both
    // sides, so equality is preserved.
    .replace(/\b\d+(?:[.,]\d+)?%/g, "[PCT]")
    // The generator bolds slot values ("The initial Managers are **X** and
    // **Y**"); the master spells the slot plain. Presentation, not prose —
    // strip it around a lone placeholder, on both sides.
    .replace(/\*\*(\[[A-Z][A-Z ()/.']*\])\*\*/g, "$1")
    // A [MANAGER NAMES]-class slot holds a LIST, formatted "A and B",
    // "A, B, and C", or "A, B". Collapse to one [NAME] to mirror the master's
    // single placeholder. Runs after the bold-strip so bold lists collapse too.
    .replace(/\[NAME\](?:(?:, \[NAME\])* and \[NAME\])+/g, "[NAME]")
    .replace(/\[NAME\](?:, \[NAME\])+/g, "[NAME]")
    .replace(/\s+/g, " ")
    .trim();
}

/** Put the placeholders back, so an output paragraph can be compared to the
 *  master paragraph it came from. Output side only. */
function unwind(s: string): string {
  return s
    .split(S.company).join("[COMPANY NAME]")
    .split(S.principal).join("[PRINCIPAL ADDRESS]")
    .split(S.date).join("[DATE]")
    .split(S.ser1).join("[SERIES]")
    .split(S.ser2).join("[SERIES]")
    .split(S.purpose1).join("[PURPOSE]")
    .split(S.purpose2).join("[PURPOSE]")
    .split(S.serContrib).join("[SERCONTRIB]")
    .split(S.mgr1).join("[NAME]").split(S.mgr2).join("[NAME]")
    .split(S.m1).join("[NAME]").split(S.m2).join("[NAME]")
    .split(S.addr1).join("[ADDRESS]").split(S.addr2).join("[ADDRESS]")
    .split(S.contrib1).join("[AMOUNT]").split(S.contrib2).join("[AMOUNT]")
    .split(S.tod1).join("[TOD]").split(S.tod2).join("[TOD]")
    .split(OA_TEMPLATE_VERSION).join("[EDITION]")
    // The document title is chosen between two wordings the generator owns;
    // the master's footer line spells the slot.
    .replace(/\b(?:AMENDED AND RESTATED )?OPERATING AGREEMENT(?= of \[COMPANY NAME\])/g, "[TITLE]")
    .replace(/\$25,000/g, "[MONEY]");
}

/** The master's own placeholder spellings, reduced to the shared vocabulary.
 *  Master side only. */
function masterKey(s: string): string {
  return (
    s
      // The generator legitimately strips these before assembling; a master
      // paragraph must be reduced the same way or every optional provision is
      // reported as invention. Bracket notes may NEST brackets — 13.2's note
      // contains "[Reserved.]" — so the patterns tolerate one level of nesting;
      // the old non-greedy [\s\S]*?\] stopped at the inner bracket and mangled
      // the heading it was meant to clean.
      .replace(/\s*\*\((To omit|Retain the selected|If this Section is omitted)[\s\S]*?\)\*/g, "")
      .replace(/\s*\*\[include only if(?:[^[\]]|\[[^\]]*\])*\]\*/g, "")
      .replace(/ ?\[OPTIONAL PROVISION(?:[^[\]]|\[[^\]]*\])*\]/g, "")
      .replace(/ ?\[SELECT ONE ALTERNATIVE(?:[^[\]]|\[[^\]]*\])*\]/g, "")
      .replace(/ ?\[SELECT THE SAME ALTERNATIVE(?:[^[\]]|\[[^\]]*\])*\]/g, "")
      .replace(/\*\*\[ \] Alternative [AB] — [^*]*\.\*\* ?/g, "")
      // ORDER MATTERS: the series-name pattern contains "[COMPANY NAME], LLC",
      // so it must be reduced BEFORE the company-name collapse below eats its
      // ", LLC". The first version of this file had these reversed, and all 16
      // series-name reports were that bug.
      .replace(/\[COMPANY NAME\], LLC - PS \[N\]|\[SERIES\]/g, "[SERIES]")
      // "[COMPANY NAME], LLC" and "[COMPANY NAME]" both receive the same value.
      .replace(/\[COMPANY NAME\], LLC/g, "[COMPANY NAME]")
      // Exhibits are renumbered per series — a transform, not composition.
      .replace(/SERIES EXHIBIT (?:PS-)?(?:\[N\]|\d+)( \([^)]*\))?/g, "SERIES EXHIBIT [N]")
      .replace(/\[MEMBER \d+(?: NAME)?(?:, if any)?\]/g, "[NAME]")
      .replace(/\[MEMBER NAME\]|\[SIGNATORY NAME\]|\[ADOPTER NAME\]|\[MANAGER NAME\]|\[MANAGER NAMES\]|\[NAME\]/g, "[NAME]")
      .replace(/\[MEMBER ADDRESS\]|\[ADDRESS\]/g, "[ADDRESS]")
      .replace(/\[MEMBER CONTRIBUTION\]|\$\[AMOUNT\] \[and\/or described property\]|\$\[AMOUNT\]/g, "[AMOUNT]")
      .replace(/\[CONTRIBUTION\]/g, "[SERCONTRIB]")
      .replace(/\[MEMBER DATE\]|\[DATE\]/g, "[DATE]")
      .replace(/\[MEMBER TOD\]|\[TOD BENEFICIARY NAME\(S\)\]|\[NAME\(S\) \/ None\]/g, "[TOD]")
      .replace(/\[MEMBER SHARE\]|\[___\]%/g, "[PCT]")
      .replace(/\$\[THRESHOLD\]|\$\[CAP\]/g, "[MONEY]")
      .replace(/\[PURPOSE[^\]]*\]/g, "[PURPOSE]")
      // Master-spelled choice cells: the generator picks one of the wordings
      // the master offers inside the bracket. The chosen wording traces; a
      // wording from anywhere else still fails.
      .replace(/\[Same as Company Manager \/ NAME\]/g, "[NAME]")
      .replace(/\[None \/ variations from the base Agreement — may not vary [^\]]*\]/g, "None")
      .replace(/\[None \/ describe\]/g, "None")
      .replace(/<!--[^>]*-->/g, "")
  );
}

const keyMaster = (s: string) => normalize(masterKey(s));
const keyOutput = (s: string) => normalize(masterKey(unwind(s)));

/** Original paragraph blocks — split only, no collapsing, so table rows and
 *  other line structure survive for the per-line fallback. */
const blocks = (s: string): string[] =>
  s.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

let violations = 0;
for (const [version, file] of Object.entries(MASTERS) as [OaInputs["version"], string][]) {
  const raw = readFileSync(`${import.meta.dir}/${file}`, "utf8");
  // A master paragraph carrying <!-- one:… --> / <!-- many:… --> holds BOTH
  // wordings; the delivered document holds one. Resolve it both ways so the
  // chosen wording traces, and the unchosen one does not go missing.
  const one = raw
    .replace(/<!--\s*many:[a-z]+\s*-->[\s\S]*?<!--\s*\/many\s*-->/g, "")
    .replace(/<!--\s*one:[a-z]+\s*-->([\s\S]*?)<!--\s*\/one\s*-->/g, "$1");
  const many = raw
    .replace(/<!--\s*one:[a-z]+\s*-->[\s\S]*?<!--\s*\/one\s*-->/g, "")
    .replace(/<!--\s*many:[a-z]+\s*-->([\s\S]*?)<!--\s*\/many\s*-->/g, "$1");
  // <!-- if:X --> … <!-- /if --> likewise holds both states: present when the
  // condition is met, absent otherwise. Resolve each base variant both ways.
  const ifOut = (v: string) => v.replace(/<!--\s*if:[a-z]+\s*-->[\s\S]*?<!--\s*\/if\s*-->/g, "");
  const ifIn = (v: string) => v.replace(/<!--\s*if:[a-z]+\s*-->([\s\S]*?)<!--\s*\/if\s*-->/g, "$1");

  const known = new Set<string>();
  for (const variant of [raw, one, many].flatMap((v) => [ifOut(v), ifIn(v)])) {
    for (const b of blocks(variant)) {
      const k = keyMaster(b);
      if (k) known.add(k);
    }
    // Every line too: a paragraph the generator split, joined, or repeated
    // (table rows, signature lines) still traces line by line.
    for (const line of variant.split("\n")) {
      const k = keyMaster(line);
      if (k) known.add(k);
    }
  }

  const traces = (block: string): boolean => {
    const k = keyOutput(block);
    if (!k || known.has(k)) return true;
    // Line-wise: repeat-expanded tables have more rows than the master
    // paragraph; each row must itself be a master line.
    const lines = block.split("\n").map((l) => keyOutput(l)).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => known.has(l))) return true;
    // Heading-join: the generator merges a section heading with the master
    // paragraph of the chosen alternative ("**4.7 Competition.**" + the text of
    // Alternative A). Both pieces must be master text on their own.
    const m = k.match(/^(\*\*.+?\.\*\*) (.+)$/s);
    if (m && known.has(m[1]) && known.has(m[2])) return true;
    return false;
  };

  const { markdown } = assembleOa(inputsFor(version));
  const orphans: string[] = [];
  for (const b of blocks(markdown)) {
    if (!traces(b)) orphans.push(keyOutput(b));
  }
  console.log(`\n=== ${version} — ${orphans.length} paragraph(s) not traceable to the master ===`);
  for (const o of orphans) console.log("   " + (o.length > 200 ? o.slice(0, 200) + " …" : o));
  violations += orphans.length;
}
console.log(`\n${violations} untraceable paragraph(s) across the eight forms.`);
process.exit(violations > 0 ? 1 : 0);
