# Batch 28 — office, billing and recovery 

Adam approved implementation with “go”, after modifying items 6 and 10. Publication and acceptance remain separate.

Governing owner corrections (verbatim):
> 6. Approved
> 10. I want to include the convenience to the customer. Allow them to update their credit card anytime in their portal

The preceding instruction specifies scheduling the reminder 70 days before renewal and states that a missed reminder does not remove the client's cancellation-notice obligation. Existing automatic-charge holds remain. The approved item 11 proposal uses 90 days without a questionnaire update for undelivered taxpayer numbers; delivered documents remain client-controlled.

Square source opened in the browser, Store card details section, 21 September 2026: https://developer.squareup.com/docs/web-payments/sca-charge-and-store-card-on-file
> Set intent to STORE, customerInitiated to true, and sellerKeyedIn to false.

The server calls CreateCard with the token. Updating a card makes no CreatePayment call. Server-side company ownership, consent, eligible-card validation, stable attempt identity and failure recovery are required. The old card remains until the replacement is saved.

## USER WALK — client updating the renewal card
1. Opens the selected company's Registered agent service card.
2. Chooses Update renewal card, enters a card in Square's secure fields and confirms storage/renewal consent.
3. Sees the saved brand and last four digits, or a truthful error with the previous card preserved.
Expects: no payment and no change to the renewal date.

## USER WALK — office handling notices and resignations
1. Opens the client and company in the office.
2. Sees failed legal-mail/contact notifications and resends the existing notice without a second document upload.
3. Records an actual resignation with its ground, supporting note and dates; sees its charge separately from any renewal debt.
Expects: truthful delivery status, company-specific cancellation and chronological resignation records.

## USER WALK — owner reviewing recovery and retention
1. Opens the retained test evidence and complete diff.
2. Checks an empty-database restore after primary storage loss and subsequent document deletion.
3. Checks pending S-election number expiry and re-entry, and each failed replacement stage.
Expects: deleted documents do not return, retained documents recover, and failed replacement never removes the prior usable package.

## Existing control constraints discovered before implementation
The Batch05 N1.15 assertion freezes the whole insertion/update/deletion code block. Item5 freezes the literal old policy update dates. The supported replacement workflow accepts released fixes only; these fixes are still implemented because publication was deferred. No record or assertion has been weakened. The approved prerequisite is now committed at 0066397. Its 12 required review checks passed. The supported workflow preserves the exact prior fixes in replacement archives.

## Topics

### A01 — Backup recovery can lose the record of deleted documents
Durably mirror every deletion decision independently of file deletion, and consult that journal even when the old file is still available. Require a trustworthy complete journal before recovery; reconcile snapshot plus later records and verify deleted documents stay unavailable. Merely checking .deleted when a file is missing fails the pending-deletion case.

### A02 — Retry a failed legal-mail notification
Add an authenticated office resend action keyed to document ID, preserve legal-mail context and current recipient, and retain delivery status keyed to that document. Reuse the existing stored document; report send acceptance truthfully.

### A03 — Contact form reports failure after saving the message
Acknowledge durable message receipt even when the separate office notification fails, and retain a visible retryable delivery failure for the office. Update the comment that currently promises acknowledgment only after both. Idempotency is useful if added, but no claim of exactly-once delivery is warranted.

### A04 — Record a registered-agent resignation for nonpayment
Allow the office to record an actual resignation with a documented Terms ground, required event dates and existing chronology safeguards. Do not gate every actual resignation on a timely-cancellation schedule. Separately resolve any automatic scheduling or fee rule.

### A05 — Show what a late cancellation means for the next charge
Show a charged renewal even when cancellation exists. Give an explicit current renewal/cancellation result using approved policy. Do not state cancellation guarantees another full service year irrespective of replacement or other termination events.

### A06 — Include the fee in a delayed renewal notice
Include the formatted renewal amount in the delayed-notice branch while keeping automatic billing on hold and retaining the payment/contact options.

### A07 — Office cancellation indicator follows the wrong record
Derive cancellation summaries from company order records and identify the affected company; if keeping an account summary, use a clearly defined active/pending-company rule that handles a future appointment-end date.

### A08 — Completed backup counts include excluded documents
Calculate completed counts after the final filters. Keep pending-job counts separately labeled as provisional if they are returned before completion.

### A09 — S-election package replacement cleanup
Clean up only the failed staged replacement; keep the existing usable package. Prove storage, insert and order-update failures separately.

### A10 — Decide whether to add a standalone renewal-card update
A standalone card-update action requires a supported token-to-card design, saved-card consent and eligible-card checks. Explain the existing pre-decline payment option accurately. Do not promise an office payment link outside a payable renewal unless implemented.

### A11 — Decide retention for never-completed S-election details
Choose a finite pre-delivery/abandonment retention rule or clearly disclose retention through delivery, then make cleanup and re-entry behavior match. Any purge path must return the order to a usable re-entry state and remove full numbers rather than completed retained PDFs.

## Final implementation scope
The eleven approved repairs remain the scope. Four existing protections travel through the explicit replacement workflow: item 5 policy dates, N1.15 package storage, item 194 renewal timing, and item 100 fact-ledger timing (only the approved 70-day schedule changes; the 60-day hold and other facts stay). No prior fix is deleted. Item 10 permits card updates anytime, without a charge or anniversary change. Item 11 expires undelivered numbers after 90 days without a questionnaire update. Product acceptance and publication remain separate.

## Implementation verification (uncommitted)

All eleven targeted server assertions pass and fail against the unchanged base for their reported defects. Twenty-three focused browser assertions pass, including a real authenticated card-save round trip. The full server and document-consistency check passes. The complete browser command passed: 1,307 main checks, all supplemental suites, and the 23 Batch 28 checks; exit 0. Evidence is in `evidence/VERIFICATION.md`.

Revision 1 omitted three old timing checks. Under Adam's standing authorization below, revision 1 was rejected, revision 2 authorized, and all 15 tracked fixes recorded as implemented through the normal commands. Both snapshots and prior fix archives are retained. The guard passes. Exact-commit review follows the commit.

## Standing revision authorization
Adam instructed: “From now on if a later revision is what’s needed, do it and stop asking me to approve it”. Necessary revision transitions within already-approved work are therefore handled without a further request. This does not authorize new policy choices, final package acceptance, integration or publication. The external rejection and replacement-approval records cite this instruction; no formal owner message was fabricated.
