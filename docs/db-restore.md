# Complete backup and restore

At 08:15 UTC the scheduled backup captures a consistent database snapshot.
It includes clients, orders, service orders, document metadata, operating-agreement
profiles and generations, library metadata, webhook history, Sunbiz sync state,
contact messages, email history, renewal history, document-deletion records,
staged-document cleanup intents, pending card-update attempts, payment-reconciliation records, the original launch notice cutoff and held-package records.
The corresponding retained files (client documents, library files and order
summaries) are copied to Dropbox and read back for verification. Only after all
required files are accounted for is the completed snapshot published to private
Vercel Blob storage. Completed snapshots use the UTC filename pattern
`db-YYYY-MM-DD-HHMMSS.json.gz`; they are immutable and kept. A second request
in the same second waits for a new timestamp instead of overwriting. No old test
backup cleanup or migration is performed by Batch 03.

The snapshot's file manifest identifies the recovery path and content hash for
every retained file. Tax documents are encrypted before storage and remain
ciphertext in Dropbox. Their plaintext content hashes allow verified in-place
key rotation without invalidating earlier snapshot manifests. The keys are
stored separately in the deployment's environment; keep a secure recovery copy
of the key ring. Losing all copies of the required key makes recovery impossible.

Excluded: the reloadable Sunbiz entity dataset, sign-in sessions, one-time auth
tokens, rate-limit windows and the schema-migration ledger (created by startup).
The full taxpayer numbers in service-order questionnaire records are always
excluded, including their encrypted values. An unfinished EIN application may
need its number re-entered after restoration. The completed retained PDFs are
included; they may contain full taxpayer numbers and are encrypted.

## Progress and failures

The Office Reference Library shows complete/incomplete status, remaining files
and errors. A file failure does not prevent later files from being attempted.
Progress is saved outside the database in private storage. The continuation cron
runs every five minutes, resuming incomplete work and retrying deletions; the
nightly document-mirror job also verifies all retained client files. There is no
200-file total limit. Per-invocation time limits preserve progress for continuation.
A missing file or unavailable provider is an incomplete backup, not success.

Deployment requires a Vercel plan that permits a five-minute cron schedule and
300-second function duration. Verify those capabilities before publishing; local
tests do not prove a production cron has executed. Missing Dropbox credentials
or encryption keys prevent a complete production backup. Do not call a staged
job a completed snapshot.

## Restore into an empty database

1. Download a completed snapshot from Office → Reference Library → Database backups.
2. Create an empty target database. Supply DATABASE_URL for that target, the
   original Blob/Dropbox credentials, and the required DOCUMENT_ENCRYPTION_KEYS
   and DOCUMENT_ENCRYPTION_ACTIVE_KEY. The key values must not be pasted into logs.
3. From webapp run `bun run scripts/db-restore.ts <snapshot.json.gz> --dry-run`.
   This only parses row counts; it does not prove recovery.
4. Run `bun run scripts/db-restore.ts <snapshot.json.gz>` with those environment
   settings. Startup creates the schema. Any nonempty business-data table is refused;
   there is no force-overwrite option. Restore into a fresh target after any
   interrupted database restoration, rather than merging partial records.
5. The restore reads the current deletion journal independently of the snapshot,
   verifies the complete manifest and decryption keys, restores retained files
   and rows, and reapplies deletion decisions. It fails closed if the journal,
   a required file, or a key is unavailable. Verify client access and documents
   before changing the production database configuration. The restored target remains
   inactive: application requests are refused and no client email is sent.
6. For a real recovery, after verifying data and acknowledging any held packages,
   run `bun run scripts/recovery-activate.ts https://YOUR-PRODUCTION-ORIGIN OPERATOR`.
   The origin must exactly match PUBLIC_BASE_URL. Then switch production to this
   target. Activation automatically attempts the required taxpayer-number notices.
   A rehearsal must never run this activation command. Inspect notices.pending in
   its result: missing mail credentials and provider failures leave notices pending,
   and the existing five-minute continuation job retries them. A logged development
   email cannot consume a real notice's eligibility.

A restore cannot generally recover records created after the snapshot. The forward
S-election replacement protocol described below can recover a later completed
package for a service and owner already present in the snapshot. It does not
invent a missing client, company, or service order. Do not remove the
independent Dropbox `/recovery/deletion-journal-v1.json` journal: it is authoritative even when restoring an older
database. Expired questionnaire numbers remain absent. Client-deleted tax
files stay unavailable even if older snapshots refer to them.

