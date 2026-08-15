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

export interface NewSeriesInput {
  companyName: string;
  /** Full filed name, e.g. "Sunshine Holdings, LLC - PS 4". */
  seriesName: string;
  /** PS-[N] label for the exhibit heading; the identifier after "PS". */
  seriesNumber: string;
  purpose: string;
  /** Human format, e.g. "August 11, 2026". */
  effectiveDate: string;
  memberNames: string[];
  /** Every person serving as Manager; s. 5.1 makes them act by majority. */
  managerNames: string[];
  memberManaged: boolean;
}

function must(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) throw new Error(`new-series template marker missing: ${label}`);
}

export function assembleNewSeries(input: NewSeriesInput): { markdown: string; title: string } {
  let s = template as unknown as string;

  const purpose = input.purpose.trim() || "any lawful business, purpose, or activity for which the Company may be organized under the Act";

  // Who signs and files differs by management form; the member-managed masters
  // name no manager at all.
  const authority = input.memberManaged
    ? "The Members authorize the Administrative Member, or any Member the Members designate, to sign and file the Protected Series Designation for the new Protected Series with the Florida Department of State, Division of Corporations, as provided in s. 605.2201(2), Florida Statutes, and Section 3.1 of the Agreement."
    : `The Members authorize the Manager to sign and file the Protected Series Designation for the new Protected Series with the Florida Department of State, Division of Corporations, as provided in s. 605.2201(2), Florida Statutes, and Section 3.1 of the Agreement.`;
  const managers = input.managerNames.map((n) => n.trim()).filter(Boolean);
  // The table row is already labelled "Protected Series Manager"; it takes the
  // names alone. The member-managed row states who acts, because the statutory
  // protected-series manager there is the Company itself.
  const psManager = input.memberManaged
    ? "The Company, acting through a Majority in Interest of the Members"
    : managers.join(", ") || "[MANAGER NAME]";
  // Manager-managed: one signature line per Manager, matching the Agreement.
  const psSignature = input.memberManaged
    ? `${input.memberNames[0] ?? "[MEMBER NAME]"}, Member, for the Company`
    : managers.length
      ? managers.map((n) => `${n}, Manager`).join("\n\n_____________________________\n")
      : "[MANAGER NAME], Manager";

  const blocks = input.memberNames.length
    ? input.memberNames.map((n) => `_____________________________\n${n}`).join("\n\n")
    : "_____________________________\n[MEMBER NAME]";

  must(s, "[COMPANY NAME], LLC", "company name");
  s = s.split("[COMPANY NAME], LLC").join(input.companyName);
  s = s.split("[COMPANY NAME]").join(input.companyName);
  must(s, "[SERIES NAME]", "series name");
  s = s.split("[SERIES NAME]").join(input.seriesName);
  must(s, "PS-[N]", "series number");
  s = s.split("PS-[N]").join(`PS-${input.seriesNumber}`);
  must(s, "[SERIES PURPOSE]", "series purpose");
  s = s.split("[SERIES PURPOSE]").join(purpose);
  must(s, "[EFFECTIVE DATE]", "effective date");
  s = s.split("[EFFECTIVE DATE]").join(input.effectiveDate);
  must(s, "[SIGNER ROLE SENTENCE]", "authority sentence");
  s = s.split("[SIGNER ROLE SENTENCE]").join(authority);
  must(s, "[PS MANAGER SIGNATURE LINE]", "ps manager signature");
  s = s.split("[PS MANAGER SIGNATURE LINE]").join(psSignature);
  must(s, "[PS MANAGER]", "ps manager");
  s = s.split("[PS MANAGER]").join(psManager);
  must(s, "[MEMBER SIGNATURE BLOCKS]", "member signature blocks");
  s = s.split("[MEMBER SIGNATURE BLOCKS]").join(blocks);

  const leftovers = s.match(/\[(COMPANY NAME|SERIES NAME|SERIES PURPOSE|EFFECTIVE DATE|PS MANAGER|MEMBER SIGNATURE BLOCKS|SIGNER ROLE SENTENCE)[^\]]*\]/g);
  if (leftovers) throw new Error(`new-series template left unfilled: ${leftovers.join(", ")}`);

  return { markdown: s, title: `New Protected Series — ${input.seriesName}` };
}
