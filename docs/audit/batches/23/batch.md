# Batch 23 — Office screens, notices and recovery

Adam approved the five displayed proposals with **“5. Go. Approve all”**. This authorizes implementation, not acceptance, integration or publication.

## 1. B4-EMAIL-ERROR-EMPTY

Approved scope: Show retryable office email-history and individual-email load errors; empty history only after successful empty response.

Governing finding and source quotes (historical proposal label preserved):

Office → Clients → Emails, when initial email-history request fails — `webapp/src/pages/admin/AdminDashboard.tsx:129`
Reads: Nothing has been sent to this address since the record began.
Claims: A completed check found no email history for this address.
True: The query is independent. After its initial request fails without cached data, isPending is false and list.data is undefined. Lines126–129 substitute [] and render this factual empty-history statement; no list.isError branch exists. Individual email-body failure also remains Loading indefinitely at106–123. This is a source-proven failure branch; no claim that a live outage occurred. Compared with priorN3.08 (board completion) andN3.09 (portal legal mail): different screen, dataset, and claim.
Proposed replacement (not approved): Render a retryable error when email history could not be loaded; use the empty-history statement only after a successful empty response. Give an explicit retryable error for an individual email-body request as well.
Rechecked by codex-reader-5: AdminDashboard.tsx:106–129 has neither list nor individual-query error branch. With failed initial list data undefined and pending false, nullish [] yields the factual nothing-sent sentence; individual body remains Loading. Prior174 corrected provider acceptance and500limit; N3.08 concerned board service completion and N3.09 portal legal mail. Different datasets/screens, hence new failure-state defect. No outage reproduced.

## 2. B4-EIN-ERROR-MISSING

Approved scope: Distinguish failed EIN details retrieval from missing client numbers; retry and show assistant answers only after successful retrieval.

Governing finding and source quotes (historical proposal label preserved):

Office → service order → Fulfil EIN dialog, when protected service details fail to load — `webapp/src/pages/admin/ServiceOrdersSection.tsx:306`
Reads: "— not yet provided —"
Claims: The client has not supplied the responsible party SSN/ITIN.
True: The SSN is supplied only by detailQuery at118–122. At303–306 the component distinguishes loading and a truthy tin but never checks query error. A failed initial request with no cached data therefore renders not yet provided even for a submitted EIN application; the IRS assistant answer list at312 also disappears. Unknown retrieval state is presented as a missing client submission. No live outage asserted. PriorN3.05 is the separate series-name fix, andN3.08 concerns board completion.
Proposed replacement (not approved): Show a retryable service-details error when detailQuery fails. Display not yet provided only after a successful response confirms no SSN/ITIN; require loaded details before presenting the IRS-assistant answers as ready.
Rechecked by codex-reader-5: ServiceOrdersSection.tsx:118–122 independently fetches protected details;303–306 uses loading/tin only, and312 gates assistant answers on detail data. Failed initial retrieval without cache renders not yet provided. PriorN3.05 concerns series legal-name row, not retrieval failure; N3.08 is separate board completion. No actual IRS submission or live outage claimed.

## 3. B5-ARTICLES-METADATA

Approved scope: Preserve the Florida document number on replacement Articles for both signing paths, or use a supplied validated correction.

Governing finding and source quotes (historical proposal label preserved):

