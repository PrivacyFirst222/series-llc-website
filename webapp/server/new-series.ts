import { documentInputs, decodeDocumentText, assertTemplateComplete } from "./document-text";
/**
 * Builds the two documents a client needs when the company establishes another
 * protected series after formation: the members' unanimous written consent, and
 * the Series Exhibit adopted with it (plus its asset schedule).
 *
 * Why both, and why a separate document from the agreement:
 *  - s. 605.2201(1) lets a company establish a protected series only "with the
 *    affirmative vote or consent of all members". s. 605.2107(1)(i) makes
 *    s. 605.2201 non-variable EXCEPT the manner of approving establishment — so
 *    unanimity here is our Section 3.1's requirement, and the consent recites it
 *    that way rather than claiming the statute compels it.
 *  - The designation filed with the Division is "signed by the company"
 *    (s. 605.2201(2)), so nothing in the public record shows the members
 *    approved. The consent is the only evidence, and it lives in the company's
 *    records.
 *  - Section 3.1 requires a Series Exhibit adopted at or before the filing, so
 *    the two travel together.
 * Regenerating the whole agreement as Amended & Restated also works and remains
 * available; this exists because re-issuing forty pages to add one series is not
 * what an owner — or their bank — actually wants.
 */
import template from "./templates-new-series.md";
import { resolveIf, titleCaseHolding, OA_TEMPLATE_VERSION } from "./oa";

export interface NewSeriesInput {
  companyName: string;
  /** Full filed name, e.g. "Sunshine Holdings, LLC - PS 4". */
  seriesName: string;
  /** PS-[N] label for the exhibit heading; the identifier after "PS". */
  seriesNumber: string;
  purpose: string;
  /** The client's special terms for this series, if any (14 Sep 2026: the
   *  agreement's exhibit takes them; this one hard-coded "None"). */
  specialTerms?: string;
  /** What the Company contributes to the series, if stated. */
  contribution?: string;
  /** Human format, e.g. "August 11, 2026". */
  effectiveDate: string;
  memberNames: string[];
  memberSignatories?: { member: string; signatories?: string[]; jointHolding?: string }[];
  /** A member or Manager that is a company signs through a person (Adam,
   *  13 Sep 2026), keyed by the entity's name. */
  entitySigners?: { entity: string; name: string; title: string }[];
  /** Every person serving as Manager; s. 5.1 makes them act by majority. */
  managerNames: string[];
  memberManaged: boolean;
  /** Derived from the selected saved agreement, never an independent portal flag. */
  professional?: boolean;
}

function must(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) throw new Error(`new-series template marker missing: ${label}`);
}

