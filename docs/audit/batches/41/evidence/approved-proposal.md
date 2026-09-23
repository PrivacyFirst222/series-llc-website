# MyFloridaSeriesLLC focused release review

September 23, 2026. Candidate **761af015e05507c19ec5a458af0cf839637ce8da**, branch **audit/batch-40**, Batch 40 revision 6, package **d664ff6d8e4c**.

**Recommendation: do not release this candidate yet.** I independently reproduced Claude's two blockers and both document-recovery failures. I recommend four release-blocking repairs: stop selling another service year after resignation while preserving collection of debt; keep paid office work visible; preserve recoverable versions of replaced filing documents; and recover replaced S-election packages without losing their retention/deletion controls. The remaining proposed repairs are smaller corrections and safeguards.

This is the requested focused examination after reading Claude's conclusions, not a blind or whole-product audit. **All 23 distinct entries and all four duplicate sightings are accounted for below.** Nothing was repaired in the candidate or original project. No finding was imported, no owner record changed, and nothing was accepted, integrated, pushed, deployed, uploaded or published. Payments, email and storage providers were simulated locally.

## How the conclusions were reached

The same criteria apply to every entry: does the current candidate violate a recorded decision or produce an incorrect real workflow result; is the proposed repair complete; is there evidence rather than a hypothetical concern; and is another business decision genuinely needed? I call a defect release-blocking where a supported operation takes payment with a false service promise, materially conceals paid work, or defeats the advertised recovery/retention behavior. Severity is my release judgment, separate from the observed facts.

Your instructions remain binding: missing or late reminders do not prevent otherwise authorized annual charges; reminder scheduling stays 70 days; charge timing, consent, cancellation, duplicate-payment and provider requirements remain. Collecting legitimate debt is distinct from selling another service year. The Manual distinguishes company property from series property; filing remains optional and the Division procedure stays qualified. No agreement-master edit, historical sample-data cleanup, disclosure of your profession, or legal-advice positioning is proposed. Existing rulings remain intact.

**No new business-policy decision is necessary for the repairs proposed here.** You are approving concrete repairs and wording. Changing retention, forgiving fees, reinstating resigned service or changing card policy would be new decisions; none is proposed. One old ambiguous Benefits-page ruling reference remains unidentified and deferred, as explained below.

### Verified release identity

- The candidate is clean and matches the expected commit/branch. The original project is at `e405da4` with its pre-existing `FAILURES.md` modification.
- Current remote `main` is `ba8b8a6b30c58004b47aaf8ff84641b586e2e8d5`. The package covers that complete 100-commit, 1,295-file range. Changes since the previous reviewed candidate `c91b101` are 22 commits and 140 files.
- The retained package has 16/16 required checks passed, none skipped. I parsed all 777 API and 1,312 core browser result records: all passed and identify the correct candidate/run. These are **verified retained results**, not a claim that I reran those entire suites.
- Recomputed package checks report no integrity problems. Its combined manifest matches 40 batches/440 parts; 12/12 Word hashes, the exact 9-file site manifest, and 353/353 retained candidate source files match. The expected before-fix failures are retained for the billing change.
- All 73 authenticated ruling records are present exactly in both repository representations. Ten retained decisions still display misleadingly as open; that is a display/disposition defect, not missing decisions.
- There is no acceptance naming this candidate. It is not integrated into original `main` or pushed to remote `main`. Dropbox's 54 files still match the package's before/after snapshot; the reviewed Word copies have not been published. **Deployment history was not inspected**, so I do not equate an absent Git push with proof that no manual deployment ever occurred.
- The eight agreement masters are unchanged **since `c91b101` and by Batch 40**. They do differ from published `ba8b8a6`. Claude's statement that they were unchanged over the whole release range was too broad.

Evidence: [identity](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/identity.json>), [package and ruling checks](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/controls.json>), [source/artifact hashes](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/source-artifact-identity.json>), [22-commit scope map](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/commit-scope-reconciled.json>). The scope mapper initially missed one test-only follow-up because no batch record changed in that commit; its existing Batch 37 declaration was then directly verified. No undeclared change was established.

## Group A — Billing and office workflow

### A1. Separate renewal sales from debts after resignation — release blocker

**Where:** client portal Registered agent service card; payment links and checkout; receipts; office Registered Agent Clients.

**What is wrong:** after the office records resignation, the client can still pay an ordinary renewal. In fresh tests, that payment advanced the anniversary by a year and generated a receipt promising service through that new date. The same wrong receipt/year advancement happens when the client pays legitimately overdue fees after a nonpayment resignation. Once the office records state filing, that overdue-fee link instead refuses payment immediately, even though the legal end date is still in the future.

