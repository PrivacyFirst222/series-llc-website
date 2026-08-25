import { isPoBox } from "./schema";
import { nameCheckKey, normalizeEntityName } from "./nameSimilarity";
import { seriesDedupeKey } from "./validation";
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

  if (step === "client") {
    if (!data.clientFirstName.trim()) e.clientFirstName = "First name required.";
    if (!data.clientLastName.trim()) e.clientLastName = "Last name required.";
    if (!data.clientEmail) e.clientEmail = "Email required.";
    else if (!isValidEmail(data.clientEmail))
      e.clientEmail = "That doesn't look like a valid email address.";
    if (!data.confirmClientEmail) e.confirmClientEmail = "Please confirm email.";
    if (
      data.clientEmail &&
      data.confirmClientEmail &&
      data.clientEmail !== data.confirmClientEmail
    )
      e.confirmClientEmail = "Emails do not match.";
    if (!data.clientAddress.address1.trim() || !data.clientAddress.city.trim() || !data.clientAddress.zip.trim())
      e.clientAddress = "Street address, city, and ZIP are required.";
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
      // The either/or: a backup name, or the explicit stop-and-ask.
      if (!data.exactNameOnly && !(data.alternateName1 ?? "").trim()) {
        e.alternateName1 =
          "Give an alternate name, or check the exact-name-only box below.";
      }
      // A backup that is the same name under Florida's rules is no backup.
      const primaryKey = normalizeEntityName(data.desiredLlcName ?? "");
      const alt1Key = normalizeEntityName(data.alternateName1 ?? "");
      const alt2Key = normalizeEntityName(data.alternateName2 ?? "");
      if (alt1Key && primaryKey && alt1Key === primaryKey) {
        e.alternateName1 =
          "Under Florida's rules this is the same name as your first choice — a backup must differ in its words, not just suffix, punctuation, or plurals.";
      }
      if (alt2Key && primaryKey && alt2Key === primaryKey) {
        e.alternateName2 =
          "Under Florida's rules this is the same name as your first choice.";
      }
      if (alt1Key && alt2Key && alt1Key === alt2Key) {
        e.alternateName2 =
          "Your two alternates are the same name under Florida's rules.";
      }
      // The availability check is mandatory: its stored result must cover
      // exactly the names now on the form, and a taken or held name cannot
      // continue. If the mirror was unavailable the gate is waived — the
      // Division decides at filing either way.
      {
        const enteredFields = (
          [
            ["desiredLlcName", data.desiredLlcName ?? ""],
            ["alternateName1", data.exactNameOnly === true ? "" : (data.alternateName1 ?? "")],
            ["alternateName2", data.exactNameOnly === true ? "" : (data.alternateName2 ?? "")],
          ] as const
        ).filter(([, v]) => v.trim().length > 0);
        const key = nameCheckKey(enteredFields.map(([, v]) => v));
        const nc = data.nameCheck;
        if (enteredFields.length > 0 && (!nc || nc.key !== key)) {
          e.nameCheck =
            "We check your names against Florida's records automatically — give it a moment to finish, then press Continue again.";
        } else if (nc && nc.key === key && nc.available) {
          nc.results.forEach((r, i) => {
            const field = enteredFields[i]?.[0];
            if (!field || r.verdict === "clear") return;
            e[field] =
              r.verdict === "taken"
                ? "Unavailable — an existing Florida company already has this name. Please choose a different name."
                : "Unavailable — this name belongs to a recently dissolved company, and Florida protects it for up to a year. Please choose a different name.";
          });
        }
      }
      // Alternates are entered WITHOUT the designator (it is added
      // automatically); typing one would double it on the filing.
      for (const [field, value] of [
        ["alternateName1", data.alternateName1],
        ["alternateName2", data.alternateName2],
      ] as const) {
        if ((value ?? "").trim() && nameContainsLegalDesignator(value ?? "")) {
          e[field] =
            "Leave the designator off — your designator above is added automatically.";
        }
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
    const keys = data.series.map((s) => seriesDedupeKey(s.name));
    keys.forEach((k, i) => {
      const first = keys.indexOf(k);
      if (data.series[i].name.trim() && first !== i)
        e[`series.${i}.name`] =
          `Same name as series ${first + 1} — "PS", "P.S.", and "Protected Series" count as the same prefix, and capitalization is ignored. Make it distinct.`;
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
    // Hidden entirely for member-managed companies — nothing to validate.
    if (data.managementStructure === "MEMBER_MANAGED") return e;
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
    // Hidden entirely for manager-managed companies — ownership is collected
    // in the operating agreement questionnaire, not here.
    if (data.managementStructure === "MANAGER_MANAGED") return e;
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