The current tool requires the complete file-manifest format and all required
workflow tables, including `staged_documents` and `renewal_card_attempts`. Older
dumps missing either table are refused before any restoration writes: their
missing workflow history cannot be reconstructed from that snapshot. Existing
backups are left alone. An unfinished pre-upgrade backup job missing a required
table restarts from one fresh consistent snapshot rather than mixing rows from
different dates.

Pending card-update requests remain encrypted and retain their original attempt
ID and provider request. Keep the encryption keys (including the legacy session
key if still used by a saved request). Restore verifies pending requests can be
decrypted and match their attempt and company before writing files or rows. It
clears the vanished worker's lease; reopening the portal card-update dialog
continues the same attempt instead of silently creating a new one. Restoration
does not call Square or charge a card. Document-cleanup intents resume through
the existing cleanup job, including abandoned uploads and superseded packages.

## Deletion and provider recovery copies

Client deletion appends to the independently stored Dropbox journal using a revision-matched write, verifies that decision, and writes its primary-storage marker before hiding the document, then
removes active Blob and Dropbox copies. Cleanup failures remain pending and
are retried automatically; the Office reports them. This controls application
access and our active stored copies. Provider-maintained recovery/version
history may have its own retention. The Privacy Policy does not promise immediate
physical erasure of every provider-held recovery copy.

## Batch 28 recovery protections

The live source initializes the independent journal from its existing primary deletion records before a new backup or deletion. Restoration never initializes an empty journal. A missing, corrupt or inaccessible journal aborts before restoring any file or row. Each completed backup records its deletion checkpoint, and recovery refuses a journal missing any checkpoint or snapshot deletion. Concurrent journal writers use Dropbox revision matching, so one cannot overwrite another decision. Primary storage loss therefore does not lose the journal; simultaneous loss of the independent journal still requires recovery of that journal before restoration.

Completed row counts are calculated after deleted-document filtering. Counts for an unfinished job, when returned, are explicitly provisional. Staged S-election replacement files have durable cleanup intents before upload; an abandoned or failed replacement is retried by the cleanup job without removing the prior usable package.


## Filing-document revisions and legacy snapshots

New Articles and Protected Series Designation revisions have immutable recovery
paths derived from the complete document and storage identity. Office Replace
verifies the old revision's recovery copy and the new revision's copy before
changing the document row. Earlier verified recovery copies remain. New snapshots
name the appropriate revision; old snapshots still read their original paths. An
unfinished snapshot using an obsolete path or a filing revision replaced during
its run restarts from a fresh consistent snapshot.

This forward repair does not repair historically overwritten bytes. Replacing an
Articles or Protected Series Designation PDF under the earlier protocol could
invalidate a snapshot that references the overwritten Dropbox bytes. Such a
restore stops with “Backup file missing or changed” before inserting database
rows. A later completed backup can restore the replacement but does not repair
earlier snapshots. Use an affected snapshot only after obtaining the exact prior
bytes and verifying its manifest hash. If those bytes are unavailable, this tool
cannot restore that snapshot. Do not bypass the hash check or assume provider
version history is available. No historical sample backup is rewritten or deleted.

## Completed S-election replacement recovery

The independent journal at the existing `/recovery/deletion-journal-v1.json` path
accepts legacy deletion-only and version 2 envelopes, and a version 3 envelope containing
package recovery records and the original launch notice cutoff. Its revision-matched writes serialize replacement and
client-deletion decisions together. Older restore tools must not be used with the
new envelope. The original deletion records remain authoritative.

Each new package records its intended primary and mirror identity before upload,
verifies an encrypted mirror, and records the committed successor relationship
before retiring its predecessor or acknowledging successful completion. The
record includes owner/company/service associations, a plaintext content hash,
and a validated completed-package metadata projection, including company EIN and shareholder SSN last four. Full shareholder taxpayer numbers
and their encrypted questionnaire values are excluded. Completed PDF contents
remain encrypted, including in the mirror.

Restore verifies this independent history before writes and reinstates the latest
committed retained package for an existing authorized service, even when that
package was completed after the snapshot. It reconciles old staging rows so their
cleanup cannot delete the recovered successor. A later actual client deletion
defeats the old snapshot and all known replacement versions; their controlled
primary/mirror copies remain eligible for cleanup, including delayed uploads.
An unfinished intent whose commit outcome cannot be established stops recovery
instead of guessing. A source-side retry/cleanup can finalize a database-committed
package; an aborted upload retains its independent cleanup identity.