Governing sources: Batch 37 item 1 says, “Replace the ordinary renewal and avoid-a-charge invitation with the resignation state” and “Keep outstanding payment information accurate.” Terms 10(f) says, “If we resign for nonpayment, that resignation charge and any unpaid service fees are due immediately.” These already establish the necessary distinction.

**Proposed repair:** stop selling/fulfilling a new service year after resignation submission and reject stale new-year links at the server. Keep legitimate unpaid service fees and the separate resignation charge collectible. A debt payment must settle the balance without advancing the anniversary, reversing resignation or promising renewed service. Apply this distinction to checkout details, payment submission, portal history, office balances and receipts, including after state filing/end. Preserve existing payment safeguards and reconcile any in-flight payment before changing its obligation. Do not cancel every unpaid row indiscriminately.

Claude's suggested portal/checkout/cancellation changes are incomplete without the debt path and checkout consent/receipt changes. The current checkout still solicits automatic future renewals for these payments.

**Exact proposed wording:**

- Debt action: **“Pay outstanding service fees”**.
- Debt checkout: **“This payment settles outstanding registered-agent service fees. It does not renew service or change the recorded resignation or appointment end date.”**
- Debt consent: **“I authorize payment of $[amount] toward the outstanding registered-agent service fees shown above.”** Existing applicable card/provider requirements must still be satisfied.
- Debt receipt: **“We received $[amount] toward the outstanding registered-agent service fees for [company]. This payment does not renew service or change the recorded resignation or appointment end date.”**
- Payment history: **“Outstanding service fees paid on [date]: $[amount].”**
- Unavailable new-year checkout: **“This service renewal is unavailable because our resignation has been submitted. Your portal shows any outstanding service fees and resignation charge separately.”**

**Required safeguard repair:** the Batch 37 negative searches for capitalized “Renews on.” I deliberately added the false lowercase “active and renews on” sentence alongside the proper resignation message; the existing walk still passed 22/22. A case-insensitive negative detected all three affected resignation cases. Claude's broader branch-reversion mutation did fail, but that does not prove this narrower wrong message is protected. Add active-service controls and resigned/declined/debt fixtures, stale-link refusal, debt settlement without renewal, and separate resignation-fee payment. Test resignation/payment races during implementation; no race defect is claimed from this review.

**New decision:** none; exact repair wording needs your requested approval.

Sources: [portal](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/portal/PortalDashboard.tsx:362>), [payment eligibility](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/ra-checkout.ts:37>), [office event handling](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/ra-office.ts:42>), [fulfillment/receipt](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/renewals.ts:175>), [checkout consent](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/AgentCheckout.tsx:19>), [test](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/scripts/batch37-walk.ts:72>). Evidence: [fresh billing observations](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/log.json>), [captured email](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/mail.jsonl>), [original check missing the mutation](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/mutation/defect-reintroduced/results.json>), [corrected negative detecting it](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/mutation/corrected-negative/results.json>).

### A2. Keep unpaid checkouts out of the paid work pages — release blocker

**Where:** Office → Formations & Service Orders.

**What is wrong:** I seeded one older paid order and 55 newer unpaid checkouts. Page one contained only 50 unpaid checkouts, while all three work columns showed zero and “Nothing here.” The paid order remained reachable on page two; it was not deleted. I also tested pagination with paid work only: a nonempty With The State queue can still show zero on the displayed page. Removing unpaid checkouts alone therefore leaves part of the misleading display.

Batch 36 requires: “Search and pagination reach all orders. Filter queues before applying page limits.” Its approved walk expects the office to see unfinished work without a completed backlog hiding it.

**Proposed repair:** page only actual work in the active board. Keep unpaid checkouts accessible in the existing separate fold with their own count, oldest age and independent pagination. Return complete totals for each work stage using the same database snapshot as its page. Retain page navigation and search; make per-page versus whole-queue counts explicit.

**Exact proposed wording:** column count **“[shown] shown · [total] total”**; empty page with work elsewhere **“No orders in this column on this page. [total] orders are on other pages.”**; truly empty stage **“No orders in this queue.”** Keep **“[total] pending payment”** on the separately counted fold. This preserves access to checkouts that may need payment reconciliation.

