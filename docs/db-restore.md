# Complete backup and restore

At 08:15 UTC the scheduled backup captures a consistent database snapshot.
It includes clients, orders, service orders, document metadata, operating-agreement
profiles and generations, library metadata, webhook history, Sunbiz sync state,
contact messages, email history, renewal history, document-deletion records,
staged-document cleanup intents and pending card-update attempts.
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
   before changing the production database configuration.

A restore cannot recover records created after the snapshot. Do not remove the
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
