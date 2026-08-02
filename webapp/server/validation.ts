import { z } from "zod";
import { formationFormSchema } from "../src/components/forms/florida-llc/schema";
import { hasProtectedSeriesPhrase } from "../src/components/forms/florida-llc/validation";

/**
 * formationFormSchema predates the series + conversion work (the form enforces
 * those in validateStep). The server must enforce everything, so extend it here.
 */
const extendedFormSchema = formationFormSchema
  .extend({
    filingPath: z.enum(["NEW", "CONVERT"]).optional(),
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
  });

/** Mirror the form: with "mailing same as principal" checked, the mailing
 *  fields stay blank in the browser and the principal address is used. */
export const orderFormSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object") {
    const d = raw as Record<string, unknown>;
    if (d.mailingSameAsPrincipal && d.principalAddress) {
      return { ...d, mailingAddress: d.principalAddress };
    }
  }
  return raw;
}, extendedFormSchema);