export function assembleNewSeries(input: NewSeriesInput): { markdown: string; title: string; encodedClientText: true } {
  input = documentInputs(input);
  let s = template as unknown as string;

  // The purpose is the master's "any lawful purpose"; the client's phrase
  // follows ", including, without limitation," only when one was given (Adam,
  // 13 Sep 2026: a stated purpose must never read as a limit).
  const purpose = input.purpose.trim();
  // Resolve nested purposes before discarding the unused complete branch.
  // The preceding master has no standard/professional alternatives; this
  // ordering keeps the helper compatible while its approved master is updated.
  s = resolveIf(s, "purpose", purpose !== "");
  if (/<!--\s*if:standard\s*-->/.test(s)) {
    s = resolveIf(s, "professional", input.professional === true);
    s = resolveIf(s, "standard", input.professional !== true);
  }

  // Who files, and who manages the series, are the master's own sentences,
  // one pair per management form (13 Sep 2026: the code said the Company was
  // the series manager, the opposite of the member-managed agreement's s. 5.2).
  // The manager-count markers sit inside the manager-managed block, so they
  // are resolved first, while the block still exists.
  {
    const mgrs = input.managerNames.map((n) => n.trim()).filter(Boolean);
    s = resolveIf(s, "onemanager", mgrs.length <= 1);
    s = resolveIf(s, "manymanagers", mgrs.length > 1);
  }
  s = resolveIf(s, "membermanaged", input.memberManaged);
  s = resolveIf(s, "managermanaged", !input.memberManaged);
  // One owner signs alone, in the singular (Adam, 15 Sep 2026): "the sole
  // member", "The Member authorizes", "MEMBER:".
  if (input.memberNames.length === 0) throw new Error("new-series: at least one member is required");
  s = resolveIf(s, "sole", input.memberNames.length === 1);
  s = resolveIf(s, "several", input.memberNames.length > 1);
  const managers = input.managerNames.map((n) => n.trim()).filter(Boolean);
  if (!input.memberManaged && managers.length === 0) throw new Error("new-series: a manager-managed company needs at least one Manager");
  // Manager-managed: one signature line per Manager, matching the Agreement.
  const signerOf = (entity: string) => (input.entitySigners ?? []).find((x) => x.entity.trim() === entity.trim());
  // A person's block is the rule then the name; an entity's is its name,
  // "By:" over the rule, and the printed name and title beneath (Adam,
  // 13 Sep 2026). Only consent signatures carry a separate Date line;
  // the Series Exhibit uses its adopted-effective date, matching the masters.
  const block = (n: string, suffix: string, dated = true) => {
    const sg = signerOf(n);
    return (sg
      ? `${n}${suffix}\n\nBy: _____________________________\n[[indent]]${sg.name}\n[[indent]]${sg.title}`
      : `_____________________________\n${n}${suffix}`) + (dated ? "\nDate: _____________________________" : "");
  };
  // Every member adopts the exhibit in a member-managed company, as the
  // agreement's exhibits are adopted (Adam, 14 Sep 2026: "Every member should
  // sign it"); every Manager otherwise — under the agreements' own labels
  // (15 Sep 2026): ", Member" and ", Protected Series Manager".
  const memberBlock = (name: string, suffix: string, dated = true) => {
    const m = input.memberSignatories?.find(m => m.member === name);
    if (!m?.signatories || m.signatories.length < 2 || signerOf(name)) return block(name, suffix, dated);
    return `[[signature-group]]

${name}${m.jointHolding ? ` — ${titleCaseHolding(m.jointHolding)}` : ""}${suffix}\n\n${m.signatories.map(n => block(n, "", dated)).join("\n\n")}

[[/signature-group]]`;
  };
  const psSignature = input.memberManaged
    ? input.memberNames.map((n) => memberBlock(n, ", Member", false)).join("\n\n")
    : managers.map((n) => block(n, ", Protected Series Manager", false)).join("\n\n");

  const blocks = input.memberNames.map((n) => memberBlock(n, "")).join("\n\n");

  must(s, "[COMPANY NAME], LLC", "company name");
  s = s.split("[COMPANY NAME], LLC").join(input.companyName);
  s = s.split("[COMPANY NAME]").join(input.companyName);
  must(s, "[SERIES NAME]", "series name");
  s = s.split("[SERIES NAME]").join(input.seriesName);
  must(s, "PS-[N]", "series number");
  s = s.split("PS-[N]").join(`PS-${input.seriesNumber}`);
  if (purpose !== "") {
    must(s, "[SERIES PURPOSE]", "series purpose");
    s = s.split("[SERIES PURPOSE]").join(purpose);
  }
  must(s, "[CONTRIBUTION]", "contribution");
  // An empty contribution prints None, matching the agreement's Series Exhibit.
  s = s.split("[CONTRIBUTION]").join((input.contribution ?? "").trim() || "None");
  must(s, "[SPECIAL TERMS]", "special terms");
  s = s.split("[SPECIAL TERMS]").join((input.specialTerms ?? "").trim() || "None");
  must(s, "[EFFECTIVE DATE]", "effective date");
  s = s.split("[EFFECTIVE DATE]").join(input.effectiveDate);
  must(s, "[PS MANAGER SIGNATURE LINE]", "ps manager signature");
  s = s.split("[PS MANAGER SIGNATURE LINE]").join(psSignature);
  must(s, "[EDITION]", "edition");
  s = s.split("[EDITION]").join(OA_TEMPLATE_VERSION);
  must(s, "[MEMBER SIGNATURE BLOCKS]", "member signature blocks");
  s = s.split("[MEMBER SIGNATURE BLOCKS]").join(blocks);
  s = s.replace(/\n{3,}/g, "\n\n");

  // The generated group delimiters are renderer controls, not unfilled slots.
  assertTemplateComplete(s.replace(/\[\[\/?signature-group\]\]/g, ""));

  return { markdown: s, encodedClientText: true, title: `Consent & Series Exhibit — ${decodeDocumentText(input.seriesName)}` };
}