**New decision:** none. Sources: [query](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/admin-board.ts:33>), [column display](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/admin/OrderBoard.tsx:185>), [pending fold](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/admin/OrderBoard.tsx:296>). Evidence: [API and rendered assertions](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/results.json>), [page one](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/unpaid-page-one.png>), [paid order on page two](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/paid-page-two.png>).

### A3. Make payment notices truthful and usable when email fails — smaller correction

**Where:** renewal/reminder/decline emails; client portal payment link; failed receipt handling.

**What is wrong:** a reminder delivered after a declined charge says “There is nothing you need to do”; it can also give an already-passed cancellation deadline as a current instruction. The portal can direct the client to an email payment link while showing no usable link itself. Failed decline emails are not retried. A newly reproduced related omission: if the charge succeeds during the email outage, advancing the anniversary makes the job stop revisiting the failed reminder, while the failed receipt is only logged.

This does not necessarily require 55 days of email failure, as Claude suggested. A fresh test first ran the renewal job on the charge date: one failed-mail run and next-day recovery reproduced the false reassurance. That proves a possible trigger, not its production frequency.

**Proposed repair:** store the payment link with the obligation before attempting email, independent of delivery success and subject to A1's debt/renewal distinction. Track and retry failed financial correspondence separately from charging. Compose retries from actual payment status, renewal date and any still-scheduled retry. Never reset a paid/declined state or start another payment simply to resend mail. Preserve the 70-day reminder schedule and all approved billing rules.

**Exact proposed wording, used conditionally:**

- Declined: **“Your $99 registered-agent renewal charge was declined. You may pay now using the same or a different eligible card.”** Action: **“Pay renewal now”**.
- Before the anniversary: **“Please pay by [renewal date] to avoid delinquency.”** After it: **“The renewal fee remains unpaid and is now overdue.”**
- Passed deadline: **“The cancellation deadline for this renewal was [date] and has passed. You may still give cancellation notice in your client portal or by emailing support@myfloridaseriesllc.com. A late reminder does not extend the cancellation or replacement deadlines.”**
- Portal decline: **“Renewal charge declined for [date]. Pay now below using the same or a different eligible card.”** If the action cannot load: **“We could not load the payment link. Please try again or contact support@myfloridaseriesllc.com.”**
- Recovered paid notice: **“We received your $99 renewal payment. Your registered-agent service is paid through [date]. No further payment is due for this renewal.”** Preserve applicable reminder/deadline information without suggesting another charge is pending. Resigned debt payments use A1's wording.

**New decision:** none; wording approval only. Sources: [job](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/renewals.ts:118>), [templates](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/email.ts:103>), [portal](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/portal/PortalDashboard.tsx:431>). Evidence: [billing observations](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/log.json>), [late first run](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/late-first/log.json>), [missing link screenshot](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/shots/decline-before-mail-recovery.png>). The two duplicate document-review email sightings are included here.

### A4. Show completed replacement and separate resignation balances accurately — smaller correction

**Where:** portal Registered agent service card; Office → Registered Agent Clients.

**What is wrong:** after the office verifies the replacement agent, the portal still asks the client to appoint a successor/send proof and offers a renewal-card update. A resigning client's office row still says “renews.” Its payment summary chooses the newest charge, so labeling that charge correctly alone would still hide earlier unpaid service fees.

**Proposed repair:** show the completed replacement/end state before the pending-cancellation instructions. Remove future-renewal controls where inappropriate, while retaining legitimate balances. In the office, show appointment status separately from both service-fee and resignation-fee balances. Submission must not be labeled an already-ended appointment.

**Exact proposed wording:** **“Replacement registered agent verified. Our registered-agent appointment ended on [date].”** For a future end use **“Our registered-agent appointment ends on [date].”** Office example: **“Resignation submitted September 20, 2026”**, **“Outstanding service fees: $99 — payment declined”**, **“Resignation charge: $99 — unpaid; payment link available.”** Each balance independently changes to **“Paid [date]”** when paid.

**New decision:** none. Sources: [portal condition](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/portal/PortalDashboard.tsx:368>), [office labels](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/admin/AdminDashboard.tsx:47>), [office query](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/routes-admin.ts:862>). Evidence: [replacement screenshot](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/shots/replacement-portal.png>), [office debt screenshot](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/shots/arrears-office-before.png>).

### A5. Search using the client's current email too — smaller correction

**Where:** Office active and Completed Orders search.

**What is wrong:** changing the account email does not change the historical order email, and the board searches only the latter. Fresh API/browser tests found the completed order using the old address and no result using the current address.

**Proposed repair:** search the associated account's current name/email as well as the original order name/email. Keep historical order details intact and apply the search consistently to counts/pages. No wording change or new decision.

