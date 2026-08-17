/**
 * Does every sentence a client receives come from a master?
 *
 * Adam's rule: the generator may put a value into a slot, choose between
 * alternatives the master spells out, delete an omitted provision, or repeat a
 * marked block. It may not compose a sentence. Until 16 August it composed the
 * whole of Exhibit A, which is how an S corporation restriction stayed in the
 * master and never reached a signed document.
 *
 * The check: generate each form with sentinel inputs chosen so every substituted
 * value is reversible, put the placeholders back, and require every remaining
 * paragraph to appear in the master. Anything left over was written in
 * TypeScript.
 *
 *     bun run server/provenance.ts
 */
import { assembleOa, type OaInputs } from "./oa";
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

/** Paragraphs, normalised for whitespace so a rewrap is not reported as prose. */
const paras = (s: string): string[] =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Put the placeholders back, so an output paragraph can be compared to the
 *  master paragraph it came from. */
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
    .replace(/\$25,000/g, "[MONEY]")
    .replace(/\b(60|40|100)%/g, "[PCT]");
}

/** The master's own paragraphs, with its placeholders reduced to the same
 *  vocabulary, so a filled slot matches the slot it was filled from. */
function masterKey(s: string): string {
  return s
    // The generator legitimately strips these before assembling; a master
    // paragraph must be reduced the same way or every optional provision is
    // reported as invention.
    .replace(/\s*\*\((To omit|Retain the selected|If this Section is omitted)[\s\S]*?\)\*/g, "")
    .replace(/\s*\*\[include only if[\s\S]*?\]\*/g, "")
    .replace(/ \[OPTIONAL PROVISION[\s\S]*?\]/g, "")
    .replace(/ \[SELECT ONE ALTERNATIVE[\s\S]*?\]/g, "")
    .replace(/ \[SELECT THE SAME ALTERNATIVE[\s\S]*?\]/g, "")
    .replace(/\*\*\[ \] Alternative [AB] — [^*]*\.\*\* ?/g, "")
    // "[COMPANY NAME], LLC" and "[COMPANY NAME]" both receive the same value.
    .replace(/\[COMPANY NAME\], LLC/g, "[COMPANY NAME]")
    // Exhibits are renumbered per series — a transform, not composition.
    .replace(/SERIES EXHIBIT (?:PS-)?(?:\[N\]|\d+)( \([^)]*\))?/g, "SERIES EXHIBIT [N]")
    // No longer flattens Manager/Managers: both wordings are in the master now,
    // and flattening them made the plural variant unmatchable.
    .replace(/\[MEMBER \d+(?: NAME)?(?:, if any)?\]/g, "[NAME]")
    .replace(/\[MEMBER NAME\]|\[SIGNATORY NAME\]|\[ADOPTER NAME\]|\[MANAGER NAME\]|\[MANAGER NAMES\]|\[NAME\]/g, "[NAME]")
    .replace(/\[MEMBER ADDRESS\]|\[ADDRESS\]/g, "[ADDRESS]")
    .replace(/\[MEMBER CONTRIBUTION\]|\$\[AMOUNT\] \[and\/or described property\]|\$\[AMOUNT\]/g, "[AMOUNT]")
    .replace(/\[MEMBER DATE\]|\[DATE\]/g, "[DATE]")
    .replace(/\[MEMBER TOD\]|\[TOD BENEFICIARY NAME\(S\)\]|\[NAME\(S\) \/ None\]/g, "[TOD]")
    .replace(/\[MEMBER SHARE\]|\[___\]%/g, "[PCT]")
    .replace(/\$\[THRESHOLD\]|\$\[CAP\]/g, "[MONEY]")
    .replace(/\[COMPANY NAME\], LLC - PS \[N\]|\[SERIES\]/g, "[SERIES]")
    .replace(/\[PURPOSE[^\]]*\]/g, "[PURPOSE]")
    .replace(/<!--[^>]*-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let violations = 0;
for (const [version, file] of Object.entries(MASTERS) as [OaInputs["version"], string][]) {
  const raw = readFileSync(`${import.meta.dir}/${file}`, "utf8");
  // A master paragraph carrying <!-- one:… --> / <!-- many:… --> holds BOTH
  // wordings; the delivered document holds one. Resolve it both ways so the
  // chosen wording traces, and the unchosen one does not go missing.
  const master = raw;
  const one = raw
    .replace(/<!--\s*many:[a-z]+\s*-->[\s\S]*?<!--\s*\/many\s*-->/g, "")
    .replace(/<!--\s*one:[a-z]+\s*-->([\s\S]*?)<!--\s*\/one\s*-->/g, "$1");
  const many = raw
    .replace(/<!--\s*one:[a-z]+\s*-->[\s\S]*?<!--\s*\/one\s*-->/g, "")
    .replace(/<!--\s*many:[a-z]+\s*-->([\s\S]*?)<!--\s*\/many\s*-->/g, "$1");
  const known = new Set([...paras(master), ...paras(one), ...paras(many)].map(masterKey));
  for (const variant of [one, many]) {
    for (const line of variant.split("\n")) {
      const k = masterKey(line.replace(/\s+/g, " ").trim());
      if (k) known.add(k);
    }
  }
  // Every line of the master too, so a paragraph the generator split or joined
  // still traces to master text rather than being reported as invention.
  for (const line of master.split("\n")) {
    const k = masterKey(line.replace(/\s+/g, " ").trim());
    if (k) known.add(k);
  }

  const { markdown } = assembleOa(inputsFor(version));
  const orphans: string[] = [];
  for (const p of paras(markdown)) {
    const k = masterKey(unwind(p));
    if (!k || known.has(k)) continue;
    // A paragraph the generator assembled from several master lines still
    // traces if each of its lines does.
    const lines = k.split(" | ").length > 1 ? [] : k.split("\n");
    if (lines.length > 1 && lines.every((l) => !l.trim() || known.has(l.trim()))) continue;
    orphans.push(k);
  }
  console.log(`\n=== ${version} — ${orphans.length} paragraph(s) not traceable to the master ===`);
  for (const o of orphans) console.log("   " + (o.length > 200 ? o.slice(0, 200) + " …" : o));
  violations += orphans.length;
}
console.log(`\n${violations} untraceable paragraph(s) across the eight forms.`);
