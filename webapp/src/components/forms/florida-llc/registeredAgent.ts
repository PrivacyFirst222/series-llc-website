import type { FloridaLLCFormData } from "./types";
import { fullPersonName } from "./validation";

export const AGENT_RESIDENCY = "I live in Florida, and the Florida street address entered above is my business address and the LLC’s registered office, not a P.O. Box.";
export const AGENT_EXISTING_RECORD = "This is the registered agent, and the Florida street address, that the Division has on file for my LLC. This order does not change it.";
export const AGENT_ACCEPTANCE = "I accept the appointment as registered agent for this Florida LLC, and I am familiar with and accept the obligations of that position.";
export const AGENT_SERIES_AGREEMENT = "I confirm that the company’s registered agent has agreed to serve as registered agent for the company and each of its protected series, including every protected series in this order.";
export const AGENT_FORM_VERSION = "fl-llc-formation-v2-agent-consent";
export function conversionAuthority(name: string, changeAgent: boolean): string {
  const company = name.trim() || "the company";
  return `I am authorized to act for ${company}, its members have consented to establishing the protected series on this order, and I authorize MyFloridaSeriesLLC to prepare and file the Protected Series Designations${changeAgent ? " and the change of registered agent" : ""} with the Florida Division of Corporations.`;
}
export function registeredAgentName(data: Pick<FloridaLLCFormData, "registeredAgentType" | "registeredAgentFirstName" | "registeredAgentLastName" | "registeredAgentSuffix" | "registeredAgentBusinessEntityName">): string {
  return data.registeredAgentType === "ENTITY" ? (data.registeredAgentBusinessEntityName ?? "").trim() : fullPersonName(data.registeredAgentFirstName, data.registeredAgentLastName, data.registeredAgentSuffix);
}
/** A confirmation applies to the facts that were on screen when checked. */
export function patchAgentConsents(data: FloridaLLCFormData, patch: Partial<FloridaLLCFormData>): FloridaLLCFormData {
  const keys = Object.keys(patch) as (keyof FloridaLLCFormData)[];
  const changed = (key: keyof FloridaLLCFormData) => keys.includes(key) && JSON.stringify(data[key]) !== JSON.stringify(patch[key]);
  const identity = ["registeredAgentChoice", "registeredAgentType", "registeredAgentFirstName", "registeredAgentLastName", "registeredAgentSuffix", "registeredAgentBusinessEntityName"] as const;
  const address = ["registeredAgentStreetAddress1", "registeredAgentStreetAddress2", "registeredAgentCity", "registeredAgentState", "registeredAgentZip"] as const;
  const agentChanged = [...identity, ...address].some(changed);
  const companyChanged = ["filingPath", "existingLlcName", "sunbizDocumentNumber"].some(k => changed(k as keyof FloridaLLCFormData));
  const next = { ...data, ...patch };
  if (changed("filingPath") && next.filingPath === "NEW" && next.registeredAgentChoice === "SELF" && next.registeredAgentType === "ENTITY") {
    next.registeredAgentType = "INDIVIDUAL";
    next.registeredAgentBusinessEntityName = "";
    next.registeredAgentFirstName = "";
    next.registeredAgentLastName = "";
    next.registeredAgentSuffix = "";
    next.registeredAgentNotSameAsLlc = false;
  }
  if (agentChanged || companyChanged) {
    next.registeredAgentExistingRecordAcknowledgment = false;
    next.registeredAgentResidencyAcknowledgment = false;
    if (next.registeredAgentChoice !== "SERVICE") {
      next.registeredAgentPhysicalAddressAcknowledgment = false;
      next.registeredAgentAcceptanceName = next.filingPath === "CONVERT" ? "" : registeredAgentName(next);
      next.registeredAgentElectronicSignature = "";
      next.registeredAgentAcceptanceCheckbox = false;
      next.registeredAgentSignatureAuthorizationCheckbox = false;
    }
  }
  if (agentChanged || companyChanged || changed("series")) next.registeredAgentSeriesAgreementAcknowledgment = false;
  if (changed("registeredAgentChoice") || companyChanged || changed("series")) next.conversionAuthorityAcknowledgment = false;
  return next;
}
