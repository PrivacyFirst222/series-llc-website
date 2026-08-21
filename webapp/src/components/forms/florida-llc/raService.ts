import type { FloridaLLCFormData } from "./types";

/** Our registered agent service, exactly as designated on filings. */
export const RA_SERVICE = {
  name: "FLORIDA PROTECTED SERIES, LLC - PS 2",
  address1: "301 N. Fern Creek Avenue",
  address2: "Suite C",
  city: "Orlando",
  state: "FL",
  zip: "32803",
  email: "support@myfloridaseriesllc.com",
} as const;

/** Field patch applied when the customer chooses our RA service. The
 *  acceptance is the service's standing acceptance — we execute the
 *  signed acceptance on the actual filing. The server re-applies this
 *  same patch, so tampered submissions cannot alter our details. */
export function raServicePatch(): Partial<FloridaLLCFormData> {
  return {
    registeredAgentChoice: "SERVICE",
    registeredAgentType: "ENTITY",
    registeredAgentFirstName: "",
    registeredAgentLastName: "",
    registeredAgentBusinessEntityName: RA_SERVICE.name,
    registeredAgentStreetAddress1: RA_SERVICE.address1,
    registeredAgentStreetAddress2: RA_SERVICE.address2,
    registeredAgentCity: RA_SERVICE.city,
    registeredAgentState: RA_SERVICE.state,
    registeredAgentZip: RA_SERVICE.zip,
    registeredAgentEmail: RA_SERVICE.email,
    registeredAgentPhone: "",
    registeredAgentIsAffiliatedPerson: false,
    registeredAgentNotSameAsLlc: true,
    registeredAgentPhysicalAddressAcknowledgment: true,
    registeredAgentAcceptanceName: RA_SERVICE.name,
    registeredAgentAcceptanceCapacity: "PRINCIPAL_OF_ENTITY",
    registeredAgentElectronicSignature: RA_SERVICE.name,
    registeredAgentAcceptanceCheckbox: true,
    registeredAgentSignatureAuthorizationCheckbox: true,
  };
}

/** Field patch applied when the customer serves as their own agent. */
export function raSelfPatch(): Partial<FloridaLLCFormData> {
  return {
    registeredAgentChoice: "SELF",
    registeredAgentType: "INDIVIDUAL",
    registeredAgentBusinessEntityName: "",
    registeredAgentState: "FL",
    registeredAgentIsAffiliatedPerson: true,
    registeredAgentAcceptanceCapacity: "INDIVIDUAL_AGENT",
    // The acceptance fields are theirs to complete — they are the agent.
    registeredAgentNotSameAsLlc: false,
    registeredAgentPhysicalAddressAcknowledgment: false,
    registeredAgentAcceptanceCheckbox: false,
    registeredAgentSignatureAuthorizationCheckbox: false,
  };
}
