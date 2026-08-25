import { z } from "zod";

const PO_BOX_REGEX = /\b(p\.?\s*o\.?\s*box|post\s*office\s*box)\b/i;
export const isPoBox = (s: string): boolean => PO_BOX_REGEX.test(s);

export const addressSchema = z.object({
  address1: z.string().min(1, "Street address is required"),
  address2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(3, "ZIP / postal code is required"),
  country: z.string().min(1, "Country is required"),
});

export const principalAddressSchema = addressSchema.refine(
  (a) => !isPoBox(a.address1) && !isPoBox(a.address2 ?? ""),
  {
    message: "A P.O. Box cannot be used for the principal office address.",
    path: ["address1"],
  },
);

export const partyEntrySchema = z.object({
  id: z.string(),
  role: z.enum(["MGR", "AR"]),
  personOrEntity: z.enum(["INDIVIDUAL", "ENTITY"]),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  businessEntityName: z.string().optional().or(z.literal("")),
  streetAddress1: z.string().min(1, "Street address is required"),
  streetAddress2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(3, "ZIP is required"),
  country: z.string().min(1, "Country is required"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
}).superRefine((p, ctx) => {
  if (p.personOrEntity === "INDIVIDUAL" && (!p.firstName || !p.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: "Full name is required",
    });
  }
  if (p.personOrEntity === "ENTITY" && !p.businessEntityName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessEntityName"],
      message: "Business entity name is required",
    });
  }
});

export const memberEntrySchema = z.object({
  id: z.string(),
  memberType: z.enum(["INDIVIDUAL", "ENTITY"]),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  entityName: z.string().optional().or(z.literal("")),
  address1: z.string().min(1, "Address is required"),
  address2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(3, "ZIP is required"),
  country: z.string().min(1, "Country is required"),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  capitalContribution: z.number().min(0).optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  isInitialMember: z.boolean(),
}).superRefine((m, ctx) => {
  if (m.memberType === "INDIVIDUAL" && (!m.firstName || !m.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: "Full legal name is required",
    });
  }
  if (m.memberType === "ENTITY" && !m.entityName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entityName"],
      message: "Entity name is required",
    });
  }
});

export const llcDesignators = [
  "LLC",
  "L.L.C.",
  "Limited Liability Company",
  "PLLC",
  "P.L.L.C.",
  "Professional Limited Liability Company",
] as const;

export const formationFormSchema = z.object({
  formationType: z.enum(["DOMESTIC_LLC", "PLLC"]),
  isFloridaDomesticEntityOnly: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  notLegalAdvice: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  publicRecordNotice: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),

  desiredLlcName: z.string().min(1, "LLC name is required"),
  llcDesignator: z.enum(llcDesignators, {
    errorMap: () => ({ message: "Choose an LLC designator." }),
  }),
  alternateName1: z.string().optional().or(z.literal("")),
  alternateName2: z.string().optional().or(z.literal("")),
  exactNameOnly: z.boolean().optional(),
  nameSearchAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  governmentAffiliationAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  lawfulPurposeNameAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),

  principalAddress: principalAddressSchema,

  mailingSameAsPrincipal: z.boolean(),
  mailingAddress: addressSchema,

  registeredAgentType: z.enum(["INDIVIDUAL", "ENTITY"]),
  registeredAgentFirstName: z.string().optional().or(z.literal("")),
  registeredAgentLastName: z.string().optional().or(z.literal("")),
  registeredAgentBusinessEntityName: z.string().optional().or(z.literal("")),
  registeredAgentStreetAddress1: z.string().min(1, "Street address required"),
  registeredAgentStreetAddress2: z.string().optional().or(z.literal("")),
  registeredAgentCity: z.string().min(1, "City required"),
  registeredAgentState: z.string().refine((s) => s === "FL", {
    message: "Registered agent address must be in Florida (FL).",
  }),
  registeredAgentZip: z.string().min(3, "ZIP required"),
  registeredAgentEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  registeredAgentPhone: z.string().optional().or(z.literal("")),
  registeredAgentIsAffiliatedPerson: z.boolean(),
  registeredAgentNotSameAsLlc: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  registeredAgentPhysicalAddressAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),

  registeredAgentAcceptanceName: z.string().min(1, "Name required"),
  registeredAgentAcceptanceCapacity: z.enum([
    "INDIVIDUAL_AGENT",
    "PRINCIPAL_OF_ENTITY",
  ]),
  registeredAgentAcceptanceCheckbox: z.literal(true, {
    errorMap: () => ({ message: "Acceptance is required." }),
  }),
  registeredAgentElectronicSignature: z.string().min(1, "Electronic signature required"),
  registeredAgentSignatureAuthorizationCheckbox: z.literal(true, {
    errorMap: () => ({ message: "Authorization is required." }),
  }),

  managementStructure: z.enum([
    "MEMBER_MANAGED",
    "MANAGER_MANAGED",
    "NOT_SPECIFIED",
  ]),
  includeManagementStatementInArticles: z.boolean(),

  managers: z.array(partyEntrySchema),

  collectMembersForInternalRecords: z.boolean(),
  includeMembersInArticles: z.boolean(),
  // Required for member-managed companies (they are the AMBRs the Articles
  // list). Manager-managed intakes never see the members step — ownership is
  // collected in the operating agreement questionnaire — so the array may be
  // empty; the conditional floor lives in the server's superRefine.
  members: z.array(memberEntrySchema),

  purposeType: z.enum(["GENERAL", "SPECIFIC", "PROFESSIONAL"]),
  businessPurposeText: z.string(),

  effectiveDateOption: z.enum(["FILED_BY_DIVISION", "SPECIFIC"]),
  requestedEffectiveDate: z.string().optional().or(z.literal("")),

  clientFirstName: z.string().min(1, "First name required"),
  clientLastName: z.string().min(1, "Last name required"),
  clientAddress: addressSchema,
  clientEmail: z.string().email("Enter a valid email"),
  confirmClientEmail: z.string().email("Enter a valid email"),
  clientPhone: z.string().optional().or(z.literal("")),

  correspondentName: z.string().min(1, "Name required"),
  correspondentCompany: z.string().optional().or(z.literal("")),
  correspondentEmail: z.string().email("Enter a valid email"),
  confirmCorrespondentEmail: z.string().email("Enter a valid email"),
  correspondentPhone: z.string().optional().or(z.literal("")),

  orderCertificateOfStatus: z.boolean(),
  orderCertifiedCopy: z.boolean(),

  // Required only when the client signs. When the client appoints us instead,
  // our own representative signs, so these stay empty — the conditional rule
  // lives in the server's superRefine so neither path can be skipped.
  authorizedRepresentativeName: z.string().optional().or(z.literal("")),
  authorizedRepresentativeTitle: z.string().optional().or(z.literal("")),
  authorizedRepresentativeEmail: z.string().email().optional().or(z.literal("")),
  authorizedRepresentativePhone: z.string().optional().or(z.literal("")),
  authorizedRepresentativeSignature: z.string().optional().or(z.literal("")),
  authorizedRepresentativeSignatureCheckbox: z.boolean().optional(),
  atLeastOneMemberAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  accuracyAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  publicRecordAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
  legalAdviceAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: "Acknowledgment is required." }),
  }),
});
