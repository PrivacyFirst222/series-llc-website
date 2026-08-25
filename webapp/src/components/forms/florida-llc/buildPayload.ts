import { canonicalizeSeriesName, buildFinalLlcName, calculateEstimatedFees } from "./validation";
import type { FloridaLLCFormData, SubmissionPayload } from "./types";

const joinName = (first?: string, last?: string): string =>
  [first, last].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");

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
      name: joinName(data.registeredAgentFirstName, data.registeredAgentLastName),
      firstName: data.registeredAgentFirstName ?? "",
      lastName: data.registeredAgentLastName ?? "",
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
      name: `${data.clientFirstName.trim()} ${data.clientLastName.trim()}`.trim(),
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

// Legacy fallback path: while online ordering is not yet enabled in production,
// intakes still go to Formspree, whose emails need flat readable keys.
export function flattenForFormspree(
  value: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (value === null || value === undefined || value === "") {
    return out;
  }
  if (typeof value === "boolean") {
    out[prefix] = value ? "Yes" : "No";
    return out;
  }
  if (typeof value === "string" || typeof value === "number") {
    out[prefix] = String(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      flattenForFormspree(item, prefix ? `${prefix} / ${i + 1}` : String(i + 1), out),
    );
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flattenForFormspree(child, prefix ? `${prefix} / ${key}` : key, out);
  }
  return out;
}
