import { canonicalizeSeriesName, buildFinalLlcName, calculateEstimatedFees } from "./validation";
import { fullPersonName } from "./validation";
import type { FloridaLLCFormData, SubmissionPayload } from "./types";

export function buildPayload(data: FloridaLLCFormData): SubmissionPayload {
  const isConversion = data.filingPath === "CONVERT";
  const fees = calculateEstimatedFees({
    isConversion,
    certificateOfStatus: data.orderCertificateOfStatus,
    certifiedCopy: data.orderCertifiedCopy,
    seriesCount: data.series.length,
    registeredAgentChange: data.registeredAgentChoice === "SERVICE",
  });

  const finalName = buildFinalLlcName(
    data.desiredLlcName,
    data.llcDesignator,
  );

  return {
    filingPath: data.filingPath ?? "NEW",
    existingLlcName: data.existingLlcName ?? "",
    sunbizDocumentNumber: data.sunbizDocumentNumber ?? "",
    formationType: data.formationType,
    llcName: {
      desiredName: data.desiredLlcName,
      designator: data.llcDesignator || "",
      finalName,
      // Alternates are entered without the designator, like the main name, and
      // stored Sunbiz-ready with it applied.
      alternateNames: [data.alternateName1, data.alternateName2]
        .map((n) => buildFinalLlcName((n ?? "").trim(), data.llcDesignator))
        .filter((s): s is string => Boolean(s && s.trim())),
      exactNameOnly: data.exactNameOnly === true,
    },
    principalOfficeAddress: data.principalAddress,
    mailingAddress: data.mailingSameAsPrincipal
      ? data.principalAddress
      : data.mailingAddress,
    registeredAgent: {
      choice: data.registeredAgentChoice ?? "",
      type: data.registeredAgentType || "",
      name: fullPersonName(
        data.registeredAgentFirstName,
        data.registeredAgentLastName,
        data.registeredAgentSuffix,
      ),
      firstName: data.registeredAgentFirstName ?? "",
      lastName: data.registeredAgentLastName ?? "",
      suffix: data.registeredAgentSuffix ?? "",
      businessEntityName: data.registeredAgentBusinessEntityName ?? "",
      address: {
        address1: data.registeredAgentStreetAddress1,
        address2: data.registeredAgentStreetAddress2 ?? "",
        city: data.registeredAgentCity,
        state: data.registeredAgentState,
        zip: data.registeredAgentZip,
        country: "United States",
      },
      email: data.registeredAgentEmail ?? "",
      phone: data.registeredAgentPhone ?? "",
      acceptance: {
        accepted: data.registeredAgentAcceptanceCheckbox,
        acceptanceName: data.registeredAgentAcceptanceName,
        capacity: data.registeredAgentAcceptanceCapacity || "",
        electronicSignature: data.registeredAgentElectronicSignature,
        signatureAuthorizationConfirmed:
          data.registeredAgentSignatureAuthorizationCheckbox,
      },
    },
    management: {
      structure: data.managementStructure || "",
      includeManagementStatementInArticles:
        data.includeManagementStatementInArticles,
      // Member-managed: the members are listed automatically (AMBR) and the
      // managers step is never shown — a stray entry must not reach the filing.
      managersOrAuthorizedRepresentatives:
        data.managementStructure === "MEMBER_MANAGED" ? [] : data.managers,
    },
    members: {
      collectForInternalRecords: data.collectMembersForInternalRecords,
      includeMembersInArticles: data.includeMembersInArticles,
      // Manager-managed: the members step is never shown — ownership lives in
      // the operating agreement questionnaire, and a stray default row must
      // not reach the record.
      memberList:
        data.managementStructure === "MANAGER_MANAGED" ? [] : data.members,
    },
    purpose: {
      purposeType: data.purposeType || "",
      businessPurposeText: data.businessPurposeText,
    },
    effectiveDate: {
      option: data.effectiveDateOption,
      requestedEffectiveDate:
        data.effectiveDateOption === "SPECIFIC"
          ? data.requestedEffectiveDate ?? null
          : null,
    },
    client: {
      firstName: data.clientFirstName.trim(),
      lastName: data.clientLastName.trim(),
      suffix: (data.clientSuffix ?? "").trim(),
      name: fullPersonName(data.clientFirstName, data.clientLastName, data.clientSuffix),
      email: data.clientEmail,
      phone: data.clientPhone ?? "",
      address: data.clientAddress,
    },
    correspondence: {
      name: data.correspondentName,
      company: data.correspondentCompany ?? "",
      email: data.correspondentEmail,
      phone: data.correspondentPhone ?? "",
      address: data.correspondentAddress ?? null,
    },
    optionalDocuments: {
      certificateOfStatus: data.orderCertificateOfStatus,
      certifiedCopy: data.orderCertifiedCopy,
      ein: data.orderEin,
      sElection: data.orderSElection && data.filingPath !== "CONVERT",
    },
    series: data.series.map((s) => ({ ...s, name: canonicalizeSeriesName(s.name) })),
    estimatedStateFees: fees,
    certifications: {
      articlesSignedBy: data.articlesSignerChoice,
      articlesSignerAppointed: data.articlesSignerAppointment,
      authorizedRepresentativeName: data.authorizedRepresentativeName,
      authorizedRepresentativeTitle:
        data.authorizedRepresentativeTitle ?? "",
      authorizedRepresentativeSignature:
        data.authorizedRepresentativeSignature,
      atLeastOneMemberAcknowledged: data.atLeastOneMemberAcknowledgment,
      accuracyAcknowledged: data.accuracyAcknowledgment,
      publicRecordAcknowledged: data.publicRecordAcknowledgment,
      notLegalAdviceAcknowledged: data.legalAdviceAcknowledgment,
      seriesOwnershipAcknowledged: data.seriesOwnershipAcknowledgment,
    },
    metadata: {
      submittedAt: new Date().toISOString(),
      ipAddress: "", // TODO(server): fill from request context
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      formVersion: "fl-llc-formation-v1",
    },
  };
}
