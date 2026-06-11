import { buildFinalLlcName, calculateEstimatedFees } from "./validation";
import type { FloridaLLCFormData, SubmissionPayload } from "./types";

export function buildPayload(data: FloridaLLCFormData): SubmissionPayload {
  const fees = calculateEstimatedFees({
    certificateOfStatus: data.orderCertificateOfStatus,
    certifiedCopy: data.orderCertifiedCopy,
    seriesCount: data.series.length,
  });

  const finalName = buildFinalLlcName(
    data.desiredLlcName,
    data.llcDesignator,
  );

  return {
    formationType: data.formationType,
    llcName: {
      desiredName: data.desiredLlcName,
      designator: data.llcDesignator || "",
      finalName,
      alternateNames: [data.alternateName1, data.alternateName2].filter(
        (s): s is string => Boolean(s && s.trim()),
      ),
    },
    principalOfficeAddress: data.principalAddress,
    mailingAddress: data.mailingSameAsPrincipal
      ? data.principalAddress
      : data.mailingAddress,
    registeredAgent: {
      type: data.registeredAgentType || "",
      name: data.registeredAgentName ?? "",
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
      managersOrAuthorizedRepresentatives: data.managers,
    },
    members: {
      collectForInternalRecords: data.collectMembersForInternalRecords,
      includeMembersInArticles: data.includeMembersInArticles,
      memberList: data.includeMembersInArticles ? data.members : data.members,
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
    },
    series: data.series,
    estimatedStateFees: fees,
    certifications: {
      authorizedRepresentativeName: data.authorizedRepresentativeName,
      authorizedRepresentativeTitle:
        data.authorizedRepresentativeTitle ?? "",
      authorizedRepresentativeSignature:
        data.authorizedRepresentativeSignature,
      atLeastOneMemberAcknowledged: data.atLeastOneMemberAcknowledgment,
      accuracyAcknowledged: data.accuracyAcknowledgment,
      publicRecordAcknowledged: data.publicRecordAcknowledgment,
      notLegalAdviceAcknowledged: data.legalAdviceAcknowledgment,
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

// Formspree renders each top-level key as one line in the notification email,
// so nested objects must be flattened to readable "a / b / c" keys.
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
