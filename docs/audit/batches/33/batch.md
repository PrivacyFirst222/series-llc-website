# Batch 33 — fourteen approved checks and housekeeping repairs

Adam approved all fourteen proposals: “Go. Approve all.” No acceptance, integration or publication.

## 1. reader-2-walk-accepts-retired-submit-label
Require the approved Continue to payment label in common and batch walks.

Source: `webapp/scripts/behavioral.ts`.

Historical reads: await page.locator("main button").filter({ hasText: /^(Continue to payment|Submit intake)$/ }).first().click();

## 2. reader-2-walk-placeholder-cannot-fail
Check the actual saved first name on the client step during forward replay.

Source: `webapp/scripts/behavioral.ts`.

Historical reads: expect((await page.locator("#client-first-name").inputValue().catch(() => "").then((v) => v)) !== "GONE", `${run.key}: placeholder`, null);

## 3. runtime-B-walk-label-year-from-formation
Describe renewal from recorded agent appointment, not formation.

Source: `webapp/scripts/behavioral.ts`.

Historical reads:         expect(new RegExp(`renews on [A-Z][a-z]+ \\d{1,2}, ${nextYear}`).test(dash) && !/renews annually/.test(dash), "renewal: the portal's agent card names the renewal date a year from formation", dash.match(/registered agent service is active[^.]*\./)?.[0]);

## 4. reader-5-e2e-stale-renewal-comments
Correct internal test comments to appointment and the approved 70-day notice.

Source: `webapp/server/e2e.ts`.

Historical reads: // The registered-agent renewal date is set at formation for a client who

## 5. reader-5-ein-pending-per-client-unused
Remove unused account-wide EIN pending query and interface field.

Source: `webapp/server/routes-admin.ts`.

Historical reads: (so.type = 's-election' AND EXISTS (

## 6. reader-5-gift-card-branch-dead
Remove unused renewal-email giftCard parameter while preserving card eligibility elsewhere.

Source: `webapp/server/email.ts`.

Historical reads: ${opts.giftCard ? "An eligible card is required" : "No eligible card is on file"}

## 7. reader-5-migration9-comment-renewal-date
Clarify current renewal basis without changing historical migration SQL.

Source: `webapp/server/db.ts`.

Historical reads: // record, and the registered-agent renewal date is stored when the company is

## 8. reader-5-notes-agent-fee-sentence
Qualify internal note as per protected series; retain company appointment fee.

Source: `webapp/server/chapter-605-notes.md`.

Historical reads: One agent covers everything. Supports charging no
  separate registered agent designation fee.

## 9. reader-5-pricing-comment-mailing-only
Add faxing to internal filing-method comment.

Source: `webapp/server/pricing.ts`.

Historical reads: election deadline for preparation, signing, and mailing. */

## 10. statutes-0702-stale-note
Replace obsolete drafting recommendation with description of existing 13.2(f).

Source: `webapp/server/chapter-605-notes.md`.

Historical reads: and sale of interests." Our Article 13 buy-sell IS such a provision, but it

## 11. reader-6-agent-signature-shadowed-messages
Required errors for empty names/signatures, mismatch only for nonblank unequal values, both validators.

Source: `webapp/server/validation.ts`.

Historical reads:       if (!(data.registeredAgentElectronicSignature ?? "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registeredAgentElectronicSignature"], message: "Electronic signature required" });
      }

## 12. reader-6-ra-cancel-route-comment
Update internal cancellation description to replacement and effective resignation.

Source: `webapp/server/routes-portal.ts`.

Historical reads: /** Online cancellation of registered agent service — required by §501.165
 *  because the service is accepted online. Recording the request is the
 *  §9(g)(i) notice; the agency itself ends only when proof of a successor
 *  designation arrives (handled by hand from the admin notification). */

## 13. reader-6-vercel-entry-bundle-comment
Correct generated API filename documentation.

Source: `webapp/server/vercel-entry.ts`.

Historical reads: // Source for the Vercel function. `bun run build:api` bundles this (and every
// dependency) into api/[[...route]].mjs — the deployed function is fully
// self-contained, so runtime dependency resolution can never fail.

## 14. reader-6-webhook-signature-compare
Length-check and constant-time compare Square signatures; preserve HMAC and key/header behavior.

Source: `webapp/server/square.ts`.

Historical reads: return expected === opts.signatureHeader;

Two replaced check labels are declared: the meaningless placeholder becomes an actual persisted-name check at the client step, and the renewal label names the appointment basis. No substantive test is removed. 70-day notice timing supersedes the stale 60-day repair-plan wording. All prices, legal masters, migration SQL and unrelated card eligibility stay unchanged.
