export type FormationType = "DOMESTIC_LLC" | "PLLC";

export type LlcDesignator =
  | "LLC"
  | "L.L.C."
  | "Limited Liability Company"
  | "PLLC"
  | "P.L.L.C."
  | "Professional Limited Liability Company";

export type ManagementStructure =
  | "MEMBER_MANAGED"
  | "MANAGER_MANAGED"
  | "NOT_SPECIFIED";

export type PartyRole = "MGR" | "AR";
export type PartyKind = "INDIVIDUAL" | "ENTITY";

export type PurposeType = "GENERAL" | "SPECIFIC" | "PROFESSIONAL";

export type EffectiveDateOption = "FILED_BY_DIVISION" | "SPECIFIC";

export type RegisteredAgentType = "INDIVIDUAL" | "ENTITY";

export type RegisteredAgentCapacity =
  | "INDIVIDUAL_AGENT"
  | "PRINCIPAL_OF_ENTITY";

export interface AddressFields {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface PartyEntry {
  id: string;
  role: PartyRole;
  personOrEntity: PartyKind;
  fullName?: string;
  businessEntityName?: string;
  streetAddress1: string;
  streetAddress2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface MemberEntry {
  id: string;
  memberType: PartyKind;
  fullLegalName?: string;
  entityName?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  ownershipPercentage?: number;
  capitalContribution?: number;
  email?: string;
  phone?: string;
  isInitialMember: boolean;
}

export interface SeriesEntry {
  id: string;
  name: string;
}

export interface FloridaLLCFormData {
  // Section 1
  formationType: FormationType;
  isFloridaDomesticEntityOnly: boolean;
  notLegalAdvice: boolean;
  publicRecordNotice: boolean;

  // Section 2
  desiredLlcName: string;
  llcDesignator: LlcDesignator | "";
  alternateName1?: string;
  alternateName2?: string;
  nameSearchAcknowledgment: boolean;
  governmentAffiliationAcknowledgment: boolean;
  lawfulPurposeNameAcknowledgment: boolean;

  // Section 3
  principalAddress: AddressFields;

  // Section 4
  mailingSameAsPrincipal: boolean;
  mailingAddress: AddressFields;

  // Section 5
  registeredAgentType: RegisteredAgentType | "";
  registeredAgentName?: string;
  registeredAgentBusinessEntityName?: string;
  registeredAgentStreetAddress1: string;
  registeredAgentStreetAddress2?: string;
  registeredAgentCity: string;
  registeredAgentState: string;
  registeredAgentZip: string;
  registeredAgentEmail?: string;
  registeredAgentPhone?: string;
  registeredAgentIsAffiliatedPerson: boolean;
  registeredAgentNotSameAsLlc: boolean;
  registeredAgentPhysicalAddressAcknowledgment: boolean;

  // Section 6
  registeredAgentAcceptanceName: string;
  registeredAgentAcceptanceCapacity: RegisteredAgentCapacity | "";
  registeredAgentAcceptanceCheckbox: boolean;
  registeredAgentElectronicSignature: string;
  registeredAgentSignatureAuthorizationCheckbox: boolean;

  // Section 7
  managementStructure: ManagementStructure | "";
  includeManagementStatementInArticles: boolean;

  // Section 8
  managers: PartyEntry[];

  // Section 9
  collectMembersForInternalRecords: boolean;
  includeMembersInArticles: boolean;
  members: MemberEntry[];

  // Section 10
  purposeType: PurposeType | "";
  businessPurposeText: string;

  // Section 11
  effectiveDateOption: EffectiveDateOption;
  requestedEffectiveDate?: string;

  // Section 12
  correspondentName: string;
  correspondentCompany?: string;
  correspondentEmail: string;
  confirmCorrespondentEmail: string;
  correspondentPhone?: string;
  correspondentAddress?: AddressFields;

  // Section 13
  orderCertificateOfStatus: boolean;
  orderCertifiedCopy: boolean;

  // Section 13.5 – Series
  series: SeriesEntry[];

  // Section 15
  authorizedRepresentativeName: string;
  authorizedRepresentativeTitle?: string;
  authorizedRepresentativeEmail?: string;
  authorizedRepresentativePhone?: string;
  authorizedRepresentativeSignature: string;
  authorizedRepresentativeSignatureCheckbox: boolean;
  atLeastOneMemberAcknowledgment: boolean;
  accuracyAcknowledgment: boolean;
  publicRecordAcknowledgment: boolean;
  legalAdviceAcknowledgment: boolean;
}

export interface SubmissionPayload {
  formationType: string;
  llcName: {
    desiredName: string;
    designator: string;
    finalName: string;
    alternateNames: string[];
  };
  principalOfficeAddress: AddressFields;
  mailingAddress: AddressFields;
  registeredAgent: {
    type: string;
    name: string;
    businessEntityName: string;
    address: AddressFields;
    email: string;
    phone: string;
    acceptance: {
      accepted: boolean;
      acceptanceName: string;
      capacity: string;
      electronicSignature: string;
      signatureAuthorizationConfirmed: boolean;
    };
  };
  management: {
    structure: string;
    includeManagementStatementInArticles: boolean;
    managersOrAuthorizedRepresentatives: PartyEntry[];
  };
  members: {
    collectForInternalRecords: boolean;
    includeMembersInArticles: boolean;
    memberList: MemberEntry[];
  };
  purpose: {
    purposeType: string;
    businessPurposeText: string;
  };
  effectiveDate: {
    option: string;
    requestedEffectiveDate: string | null;
  };
  correspondence: {
    name: string;
    company: string;
    email: string;
    phone: string;
    address: AddressFields | null;
  };
  optionalDocuments: {
    certificateOfStatus: boolean;
    certifiedCopy: boolean;
  };
  series: SeriesEntry[];
  estimatedStateFees: {
    articlesOfOrganization: number;
    registeredAgentDesignation: number;
    certificateOfStatus: number;
    certifiedCopy: number;
    estimatedTotal: number;
  };
  certifications: {
    authorizedRepresentativeName: string;
    authorizedRepresentativeTitle: string;
    authorizedRepresentativeSignature: string;
    atLeastOneMemberAcknowledged: boolean;
    accuracyAcknowledged: boolean;
    publicRecordAcknowledged: boolean;
    notLegalAdviceAcknowledged: boolean;
  };
  metadata: {
    submittedAt: string;
    ipAddress: string;
    userAgent: string;
    formVersion: string;
  };
}