Sources: [board search](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/admin-board.ts:35>), [email change](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/routes-admin.ts:991>). Evidence: [results](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/results.json>), [current address misses](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/current-email-search-empty.png>), [old address matches](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/historical-email-search-found.png>). The fixture sets the exact resulting account state directly; it does not claim a fresh end-to-end email-verification walk.

### A6. Refresh the work queues after deleting the last certificate — smaller correction, additional finding

**Where:** Office → Completed Orders → order details → Delete certificate copy.

**What is wrong:** I deleted the last purchased Certificate of Status through the real screen. The detail correctly said the certificate was owed; the API moved the order to Post-Filing Items. After closing the detail, the board still displayed the order under Completed Orders until reload. Claude's office notes mentioned this as a source-level possibility; it was outside the 23 consolidated entries. It is now independently reproduced.

**Proposed repair:** after successful certificate deletion, refresh the order detail and both board scopes, their counts and page bounds. Keep an order complete if another qualifying copy still exists. No new wording or policy.

Source: [delete callback](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/src/pages/admin/OrderDetail.tsx:97>). Evidence: [actual UI/API assertions](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office-delete/results.json>), [stale Completed card](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office-delete/stale-completed-after-delete.png>), [correct after reload](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office-delete/reload-post-filing.png>).

## Group B — Backup and recovery

### B1. Preserve prior filing-document versions needed by completed backups — release blocker

**Where:** Office Replace action for Articles/designations; document mirror; database restore tool and runbook.

**What is wrong:** replacing a PDF keeps its document identity/title, so the mirror overwrites the path older backup manifests reference. A previously successful backup then fails its content-hash check before inserting any rows. A new backup can restore the replacement, but it does not repair older affected backups. The precise scope is every snapshot referencing those overwritten bytes, not literally every backup ever created.

**Proposed repair:** give each non-sensitive filing-document revision an immutable backup identity and retain the verified older copies needed by completed snapshots. Use those identities consistently in the mirror, manifest and restore. Preserve or restart any unfinished snapshot whose required bytes would otherwise be destroyed. Keep old manifest paths readable. Do not apply a global filename change to encrypted tax files without accounting for every copy in their deletion mechanism.

A runbook note alone is insufficient for release: a routine correction can disable the latest completed recovery point before another exists. Failing safely on a bad hash is correct, but it does not make the backup recoverable. Provider version history is a possible recovery source only if the exact prior bytes actually exist and match; I did not verify that service.

**Exact proposed interim runbook wording:**

> Replacing an Articles or Protected Series Designation PDF can invalidate an earlier snapshot that references the overwritten Dropbox bytes. The restore stops with “Backup file missing or changed” before inserting database rows. A later completed backup can restore the replacement but does not repair earlier snapshots. Use an affected snapshot only after obtaining the exact prior bytes and verifying its manifest hash. If those bytes are unavailable, this tool cannot restore that snapshot. Do not bypass the hash check or assume provider version history is available.

After repair, replace the interim warning with the tested revision-recovery procedure and keep its legacy limitation. Do not rewrite or clean historical sample backups.

**New decision:** none. Sources: [Replace](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/routes-admin.ts:1415>), [mirror identity/overwrite](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/dropbox.ts:75>), [restore hash check](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/restore.ts:43>). Evidence: [decisive fresh results](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/coordinator-decisive-evidence.json>), [full observations](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/structured-observations.json>). Original snapshot control recovered 16 tables/9 files; after replacement, affected restores stopped with all 16 tables empty; a later snapshot restored successfully.

### B2. Recover the latest retained S-election package without losing deletion control — release blocker

**Where:** S-election replacement; independent recovery journal; restore; client documents and S-election service state.

**What is wrong:** restore a snapshot taken before a completed replacement, and the system can hide both packages, leave the order fulfilled, and reject editing with “You deleted this document.” The client did not delete it. In two fresh variants, two encrypted primary objects and two mirror copies survived without restored document/staging/deletion references, even after cleanup and a subsequent backup. The portal offered neither package nor a recovery action.

N1.01/N1.02 already require completed encrypted forms to remain until client deletion, while excluding transient questionnaire numbers and preserving deletion decisions. Therefore I reject Claude's classification as a required new choice between retaining the replacement and deleting it. **Retaining the latest completed package follows the existing decision.** The reproduced loss of access/deletion tracking makes this a release blocker, even though it requires recovery to expose it.

