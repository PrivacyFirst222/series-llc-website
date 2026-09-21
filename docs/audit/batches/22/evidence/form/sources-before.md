# Batch22 first five approved findings: sources before changes
Owner approved all five proposals with “Go. Approve all”.
All six editable product files read whole: 1403/1403 lines.
Governing behavior: current selections determine both preview and submitted text; searches may update only the query that is still current; English alphabet restriction remains for active text.
B1-N02 approved title: “Registered Agent Payment — MyFloridaSeriesLLC.com.”
B1-N03: “Cancel outdated searches whenever the address changes or is selected. Display suggestions only for what is currently typed.”
B2-01: “Build the preview from the company selected in the current order path.”
B2-02: “Validate the fields that belong to the current selections and will actually be submitted. Ignore discarded answers.”
B2-03: “Ignore responses from outdated searches. Keep the results for the current name visible.”

## webapp/src/components/layout/Layout.tsx
```tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";

const SITE = "MyFloridaSeriesLLC.com";

/** Browser-tab titles, named the way a visitor thinks of the page. Every page
 *  previously shared one title, which broke bookmarks, browser history, and
 *  screen-reader page announcements. The home page keeps the full pitch. */
const PAGE_TITLES: Record<string, string> = {
  "/": `${SITE} \u2014 Form a Florida Protected Series LLC`,
  "/what-is": `What Is a Protected Series LLC? \u2014 ${SITE}`,
  "/benefits": `Benefits \u2014 ${SITE}`,
  "/the-statute": `The Florida Statute \u2014 ${SITE}`,
  "/how-it-works": `How It Works \u2014 ${SITE}`,
  "/pricing": `Pricing \u2014 ${SITE}`,
  "/faq": `FAQ \u2014 ${SITE}`,
  "/asset-protection": `Asset Protection \u2014 ${SITE}`,
  "/recordkeeping-app": `Recordkeeping App \u2014 ${SITE}`,
  "/contact": `Contact \u2014 ${SITE}`,
  "/terms": `Terms of Service \u2014 ${SITE}`,
  "/privacy": `Privacy Policy \u2014 ${SITE}`,
  "/form-llc": `Form Your LLC \u2014 ${SITE}`,
  "/order/confirmed": `Order Confirmed \u2014 ${SITE}`,
  "/portal": `Client Portal \u2014 ${SITE}`,
  "/portal/amend": `Amendment to Operating Agreement — ${SITE}`,
  "/portal/agreement": `Operating Agreement Questionnaire \u2014 ${SITE}`,
  "/portal/login": `Client Sign-In \u2014 ${SITE}`,
  "/portal/forgot": `Forgot Password \u2014 ${SITE}`,
  "/portal/set-password": `Set Your Password \u2014 ${SITE}`,
  "/portal/verify-email": `Verify Your Email \u2014 ${SITE}`,
  "/admin": `Admin \u2014 ${SITE}`,
  "/admin/login": `Admin Sign-In \u2014 ${SITE}`,
};

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    document.title = PAGE_TITLES[pathname] ?? `Page Not Found \u2014 ${SITE}`;
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

```

