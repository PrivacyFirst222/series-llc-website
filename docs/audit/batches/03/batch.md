# Batch 03 — revised scope approved by Adam

Authorization: Adam's whole message "Go - approve all", after reviewing the replacement Batch 03. No second confirmation is required. Implementation and a review package only; no acceptance, integration, publication, production data cleanup, or key change in production.

## Governing instructions, quoted

Adam: "On 4 and 5 you say you’ll clean up existing test data back ups. Don’t waste time on this. It’s test data. It’s going to be deleted."

Adam: "With respect to S election forms and EIN letters, encrypt them and then give the user the option to delete them or leave them in their portal. Then change the description in our privacy policy"

Adam: "I want a full backup"

Approved replacement scope: "Explain that completed S-election forms and EIN letters are stored encrypted and remain available until the client chooses to delete them. Distinguish these documents from the underlying questionnaire answers. My proposed rule for those underlying numbers remains: remove EIN numbers when the office records fulfillment, and S-election numbers after the 14-day editing window."

Approved replacement scope: "Replace the 200-files-then-stop behavior with automatic continuation through the complete backup. Retry failures, identify anything missing, and show 'Complete' only after verification."

## Approved scope — 13 ledger parts in 12 review units

1. 26:all — payment storage disclosure.
2. 27:collection-channel — portal collection disclosure.
3. 27:retention — client controlled document retention.
4. N1.01:all — backups exclude transient taxpayer numbers.
5. N1.02:all — encrypted documents and deletion survive restore.
6. N1.03:all — manual tax documents use the same retention.
7. 121:all — editing expires without deleting documents.
8. 162:all — closed editing message preserves documents.
9. 207:all — office email describes repeatable access.
10. 223:all — complete backup restores business history.
11. 226:all — key rotation preserves live information.
12. 179:all — backup completes beyond 200 files.
13. 224:all — mirror description matches complete processing.

The 12 review units comprise 13 ledger parts (121 and its duplicate 162 move together). Keep all prior items, histories, rulings and assertions. Batch 02's named address check still compares original, office draft and retained post-window PDF; its obsolete record-copy lookup is the only necessary expectation change. No existing test backups or mirrors are enumerated for cleanup.

## User walks

USER WALK — client keeping or deleting tax documents:
1. Opens the selected company's Your documents section after an S-election form or EIN letter is delivered.
2. Downloads it normally while signed in; after fourteen days the S-election PDF still downloads, while editing has closed.
3. Chooses Delete on that document, reads the named confirmation, and confirms or cancels.
Expects: keep by default; deletion removes access and retries storage/mirror cleanup visibly; another client's document cannot be deleted.

USER WALK — office manually delivering a tax document:
1. Opens the service order and uploads the completed PDF.
2. Marks it fulfilled and sees the linked client document.
3. Returns after the S-election edit window and checks its status.
Expects: uploaded and generated tax PDFs follow the same encryption and client-controlled retention; raw questionnaire numbers expire separately.

USER WALK — office checking recovery:
1. Opens Reference Library, then runs a backup or checks its automatic progress.
2. Sees incomplete/running/failed counts while documents remain and Complete only after verified coverage.
3. Uses the restore instructions on an empty target and validates recovered records and decryptable documents.
Expects: no 200-file overall cap, failed files do not strand later files, interruptions resume, and deleted documents are not restored as available.

## Verification and deployment boundaries

Use only offline disposable databases and mock storage/service failures. Exercise raw stored ciphertext, authenticated download, unauthorized deletion, deletion retries and a restore from a pre-deletion database snapshot. Test more than 200 documents, interrupted work, failed early files, byte verification, and recovery of email and renewal history. Encryption keys stay outside backups and require their own secure recovery copy. No secret value is included in evidence. A production configuration preflight must fail closed when encryption keys are missing; production setup belongs to the later accepted release.

## Original findings (history, not approval of old replacements)

### 26

Privacy Policy, section 3 'Payment Information' — `webapp/src/content/privacy.md:19`
Reads: Payments are processed by **Square, Inc.** We never receive or store your full card number, CVV, or bank credentials. Square provides us a confirmation of payment and limited details (such as the last four digits and the name on the order). Square's handling of your information is governed by Square's own privacy policy.
Claims: That Square gives us only a payment confirmation and a few details.
True: With the client's permission on the agent step the formation card is kept with Square for the yearly $99 renewal and charged 15 days before the renewal date (terms.md:44 'You authorize the charges shown at checkout and the renewal charges described below.', :50; buildPayload.ts:68 'renewalCardConsent'; commit e08f019 'the card the formation was paid with is kept with Square'). The policy never says a card is kept on file, by whom, or what we retain to identify it.
Replace with: Add after the third sentence: "If you agree on the order form to keep your card for registered agent renewals, Square stores the card on our behalf and charges the renewal as the Terms describe; we keep only the card brand, its last four digits, and its expiration so you can recognize it in your portal."