**Proposed repair:** durably record the committed replacement relationship, owner/company/service associations, immutable encrypted recovery identity and verified file hash independently of the restorable database, before retiring the predecessor. Ensure the successor has a verified recoverable encrypted copy first. Recovery must reinstate the latest committed, not-client-deleted successor and reconcile staged work so cleanup cannot delete it. An actual later client deletion must defeat all earlier snapshots and replacement records and reach all controlled encrypted copies. Cover repeated replacements, lost responses, concurrent operations, primary-storage loss, restore-then-delete and repeated recovery.

Keep full questionnaire numbers out of snapshots/journals and recovered questionnaire fields. A retained encrypted completed PDF remains permitted by the existing ruling. If required recovery evidence is unavailable, stop with a truthful actionable failure; do not silently label the service fulfilled/client-deleted or leave files untracked. Legacy tombstones lack reliable replacement history: preserve their deletion effect rather than guessing or resurrecting documents. Introduce the new protocol forward; no sample-data cleanup is needed.

**Exact proposed recovery failure wording:** **“Recovery could not verify the current S-election package for [company]. Do not switch production to this restored database until the package and its document records are reconciled. No client deletion has been inferred.”**

**Exact proposed runbook wording:**

> Before switching production to a restored database, verify that every recorded S-election replacement resolves to its latest retained encrypted package or a later actual client-deletion decision. A successful restore command alone does not prove this. Preserve all controlled-copy deletion records and exclude full questionnaire numbers. Missing historical replacement metadata cannot be recreated by guessing; stop and reconcile the affected package before using the restored database.

**New decision:** none for this retention-preserving repair. Sources: [replacement storage](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/s-election-package-storage.ts:10>), [retirement](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/document-retention.ts:16>), [restore treatment](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/restore.ts:19>), [recovery exclusion](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/s-election-recovery.ts:18>), [edit denial](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/webapp/server/routes-portal.ts:2269>). Evidence: [fresh results](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/coordinator-decisive-evidence.json>), [recovered portal](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/ui-live.png>), [portal readback](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/ui-live.txt>).

## Group C — Manual and tracking

### C1. Correct the Manual's company-filing table — smaller substantive correction

**Where:** Owner's Manual Section 11, Step 4; generated Word and client PDF.

The new paragraph correctly distinguishes company-owned from series-owned property, but the table below still says to record the company's statement where “the company or a series” owns property. **That was a missed dependent edit in the earlier Codex work.** The source and both fresh renders confirm it; passing tests did not establish consistency.

Governing approved words: “A statement concerning property held by the company identifies the company; a statement concerning property held by a protected series identifies that protected series.” The company instructions are expressly qualified against use for a series filing. Official [s. 605.0302](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0302.html) and [s. 605.2108](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.2108.html) were directly read; they support the entity distinction without establishing the Division's practical series-filing procedure.

**Exact proposed Step 4 cell:**

> In the official records of **every county where the company owns real property.** The clerk charges a separate recording fee.

Delete only “or a series.” Preserve the entire approved paragraph, optional filing, qualifications and agreement masters. Update the Markdown source, regenerate outputs, inspect the table/downstream pages and add a targeted consistency safeguard. This implements the existing policy; it is not a new legal/business choice.

Source: [Manual](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/owners-manual.md:194>). Evidence: [fresh PDF table](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/manual-16.png>), [fresh Word page](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/word/page-19.png>), [artifact identity](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/identity.json>).

### C2. Keep the Word sample signature block together — smaller formatting correction

**Where:** Manual Section 13 in Word. Fresh bundled-LibreOffice rendering puts “Name: Maria Santos” on page 20 and “Title: Manager” on page 21. The client PDF keeps the block together.

**Proposed repair:** make the generator keep this contiguous sample block together through its explanatory note, leaving the final paragraph free to end the group. Preserve every word; do not chain all quoted prose throughout all documents. Regenerate and inspect adjacent pages after C1. Microsoft Word pagination was not tested. No new decision or wording.

Sources: [sample](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/owners-manual.md:216>), [generator](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/md-to-docx.py:564>). Evidence: [Word page 20](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/word/page-20.png>), [page 21](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/word/page-21.png>), [paragraph properties](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/documents/signature-ooxml.json>).

### C3. Display settled owner choices as settled — smaller tracking correction

**Where:** generated audit list. Items **8, 15, 22, 34, 38, 139, N2.14, 232, 236 and N2.02** have their authentic rulings, but no owner-retained disposition; they still read as open work. The generator also prints “waits on Adam's ruling” for 51 item-level waits whose named ruling exists.

