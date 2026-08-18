/**
 * Single source of truth for the intake flow's order and labels.
 *
 * Steps are addressed by key rather than by numeric index so that inserting a
 * step (as the conversion path required) cannot silently repoint the review
 * page's edit links or the per-step validation.
 */
export type StepKey =
  | "path"
  | "intro"
  | "name"
  | "principal"
  | "mailing"
  | "series"
  | "agent"
  | "acceptance"
  | "management"
  | "managers"
  | "members"
  | "purpose"
  | "effective"
  | "correspondence"
  | "optional"
  | "review"
  | "certify"
  | "submit";

export const STEPS: { key: StepKey; label: string }[] = [
  { key: "path", label: "Getting started" },
  { key: "intro", label: "Eligibility" },
  { key: "name", label: "LLC name" },
  { key: "principal", label: "Principal address" },
  { key: "mailing", label: "Mailing address" },
  { key: "series", label: "Series" },
  { key: "agent", label: "Registered agent" },
  { key: "acceptance", label: "Agent acceptance" },
  { key: "management", label: "Management" },
  // Members before managers: the managers are almost always the members, so the
  // managers step offers them by name rather than making the client retype one.
  { key: "members", label: "Initial members" },
  { key: "managers", label: "Managers / AR" },
  { key: "purpose", label: "Purpose" },
  { key: "effective", label: "Effective date" },
  { key: "correspondence", label: "Correspondence" },
  { key: "optional", label: "Optional docs" },
  { key: "review", label: "Review" },
  { key: "certify", label: "Certify & sign" },
  { key: "submit", label: "Submit" },
];

export const stepIndexOf = (key: StepKey): number =>
  STEPS.findIndex((s) => s.key === key);

/** Which step edits a given top-level form field — used to send the user to
 *  the right screen when server-side validation flags something. */
const FIELD_STEP: Record<string, StepKey> = {
  filingPath: "path",
  existingLlcName: "path",
  sunbizDocumentNumber: "path",
  formationType: "intro",
  isFloridaDomesticEntityOnly: "intro",
  notLegalAdvice: "intro",
  publicRecordNotice: "intro",
  desiredLlcName: "name",
  llcDesignator: "name",
  alternateName1: "name",
  alternateName2: "name",
  nameSearchAcknowledgment: "name",
  governmentAffiliationAcknowledgment: "name",
  lawfulPurposeNameAcknowledgment: "name",
  principalAddress: "principal",
  mailingSameAsPrincipal: "mailing",
  mailingAddress: "mailing",
  series: "series",
  registeredAgentAcceptanceCheckbox: "acceptance",
  registeredAgentAcceptanceName: "acceptance",
  registeredAgentAcceptanceCapacity: "acceptance",
  registeredAgentElectronicSignature: "acceptance",
  registeredAgentSignatureAuthorizationCheckbox: "acceptance",
  managementStructure: "management",
  includeManagementStatementInArticles: "management",
  managers: "managers",
  members: "members",
  collectMembersForInternalRecords: "members",
  includeMembersInArticles: "members",
  purposeType: "purpose",
  businessPurposeText: "purpose",
  effectiveDateOption: "effective",
  requestedEffectiveDate: "effective",
  correspondentName: "correspondence",
  correspondentEmail: "correspondence",
  confirmCorrespondentEmail: "correspondence",
  correspondentCompany: "correspondence",
  correspondentPhone: "correspondence",
  correspondentAddress: "correspondence",
  orderCertificateOfStatus: "optional",
  orderCertifiedCopy: "optional",
};

export function stepForField(field: string): StepKey {
  if (FIELD_STEP[field]) return FIELD_STEP[field];
  // Remaining registeredAgent* fields belong to the agent step; the
  // certification fields and anything unknown land on certify.
  if (field.startsWith("registeredAgent")) return "agent";
  return "certify";
}