Before switching production to a restored database, verify that every recorded
S-election replacement resolves to its latest retained encrypted package, a
later actual client-deletion decision, or an explicitly acknowledged held package under the procedure below. A successful restore command alone does
not prove this. Preserve all controlled-copy deletion records and exclude full
questionnaire numbers. Missing historical replacement metadata cannot be recreated
by guessing; keep the affected package unavailable until reconciliation. Unrelated verified data may run only after explicit acknowledgment of the enumerated holds. Legacy tombstones do not identify a successor and retain their deletion
effect. No historical test-copy cleanup is performed.

If current package evidence or recoverable bytes are unavailable, the restore
reports: “Recovery could not verify the current S-election package for [company].
Do not switch production to this restored database until the package and its
document records are reconciled. No client deletion has been inferred.” Restore
to a fresh empty target after correcting the evidence; do not merge partial data.

Correspondence worker leases are cleared after restore. Unresolved payment
reservations and pending provider request identities remain; restoration itself
does not submit a payment or decide that an ambiguous provider request failed.

## Explicit held-package recovery and operator commands

Use `--hold-unresolved-packages` only when intentionally restoring verified unrelated data while preserving unresolved package identities, encrypted copies, ownership and deletion evidence. This option does not waive corruption or missing encryption keys. A new service created after the snapshot and an interrupted package operation are reported as those conditions, not as an unverified PDF. API activation is blocked until the exact current held manifest is acknowledged. Client access to held packages stays blocked afterwards.

The supported list, acknowledgment, original-owner import and reconciliation commands, their evidence requirements, payment reconciliation, original-cutoff recovery and old-writer shutdown requirements are in [Operational procedures](release-repair-operations.md). Do not substitute database edits or invent missing ownership. Completed-package EIN and last-four metadata survive matching recovery; missing legacy metadata is identified as unavailable and does not trigger a false late-EIN notice.

An obsolete incomplete backup restarts when an ordinary document is deleted/replaced, a library document changes or an order summary changes. Cleanup uses durable bounded batches and retains deletion obligations without an age cutoff. Continue checking pending/errors and completion; a successful invocation is not a statement that every historical cleanup obligation has disappeared.

## Repeated recovery and manual packages

Manual office S-election uploads use the same durable encrypted-package and
ownership journal as generated packages. The manual completion still purges the
active questionnaire taxpayer numbers. Restoring a snapshot taken while packages
were held replays later committed/aborted decisions from the independent journal;
it does not resurrect the snapshot's old holds. Client deletion retains priority.
Missing committed cleanup records are reconstructed so a database loss cannot
strand a superseded package in the portal. The recovery target's activation
record is local to that target and is never copied from a backup.


### Office correction history and journal version 4 (27 September 2026)

The current writer uses recovery-journal version 4, including every controlled
copy of an office document and its service identity. It reads versions 1–4.
Do not roll back to a release that cannot read version 4: the previous reader
refuses that journal, and deletion and backup work cannot proceed. Keep the
current reader with any application rollback; never delete, downgrade or
recreate the independent journal to get an older release to start.

A superseded failed upload retires its own storage key and its
`/OfficeOperations/<operation>/<slot>` backup. That decision is permanent even
if an old database snapshot still contains the failed operation. Retiring a
key does not delete another, current revision that shares its document ID.
Client deletion covers all attempts belonging to the service. Cleanup retries
also remove late writes. Preserve the independent journal when restoring.

Published Articles corrections keep the previous Articles/Statement pair as
hidden filing history. The new pair becomes current in one database statement;
a failed correction leaves the previous pair current. Resume from the office
control with the original corrected PDF, or explicitly replace a pending
correction's input. A restore clears the abandoned worker lease and retains
the order's pending-correction reservation. Correction notices are retried
from the order drawer without repeating the correction. Provider acceptance
is recorded separately from inbox delivery. The notice uses one provider
idempotency key per correction; Resend retains those keys for 24 hours
(https://resend.com/docs/dashboard/emails/idempotency-keys). A retry after an
unconfirmed acceptance beyond that window can produce a duplicate notice;
check the provider log before retrying such an old unconfirmed notice.