**Proposed repair:** record the ten dispositions through the existing checked mechanism and regenerate the list. Render only genuinely unmet ruling waits, including the already-supported item/part semantics; do not delete immutable wait/history fields. Keep technical implementation/release status separate from the owner's retained wording. Existing rulings and assertions remain untouched. This is a reviewed tracking change, not permission to mark everything released.

**Exact display wording:** reuse **“Owner retained the wording.”** with its existing technical-lifecycle explanation. Omit satisfied “waits on Adam's ruling” labels. Suppressing all 51 misleading labels is explicitly included here, rather than silently expanding a ten-item bookkeeping fix.

**New decision:** none. Sources: [renderer](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/audit/ledger-print.ts:40>), [retain mechanism](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/audit/tracking.ts:14>). Evidence: [all ten dispositions and 51 named waits](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/controls.json>).

### C4. Detect authentic rulings that never reach repository records — smaller safeguard correction

**Where:** local commit/release checks. Today's 73 rulings are present; current release records are not missing one. But the checks reject removal/forgery of repository rulings without checking completeness against the external authenticated records. A fresh in-memory probe of the historical ledger, which lacks eleven records, produces no refusal when compared with itself.

**Proposed repair:** local gates with access to owner records must require each relevant authenticated ruling's exact item/part/text in both the ledger and canonical ruling line, naming omissions. Preserve historical verification modes without silently allowing incomplete current release records. CI should explicitly report that it cannot inspect the local owner-record source; it must not claim to have performed that check. Add clean, omitted, altered and forged-record probes. No new policy or customer wording.

Source: [current validation](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/audit/ledger-lib.ts:426>). Evidence: [control and mutation results](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/controls.json>). Existing removal/forgery protections did reject their intended mutations.

### C5. Preserve exact approval provenance supplied in this handoff — smaller records correction

**Where:** Batch 38 and 39 readable records. They summarize approval rather than quote it. Your handoff supplies both exact exchanges: after **“Load group b”**, **“Go. Approve all”**; after **“Load group c”**, **“Go. Approve all”**.

**Proposed append-only note for each relevant record:**

> Approval provenance supplied by Adam in the September 23, 2026 website handoff: after “[Load group b / Load group c]”, Adam said “Go. Approve all”. This authorized the presented implementation scope; it was not acceptance of an exact release package.

Use the applicable group in each note. Preserve the exact Group D exchange from the supplied handoff in its provenance note if completing that record at the same time. Label these as quotations supplied by you in this handoff; do not pretend the original session was independently recovered or fabricate an authenticated acceptance. No new decision is needed, and this review does not write those records.

Sources: [Batch 38](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/audit/batches/38/batch.md:3>), [Batch 39](</Users/adam/Documents/FLPSLLC Website Review/batch-40-implementation-2026-09-23/repo/docs/audit/batches/39/batch.md:3>), [your supplied handoff](</Users/adam/.codex/attachments/2d1431b2-b172-4c55-b6b3-b62d0d4439fc/Pasted text.txt>).

## Every Claude entry reconciled

The 23 entries reduce to **4 release-blocking defects, 11 smaller corrections/safeguards, 2 verification gaps and 6 retained/deferred matters**. These categories describe entries, not 23 separate repair batches. The thirteen proposals above group related work and include the two additional observations.

