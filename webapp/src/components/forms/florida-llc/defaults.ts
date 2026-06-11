import type { FloridaLLCFormData, MemberEntry } from "./types";

const newId = () => Math.random().toString(36).slice(2, 10);

const blankAddress = {
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
};

const initialMember = (): MemberEntry => ({
  id: newId(),
  memberType: "INDIVIDUAL",
  fullLegalName: "",
  entityName: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
  ownershipPercentage: undefined,
  capitalContribution: undefined,
  email: "",
  phone: "",
  isInitialMember: true,
});

export const defaultFormData: FloridaLLCFormData = {
  formationType: "DOMESTIC_LLC",
  isFloridaDomesticEntityOnly: false,
  notLegalAdvice: false,
  publicRecordNotice: false,

  desiredLlcName: "",
  llcDesignator: "",
  alternateName1: "",
  alternateName2: "",
  nameSearchAcknowledgment: false,
  governmentAffiliationAcknowledgment: false,
  lawfulPurposeNameAcknowledgment: false,

  principalAddress: { ...blankAddress },

  mailingSameAsPrincipal: true,
  mailingAddress: { ...blankAddress },

  registeredAgentType: "",
  registeredAgentName: "",
  registeredAgentBusinessEntityName: "",
  registeredAgentStreetAddress1: "",
  registeredAgentStreetAddress2: "",
  registeredAgentCity: "",
  registeredAgentState: "FL",
  registeredAgentZip: "",
  registeredAgentEmail: "",
  registeredAgentPhone: "",
  registeredAgentIsAffiliatedPerson: false,
  registeredAgentNotSameAsLlc: false,
  registeredAgentPhysicalAddressAcknowledgment: false,

  registeredAgentAcceptanceName: "",
  registeredAgentAcceptanceCapacity: "",
  registeredAgentAcceptanceCheckbox: false,
  registeredAgentElectronicSignature: "",
  registeredAgentSignatureAuthorizationCheckbox: false,

  managementStructure: "",
  includeManagementStatementInArticles: false,

  managers: [],

  collectMembersForInternalRecords: true,
  includeMembersInArticles: false,
  members: [initialMember()],

  purposeType: "",
  businessPurposeText: "",

  effectiveDateOption: "FILED_BY_DIVISION",
  requestedEffectiveDate: "",

  correspondentName: "",
  correspondentCompany: "",
  correspondentEmail: "",
  confirmCorrespondentEmail: "",
  correspondentPhone: "",
  correspondentAddress: undefined,

  orderCertificateOfStatus: false,
  orderCertifiedCopy: false,

  series: [],

  authorizedRepresentativeName: "",
  authorizedRepresentativeTitle: "",
  authorizedRepresentativeEmail: "",
  authorizedRepresentativePhone: "",
  authorizedRepresentativeSignature: "",
  authorizedRepresentativeSignatureCheckbox: false,
  atLeastOneMemberAcknowledgment: false,
  accuracyAcknowledgment: false,
  publicRecordAcknowledgment: false,
  legalAdviceAcknowledgment: false,
};
