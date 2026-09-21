/** Shared presentation metadata. Owner count and management describe the form;
 * tax classification is a separate badge. Unknown historical versions must
 * never silently become partnerships. This does not determine tax eligibility. */
const AGREEMENT_FORMS: Record<string, { name: string; tax: string }> = {
  single: { name: "Manager-Managed Single-Member (Disregarded Entity)", tax: "Disregarded entity" },
  "single-s": { name: "Manager-Managed Single-Member (S Corporation)", tax: "S Corporation" },
  "member-single": { name: "Member-Managed Single-Member (Disregarded Entity)", tax: "Disregarded entity" },
  "member-single-s": { name: "Member-Managed Single-Member (S Corporation)", tax: "S Corporation" },
  multi: { name: "Manager-Managed Multi-Member (Partnership)", tax: "Partnership" },
  s: { name: "Manager-Managed Multi-Member (S Corporation)", tax: "S Corporation" },
  member: { name: "Member-Managed Multi-Member (Partnership)", tax: "Partnership" },
  "member-s": { name: "Member-Managed Multi-Member (S Corporation)", tax: "S Corporation" },
};
export function taxationLabel(version: string): string {
  return Object.prototype.hasOwnProperty.call(AGREEMENT_FORMS, version) ? AGREEMENT_FORMS[version].tax : "";
}
export function taxationHelp(version: string): string {
  return taxationLabel(version) === "Disregarded entity"
    ? "Reported through its owner for federal income-tax purposes." : "";
}
export function agreementTitle(opts: { version: string; amendedRestated: boolean; generationNumber?: number; companyName?: string }): string {
  const form = Object.prototype.hasOwnProperty.call(AGREEMENT_FORMS, opts.version) ? AGREEMENT_FORMS[opts.version].name : "";
  const prefix = opts.amendedRestated ? "Amended and Restated " : "";
  const number = opts.generationNumber ? ` (No. ${opts.generationNumber})` : "";
  return `${prefix}Operating Agreement${form ? ` — ${form}` : ""}${number}${opts.companyName ? ` — ${opts.companyName}` : ""}`;
}