| # | Claude ID | Reconciled disposition and proposal assessment |
|---|---|---|
| 1 | X40-AGENT-renewal-sold-after-resignation | Confirmed blocker; A1. Claude's fix needs the debt/checkout/receipt path, not indiscriminate cancellation. No new policy decision. |
| 2 | X40-office-abandoned-checkouts-page-out-work | Confirmed blocker; A2. Remove pending rows from work pagination and fix whole-queue totals/empty-page wording. |
| 3 | X40-CLOSE-agent1-walk-negative | Confirmed safeguard correction; A1. Narrow false wording survives the old check; corrected negative catches it. |
| 4 | X40-CLOSE-groupBC-approval-not-verbatim | Confirmed provenance correction; C5. Exact words are now supplied, not missing user input. |
| 5 | X40-docs-division-series-statement-procedure | Acknowledged verification gap; retain approved qualification. No current product repair or repeated decision. |
| 6 | X40-REL-migration16-production-evidence | Conditional production-history gap. Published-base upgrade passed; intermediate duplicate history failed. See deployment prerequisites below. |
| 7 | X40-REL-ruling-completeness-unchecked | Confirmed safeguard correction; C4. Today's record set is complete; future omissions need detection. |
| 8 | X40-CLOSE-carried-staged-cleanup | Retain current behavior. Repeated cleanup catches late uploads; arbitrary cutoff would weaken it. Optional future optimization, not an unresolved release decision. |
| 9 | X40-CLOSE-carried-manual-transfer-sentence | Leave unchanged: unproved ambiguity. Context says restrictions “among owners,” while the Manual separately describes transfer restrictions. Prior reconciliation recommended no change; this is not invented owner approval. |
| 10 | X40-CLOSE-carried-library-pagination-key | Defer until another library document needs a numbering policy. Current product-created Manual key matches the approved fix. |
| 11 | X40-CLOSE-carried-rulings-md-14 | Old clarification remains: which Benefits “Side by side” row the 15 September “This is correct” referred to. The ledger's item 6 still carries that ambiguity. Preserve wording/ruling and defer; do not mark resolved or ask a new policy question now. |
| 12 | X40-DATA-restore-after-package-replacement-loses-both-and-orphans-ssn-copy | Confirmed blocker; B2. Reclassified from owner decision because existing retention rulings govern the repair. |
| 13 | X40-AGENT-late-reminder-wording | Confirmed smaller correction; A3. State-aware wording and durable correspondence retry; no billing hold. |
| 14 | X40-AGENT-decline-without-portal-link | Confirmed smaller correction; A3. Save usable link independently of email and apply A1 categories. |
| 15 | X40-AGENT-replaced-client-still-told-to-replace | Confirmed smaller correction; A4. Actual replacement/end state precedes pending instructions. |
| 16 | X40-AGENT-office-row-after-resignation | Confirmed smaller correction; A4. Show both balances; relabeling just the latest charge is insufficient. |
| 17 | X40-DATA-inplace-replace-voids-earlier-backups | Confirmed blocker; B1. Narrow claim to snapshots referencing overwritten bytes; a later backup does not repair them. |
| 18 | X40-office-search-misses-current-email | Confirmed smaller correction; A5. Search current and historical identity without overwriting the order record. |
| 19 | X40-docs-manual-s11-step4-records-company-statement-where-series-owns | Confirmed smaller substantive correction; C1, exact proposed text above. Policy already settled. |
| 20 | X40-docs-manual-pdf-three-bullet-page | Reproduced cosmetic issue; defer. PDF physical page 19 holds three legible bullets with whitespace; no content loss. Reassess reflow after C1, without shortening approved text. |
| 21 | X40-docs-word-manual-sample-signature-block-split | Confirmed smaller formatting correction; C2. Scope keep-together to the sample block. |
| 22 | X40-REL-retained-rulings-read-open | Confirmed smaller tracking correction; C3. Preserve authentic rulings/history and show their effect. |
| 23 | X40-REL-diffsha-text-decoded | Confirmed technical limitation; defer format redesign. Diff hash covers UTF-8-decoded text, not binary bytes, but commit identity plus separately verified source/site/Word hashes closes this candidate's practical identity gap. Do not invalidate old packages by silently changing the hash format. |

Duplicate sightings, not additional findings: **X40-CLOSE-recon01-ten-retained-display → #22/C3**; **X40-CLOSE-data01-production-schema → #6**; **X40-docs-renewal-reminder-says-nothing-to-do-after-decline → #13/A3**; **X40-docs-late-reminder-states-past-cancellation-date → #13/A3**.

Additional observations are linked, not hidden in counts: **successful-charge correspondence loss → A3**; **certificate-deletion queue refresh → A6**. Debt collection after state filing and checkout wording are completeness requirements of A1; paid-only misleading column counts are part of A2.

## Remaining deployment prerequisites

**Migration 16 is not demonstrated broken for current production.** A fresh database created by published `ba8b8a6` had migrations 1–11 and no resignation-purpose column. Upgrading it to this candidate succeeded, preserved both seeded renewal records and applied migrations 1–16. A database made by intermediate `e405da4` with migrations 1–15 and two resignation rows failed twice at the unique index. No later repair changed migration 16. [Fresh migration evidence](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/migration-repro.json>).

Before deployment, obtain a read-only view of actual schema history and shape:

```sql
SELECT id, checksum FROM schema_migrations ORDER BY id;
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ra_renewals'
  AND column_name = 'purpose';
```

If the schema matches the published 1–11 history with no purpose column, the duplicate-resignation hazard does not apply. If the column exists and migration 16 has not completed, check:

```sql
SELECT order_id, count(*)
FROM ra_renewals WHERE purpose = 'resignation'
GROUP BY order_id HAVING count(*) > 1;
```

