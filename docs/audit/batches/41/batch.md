# Batch41 — approved focused release repairs

Governing approval, verbatim: “2.  Why would an unpaid checkout show up as an order?\n\nApprove the rest”. A2 is held; all other proposed repairs are approved. The frozen work order elaborates the already-approved report without new business/legal decisions.

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
## Running instructions — 12 of 12 included
1. A2 remains unapproved; preserve its current query scope and pagination.
2. Implement only the other twelve approved proposals and their necessary tests.
3. No missing/late reminder billing hold; schedule stays70 days and existing payment safeguards remain.
4. Collect genuine debt separately; no renewal year/fee forgiveness/reinstatement policy change.
5. Preserve encrypted completed packages until actual client deletion; exclude transient questionnaire identifiers.
6. Preserve legacy deletion decisions and recovery verification; no historical sample cleanup.
7. Company-owned and series-owned property remain distinct, optional filing and Division qualification retained.
8. Eight agreement masters and other approved wording unchanged.
9. Never disclose owner profession or offer legal advice.
10. Keep old findings/rulings/assertions and frozen batches; truthful append-only tracking.
11. Offline owned tests with throwaway data; prove integrations disabled before fixtures.
12. Implementation only: no acceptance, integration, push, deployment or Dropbox publication.

## USER WALK — client paying outstanding fees after resignation
1. Opens the portal and sees the recorded resignation and separate balances.
2. Chooses Pay outstanding service fees and reads the debt-only consent.
3. Pays and receives an accurate receipt without a new service year.
Expects: genuine debt paid, resignation unchanged, no promise of renewed service.

## USER WALK — client after failed notice or completed replacement
1. Opens the portal after an email failure or replacement verification.
2. Sees actual payment/appointment state and a usable applicable payment link.
3. Receives truthful retried correspondence; pays only if still unpaid.
Expects: no contradictory replacement instructions, duplicate payment or notice-based billing hold.

## USER WALK — office handling a changed email and certificate deletion
1. Searches with the client's current address and opens the matching order.
2. Deletes one certificate copy and confirms the action.
3. Closes the detail and sees the current completed/unfinished position.
Expects: current and historical searches work, board refreshes without reload; A2 remains unchanged.

## USER WALK — operator replacing a filing or recovering tax packages
1. Replaces a filing or completes a newer encrypted S-election package.
2. Restores an earlier snapshot into a fresh isolated database.
3. Verifies exact filing revisions, latest retained tax package and actual client deletions before switching.
Expects: recoverable bytes and complete deletion tracking; unverifiable recovery stops truthfully.

## USER WALK — Manual reader
1. Reads the qualified optional company/series filing explanation.
2. Follows the company table's company-owned-property instruction.
3. Reads the sample signature block on one page.
Expects: consistent approved wording and intact formatting.

## USER WALK — next reviewer using decision records
1. Opens the generated list and sees settled choices labeled accurately.
2. Reads supplied exact approval quotations with their true provenance.
3. Runs current local gates and sees missing authentic rulings refused.
Expects: no reopened choice, forged historical approval or implied publication.


## Revision2 scope accounting

Necessary Batch41 revision under Adam's standing authorization: declare v2 deletion-journal fixture checksum adapter, recovery test support, and mandatory generated API/Word outputs. Same twelve approved repairs; A2 excluded; no new policy or publication.
The v2 checksum adapter preserves the existing validly hashed incomplete-journal refusal test. Earlier r1 snapshot and rejection provenance remain retained. No new owner decision or release acceptance is inferred.

## Revision3 scope accounting

Necessary revision under Adam's standing authorization: declare isolated tracking-fixture owner records and historical-renderer fixture selection. Existing exact assertions are preserved. The twelve approved repairs are unchanged; A2 and publication remain excluded.

## Revision4 review-check accounting

The complete release range includes Batches39/40, which require the tracking check. Declare it explicitly so the review runner executes it in addition to reconstructing the combined manifest. This necessary revision uses Adam's standing authorization and adds no product scope or release acceptance.
