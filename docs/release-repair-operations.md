# Operational procedures for this repair candidate

These procedures are prepared for review. No production operation, deployment, real Square lookup, email delivery or owner acceptance occurred in this implementation run.

## Deployment boundary

Stop/drain every older API and scheduled-job writer before enabling the new reservation protocol or version-3 recovery journal. An older binary does not enforce generation fencing and does not understand the extended journal. Do not run old and new writers together. Preserve original schema history and encrypted backups/keys; apply migration 18 once and verify its recorded success. Do not roll back to an older journal writer after the journal is upgraded.

Record the `launch_policy` initial-launch cutoff in the deployment record. It is created once and is not advanced on later deploys. Backups and the independent recovery journal retain it. Verify Adam's premise that all pre-cutoff records are sample data before activation; do not apply that premise to subsequently acquired customers. Restoring an old snapshot must preserve the recorded original cutoff, never substitute the restore date.

## Payment reconciliation

Use **Manage appointment → Check payment result**. The endpoint requires office authentication and checks that the target belongs to that order. The daily job and client control use the same routine. No new payment attempt is created by a check. An unknown provider outcome remains reserved.

A reservation without sufficient provenance returns its existing renewal reference. Do not clear it by age or edit the database. Locate the original durable request/transaction export and the corresponding Square payment. If either is missing, ownership/amount differs, or the provider is ambiguous/nonterminal, retain the reservation and investigate; missing search results do not prove no charge.

For a known terminal payment and missing original local attempt, the supported command is:

```
cd /path/to/candidate/webapp
bun scripts/reconcile-payment.ts /protected/original-request-evidence.json
```

The evidence JSON names `targetId`, original `attemptId` (the original provider request key), `paymentId`, `automatic`, `priorAutomaticDeclines`, `cardLast4` (or null), `originalRecordReference`, and `operator`. Independently verify these against the ORIGINAL durable request export; never invent an attempt UUID or retry history to make the command pass. The tool checks the exact local reserved obligation, existing attempts and retry counter; retrieves the already identified payment; compares reference, amount, currency and configured location; requires a terminal provider result; records the evidence; and resumes shared fulfillment/decline handling. It has no path to a fresh authorization or capture. A refusal leaves the unresolved obligation for further reconciliation.

Provider basis checked September 24, 2026: [Square GetPayment](https://developer.squareup.com/reference/square/payments/get-payment) retrieves a known payment ID; the [Payment object](https://developer.squareup.com/reference/square/objects/Payment) provides status, reference, location and money fields. This documentation check is not live-provider qualification. Run the planned Square sandbox cases before release.

## Restore with packages held

The ordinary restore continues to refuse missing/corrupt required copies and unresolved package operations, with an accurate explanation. The explicit alternative is:

```
bun scripts/db-restore.ts /protected/verified-backup.json.gz --hold-unresolved-packages
bun scripts/recovery-holds.ts list
```

Use an empty schema-initialized target with the correct decryption keys and surviving independent journal. No hold option can waive corruption, missing keys or ownership verification. The result counts held packages and does not claim full recovery. Normal API access is blocked until acknowledgment.

If neither a legacy backup nor the independent journal contains the initial-launch notice cutoff, supply the ORIGINAL recorded deployment value with `--first-notice-cutoff=ORIGINAL_ISO_VALUE`. Do not guess it. No notice suppression policy may silently advance during restore.

Inspect every held package's service/client/company UUIDs, hash, encrypted location, lineage and reason. Preserve that list and the decision to run unrelated verified data while affected packages remain unavailable. Acknowledge the exact current manifest:

```
bun scripts/recovery-holds.ts acknowledge MANIFEST_SHA 'Operator name'
```

A stale manifest hash is refused. New holds remain unacknowledged. This enables unrelated service; it is not a statement that the held packages are recovered. Matching clients see the recovery message and cannot download/regenerate a held package.

For a service/client created after the snapshot, obtain an authoritative original database export establishing the exact client, company and service identities. A PDF, matching name, matching email, payment alone, or absence from the backup is insufficient. The supported import checks original UUID relationships, refuses conflicts, preserves existing rows, strips transient taxpayer-number storage and retains the hold:

```
bun scripts/recovery-holds.ts restore-owner DOCUMENT_UUID /protected/verified-owner-export.json
```

The export JSON has `client` and `company` rows when missing, the `service` row, `reference` to the verified original export and `operator`. It is sensitive operational data: keep it protected. The command retains only its hash/reference as evidence, not a second copy of its account data. If a prerequisite cannot be established, keep the package held; do not assign it to a newly guessed account.

Reconcile an enumerated package:

```
bun scripts/recovery-holds.ts reconcile DOCUMENT_UUID /protected/verified-package-evidence.json
```

Evidence fields: `documentId`, `serviceId`, `clientId`, `companyId` (or null), plaintext `sha`, `decision`, `authority`, `reference`, `operator`.

- `committed` / `database-transaction`: independently verified original database commit evidence; exact current owner rows and encrypted copy must also pass. Do not treat an uploaded copy or missing snapshot row as proof of commit/abandonment.
- `aborted-before-commit` / `database-transaction`: affirmative original transaction evidence that the intent did not commit. A committed package cannot be declared abandoned.
- `client-deletion` / `verified-client-request`: verify the instruction is from the recorded client, identifies the package, and is authorized. Record the actual request reference. The independent journal retains the deletion across snapshots and delayed uploads.

After reconciliation, verify the intended client's authenticated download, EIN/last-four display and lack of a false late-EIN email, then exercise deletion in the isolated qualification environment. Run a fresh complete backup and a second restore. A resolved hold alone is not proof of every adjacent workflow.

Cleanup retains aborted/deleted identities without an age cutoff, advances durable cursors in bounded batches and revisits failed or late-arriving copies. Observe pending/error counts and subsequent complete backups; do not delete journals or mark unresolved work complete to silence an alert.