Prior assessment: {"status": "disputed", "evidence": "privacy.md:19 contains the quoted Square paragraph, but the replacement says \"we keep only the card brand, its last four digits, and its expiration\". renewals.ts stores Square customer/card identifiers as well and does not store expiration in that update.", "replacementOk": false, "replacementNote": "Disclose card-on-file consent and Square storage, and accurately list retained identifiers, brand and last four; do not invent retained expiration or say only."}

### 27

Privacy Policy, section 2 'Information You Give Us', the Social Security paragraph — `webapp/src/content/privacy.md:15`
Reads: Our website forms do not request, and you should not enter into them, Social Security numbers, driver's license numbers, government identification numbers, biometric data, or bank account numbers. If you purchase our EIN service, we collect the responsible party's Social Security number or ITIN separately, through a secure channel we designate, solely to prepare and submit IRS Form SS-4, and we do not retain it after the EIN is issued.
Claims: That no website form takes a Social Security number, and that the EIN service prepares and submits Form SS-4.
True: The 'secure channel' is a website form — the portal's EIN details and S election forms (ssn.ts:1-4 'Social Security number checks shared by every box that takes one'; the S election form collects each owner's SSN). And the office applies through the IRS online EIN assistant, walked screen by screen (einActivity.ts:1-3), not by submitting a paper SS-4. The deletion claim is right: routes-admin.ts:1370 'The TIN is deleted the moment the order is fulfilled'.
Replace with: Our order form does not request, and you should not enter into it, Social Security numbers, driver's license numbers, government identification numbers, biometric data, or bank account numbers. If you purchase our EIN service, we collect the responsible party's Social Security number or ITIN separately, through a secure form in your client portal, solely to complete the IRS's EIN application (Form SS-4 or its online equivalent), and we delete it the moment the EIN is issued.

Prior assessment: {"status": "disputed", "evidence": "privacy.md:15 does incorrectly deny website SSN collection. However, \"we delete it the moment the EIN is issued\" is not established by an office fulfillment update, and backup.ts:13-28,107-142 explicitly preserves service_orders ciphertext in permanent snapshots.", "replacementOk": false, "replacementNote": "Correct the portal-collection/application description, and resolve the actual retention policy and backup behavior before promising deletion at issuance. The finding’s assertion that the deletion claim is right is unsupported."}

### N1.01

Privacy Policy, Social Security number retention; nightly database backups — `webapp/src/content/privacy.md:15`
Reads: At the end of that period we permanently delete every Social Security number you gave us and replace your copy of the completed form with a record copy showing only the last four digits.
Claims: Every retained copy of an S-election Social Security number is permanently deleted after14 days.
True: backup.ts:13–14 expressly includes taxpayer-number ciphertext; :124–142 snapshots every column of service_orders into immutable archives and :107–110 retains backups indefinitely. crypto.ts:52–53 derives the decrypting key from unchanged SESSION_SECRET. routes-portal.ts:623 clears only live rows. A backup made during the edit window remains decryptable afterwards. This is a separate retention defect from prior27's collection-channel wording; production execution is not asserted.
Replace with: At the end of that period we remove the Social Security numbers from the active service-order record and replace the portal form with a record copy showing only the last four digits. Encrypted copies remain in archived database backups. [To preserve the existing permanent-deletion promise instead, exclude live secrets from backups or expire their independent encryption keys, and remove already retained copies.]

Prior assessment: {}

### N1.02

S-election package, what happens to the offsite copy after the edit window — `webapp/server/dropbox.ts:9`
Reads: * Vercel Blob. Copies are only ever added or overwritten — a deletion on the
 * live site never propagates; that is what makes it a backup.