## webapp/src/components/forms/florida-llc/AddressAutocomplete.tsx
```tsx
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** One selectable suggestion, already split into our address fields. */
export interface AddressSuggestion {
  label: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
}

const SMARTY_KEY = import.meta.env.VITE_SMARTY_EMBEDDED_KEY as string | undefined;

interface AddressAutocompleteProps {
  id?: string;
  value: string;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  /** Runs when the client leaves the box — a typed address gets its check then. */
  onBlur?: () => void;
  onChangeText: (text: string) => void;
  onSelect: (s: AddressSuggestion) => void;
}

/** Street-address input with Smarty type-ahead. Without a key (or when the
 *  API is unreachable) it is just a normal text input — never blocking. */
export function AddressAutocomplete({
  id,
  value,
  placeholder,
  onChangeText,
  onSelect,
  ...rest
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const query = (text: string) => {
    onChangeText(text);
    if (!SMARTY_KEY || text.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `https://us-autocomplete-pro.api.smarty.com/lookup?key=${SMARTY_KEY}&search=${encodeURIComponent(text)}&max_results=5`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          suggestions?: {
            street_line?: string;
            secondary?: string;
            city?: string;
            state?: string;
            zipcode?: string;
            entries?: number;
          }[];
        };
        const seen = new Set<string>();
        const next = (body.suggestions ?? [])
          .map((a) => {
            const street = [a.street_line, a.secondary].filter(Boolean).join(" ");
            return {
              label: `${street}, ${a.city} ${a.state} ${a.zipcode}`,
              address1: street,
              city: a.city ?? "",
              state: a.state?.toUpperCase() ?? "",
              zip: a.zipcode ?? "",
            };
          })
          .filter((s) => {
            if (!s.address1 || !s.city) return false;
            // Smarty returns one row per matching unit; collapse duplicates.
            if (seen.has(s.label)) return false;
            seen.add(s.label);
            return true;
          });
        setSuggestions(next);
        setOpen(next.length > 0);
        setHighlight(-1);
      } catch {
        // network/abort — behave like a plain input
      }
    }, 250);
  };

  const choose = (s: AddressSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    onSelect(s);
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => query(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            choose(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        {...rest}
      />
      {open ? (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${
                  i === highlight ? "bg-secondary" : "hover:bg-secondary"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(s)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

```

## webapp/src/components/forms/florida-llc/buildPayload.ts
```tsx
import { AGENT_FORM_VERSION, registeredAgentName } from "./registeredAgent";
import { selectedParty } from "../../../lib/partyIdentity";
import { canonicalizeSeriesName, buildFinalLlcName, calculateEstimatedFees } from "./validation";
import { fullPersonName } from "./validation";
import type { FloridaLLCFormData, SubmissionPayload } from "./types";

export function buildPayload(data: FloridaLLCFormData): SubmissionPayload {
  const isConversion = data.filingPath === "CONVERT";
  const signsSelf = !isConversion && data.articlesSignerChoice === "SELF";
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
    // A conversion names no new company: whatever was typed on the
    // new-formation path before switching stays off the record (14 Sep 2026).
    llcName: isConversion
      ? { desiredName: "", designator: "", finalName: "", alternateNames: [], exactNameOnly: false }
      : {
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
      name: registeredAgentName(data),
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
      // The permission to keep the card for the yearly renewal, ours only.
      renewalCardConsent: data.registeredAgentChoice === "SERVICE" && data.raRenewalCardConsent === true,
      acceptance: {
        accepted: !(isConversion && data.registeredAgentChoice === "SELF") && data.registeredAgentAcceptanceCheckbox,
        acceptanceName: isConversion && data.registeredAgentChoice === "SELF" ? "" : data.registeredAgentAcceptanceName,
        capacity: data.registeredAgentAcceptanceCapacity || "",
        electronicSignature: isConversion && data.registeredAgentChoice === "SELF" ? "" : data.registeredAgentElectronicSignature,
        signatureAuthorizationConfirmed:
          !(isConversion && data.registeredAgentChoice === "SELF") && data.registeredAgentSignatureAuthorizationCheckbox,
      },
    },
    management: {
      structure: data.managementStructure || "",
      includeManagementStatementInArticles:
        data.includeManagementStatementInArticles,
      // Member-managed: the members are listed automatically (AMBR) and the
      // managers step is never shown — a stray entry must not reach the filing.
      managersOrAuthorizedRepresentatives:
        data.managementStructure === "MEMBER_MANAGED" ? [] : data.managers.map(selectedParty),
    },
    members: {
      collectForInternalRecords: data.collectMembersForInternalRecords,
      includeMembersInArticles: data.includeMembersInArticles,
      // Manager-managed: the members step is never shown — ownership lives in
      // the operating agreement questionnaire, and a stray default row must
      // not reach the record.
      memberList:
        data.managementStructure === "MANAGER_MANAGED" ? [] : data.members.map(({ id, memberType, firstName, lastName, suffix, entityName, address1, address2, city, state, zip, country, email, phone, isInitialMember }) =>
          selectedParty({ id, memberType, firstName, lastName, suffix, entityName, address1, address2, city, state, zip, country, email, phone, isInitialMember })),
    },
    // Purpose and effective date are Articles questions a conversion never
    // sees; answers from an abandoned new-formation path stay off the record.
    purpose: isConversion
      ? { purposeType: "", businessPurposeText: "" }
      : {
      purposeType: data.purposeType || "",
      businessPurposeText: data.businessPurposeText,
    },
    effectiveDate: isConversion
      ? { option: "", requestedEffectiveDate: null }
      : {
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
      company: "",
      email: data.correspondentEmail || data.clientEmail,
      phone: "",
      address: null,
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
      // The client's own signer details reach the record only when the
      // client signs (15 Sep 2026: an appointed order still named the client).
      authorizedRepresentativeName: signsSelf ? data.authorizedRepresentativeName : "",
      authorizedRepresentativeTitle: signsSelf ? data.authorizedRepresentativeTitle ?? "" : "",
      authorizedRepresentativeSignature: signsSelf ? data.authorizedRepresentativeSignature : "",
      atLeastOneMemberAcknowledged: data.atLeastOneMemberAcknowledgment,
      accuracyAcknowledged: data.accuracyAcknowledgment,
      publicRecordAcknowledged: data.publicRecordAcknowledgment,
      notLegalAdviceAcknowledged: data.legalAdviceAcknowledgment,
      seriesOwnershipAcknowledged: data.seriesOwnershipAcknowledgment,
      conversionAuthorityAcknowledged: data.conversionAuthorityAcknowledgment === true,
    },
    acknowledgments: {
      isFloridaDomesticEntityOnly: data.isFloridaDomesticEntityOnly === true,
      notLegalAdvice: false, // Removed Eligibility checkbox; do not invent consent from a stale draft.
      publicRecordNotice: false, // The actual final consent is recorded above.
      nameSearchAcknowledgment: data.nameSearchAcknowledgment === true,
      governmentAffiliationAcknowledgment: data.governmentAffiliationAcknowledgment === true,
      lawfulPurposeNameAcknowledgment: data.lawfulPurposeNameAcknowledgment === true,
      registeredAgentNotSameAsLlc: !isConversion && data.registeredAgentNotSameAsLlc === true,
      registeredAgentPhysicalAddressAcknowledgment: !isConversion && data.registeredAgentPhysicalAddressAcknowledgment === true,
      registeredAgentResidencyAcknowledgment: !isConversion && data.registeredAgentChoice === "SELF" && data.registeredAgentResidencyAcknowledgment === true,
      registeredAgentExistingRecordAcknowledgment: isConversion && data.registeredAgentChoice === "SELF" && data.registeredAgentExistingRecordAcknowledgment === true,
      registeredAgentSeriesAgreementAcknowledgment: isConversion && data.registeredAgentChoice === "SELF" && data.registeredAgentSeriesAgreementAcknowledgment === true,
      registeredAgentAcceptanceCheckbox: !isConversion && data.registeredAgentAcceptanceCheckbox === true,
      registeredAgentSignatureAuthorizationCheckbox: !isConversion && data.registeredAgentSignatureAuthorizationCheckbox === true,
      authorizedRepresentativeSignatureCheckbox: signsSelf && data.authorizedRepresentativeSignatureCheckbox === true,
      addressAccuracyAcknowledgment: data.addressAccuracyAcknowledgment === true,
      termsOfServiceAcknowledgment: data.termsOfServiceAcknowledgment === true,
      // The no-refund deadline acknowledgment for the S election package
      // (14 Sep 2026: required by the server, never recorded).
      sElectionFilingAcknowledgment: !isConversion && data.sElectionFilingAcknowledgment === true,
    },
    nameCheck: data.nameCheck
      ? { available: data.nameCheck.available, asOf: data.nameCheck.asOf, results: data.nameCheck.results.map((r) => ({ input: r.input, verdict: r.verdict })) }
      : null,
    metadata: {
      submittedAt: new Date().toISOString(),
      ipAddress: "", // The server fills this from the request (routes-payments.ts).
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      formVersion: AGENT_FORM_VERSION,
    },
  };
}

```

## webapp/src/components/forms/florida-llc/stepValidation.ts
```tsx
import { englishTextProblems } from "@/lib/englishText";
import { stepForField } from "./steps";
import { postalCodeError } from "./addressValidation";
import { registeredAgentName } from "./registeredAgent";
import { FIRST_AND_LAST, hasFirstAndLast } from "@/lib/personName";
import { isPoBox } from "./schema";
import { nameCheckKey, normalizeEntityName } from "./nameSimilarity";
import { seriesDedupeKey } from "./validation";
import {
  buildFinalLlcName,
  designatorAllowedForFormationType,
  hasProtectedSeriesPhrase,
  isValidEmail,
  nameContainsLegalDesignator, typedDesignatorProblem,
  validateRequestedDate,
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
    // Each box says what it is missing, and the state is required here as
    // the server requires it (15 Sep 2026: a typed address could skip it).
    if (!data.clientAddress.address1.trim()) e["clientAddress.address1"] = "Street address is required.";
    if (!data.clientAddress.city.trim()) e["clientAddress.city"] = "City is required.";
    if (!data.clientAddress.state.trim()) e["clientAddress.state"] = "State is required.";
    if (postalCodeError(data.clientAddress.zip, data.clientAddress.country)) e["clientAddress.zip"] = postalCodeError(data.clientAddress.zip, data.clientAddress.country)!;
    if (!data.clientAddress.country.trim()) e["clientAddress.country"] = "Country required.";
    if (!data.clientAddress.address1.trim() || !data.clientAddress.city.trim() || !data.clientAddress.state.trim() || !data.clientAddress.zip.trim())
      e.clientAddress = "Street address, city, state, and ZIP are required.";
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
          !data.llcDesignator
            ? "Choose a designator above to complete the name."
            : "Choose a valid company designator.";
      }
      const endingProblem = typedDesignatorProblem(data.desiredLlcName, data.formationType);
      if (endingProblem) e.desiredLlcName = endingProblem;
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
    if (postalCodeError(a.zip, a.country)) e["principalAddress.zip"] = postalCodeError(a.zip, a.country)!;
    if (!a.country.trim()) e["principalAddress.country"] = "Country required.";
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
      if (postalCodeError(a.zip, a.country)) e["mailingAddress.zip"] = postalCodeError(a.zip, a.country)!;
      if (!a.country.trim()) e["mailingAddress.country"] = "Country required.";
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
          'Include "PS" (or "P.S." / "protected series") — s. 605.2202, Fla. Stat., requires it in every series name.';
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
    // Our service renews yearly on a card kept with Square, with the
    // client's permission (16 Sep 2026).
    if (data.registeredAgentChoice === "SERVICE" && data.raRenewalCardConsent !== true)
      e.raRenewalCardConsent = "Please agree to keep a card on file for the yearly renewal.";
    if (data.registeredAgentChoice === "SELF") {
      const retainedEntity = data.filingPath === "CONVERT" && data.registeredAgentType === "ENTITY";
      if (!retainedEntity && data.registeredAgentType !== "INDIVIDUAL") e.registeredAgentType = "Choose an individual agent.";
      if (retainedEntity && !(data.registeredAgentBusinessEntityName ?? "").trim()) e.registeredAgentBusinessEntityName = "The agent’s legal entity name is required.";
      if (!retainedEntity && !(data.registeredAgentFirstName ?? "").trim())
        e.registeredAgentFirstName = "First name is required.";
      if (!retainedEntity && !(data.registeredAgentLastName ?? "").trim())
        e.registeredAgentLastName = "Last name is required.";
      if (!data.registeredAgentStreetAddress1)
        e.registeredAgentStreetAddress1 = "Street address required.";
      if (!data.registeredAgentCity) e.registeredAgentCity = "City required.";
      if (data.registeredAgentState !== "FL")
        e.registeredAgentState = "The registered agent's address must be in Florida.";
      if (postalCodeError(data.registeredAgentZip)) e.registeredAgentZip = postalCodeError(data.registeredAgentZip)!;
      if (
        isPoBox(data.registeredAgentStreetAddress1) ||
        isPoBox(data.registeredAgentStreetAddress2 ?? "")
      )
        e.registeredAgentStreetAddress1 =
          "A P.O. Box cannot be used for the registered agent address.";
      if (data.filingPath === "CONVERT") {
        if (data.registeredAgentExistingRecordAcknowledgment !== true) e.registeredAgentExistingRecordAcknowledgment = "Confirm the agent and address match the Division’s existing record.";
      } else {
        if (data.registeredAgentResidencyAcknowledgment !== true) e.registeredAgentResidencyAcknowledgment = "Confirm that you live in Florida and this is your business address and the registered office.";
        if (!data.registeredAgentNotSameAsLlc)
          e.registeredAgentNotSameAsLlc = "Acknowledgment is required.";
        if (!data.registeredAgentPhysicalAddressAcknowledgment)
          e.registeredAgentPhysicalAddressAcknowledgment =
            "Acknowledgment is required.";
      }
    }
  }

  // A conversion keeping its own agent files no appointment: the step is
  // hidden and nothing here applies (15 Sep 2026).
  if (step === "acceptance" && data.registeredAgentChoice !== "SERVICE" && !(data.filingPath === "CONVERT" && data.registeredAgentChoice === "SELF")) {
    if (!data.registeredAgentAcceptanceName.trim())
      e.registeredAgentAcceptanceName = "Your name is required.";
    else if (!hasFirstAndLast(data.registeredAgentAcceptanceName))
      e.registeredAgentAcceptanceName = FIRST_AND_LAST;
    if (!data.registeredAgentElectronicSignature)
      e.registeredAgentElectronicSignature = "Electronic signature required.";
    const expected = registeredAgentName(data);
    if (data.registeredAgentAcceptanceName.trim() !== expected) e.registeredAgentAcceptanceName = `The acceptance name must match the registered agent name exactly: ${expected}`;
    if (data.registeredAgentElectronicSignature.trim() !== expected) e.registeredAgentElectronicSignature = `Your electronic signature must match the registered agent name exactly: ${expected}`;
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
        "At least one Manager is required when including a manager-managed statement in the Articles.";

    data.managers.forEach((m, i) => {
      if (m.personOrEntity === "INDIVIDUAL" && !(m.firstName ?? "").trim())
        e[`managers.${i}.firstName`] = "First name required.";
      if (m.personOrEntity === "INDIVIDUAL" && !(m.lastName ?? "").trim())
        e[`managers.${i}.lastName`] = "Last name required.";
      if (m.personOrEntity === "ENTITY" && !m.businessEntityName)
        e[`managers.${i}.businessEntityName`] = "Entity name required.";
      if (!m.streetAddress1)
        e[`managers.${i}.streetAddress1`] = "Street address required.";
      // The server requires city, state and ZIP per row (15 Sep 2026).
      if (!(m.city ?? "").trim()) e[`managers.${i}.city`] = "City required.";
      if (!(m.state ?? "").trim()) e[`managers.${i}.state`] = "State required.";
      if (postalCodeError(m.zip, m.country)) e[`managers.${i}.zip`] = postalCodeError(m.zip, m.country)!;
      if (!(m.country ?? "").trim()) e[`managers.${i}.country`] = "Country required.";
      if (m.email && !isValidEmail(m.email)) e[`managers.${i}.email`] = "Enter a valid email.";
    });
  }

  if (step === "members") {
    // Hidden entirely for manager-managed companies — ownership is collected
    // in the operating agreement questionnaire, not here.
    if (data.managementStructure === "MANAGER_MANAGED") return e;
    if (data.members.length === 0)
      e.members =
        data.filingPath === "CONVERT"
          ? "At least one member is required for your operating agreement."
          : "At least one member is required. We list these members in the Articles of Organization.";
    data.members.forEach((m, i) => {
      if (m.memberType === "INDIVIDUAL" && !(m.firstName ?? "").trim())
        e[`members.${i}.firstName`] = "First name required.";
      if (m.memberType === "INDIVIDUAL" && !(m.lastName ?? "").trim())
        e[`members.${i}.lastName`] = "Last name required.";
      if (m.memberType === "ENTITY" && !m.entityName)
        e[`members.${i}.entityName`] = "Entity name required.";
      if (!m.address1) e[`members.${i}.address1`] = "Address required.";
      if (!(m.city ?? "").trim()) e[`members.${i}.city`] = "City required.";
      if (!(m.state ?? "").trim()) e[`members.${i}.state`] = "State required.";
      if (postalCodeError(m.zip, m.country)) e[`members.${i}.zip`] = postalCodeError(m.zip, m.country)!;
      if (!(m.country ?? "").trim()) e[`members.${i}.country`] = "Country required.";
    });
  }

  // Purpose and effective date are Articles questions; a conversion never
  // sees them and files none.
  if (step === "purpose" && data.filingPath !== "CONVERT") {
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

  if (step === "effective" && data.filingPath !== "CONVERT") {
    if (data.effectiveDateOption === "SPECIFIC") {
      if (!data.requestedEffectiveDate)
        e.requestedEffectiveDate = "Please select a date.";
      else {
        const err = validateRequestedDate(data.requestedEffectiveDate);
        if (err) e.requestedEffectiveDate = err;
      }
    }
  }

  if (step === "correspondence") {
    if (!data.correspondentName.trim()) e.correspondentName = "Name required.";
    else if (!hasFirstAndLast(data.correspondentName)) e.correspondentName = FIRST_AND_LAST;
    if (data.correspondentEmail && !isValidEmail(data.correspondentEmail))
      e.correspondentEmail = "That doesn't look like a valid email address.";
    if (data.correspondentEmail && !data.confirmCorrespondentEmail)
      e.confirmCorrespondentEmail = "Please confirm email.";
    if (
      data.correspondentEmail &&
      data.confirmCorrespondentEmail &&
      data.correspondentEmail !== data.confirmCorrespondentEmail
    )
      e.confirmCorrespondentEmail = "Emails do not match.";
  }

  // "optional": the S election add-on carries a required acknowledgment
  // (Adam, 6 Sep 2026) — the client files it, within 2 months and 15 days,
  // and there is no refund for missing that.
  // A conversion never shows the package, so a tick left over from the
  // new-formation path cannot trap it (15 Sep 2026).
  if (step === "optional" && data.filingPath !== "CONVERT" && data.orderSElection && !data.sElectionFilingAcknowledgment) {
    e.sElectionFilingAcknowledgment = "Please acknowledge the Form 2553 filing deadline to add the S election package.";
  }

  // "review" step has no required validation
  if (step === "certify") {
    if (data.filingPath === "CONVERT" && data.registeredAgentChoice === "SELF" && data.registeredAgentSeriesAgreementAcknowledgment !== true) e.registeredAgentSeriesAgreementAcknowledgment = "Confirm the registered agent has agreed to serve the company and each protected series.";
    if (data.filingPath === "CONVERT") {
      // No Articles to sign: the client certifies authority for the company
      // already on file and authorizes the Designation filings.
      if (!data.conversionAuthorityAcknowledgment)
        e.conversionAuthorityAcknowledgment = "Please confirm that you are authorized to act for the company.";
    } else {
      // Only the person actually signing supplies a name and signature: when the
      // client appoints us, our own representative types their name into Sunbiz,
      // and what we need from the client is the appointment.
      if (data.articlesSignerChoice === "SERVICE") {
        if (!data.articlesSignerAppointment)
          e.articlesSignerAppointment =
            "Please appoint us as your authorized representative, or choose to sign yourself.";
      } else {
        if (!data.authorizedRepresentativeName.trim())
          e.authorizedRepresentativeName = "Authorized representative name required.";
        else if (!hasFirstAndLast(data.authorizedRepresentativeName))
          e.authorizedRepresentativeName = FIRST_AND_LAST;
        if (!data.authorizedRepresentativeSignature)
          e.authorizedRepresentativeSignature = "Electronic signature required.";
        else if (data.authorizedRepresentativeSignature.trim() !== data.authorizedRepresentativeName.trim())
          e.authorizedRepresentativeSignature = `Your electronic signature must match the authorized representative name exactly: ${data.authorizedRepresentativeName.trim()}`;
        if (!data.authorizedRepresentativeSignatureCheckbox)
          e.authorizedRepresentativeSignatureCheckbox =
            "Acknowledgment is required.";
      }
      if (!data.atLeastOneMemberAcknowledgment)
        e.atLeastOneMemberAcknowledgment = "Acknowledgment is required.";
    }
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

  for (const [field, message] of Object.entries(englishTextProblems(data))) {
    if (stepForField(field.split(".")[0]) === step) e[field] = message;
  }
  return e;
}

```

## webapp/src/components/forms/florida-llc/sections/StepName.tsx
```tsx
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NameCheck } from "../NameCheck";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import {
  buildFinalLlcName,
  designatorAllowedForFormationType,
  nameContainsLegalDesignator, typedDesignatorProblem,
} from "../validation";
import type { FloridaLLCFormData, LlcDesignator } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const STANDARD: LlcDesignator[] = ["LLC", "L.L.C.", "Limited Liability Company"];
const PROFESSIONAL: LlcDesignator[] = [
  "PLLC",
  "P.L.L.C.",
  "Professional Limited Liability Company",
];

/** One company on file under the typed name, from the Sunbiz mirror. */
interface EntityMatch { docNumber: string; name: string; status: "Active" | "Inactive"; filingType: string }

export function StepName({ data, patch, errors }: StepProps) {
  const isConversion = data.filingPath === "CONVERT";
  if (isConversion) {
    return <ConversionName data={data} patch={patch} errors={errors} />;
  }
  return <NewName data={data} patch={patch} errors={errors} />;
}

/** The conversion branch: the existing company, looked up on the Sunbiz
 *  mirror as it is typed so the client picks it and its document number
 *  comes along (Adam, 9 Sep 2026: "Is there a way to look up the document
 *  number"). */
function ConversionName({ data, patch, errors }: StepProps) {
  const [lookup, setLookup] = useState<{ forName: string; available: boolean; matches: EntityMatch[] } | null>(null);
  const [looking, setLooking] = useState(false);
  const typed = (data.existingLlcName ?? "").trim();
  useEffect(() => {
    if (typed.length < 3) { setLookup(null); return; }
    if (lookup?.forName === typed) return;
    const t = setTimeout(async () => {
      setLooking(true);
      try {
        const r = await api.post<{ available: boolean; matches: EntityMatch[] }>("/api/entity-lookup", { name: typed });
        setLookup({ forName: typed, available: r.available, matches: r.matches });
      } catch {
        setLookup({ forName: typed, available: false, matches: [] });
      } finally {
        setLooking(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // The recorded name guards re-running; the effect keys on what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  const current = lookup?.forName === typed ? lookup : null;
  const chosen = current?.matches.find((m) => m.name === data.existingLlcName && m.docNumber === data.sunbizDocumentNumber);
  {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="font-display text-3xl">Your existing LLC</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Tell us which existing company you want to add protected series to. Enter the name exactly as
            it appears on Sunbiz, along with its document number, so we file
            against the right entity.
          </p>
        </header>

        <FieldShell
          label="Existing LLC name"
          htmlFor="existing-llc-name"
          required
          helper="Exactly as it appears with the Florida Division of Corporations, including the designator."
          error={errors.existingLlcName}
        >
          <Input
            id="existing-llc-name"
            value={data.existingLlcName ?? ""}
            onChange={(e) => patch({ existingLlcName: e.target.value })}
            placeholder="Sunshine Holdings, LLC"
            aria-invalid={!!errors.existingLlcName}
          />
          {looking ? (
            <p className="mt-2 text-xs text-muted-foreground">Looking up the company on Florida's records…</p>
          ) : current && current.available && !chosen ? (
            current.matches.length > 0 ? (
              <div className="mt-2 space-y-1" data-testid="entity-matches">
                <p className="text-xs text-muted-foreground">On file with the Division of Corporations — tap yours to fill in the name as filed and its document number:</p>
                {current.matches.map((m) => (
                  <button
                    key={m.docNumber}
                    type="button"
                    data-testid="entity-match"
                    onClick={() => patch({ existingLlcName: m.name, sunbizDocumentNumber: m.docNumber })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-trust"
                  >
                    <span className="min-w-0 break-words font-medium">{m.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.status} · {m.docNumber}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="entity-no-match">
                No Florida company by that name is on file. Check the spelling, or type the document number from your Sunbiz record below.
              </p>
            )
          ) : null}
        </FieldShell>

        <FieldShell
          label="Sunbiz document number"
          htmlFor="sunbiz-doc-number"
          required
          helper="Found on your Sunbiz record — usually letter-and-digit, e.g. L24000123456."
          error={errors.sunbizDocumentNumber}
        >
          <Input
            id="sunbiz-doc-number"
            value={data.sunbizDocumentNumber ?? ""}
            onChange={(e) => patch({ sunbizDocumentNumber: e.target.value })}
            placeholder="L00000000000"
            aria-invalid={!!errors.sunbizDocumentNumber}
          />
        </FieldShell>

        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground leading-relaxed">
          Because the company is already on file, there is no name availability
          check, and you skip the $125 filing fee for the Articles and Registered Agent
          (if you keep your existing Registered Agent).
        </div>
      </div>
    );
  }
}

function NewName({ data, patch, errors }: StepProps) {
  // Only the designators that are legal for the chosen formation type are
  // offered at all (s. 621.12(2)(b)3: professional in lieu of standard).
  const opts = data.formationType === "PLLC" ? PROFESSIONAL : STANDARD;

  const finalName = buildFinalLlcName(data.desiredLlcName, data.llcDesignator);
  const finalNameValid = !finalName || nameContainsLegalDesignator(finalName);
  const nameProblem = !data.llcDesignator ? "Choose a designator above to complete the name." : typedDesignatorProblem(finalName, data.formationType) ?? (!finalNameValid ? "Choose a valid company designator." : null);

  const designatorMismatch =
    data.llcDesignator &&
    !designatorAllowedForFormationType(
      data.llcDesignator as LlcDesignator,
      data.formationType,
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">LLC name</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Choose the legal name for your LLC. Florida requires the name to
          include an LLC-style designator.
        </p>
      </header>

      <FieldShell
        label="Desired LLC name"
        htmlFor="llc-name"
        required
        helper="The base name without the LLC designator (we'll add it for you)."
        error={errors.desiredLlcName}
      >
        <Input
          id="llc-name"
          value={data.desiredLlcName}
          onChange={(e) => patch({ desiredLlcName: e.target.value })}
          placeholder="Coastal Holdings"
        />
      </FieldShell>

      <FieldShell
        label="LLC designator"
        htmlFor="llc-designator"
        required
        error={errors.llcDesignator}
        helper={
          data.formationType === "PLLC"
            ? "A professional LLC's name must use PLLC, P.L.L.C., or Professional Limited Liability Company."
            : "Standard designators only — switch to PLLC formation type if you need a professional designator."
        }
      >
        <Select
          value={data.llcDesignator}
          onValueChange={(v) => patch({ llcDesignator: v as LlcDesignator })}
        >
          <SelectTrigger id="llc-designator">
            <SelectValue placeholder="Select designator…" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>

      {designatorMismatch ? (
        <p className="text-xs text-destructive">
          {data.formationType === "DOMESTIC_LLC"
            ? "PLLC designators are not allowed for a standard LLC. Switch to PLLC formation type to use them."
            : "A professional LLC must use a professional designator — PLLC, P.L.L.C., or Professional Limited Liability Company."}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        The State of Florida's website does not offer a way for services like
        ours to check availability automatically. We have created a tool to
        check whether a name is unavailable. It does not guarantee that the
        name will be accepted by the Florida Division of Corporations, but it can
        save you time submitting a name that will be rejected. If you provide
        an alternate name and your first choice is not available, we will use
        your alternate names in order of preference. This will also save you
        time if your first choice is rejected. If you check the "I only want
        this exact name" option and your name is unavailable, we will have to
        email you (typically within 1 business day) which can potentially slow
        down the formation process.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldShell label="Alternate name #1" error={errors.alternateName1} htmlFor="alternate-name-1">
          <Input
            id="alternate-name-1"
            value={data.alternateName1 ?? ""}
            disabled={data.exactNameOnly === true}
            onChange={(e) =>
              patch({ alternateName1: e.target.value, exactNameOnly: false })
            }
          />
        </FieldShell>
        <FieldShell label="Alternate name #2 (optional)" error={errors.alternateName2} htmlFor="alternate-name-2">
          <Input
            id="alternate-name-2"
            value={data.alternateName2 ?? ""}
            disabled={data.exactNameOnly === true}
            onChange={(e) =>
              patch({ alternateName2: e.target.value, exactNameOnly: false })
            }
          />
        </FieldShell>
      </div>
      <p className="text-xs text-muted-foreground">
        Without the designator — it is added automatically. Alternate #1 is
        required unless you check the exact-name box.
      </p>

      {data.desiredLlcName.trim() ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <NameCheck
            names={[
              { label: "First choice", value: data.desiredLlcName },
              {
                label: "Alternate 1",
                value: data.exactNameOnly === true ? "" : (data.alternateName1 ?? ""),
              },
              {
                label: "Alternate 2",
                value: data.exactNameOnly === true ? "" : (data.alternateName2 ?? ""),
              },
            ]}
            state={data.nameCheck}
            onState={(s) => patch({ nameCheck: s })}
          />
          {errors.nameCheck ? (
            <p className="mt-2 text-sm text-destructive">{errors.nameCheck}</p>
          ) : null}
        </div>
      ) : null}

      <AcknowledgeBox
        id="exact-name-only"
        checked={data.exactNameOnly === true}
        onChange={(v) =>
          patch(
            v
              ? { exactNameOnly: true, alternateName1: "", alternateName2: "" }
              : { exactNameOnly: false },
          )
        }
        label="I only want this exact name — if it is unavailable, contact me before doing anything else."
        error={errors.exactNameOnly}
      />

      {finalName ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-trust font-medium">
            Final name preview
          </div>
          <div className="mt-1 font-display text-xl">{finalName}</div>
          {[data.alternateName1, data.alternateName2]
            .map((n) => buildFinalLlcName((n ?? "").trim(), data.llcDesignator))
            .filter(Boolean)
            .map((n, i) => (
              <div key={i} className="mt-1 text-sm text-muted-foreground">
                Alternate {i + 1}: <span className="font-display text-base text-foreground">{n}</span>
              </div>
            ))}
          {nameProblem ? (
            <p className="mt-2 text-xs text-destructive">
              {nameProblem}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <AcknowledgeBox
          id="ack-namesearch"
          checked={data.nameSearchAcknowledgment}
          onChange={(v) => patch({ nameSearchAcknowledgment: v })}
          label="I understand that availability is not guaranteed until accepted by the Florida Division of Corporations."
          error={errors.nameSearchAcknowledgment}
        />
        <AcknowledgeBox
          id="ack-gov"
          checked={data.governmentAffiliationAcknowledgment}
          onChange={(v) =>
            patch({ governmentAffiliationAcknowledgment: v })
          }
          label="I confirm the name does not imply affiliation with a state or federal government agency."
          error={errors.governmentAffiliationAcknowledgment}
        />
        <AcknowledgeBox
          id="ack-lawful"
          checked={data.lawfulPurposeNameAcknowledgment}
          onChange={(v) => patch({ lawfulPurposeNameAcknowledgment: v })}
          label="I confirm the name does not imply a purpose unauthorized for this LLC."
          error={errors.lawfulPurposeNameAcknowledgment}
        />
      </div>

    </div>
  );
}

```

## webapp/src/components/forms/florida-llc/sections/StepSeries.tsx
```tsx
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Layers, Info, DollarSign, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AcknowledgeBox, FieldShell } from "../FieldShell";
import { canonicalizeSeriesName } from "../validation";
import { buildFinalLlcName } from "../validation";
import type { FloridaLLCFormData, SeriesEntry } from "../types";

interface StepProps {
  data: FloridaLLCFormData;
  patch: (p: Partial<FloridaLLCFormData>) => void;
  errors: Record<string, string>;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const INCLUDED_COUNT = 3;
const ADDITIONAL_FEE = 50;

function nextDefaultName(existing: SeriesEntry[]): string {
  // Numbered, matching the portal's add-a-series service (PS-1, PS-2, …);
  // the lowest unused number fills any gap left by a rename or delete.
  for (let n = 1; ; n++) {
    const candidate = `PS ${n}`;
    if (!existing.some((s) => s.name === candidate)) return candidate;
  }
}

export function StepSeries({ data, patch, errors }: StepProps) {
  const llcName =
    buildFinalLlcName(data.desiredLlcName, data.llcDesignator) ||
    // A conversion named its company two steps ago (15 Sep 2026).
    (data.filingPath === "CONVERT" ? (data.existingLlcName ?? "").trim() : "") ||
    "[Your LLC Name]";
  const extraSeries = Math.max(0, data.series.length - INCLUDED_COUNT);
  const additionalFee = extraSeries * ADDITIONAL_FEE;

  const addSeries = () => {
    patch({
      series: [...data.series, { id: newId(), name: nextDefaultName(data.series) }],
    });
  };

  const removeSeries = (id: string) => {
    patch({ series: data.series.filter((s) => s.id !== id) });
  };

  const updateName = (id: string, name: string) => {
    patch({ series: data.series.map((s) => (s.id === id ? { ...s, name } : s)) });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-3xl">Your protected series</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Each series is a separate compartment within your LLC, created by
          filing a Protected Series Designation with the state. Define your
          initial series below.
        </p>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2 text-sm text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" />
          How series must be named
        </div>
        <ul className="list-disc list-inside space-y-1.5 text-blue-800 leading-relaxed">
          <li>
            Florida requires every protected series name to <strong>begin with your
            LLC&rsquo;s name</strong> and to <strong>contain the phrase &ldquo;protected
            series&rdquo; or the abbreviation &ldquo;P.S.&rdquo; or &ldquo;PS&rdquo;</strong>{" "}
            (s. 605.2202, Fla. Stat.). We use <strong>PS</strong>.
          </li>
          <li>
            <strong>Full name format:</strong>{" "}
            <span className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">
              {llcName}, PS [Identifier]
            </span>
          </li>
          <li>
            The identifier after PS can be a letter (A, B, C &hellip;), a number
            (1, 2, 3 &hellip;), or a descriptive word (Real Estate, Investments,
            Vehicles).
          </li>
          <li>
            No two series of the same LLC may share an identical name.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Network className="h-4 w-4 shrink-0 text-trust" />
          How ownership works in this structure
        </div>
        <p className="text-foreground/80 leading-relaxed">
          <strong>Your LLC owns every protected series. You own the LLC.</strong>{" "}
          No series has its own separate owners, and ownership cannot differ from
          one series to the next.
        </p>
        <p className="text-foreground/80 leading-relaxed">
          This is deliberate. It keeps the entire structure on{" "}
          <strong>one federal income tax return</strong> no matter how many series you
          create, and it protects an S corporation election that divergent
          per-series ownership would otherwise break.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          If you need different people to own different series, this is not the
          right product. That structure carries significant tax complexity and
          needs an operating agreement custom drafted by an attorney.
        </p>
        <AcknowledgeBox
          id="series-ownership"
          checked={data.seriesOwnershipAcknowledgment}
          onChange={(v) => patch({ seriesOwnershipAcknowledgment: v })}
          label="I understand that every protected series will be owned by my LLC, and that no series will have its own separate owners."
          error={errors.seriesOwnershipAcknowledgment}
        />
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-trust font-semibold">
          <DollarSign className="h-4 w-4 shrink-0" />
          Series pricing
        </div>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between">
            <span className="text-foreground/80">Up to 3 series</span>
            <span className="font-medium text-trust">Included in $499</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-foreground/80">Each additional series</span>
            <span className="font-medium">$50 / series</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1 border-t border-border">
          The $50 additional series fee includes $25 to prepare the Protected
          Series Designation and a $25 state filing fee.
        </p>
        {extraSeries > 0 ? (
          <div className="flex justify-between font-semibold text-sm pt-1 border-t border-border">
            <span>
              Additional series ({extraSeries} × $50)
            </span>
            <span className="text-trust">${additionalFee}</span>
          </div>
        ) : null}
      </div>

      {errors.series ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errors.series}
        </p>
      ) : null}

      {/* The loudest thing on the step (Adam, 13 Sep 2026: "make it obvious
          that they need to create their series. The one little add series
          button is barely noticeable"), and it stays: the series cards and
          the Add button live inside it ("Keep the add series dialog in that
          box"). The "$499" and "first three" facts are the Series pricing
          box's, above. */}
      <div className="rounded-xl border-2 border-trust bg-trust/5 p-6 sm:p-8" data-testid="series-box">
        <div className="text-center">
          <Layers className="h-9 w-9 mx-auto mb-3 text-trust" />
          <h3 className="font-display text-2xl">Create your protected series</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Your LLC needs at least one protected series before you can continue. The first three
            are included in the $499 service fee.
          </p>
        </div>

        <div className="mt-5 space-y-3">
        {data.series.map((s, i) => (
          <div
            key={s.id}
            className="rounded-xl border border-border bg-card p-4 flex items-start gap-3"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-trust/10 text-trust text-xs font-semibold mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1">
              <FieldShell
                label="Series identifier"
                required
                htmlFor={`series-${s.id}-name`}
                error={errors[`series.${i}.name`]}
                helper={
                  s.name.trim()
                    ? `Full name: ${llcName}, ${s.name.trim()}`
                    : undefined
                }
              >
                <Input
                  id={`series-${s.id}-name`}
                  type="text"
                  value={s.name}
                  onChange={(e) => updateName(s.id, e.target.value)}
                  onBlur={(e) => updateName(s.id, canonicalizeSeriesName(e.target.value))}
                  placeholder="e.g. PS A or PS Real Estate"
                  aria-invalid={!!errors[`series.${i}.name`]}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-trust/30 focus:border-trust/50"
                />
              </FieldShell>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeSeries(s.id)}
              className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        ))}
        </div>

        <div className="mt-5 text-center">
          <Button type="button" size="lg" onClick={addSeries} className="rounded-full px-8">
            <Plus className="h-4 w-4 mr-1.5" />
            Add a series
          </Button>
        </div>
      </div>
    </div>
  );
}

```