Checking shape covers a partially applied migration whose ledger row was never written. If 16 is already recorded, verify its expected checksum/index. Any actual duplicate charge records require evidence-led reconciliation; do not rewrite applied migration 16 or assume a later migration can repair a failure that prevents reaching it. Production schema/history was not accessed in this review.

The existing runbook also requires working encryption keys/recovery copies, connected storage, and a hosting plan/schedule capable of the five-minute continuation job and 300-second function duration. Those live prerequisites and actual cron/provider execution were not verified by offline tests. They are deployment evidence requirements, not new product defects.

After approved repairs: create a fresh full-range package, recheck remote base, obtain acceptance of that exact package through existing controls, then separately perform authorized integration/push/deployment/document publication and record observed receipts. Approval of this proposal alone would authorize implementation, not publication.

## Evidence coverage and limitations

The finite checklist was written before fixtures. Fresh independent executions covered billing/resignation and arrears, late/failed correspondence, office paging/search/deletion, both replacement-recovery defects, published/intermediate migration histories, ruling-control probes and selected mutation safeguards. Reviewed prior drivers were reused where noted; results were newly produced. This is independence of execution and assessment, not a claim every test harness was independently authored.

Before fixture writes, each app verified `offline:true` and all seven external integrations disabled, with dedicated throwaway database/storage/mirror paths. Billing/recovery child servers had process ownership checked; office tests hosted the app in-process after verifying the same environment and installing an external-fetch refusal. Browser contexts blocked outside traffic. No live provider result is claimed. [Office proof](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/office/offline-proof.json>), [billing proof](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/billing/runs/focused/offline-proof.json>), [recovery proof](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/recovery/offline-proof-stack.json>).

Recovery control restored all 16 tables with no row-comparison differences and all 9 files readable. Direct source-byte comparison was recorded for 7 of those 9; the other two rely on manifest verification/readability, so this report does not claim nine independent source-byte comparisons. Post-snapshot replacement failures were then exercised separately. Synthetic encrypted PDF fixtures tested recovery mechanics; real taxpayer content was not used. The complete retention/copy implications are source-grounded in the S-election generation path.

Selected mutation results: the false lowercase renewal wording escaped the original walk and was caught by the corrected assertion; removing staged-document backup coverage made the existing structured checks fail while secret-exclusion still passed; removing/forging rulings was refused. The recovery probe reports assertion booleans and exits zero itself, so a failed boolean is not reported as a nonzero command exit. Temporary product mutations were restored.

Fresh Manual PDF rendering produced 38 pages. Relevant pages 15–19 were visually inspected, including the company table, signature and three-bullet page; all 38 page texts/content streams matched Claude's retained candidate artifact. Fresh bundled-LibreOffice Manual rendering produced 43 pages; pages 19–21 were inspected, and regenerated Manual OOXML matched. All 12 prior Word render inputs were identity-checked before reusing remaining historical visual evidence. This is not a new visual review of every page of every document. Microsoft Word itself was not tested.

Necessary official statutory sections and the Division FAQ were read directly in an owned browser tab. The Division's practical protected-series statement filing procedure remains unconfirmed. The official generic form's existence does not prove acceptance of a protected-series filing; its browser PDF viewer was blank, so no conforming browser inspection of that form is claimed.

The 22-commit changed range and relevant product dependencies were divided across the reviewers; unrelated files were not audited anew. Prior disposition records were read as inputs and duplicates retained; old “fixed” results are not silently relabeled newly reproduced. The historical 62-entry disposition file remains supporting input, not a new whole-product certification.

Final preservation verification found no changes to the candidate’s 1,484 tracked files, the original project’s 1,274 tracked files or its pre-existing status, either authenticated record file, all 54 Dropbox files, or all 742 release-package files. Remote `main` was rechecked at 19:10 UTC and remains `ba8b8a6`. [Before/after verification](</Users/adam/Documents/FLPSLLC Website Review/codex-release-review-40-2026-09-23/evidence/release/preservation-result.json>).

The requested boundaries are satisfied: exact candidate; finite scope; isolated evidence; all 23 entries reconciled; consequential runtime tests; changed-dependency examination; cross-surface/document checks; fresh relevant rendering; mutation checks; release-range/migration distinction; preserved owner rulings; one approval proposal; no product or publication mutations. The two production/Division verification gaps and explicit rendering/provider limits remain disclosed.

**Proposed approval scope is Groups A, B and C above. No repairs have been implemented.**
