# Batch 37 — approved Group A repairs


Owner: “Go. Approve all” after the fourteen numbered Group A proposals. Only items 1–14 are authorized. Groups B–D remain unapproved. No acceptance or publication.


## 1. Client portal: show a submitted registered-agent resignation

After the office submits a resignation for nonpayment, bad contact information, or misuse of the address, the client can still see an ordinary active-service/renewal message and no resignation notice.

Approved scope: Show the submitted date for every resignation ground. Replace the ordinary renewal and avoid-a-charge invitation with the resignation state. Distinguish submission, recorded state filing, and the appointment ending; do not imply submission immediately ends the appointment. Keep outstanding payment information accurate.

Governing prior decision: Batch 28 already approved recording all four grounds; the office display already distinguishes submission. This completes that behavior, without changing billing or legal end dates.

Verification: Drive each ground through the real office route, then inspect the client page before filing and after filing/end-date recording. Include submitted-without-due-date and ordinary active-service controls.

Approved wording: Resignation submitted [date]. We will display the appointment end date when it is recorded.

Source webapp/src/pages/portal/PortalDashboard.tsx:382:
>                 {company.raEndedDate ? `Our registered-agent appointment ends on ${formatDate(company.raEndedDate)}.` : company.raAppointmentDate ? `Your registered agent service is active${company.raRenewalDate ? ` and renews on ${new Date(`${company.raRenewalDate}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}.` : "Your appointment date has not yet been recorded. Your first service year begins when our appointment takes effect."} You may give cancellation notice here at any time. Give notice at least 30 days before renewal and provide replacement proof by renewal to avoid a resignation charge.

## 2. Office order summary: quote the consent the client actually gave

The new-company self-agent form uses a personal acceptance, but the office summary quotes the different confirmation used when adding series to an existing company.

Approved scope: Select the same existing consent constant using the same form path and agent choice as the screen. Preserve the version distinction for older records; do not rewrite historical attestations by guessing what an old client saw.

Governing prior decision: Adam already chose self-agent or our service for new formations, and Batch 29 approved preserving the personal acceptance. No new consent language is needed.

Verification: Compare actual submitted and rendered summaries for new SELF, new SERVICE, conversion, and supported older form versions against their displayed checkbox text.

Approved wording: I agree to serve as registered agent for the company and each of its protected series, including every protected series in this order.

Source webapp/server/order-summary.ts:35:
>   { field: "registeredAgentSeriesAgreementAcknowledgment", text: AGENT_SERIES_AGREEMENT },

## 3. S-election questionnaire: explain both deletion deadlines

The dialog where clients enter taxpayer numbers mentions only the fourteen-day editing window. An undelivered package instead loses those questionnaire numbers after 90 days without an update.

Approved scope: Make this dialog match the already-approved Privacy Policy. Preserve the existing retention periods, encrypted completed documents, and secure re-entry process. This does not add a new email.

Governing prior decision: Batch 28 approved 90-day expiry before delivery; Batch 03 approved keeping encrypted completed documents until the client deletes them.

Verification: Open the S corporation election details dialog and check the exact disclosure against both purge branches and the Privacy Policy.

Approved wording: Social Security numbers are encrypted. Our scheduled cleanup removes them from the questionnaire after the fourteen-day editing window following delivery. If your package has not been delivered, our scheduled cleanup removes them after 90 days without an update to this questionnaire. Your other answers remain available, but you must re-enter the numbers securely before we can complete the package. Your completed document stays encrypted in Your documents until you choose to delete it.

Source webapp/src/pages/portal/OrdersInProgress.tsx:287:
>               We use this to complete IRS Form 2553 for {detailsFor?.llc_name}. You sign the

## 4. Office document uploads: retry failed emails without uploading twice

Legal-mail notices have a retry record, but other document notices can fail without a usable resend path. Re-uploading creates another document instead of retrying the email.

Approved scope: Record requested notices and their outcomes for ordinary uploads and the formation-package notification. Give the office a retry for the existing document or package, with the appropriate email template. Keep unchecked optional notifications unsent. This is more than widening the legal-mail query: formation notices also need an explicit, nonduplicating identity.

Governing prior decision: Preserves the existing Email the client choice and legal-mail behavior. It does not authorize new marketing or automatic reminders.

Verification: Inject mail failure for legal mail, an ordinary upload, and a formation package; retry each without creating extra documents. Test notify unchecked, repeat clicks, and a deleted document.

Source webapp/server/office-notifications.ts:8:
> export async function notifyLegalMail(id:string):Promise<boolean> {

## 5. Backup log: label unfinished backup counts accurately

An unfinished backup logs empty final row counts even though provisional counts are available.

Approved scope: Log the provisional counts with an explicit unfinished label; log final counts only for a completed backup. Do not put provisional numbers into a field downstream readers treat as final.

Governing prior decision: Preserves complete, resumable backups and the existing distinction between provisional and final totals.

Verification: Capture log output for one unfinished and one completed backup; compare the labels and counts with their returned records.

Source webapp/server/routes-ops.ts:319:
>   console.log(`[backup] ${result.key}: ${result.sizeBytes} bytes`, result.rowCounts);

## 6. Owner’s Manual: include fractional ownership in the article map

The Article 4 summary says simple percentages, although the agreement and the next section of the Manual permit exact fractions.

Approved scope: Replace only the map’s description of membership interests; carry the change through generated outputs.

Governing prior decision: Batch 31 already approved percentages or fractions in the masters; Manual line 142 already explains the same choice.

Verification: Verify the map, paragraph, relevant masters, generated Manual and portal copy agree.

Approved wording: membership interests as percentages or fractions of the whole

Source docs/owners-manual.md:126:
> | **Article 4** | The owners: membership interests as simple percentages, the rule that no owner holds any series directly, voting (multi-owner), the transfer-on-death designation (Section 23), and — in the multi-owner forms — the member duties that power the bankruptcy protections |

## 7. Editable Word documents: define the drafting-label style

Drafting labels refer to a Word character style that is not defined in the document. Direct formatting currently makes the labels look correct.

Approved scope: Define the existing DraftingChoice character style with the intended italic appearance, keeping every legal word and current direct formatting. Verify the actual XML and rendered appearance; do not claim Microsoft Word behavior from LibreOffice alone.

Governing prior decision: Batch 32 approved italic, bracketed drafting annotations. This supplies their missing style definition.

Verification: Check each emitted style reference resolves, regenerate the documents, and compare rendered labels and body text.

Source docs/md-to-docx.py:126:
>                 output.append(label_runs.replace("<w:rPr>", '<w:rPr><w:rStyle w:val="DraftingChoice"/>'))

## 8. Editable Word documents: fix annotation capitalization and spacing

One label lowercases Exhibit A; some labels have doubled spaces, and an optional clause has awkward punctuation inside its label.

Approved scope: Preserve Exhibit A capitalization and normalize boundaries around drafting annotations without deleting punctuation belonging to an optional clause. Preserve all alternatives and their removal behavior. Do not blindly adopt the suggested suppress-space rule if it glues labels to words.

Governing prior decision: Batch 32’s drafting choices and legal text stay intact. These are editable-master annotations, not new legal terms.

Verification: Render inline, paragraph and table alternatives; test adjacent punctuation, nested alternatives and exact legal text after removing only annotations.

Source docs/md-to-docx.py:389:
>                 label = "If " + labels[subject].lower()

## 9. Generated PDFs: wrap unusually long words instead of overflowing

A long unbroken name or other token can run beyond the page margin. Claude reproduced it on both the old and current renderer; it is not a new regression.

Approved scope: Split an over-wide token across lines only when it cannot fit as a whole, preserving all characters and formatting. Keep existing accepted name-length limits.

Governing prior decision: No new intake restriction or foreign-character policy is introduced.

Verification: Test the reported long token plus normal names, punctuation and mixed bold text; check widths and all retained characters, then render representative documents.

Source webapp/server/pdf-render.ts:144:
> export function wrapSegs(f: Fonts, segs: Seg[], width: number, size: number): Seg[][] {

## 10. Office S-election order: distinguish missing answers from a failed load

When the secure details request fails, the office sees EIN and officer information as not yet provided, even when the client supplied it.

Approved scope: Use loading, failed-with-Retry, and successful-response states for the S-election branch, as the EIN branch already does. Only a successful response can establish missing answers.

Governing prior decision: The existing EIN-details repair already establishes this error-handling rule.

Verification: Force the S-election details request to fail through the full retry window, then recover it; verify no false missing-answer labels.

Approved wording: We couldn’t load the S-election details. Please try again.

Source webapp/src/pages/admin/ServiceOrdersSection.tsx:216:
>             ) : viewing.type === "s-election" ? (

## 11. Office protected-series EIN instructions: match your chosen classification

The client is promised a disregarded-entity application, while the office list still asks staff to confirm the classification.

Approved scope: Show Disregarded entity for a protected-series target. Keep parent-company scoping and parent tax choices separate. This describes the service you permit, not universal tax advice about all possible series.

Governing prior decision: Adam’s later explicit instruction governs: “The only tax classification for a series we permit is disregarded entity.” An older auditor’s caution is not a contrary owner ruling.

Verification: Open a series EIN order under an S-election parent and under another parent; both show the series rule, while parent EIN orders retain their own classification.

Approved wording: Disregarded entity

Source webapp/src/pages/admin/ServiceOrdersSection.tsx:340:
>                         ["Tax classification", viewing.details.target === "series" ? "Confirm this series’ intended tax treatment before applying." : detailQuery.data?.sElectionPaid ? "S corporation (Form 2553 package for this company)" : Number(d.memberCount) > 1 ? "Partnership" : "Disregarded entity"],

## 12. Operating-agreement amendment page: handle an empty usable-agreement list

Stored agreement history can exist while none of those agreements is usable by the amendment picker. The page then shows a form with no selectable agreement.

Approved scope: Base the empty-state message on the successfully loaded usable source list, not the separate history count. Keep loading and failed requests distinct. Do not alter sample records or weaken source validation.

Governing prior decision: Batch 30 already requires rejection of unavailable, foreign and incomplete sources.

Verification: Use a disposable stale/incomplete row, an empty history, a valid source, and a failed list request; check each visible state.

Approved wording: No usable operating agreement is available for this company. Go to the operating agreement questionnaire to create one before using this amendment form.

Source webapp/src/pages/portal/AmendAgreement.tsx:125:
>         {!data.generations.length ? (

## 13. Operating-agreement questionnaire: name the 100-owner limit in server errors

The screen blocks owner 101 correctly, but a direct request receives only Please check your answers.

Approved scope: Return the specific owner-limit message when that validation fails. Preserve the general fallback for unrelated malformed requests.

Governing prior decision: Adam already approved a maximum of 100 and an explanation before unsupported entry.

Verification: Verify 100 succeeds, 101 gets the specific refusal, and unrelated validation errors remain accurate.

Approved wording: The operating agreement supports up to 100 owners. Remove an owner before saving.

Source webapp/server/routes-portal.ts:1111:
> function answersProblem(error: z.ZodError): string {

## 14. Office Clients tab: do not draw an empty cancellation badge

A cancellation flag can be present while the separately filtered company text is empty, producing an empty colored badge. The source supports this possibility; no real-user reproduction is claimed.

Approved scope: Render the badge only when there is company-specific cancellation text to display. Keep the existing company eligibility and end-date rules.

Governing prior decision: Batch 28 approved identifying the affected company in the cancellation summary.

Verification: Render zero, one and multiple matching company names with the flag set and unset.

Source webapp/src/pages/admin/AdminDashboard.tsx:576:
>                   {variant !== "ra" && cl.ra_cancellation_requested_at ? (

## USER WALK — client
1. Opens the registered-agent card, S-election questionnaire or amendment page.
2. Sees accurate service, retention and agreement availability information.
3. Completes the existing action without false missing-data messages.
Expects: the recorded state is shown; prior business decisions remain unchanged.

## USER WALK — office
1. Opens an order and its stored acknowledgment or service details.
2. Retries a failed document notification without uploading twice.
3. Uses the correct company-specific tax instruction and cancellation badge.
Expects: faithful records and no duplicate document from email retry.

## USER WALK — document reviewer
1. Opens regenerated Word/PDF files.
2. Checks exact fractions, label spacing and long names.
3. Compares legal wording and layout with the prior version.
Expects: approved presentation corrections with all alternatives and legal text retained.

## Revision 2

Under Adam's standing authorization for necessary revisions, revision 1 is rejected and revision 2 adds two declared test files. Batch02's office series classification must now be Disregarded entity under the approved rule. Batch10's date test now supplies a usable generated agreement, so it reaches the amendment form whose date it tests. All existing date comparisons remain unchanged. No additional product change is authorized.

## Revision 3

The full revision-2 browser command passed all 1,312 browser checks, then failed its subsequent Word-preservation gate because the approved Manual sentence had no exact replacement assertion. Revision 3 adds that assertion to item 6 and uses replace mode for the Manual. The approved text and all product bytes are unchanged. The existing preservation check remains intact.

## Revision 4

The remaining bundled checks exposed one stale selector in Batch28: Legal-mail notices was renamed Document notices by the approved notification expansion. Revision 4 declares that test file and updates only the selector. The existing resend assertion is unchanged; its focused run passes 23/23. All other remaining bundled checks passed before the full rerun.
