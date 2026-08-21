import { isPoBox } from "./schema";
import {
  buildFinalLlcName,
  designatorAllowedForFormationType,
  hasProtectedSeriesPhrase,
  isValidEmail,
  nameContainsLegalDesignator,
  validateEffectiveDate,
} from "./validation";
import type { FloridaLLCFormData, LlcDesignator } from "./types";
import type { StepKey } from "./steps";

export type StepErrors = Record<string, string>;

export function validateStep(
  step: StepKey,
  data: FloridaLLCFormData,
): StepErrors {
  const e: StepErrors = {};

  if (step === "path") {
    if (!data.filingPath) e.filingPath = "Choose one to continue.";
  }

  if (step === "intro") {
    if (!data.isFloridaDomesticEntityOnly)
      e.isFloridaDomesticEntityOnly = "Acknowledgment is required.";
    if (!data.notLegalAdvice) e.notLegalAdvice = "Acknowledgment is required.";
    if (!data.publicRecordNotice)
      e.publicRecordNotice = "Acknowledgment is required.";
  }

  if (step === "name") {
    if (data.filingPath === "CONVERT") {
      if (!data.existingLlcName?.trim())
        e.existingLlcName = "Enter the LLC's name exactly as it appears with the state.";
      if (!data.sunbizDocumentNumber?.trim())
        e.sunbizDocumentNumber = "Sunbiz document number is required.";
    } else {
      if (!data.desiredLlcName.trim())
        e.desiredLlcName = "LLC name is required.";
      if (!data.llcDesignator) e.llcDesignator = "Choose a designator.";
      if (
        data.llcDesignator &&
        !designatorAllowedForFormationType(
          data.llcDesignator as LlcDesignator,
          data.formationType,
        )
      ) {
        e.llcDesignator =
          "Designator not allowed for the selected formation type.";
      }
      const finalName = buildFinalLlcName(data.desiredLlcName, data.llcDesignator);
      if (finalName && !nameContainsLegalDesignator(finalName)) {
        e.desiredLlcName =
          "Florida LLC name must include LLC, L.L.C., or Limited Liability Company.";
      }
      if (!data.nameSearchAcknowledgment)
        e.nameSearchAcknowledgment = "Acknowledgment is required.";
      if (!data.governmentAffiliationAcknowledgment)
        e.governmentAffiliationAcknowledgment = "Acknowledgment is required.";
      if (!data.lawfulPurposeNameAcknowledgment)
        e.lawfulPurposeNameAcknowledgment = "Acknowledgment is required.";
    }
  }

  if (step === "principal") {
    const a = data.principalAddress;
    if (!a.address1) e["principalAddress.address1"] = "Street address required.";
    if (!a.city) e["principalAddress.city"] = "City required.";
    if (!a.state) e["principalAddress.state"] = "State required.";
    if (!a.zip) e["principalAddress.zip"] = "ZIP required.";
    if (!a.country) e["principalAddress.country"] = "Country required.";
    if (isPoBox(a.address1) || isPoBox(a.address2 ?? "")) {
      e["principalAddress.address1"] =
        "A P.O. Box cannot be used for the principal office address.";
    }
  }

  if (step === "mailing") {
    if (!data.mailingSameAsPrincipal) {
      const a = data.mailingAddress;
      if (!a.address1) e["mailingAddress.address1"] = "Street address required.";
      if (!a.city) e["mailingAddress.city"] = "City required.";
      if (!a.state) e["mailingAddress.state"] = "State required.";
      if (!a.zip) e["mailingAddress.zip"] = "ZIP required.";
      if (!a.country) e["mailingAddress.country"] = "Country required.";
    }
  }

  if (step === "series") {
    if (data.series.length === 0)
      e.series = "Add at least one series to proceed.";
    if (!data.seriesOwnershipAcknowledgment)
      e.seriesOwnershipAcknowledgment =
        "Please confirm you understand that your LLC will own every protected series.";
    data.series.forEach((s, i) => {
      const name = s.name.trim();
      if (!name) {
        e[`series.${i}.name`] = "Series identifier is required.";
      } else if (!hasProtectedSeriesPhrase(name)) {
        e[`series.${i}.name`] =
          'Include "PS" (or "P.S." / "protected series") — §605.2202 requires it in every series name.';
      }
    });
    const names = data.series.map((s) => s.name.trim().toLowerCase());
    names.forEach((n, i) => {
      if (n && names.indexOf(n) !== i)
        e[`series.${i}.name`] = "Each series must have a unique name.";
    });
  }

  if (step === "agent") {
    if (!data.registeredAgentChoice)
      e.registeredAgentChoice = "Choose who will serve as registered agent.";
    if (data.registeredAgentChoice === "SELF") {
      if (!data.registeredAgentFirstName)
        e.registeredAgentFirstName = "First name is required.";
      if (!data.registeredAgentLastName)
        e.registeredAgentLastName = "Last name is required.";
      if (!data.registeredAgentStreetAddress1)
        e.registeredAgentStreetAddress1 = "Street address required.";
      if (!data.registeredAgentCity) e.registeredAgentCity = "City required.";
      if (!data.registeredAgentZip) e.registeredAgentZip = "ZIP required.";
      if (
        isPoBox(data.registeredAgentStreetAddress1) ||
        isPoBox(data.registeredAgentStreetAddress2 ?? "")
      )
        e.registeredAgentStreetAddress1 =
          "A P.O. Box cannot be used for the registered agent address.";
      if (!data.registeredAgentNotSameAsLlc)
        e.registeredAgentNotSameAsLlc = "Acknowledgment is required.";
      if (!data.registeredAgentPhysicalAddressAcknowledgment)
        e.registeredAgentPhysicalAddressAcknowledgment =
          "Acknowledgment is required.";
    }
  }

  if (step === "acceptance" && data.registeredAgentChoice !== "SERVICE") {
    if (!data.registeredAgentAcceptanceName)
      e.registeredAgentAcceptanceName = "Your name is required.";
    if (!data.registeredAgentElectronicSignature)
      e.registeredAgentElectronicSignature = "Electronic signature required.";
    if (!data.registeredAgentAcceptanceCheckbox)
      e.registeredAgentAcceptanceCheckbox = "Acceptance is required.";
    if (!data.registeredAgentSignatureAuthorizationCheckbox)
      e.registeredAgentSignatureAuthorizationCheckbox =
        "Authorization is required.";
  }

  if (step === "management") {
    if (!data.managementStructure)
      e.managementStructure = "Choose a management structure.";
    else if (data.managementStructure === "NOT_SPECIFIED")
      e.managementStructure =
        "Please choose member-managed or manager-managed.";
  }

  if (step === "managers") {
    const needsManager =
      data.managementStructure === "MANAGER_MANAGED" &&
      data.includeManagementStatementInArticles;
    if (
      needsManager &&
      !data.managers.some((m) => m.role === "MGR")
    )
      e.managers =
        "At least one Manager (MGR) is required when including a manager-managed statement in the Articles.";

    data.managers.forEach((m, i) => {
      if (m.personOrEntity === "INDIVIDUAL" && !m.firstName)
        e[`managers.${i}.firstName`] = "First name required.";
      if (m.personOrEntity === "INDIVIDUAL" && !m.lastName)
        e[`managers.${i}.lastName`] = "Last name required.";
      if (m.personOrEntity === "ENTITY" && !m.businessEntityName)
        e[`managers.${i}.businessEntityName`] = "Entity name required.";
      if (!m.streetAddress1)
        e[`managers.${i}.streetAddress1`] = "Street address required.";
    });
  }

  if (step === "members") {
    if (data.members.length === 0)
      e.members =
        "At least one initial member is required for internal formation records.";
    data.members.forEach((m, i) => {
      if (m.memberType === "INDIVIDUAL" && !m.firstName)
        e[`members.${i}.firstName`] = "First name required.";
      if (m.memberType === "INDIVIDUAL" && !m.lastName)
        e[`members.${i}.lastName`] = "Last name required.";
      if (m.memberType === "ENTITY" && !m.entityName)
        e[`members.${i}.entityName`] = "Entity name required.";
      if (!m.address1) e[`members.${i}.address1`] = "Address required.";
    });
  }

  if (step === "purpose") {
    if (!data.purposeType) e.purposeType = "Choose a purpose type.";
    if (data.formationType === "PLLC") {
      if (data.purposeType !== "PROFESSIONAL")
        e.purposeType =
          "A Professional LLC must select a professional purpose.";
      if (!data.businessPurposeText.trim())
        e.businessPurposeText =
          "A Professional LLC must provide a specific professional purpose.";
    } else if (data.purposeType === "SPECIFIC") {
      if (!data.businessPurposeText.trim())
        e.businessPurposeText = "Specific purpose is required.";
    }
  }

  if (step === "effective") {
    if (data.effectiveDateOption === "SPECIFIC") {
      if (!data.requestedEffectiveDate)
        e.requestedEffectiveDate = "Please select a date.";
      else {
        const err = validateEffectiveDate(data.requestedEffectiveDate);
        if (err) e.requestedEffectiveDate = err;
      }
    }
  }

  if (step === "correspondence") {
    if (!data.correspondentName) e.correspondentName = "Name required.";
    if (!data.correspondentEmail) e.correspondentEmail = "Email required.";
    else if (!isValidEmail(data.correspondentEmail))
      e.correspondentEmail = "That doesn't look like a valid email address.";
    if (!data.confirmCorrespondentEmail)
      e.confirmCorrespondentEmail = "Please confirm email.";
    if (
      data.correspondentEmail &&
      data.confirmCorrespondentEmail &&
      data.correspondentEmail !== data.confirmCorrespondentEmail
    )
      e.confirmCorrespondentEmail = "Emails do not match.";
  }

  // "optional" step has no required validation

  // "review" step has no required validation
  if (step === "certify") {
    // Only the person actually signing supplies a name and signature: when the
    // client appoints us, our own representative types their name into Sunbiz,
    // and what we need from the client is the appointment.
    if (data.articlesSignerChoice === "SERVICE") {
      if (!data.articlesSignerAppointment)
        e.articlesSignerAppointment =
          "Please appoint us as your authorized representative, or choose to sign yourself.";
    } else {
      if (!data.authorizedRepresentativeName)
        e.authorizedRepresentativeName = "Authorized representative name required.";
      if (!data.authorizedRepresentativeSignature)
        e.authorizedRepresentativeSignature = "Electronic signature required.";
      if (!data.authorizedRepresentativeSignatureCheckbox)
        e.authorizedRepresentativeSignatureCheckbox =
          "Acknowledgment is required.";
    }
    if (!data.atLeastOneMemberAcknowledgment)
      e.atLeastOneMemberAcknowledgment = "Acknowledgment is required.";
    if (!data.accuracyAcknowledgment)
      e.accuracyAcknowledgment = "Acknowledgment is required.";
    if (!data.addressAccuracyAcknowledgment)
      e.addressAccuracyAcknowledgment = "Acknowledgment is required.";
    if (!data.termsOfServiceAcknowledgment)
      e.termsOfServiceAcknowledgment = "You must agree to the Terms of Service to continue.";
    if (!data.publicRecordAcknowledgment)
      e.publicRecordAcknowledgment = "Acknowledgment is required.";
    if (!data.legalAdviceAcknowledgment)
      e.legalAdviceAcknowledgment = "Acknowledgment is required.";
  }

  return e;
}