Claims: Offsite files intentionally survive deletion on the live site, while privacy.md:15 and email.ts:407–410 promise permanent SSN deletion from the systems.
True: dropbox.ts:128–152 mirrors every pending document, without excluding full-SSN S-election packages. purgeExpiredSElections at routes-portal.ts:589–598 replaces only the live document/blob; it neither removes the old Dropbox object nor clears mirrored_at. The mirror filename includes the old title, so copying a differently titled Record Copy alone would not remove the original.
Replace with: Exclude full-SSN S-election filing copies from the offsite mirror. Remove any previously mirrored filing copies when the edit window closes, using a stored mirror path, and mirror only the redacted record copy.

Prior assessment: {}

### N1.03

Office, fulfilling an S-election package manually; client record-copy retention — `webapp/server/routes-admin.ts:1372`
Reads: await db.query(
    "UPDATE service_orders SET status = 'fulfilled', fulfilled_at = now(), ein_secret = NULL WHERE id = $1",
    [so.id],
  );
Claims: Marking an uploaded S-election package fulfilled leaves a package that the standard14-day purge can identify and redact.
True: The manual fulfill route accepts awaiting_info orders (:1295–1297), inserts a PDF (:1360–1367), but does not store its documentId or the formation/shareholder details in service_orders.details. purgeExpiredSElections at routes-portal.ts:568 requires shareholder details and dateIncorporated before touching a PDF and otherwise merely clears ein_secret at:623. An office-uploaded full-SSN PDF can remain in the portal indefinitely.
Replace with: For S-election fulfillment, require the structured details needed for redaction and persist the uploaded document ID on the service order before setting fulfilled. If those details are unavailable, remove the linked filing PDF when the edit window closes instead of leaving it accessible.

Prior assessment: {}

### 121

S election dialog and "Editable until" row say the package is "deleted"; it is replaced with a record copy. Replace both to say so.

Prior assessment: {"status": "confirmed", "evidence": "OrdersInProgress.tsx describes the S-election package as deleted; routes-portal.ts:548-630 instead attempts to replace it with a last-four record copy.", "replacementOk": false, "replacementNote": "Say the editable original is removed and a record copy is normally posted; do not promise system-wide SSN destruction: backup.ts:13-14/17-28 retains ciphertext and Dropbox retains old files. Handle a failed record-copy rebuild explicitly."}

### 162

Client portal, S election details — the refusal after the two-week window — `webapp/server/routes-portal.ts:2277`
Reads: "The two-week window for changing this package has closed, and the details have been deleted. Contact us if you need a new one.",
Claims: The details are gone.
True: purgeExpiredSElections (:548-630) deletes the encrypted Social Security numbers (:623 `ein_secret = NULL`) and rebuilds the package as a record copy showing last-four digits (:581-586); the details themselves are kept (:566 `const kept = { ...d, purgedAt }`). This is the server half of A53; the text is shown by SElectionDetailsForm.tsx:677.
Replace with: "The two-week window for changing this package has closed: the Social Security numbers have been destroyed and the package replaced with a record copy. Contact us if you need a new one.",

Prior assessment: {"status": "confirmed", "evidence": "routes-portal.ts:2277 says details were deleted, but :566 spreads the details into a kept record and :623 only nulls ein_secret. The refusal is displayed in SElectionDetailsForm.", "replacementOk": false, "replacementNote": "Replace details-deletion language with a precise live-system statement; do not claim all SSNs have been destroyed when backups and mirror copies persist, or promise a record copy exists if its rebuild failed."}

### 207

Office email 'EIN details submitted — ready to file' — `webapp/server/email.ts:374`
Reads: View them once in the admin dashboard; the identification number is deleted automatically when you mark the order fulfilled.
Claims: The details can be viewed once.
True: GET /admin/services/:id decrypts the number on every call (routes-admin.ts:1124-1132); nothing limits viewing to once. The deletion clause is true (:1372-1375).
Replace with: View them in the admin dashboard; the identification number is deleted automatically when you mark the order fulfilled.

Prior assessment: {"status": "confirmed", "evidence": "email.ts:374 says View them once; routes-admin.ts:1124–1132 decrypts the TIN on every authorized request. There is no once-only viewing restriction.", "replacementOk": false, "replacementNote": "Remove once. Qualify deletion as removal from the active service-order record unless backup retention is also corrected; the existing blanket deletion clause is not true for archived snapshots."}

### 223

