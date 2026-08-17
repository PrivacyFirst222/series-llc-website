import { z } from "zod";
import { formationFormSchema } from "../src/components/forms/florida-llc/schema";
import { hasProtectedSeriesPhrase } from "../src/components/forms/florida-llc/validation";
import { raServicePatch } from "../src/components/forms/florida-llc/raService";

/**
 * formationFormSchema predates the series + conversion work (the form enforces
 * those in validateStep). The server must enforce everything, so extend it here.
 */
const extendedFormSchema = formationFormSchema
  .extend({
    registeredAgentChoice: z.enum(["SERVICE", "SELF"], {
      errorMap: () => ({ message: "Choose who will serve as registered agent." }),
    }),
    addressAccuracyAcknowledgment: z.literal(true, {
      errorMap: () => ({ message: "Acknowledgment is required." }),
    }),
    termsOfServiceAcknowledgment: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the Terms of Service to continue." }),
    }),
    filingPath: z.enum(["NEW", "CONVERT"]).optional(),
    orderEin: z.boolean().optional().default(false),
    orderSElection: z.boolean().optional().default(false),
    existingLlcName: z.string().max(300).optional().or(z.literal("")),
    sunbizDocumentNumber: z.string().max(50).optional().or(z.literal("")),
    series: z
      .array(
        z.object({
          id: z.string().max(64),
          name: z.string().min(1, "Series identifier is required.").max(300),
        }),
      )
      .min(1, "Add at least one series."),
    seriesOwnershipAcknowledgment: z.literal(true, {
      errorMap: () => ({
        message:
          "Please confirm you understand that your LLC will own every protected series.",
      }),
    }),
    articlesSignerChoice: z.enum(["SELF", "SERVICE"], {
      errorMap: () => ({ message: "Choose who will sign the Articles." }),
    }),
    articlesSignerAppointment: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    data.series.forEach((s, i) => {
      if (!hasProtectedSeriesPhrase(s.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", i, "name"],
          message: 'Series names must include "PS", "P.S.", or "protected series" (§605.2202).',
        });
      }
    });
    const names = data.series.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["series"],
        message: "Each series must have a unique name.",
      });
    }
    if (data.filingPath === "CONVERT" && !data.existingLlcName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["existingLlcName"],
        message: "The existing LLC's name is required for a conversion.",
      });
    }
    if (data.registeredAgentChoice === "SELF" && !data.registeredAgentName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registeredAgentName"],
        message: "The registered agent's full legal name is required.",
      });
    }
    // Exactly one of the two signing paths must be complete. Relaxing the base
    // schema to allow an empty signature block is only safe because of this.
    if (data.articlesSignerChoice === "SERVICE") {
      if (!data.articlesSignerAppointment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["articlesSignerAppointment"],
          message:
            "Appoint us as your authorized representative, or choose to sign yourself.",
        });
      }
    } else {
      if (!data.authorizedRepresentativeName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["authorizedRepresentativeName"],
          message: "The authorized representative's name is required.",
        });
      }
      if (!data.authorizedRepresentativeSignature?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["authorizedRepresentativeSignature"],
          message: "An electronic signature is required.",
        });
      }
      if (data.authorizedRepresentativeSignatureCheckbox !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["authorizedRepresentativeSignatureCheckbox"],
          message: "Acknowledgment is required.",
        });
      }
    }
    if (data.managementStructure === "NOT_SPECIFIED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managementStructure"],
        message: "Choose member-managed or manager-managed.",
      });
    }
    // Check 6 of this file's own docstring, which until 17 August was described
    // here and implemented only in the browser (stepValidation.ts). An order
    // reaching the server with no MGR produced an agreement reading "The initial
    // Manager is <first member>" — an office nobody appointed anyone to — because
    // oaSeed filled the empty list from the member list. An authorized
    // representative signs the Articles and manages nothing, so an AR can never
    // satisfy this.
    if (
      data.managementStructure === "MANAGER_MANAGED" &&
      !(data.managers ?? []).some((m) => (m.role ?? "MGR") === "MGR")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managers"],
        message:
          "A manager-managed LLC needs at least one Manager. An authorized representative signs the Articles and manages nothing.",
      });
    }
  });

/** Mirror the form's behavior before validating:
 *  - "mailing same as principal" leaves the mailing fields blank in the
 *    browser; substitute the principal address.
 *  - our RA service: re-apply the canonical service details server-side so a
 *    tampered submission cannot alter the designated agent or its acceptance. */
export const orderFormSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object") {
    let d = raw as Record<string, unknown>;
    if (d.mailingSameAsPrincipal && d.principalAddress) {
      d = { ...d, mailingAddress: d.principalAddress };
    }
    if (d.registeredAgentChoice === "SERVICE") {
      d = { ...d, ...raServicePatch() };
    }
    if (d.managementStructure === "MANAGER_MANAGED") {
      // The manager-managed statement always goes in the Articles.
      d = { ...d, includeManagementStatementInArticles: true };
    }
    // Member info is always collected for internal records and never listed
    // in the Articles (the form no longer offers either toggle).
    d = { ...d, collectMembersForInternalRecords: true, includeMembersInArticles: false };
    return d;
  }
  return raw;
}, extendedFormSchema);
