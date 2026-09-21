import { readFileSync } from "node:fs";
import { assembleOa, type OaInputs } from "./oa";

const ownerParagraph = "The Members acknowledge that this Agreement imposes continuing managerial and governance obligations and is intended to be an executory contract. Under 11 U.S.C. § 365(c)(1) and applicable Florida law (including Chapter 605 and this Agreement), a trustee or debtor in possession may not assume or assign a debtor Member’s governance or management rights, or cause a substitute to be admitted as a Member, without the prior written consent of the other Members. Nothing in this Section limits the estate’s interest in a Member’s transferable (economic) interest to the extent permitted by applicable law.";
const versions: OaInputs["version"][] = ["single", "single-s", "member-single", "member-single-s", "multi", "s", "member", "member-s"];

export function batch16Checks(check: (label: string, ok: boolean, detail?: unknown) => void): void {
  const failures: Record<string, string[]> = { provenance: [], recitals: [], professional: [], bankruptcy: [] };
  let generated = 0;
  for (const version of versions) {
    const master = readFileSync(`${import.meta.dir}/templates-oa-${version}.md`, "utf8");
    const alternatives = new Map<string, string>();
    for (const m of master.matchAll(/^<!-- alternative:([a-z-]+) (.+) -->$/gm)) alternatives.set(m[1], JSON.parse(m[2]));
    for (const professional of [false, true]) for (const mode of ["initial", "dated", "undated"]) {
      const id = `${version}/${professional ? "professional" : "ordinary"}/${mode}`;
      const single = version.includes("single");
      const members = [{ name: "Alex Owner", address: "1 Main Street", percentage: single ? 100 : 60, contribution: "$60", todBeneficiary: "Eligible Beneficiary" }];
      if (!single) members.push({ name: "Blair Owner", address: "2 Main Street", percentage: 40, contribution: "$40", todBeneficiary: "Eligible Beneficiary" });
      let text: string;
      try {
        text = assembleOa({ version, professional, companyName: "Review Company, LLC", principalAddress: "1 Main Street, Miami, FL 33130", managerNames: version.startsWith("member") ? [] : ["Alex Owner"], effectiveDate: "September 20, 2026", amendedRestated: mode !== "initial", priorAgreementDate: mode === "dated" ? "August 5, 2026" : null, members, series: [{ name: "Review Company, LLC - PS 1", purpose: "Professional services", contribution: "$100" }], competition: "A", includeCapitalCalls: true, capitalCallCap: 1000, includeShotgun: true, borrowingThreshold: 5000 }).markdown;
      } catch (e) { for (const f of Object.values(failures)) f.push(`${id}: generation failed ${String(e)}`); continue; }
      generated++;
      if (mode !== "initial") {
        const selected = alternatives.get(mode === "dated" ? "restatement-dated" : "restatement-undated")?.replace("[PRIOR AGREEMENT DATE]", "August 5, 2026");
        if (!selected || !text.includes(selected) || !alternatives.has("restated-preamble") || !alternatives.has("restated-title")) failures.provenance.push(id);
      }
      if (/<!--|\[PRIOR AGREEMENT DATE\]|alternative:/.test(text)) failures.provenance.push(`${id}: template marker leaked`);
      const recitals = text.slice(text.indexOf("### RECITALS"), text.indexOf("NOW, THEREFORE,")).match(/^[A-Z]\. /gm) ?? [];
      const count = (version === "single-s" || version === "member-single-s" ? 4 : 3) + (mode === "initial" ? 0 : 1);
      if (recitals.join("") !== Array.from({ length: count }, (_, i) => `${String.fromCharCode(65 + i)}. `).join("")) failures.recitals.push(id);
      const restrictions = text.includes("No Transfer of a Membership Interest or admission as a Member") && text.includes("ss. 621.09(2) and 621.11(2)") && text.includes("investments and ownership of property permitted by s. 621.08") && text.includes("Any beneficiary must also satisfy the professional ownership and admission requirements in Section 1.4.") && text.includes("including any applicable S corporation shareholder eligibility requirement");
      if (professional ? !restrictions : text.includes("Professional companies only.") || text.includes("621.11(2)")) failures.professional.push(id);
      if (!single) {
        const actual = text.match(/^\*\*11\.2 [^\n]*?\*\* (.+)$/m)?.[1];
        if (actual !== ownerParagraph) failures.bankruptcy.push(id);
      }
    }
  }
  check("batch16: restatement language traces to each master", generated === 48 && failures.provenance.length === 0, { generated, failures: failures.provenance });
  check("batch16: restatement recitals remain sequential", generated === 48 && failures.recitals.length === 0, { generated, failures: failures.recitals });
  check("batch16: professional eligibility is conditional and cumulative", generated === 48 && failures.professional.length === 0, { generated, failures: failures.professional });
  check("batch16: bankruptcy paragraph is exactly owner approved", generated === 48 && failures.bankruptcy.length === 0, { generated, failures: failures.bankruptcy });
}

if (import.meta.main) {
  let failed = 0;
  batch16Checks((label, ok, detail) => { console.log(JSON.stringify({ label, ok, detail })); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