Nightly database backup — what it contains — `webapp/server/backup.ts:17`
Reads: export const BACKUP_TABLES = ["clients", "orders", "service_orders", "documents", "oa_profiles", "oa_generations", "library_documents", "webhook_events", "fl_sync_state", "contact_messages"] as const;
Claims: The header (:6) says these are 'the tables that cannot be rebuilt from anywhere else' and :9-12 lists the deliberate exclusions (fl_entities, sessions, auth_tokens).
True: Two tables added since are neither dumped nor listed as excluded: email_log (db.ts:405-417, kept so the office can prove 'that we sent them something') and ra_renewals (db.ts:442-461 — each renewal's notice, charge, Square payment id, decline code and payment link). A Neon-side loss takes the email record and every renewal's history with it. rate_limits and schema_migrations are also absent (harmless; the restore script must recreate the ledger).
Replace with: Add "email_log" and "ra_renewals" to BACKUP_TABLES and to scripts/db-restore.ts; list rate_limits with the deliberate exclusions in the header.

Prior assessment: {"status": "confirmed", "evidence": "backup.ts:17 omits email_log and ra_renewals, which db.ts:405–417 and442–461 define as persistent history. A restored snapshot cannot recover those records. This changes office evidence and renewal behavior, so it is not housekeeping-only.", "replacementOk": true, "replacementNote": "Include both tables in backup and the restore workflow, preserving foreign-key order and migration setup. The excluded restore script itself was not read; this is a required corresponding change, not certification of that script."}

### 226

Encryption note on when the secrets are deleted — `webapp/server/crypto.ts:47`
Reads: rotating SESSION_SECRET orphans stored ciphertexts, which is acceptable because these secrets are deleted at fulfillment by design.
Claims: Secrets are deleted at fulfillment.
True: EIN secrets are (routes-admin.ts:1372-1375). S election SSNs are re-stored at fulfillment and kept for the 14-day edit window (routes-portal.ts:885-893, S_ELECTION_EDIT_DAYS = 14 at :517) before the purge; a key rotation inside that window orphans a live package the client may still regenerate.
Replace with: …because EIN secrets are deleted at fulfillment and S election secrets 14 days after it; rotate SESSION_SECRET only when no S election window is open.

Prior assessment: {"status": "disputed", "evidence": "crypto.ts:49–51 reads rotating SESSION_SECRET orphans stored ciphertexts, which is acceptable because these secrets are deleted at fulfillment by design. The finding rightly notices14-day S-election retention, but its replacement permits rotation whenever no S window is open even if an active EIN order still needs decryption.", "replacementOk": false, "replacementNote": "Document both lifetimes and require migration/re-encryption of ALL live encrypted secrets before key retirement; pending EIN secrets and retained S-election secrets both matter."}

### 179

Reference Library backup line (four tables; "own company") and mirror line ("every file" nightly; nothing overwritten). Replace both sentences.

Prior assessment: {"status": "disputed", "evidence": "LibrarySection.tsx:177-179 lists four table categories without saying only four; :244-246 says deletions never propagate, not that mirror uploads can never overwrite. BACKUP_TABLES has ten entries and mirror processing is capped, so there are real precision issues, but the finding attributes exclusive/no-overwrite statements the UI does not make.", "replacementOk": false, "replacementNote": "Use “A nightly snapshot of the ten backed-up tables is stored in private Vercel Blob storage.” For mirroring say “Each run attempts up to200 pending client files. Files may be replaced at the same destination; source deletions do not remove mirror copies.” Name providers rather than make an unverified corporate-ownership claim."}

### 224

Nightly Dropbox mirror — its own description — `webapp/server/dropbox.ts:112`
Reads: /** Copies every not-yet-mirrored document. One failure doesn't strand the rest — errors are counted and the document stays pending for the next sweep. */
Claims: Every pending document is copied in a sweep.
True: :139 `LIMIT 200` — a sweep copies at most 200; with more pending, the rest wait a night each. The office line A76 covers ('every file' nightly) rests on this.
Replace with: Comment: 'Copies up to 200 not-yet-mirrored documents a sweep…'; or loop until the query returns fewer than 200.

Prior assessment: {"status": "housekeeping-only", "evidence": "dropbox.ts:112 says every not-yet-mirrored document; :139 caps each sweep at200. Only the internal comment is corrected by the bounded-batch wording.", "replacementOk": true, "replacementNote": "Describe up to200 per sweep. An unbounded loop is not required to correct the comment."}

## Work-order metadata correction

Adam explicitly authorized the correction of three omitted control flags and the matching frozen records with “Yes”. See evidence/metadata-correction.md for the exact request, hashes and retained originals. No scope or approval requirement changed.