Office formation-package Articles replacement — `webapp/server/routes-admin.ts:742`
Reads: VALUES ($1, $2, 'articles', $3, $4, $5, $6, '{}'::jsonb) RETURNING id`,
Claims: The replacement Articles preserve the company document number entered at original upload.
True: Initial /articles stores documentNumber in meta at503. Full formation-package replacement inserts new Articles with empty meta then retires prior Articles. For a self-signed company there is no Statement metadata fallback at407, so the admin detail loses its stored document number even when form.documentNumber was supplied. Source-confirmed; coordinator runtime pending. Compared ledger177 (different frontend validation mismatch),208 (dates),N1.14 (rollback); none covers lost metadata.
Proposed replacement (not approved): Preserve existing validated documentNumber when replacing Articles, or replace it with a newly supplied validated number. Store it on replacement Articles for both signing paths. Verify self-signed and office-signed replacement retain the number.
Rechecked by codex-root-independent: Root independently reopened routes-admin.ts385–414,488–510,724–760. Initial upload stores documentNumber; replacement writes empty JSON. Detail reads Articles then Statement; self-signed replacement lacks fallback. Compared prior177,208,N1.14; distinct metadata loss. Source proof, no external incident claimed.

## 4. B5-RENEWAL-OLD-EMAIL

Approved scope: Send registered-agent notices, receipts and resignation copies to the current account email; preserve original intake contact fields.

Governing finding and source quotes (historical proposal label preserved):

Registered-agent renewal/resignation notices after account email change — `webapp/server/renewals.ts:128`
Reads: await sendMail({to:o.contact_email,...mail});
Claims: Notices go to the newly confirmed account email as email.ts193–194 promises.
True: Both portal confirmation2548 and adminoverride1034 update clients.email only. Renewal query104 loads orders.* and sends to original o.contact_email at128/147; paid receipt159–169 and ra-office70 also use ordercontactemail. A client changing email therefore leaves renewal/payment/resignation notices addressed to old inbox. No claim of observed production incident; runtime pending coordinator. Prior200 concerns invalidating pending email-change tokens, a different failure.
Proposed replacement (not approved): Resolve current clients.email through order.client_id for account notices, payment receipts and resignation copies; preserve original intake contact fields as historical records. Test both portalverified and adminoverride address changes before each notice path.
Rechecked by codex-root-independent: Root independently reopened renewals.ts94–176, email.ts187–200, portal2536–2554 and admin1025–1039. Account-change promise expressly includes notices while jobs/receipt read original order.contact_email. Historical intake should remain; resolve active client address for new notices. Distinct prior200 token invalidation.

## 5. B4-RESTORE-S-ELECTION-SECRET-STATE

Approved scope: Mark restored unfinished S elections needing taxpayer-number re-entry, display the required portal action and automatically notify; handle missing secret when EIN arrives even without a prior package. Keep temporary secrets excluded from backups.

Governing finding and source quotes (historical proposal label preserved):

Restore an unfinished S-election awaiting the EIN; then Office supplies the issued EIN — `webapp/server/restore.ts:22`
Reads: else if(row.type==='ein'&&row.status==='in_progress')row.status='awaiting_info';
Claims: Restored unfinished services are in a usable recovery state after transient taxpayer numbers are deliberately excluded. The portal calls the S-election Details saved — waiting for your issued EIN (OrdersInProgress.tsx211).
True: backup.ts128 and restore.ts20 clear every service_orders.ein_secret. The actual empty-target probe restored EIN as awaiting_info but S-election as in_progress with null secret. A valid unfulfilled pending-EIN S-election has einPending/shareholders but no documentId or purgedAt (routes-portal.ts2401–2404). When the EIN arrives, routes-admin.ts1399–1404 skips rows without secret and sends recovery email only if documentId or purgedAt exists. Thus this normal pending case is skipped without package or recovery notice, while the portal still says it is waiting for the EIN. Re-entering via Edit saved details remains possible; not claimed permanently unrecoverable. Fresh restore followed by actual registered Hono EIN-fulfill handler with valid synthetic PDF returned200, rebuiltSElections0, unchanged S-election in_progress/einPending true/secret null/no documentId and unchanged email_log count1→1. Ordinary EIN notice explicitly disabled; recovery notice has no such toggle. This proves the skipped carry/recovery-notice branch locally, with all external fetches blocked. Prior223 is specifically omission of email_log/ra_renewals and is now fixed;179 is backup coverage/status. N1.01 intentionally excludes transient secrets and should not be reversed. No prior identified for restoring pending S-election operational state.
Proposed replacement (not approved): On restore, mark unfinished pending-EIN S-elections as requiring taxpayer-number re-entry and communicate that requirement; also make the EIN-arrival missing-secret branch notify/flag this state even when no package has ever been built. Keep transient secrets excluded from backups.
Rechecked by codex-coordinator: Reopened entire restore.ts and carryEinIntoSElections missing-secret branch, then read the retained actual Hono response and before/after service/email records. Only EIN is reset to awaiting_info; S-election remains in_progress without secret, package or notification. Compared223 omitted-table scope and N1.01 intentional secret exclusions. The repair must preserve exclusion and request re-entry; no claim of irreversible loss of all client information.

## Accumulated instructions — 8 of 8 addressed

1. Implement all five proposed repairs; leave ten other new findings open.
2. Describe failures truthfully and allow retry; do not treat unavailable data as absent.
3. Preserve original intake email as history; resolve current account recipients for future notices.
4. Preserve the saved Florida number unless a validated correction is supplied.
5. Temporary taxpayer numbers stay excluded from backups; do not clean up existing test backups.
6. Make recovery self-service through the portal and automatic email, not an invitation to contact support.
7. Preserve existing ledger history, assertions, tests and approved billing behavior.
8. Commit locally through normal hooks, run the full isolated review, retain the rollback point; no acceptance, integration or publication.

## USER WALK — office checking a client
1. Opens Clients → Emails or an EIN service order.
2. If retrieval fails, sees the relevant error and taps Retry.
3. Reads the returned history/application after a successful retry; replacing Articles preserves the company's document number or saves the validated correction entered.
Expects: a retrieval failure does not accuse the client of omitting information, and document replacement does not erase the identifying number.

## USER WALK — client who changed email
1. Confirms a new account email, or the office records the authorized change.
2. Reaches an agent renewal, payment or resignation event.
3. Receives the new notice/receipt/copy at the current account address.
Expects: historical intake stays intact; future account notices follow the changed address.

## USER WALK — client after backup recovery
1. Opens the portal with an unfinished S-election whose temporary taxpayer numbers were excluded from the backup.
2. Sees the required re-entry action and receives an automatic email directing them to the portal.
3. Re-enters the numbers; the issued EIN, when available, is used to generate the package.
Expects: no indefinite waiting-for-EIN message while re-entry is needed, no claim that excluded SSNs remain on file, and no need to contact the office for the ordinary recovery path.

## Verification contract

Run identical offline tests against baseline3577d25 and the repair. Exercise real components with failing and retrying responses; actual formation-package replacement and invalid-number rollback; actual backup restore into an empty database plus EIN arrival and re-entry; real notice paths after both portal-confirmed and office-entered email changes. Retain all outputs and inspect the changed screens. All three focused runners are appended to the mandatory browser-walk command after existing checks. Do not remove checks or install dependencies. Full review targets the exact local commit. Code scope inside declared files remains subject to complete-diff review.
