# Batch 03 — implemented working tree; formal review package pending

The revised batch covers 12 review units / 13 ledger parts. Nothing has been accepted, integrated, published or deployed. No production encryption keys were changed. Existing test backups and copies were not cleaned up.

## What changed

- New completed S-election forms and office-uploaded EIN letters are encrypted before storage. Authorized downloads still return the ordinary PDF. The client can keep them indefinitely or delete them through a named confirmation in the selected company’s portal.
- The 14-day S-election editing window expires separately from the completed PDF. EIN-service questionnaire taxpayer numbers are removed when the office records fulfillment; S-election questionnaire numbers expire after the editing window. Full questionnaire numbers are omitted from database snapshots.
- Deletion first writes a durable record outside the database snapshot. Active and mirrored copies are removed, failures are retried, and restoring an older snapshot excludes client-deleted documents. Provider recovery/version history is not represented as immediately physically erased.
- Full backups include email and renewal history and a verified retained-file manifest. Interrupted jobs resume. An early missing file does not prevent later files being attempted. Completion requires accounting for every required file; there is no 200-file overall cap.
- Encryption keys are independent of session secrets. The rotation procedure preserves live data and requires historical recovery keys to remain available for retained backups.
- The Privacy Policy, client editing messages, office email and backup descriptions follow these behaviors.

## Verification

The 13 named batch checks fail on f902a8e, the unchanged Batch 02 base, at their intended defects. The latest targeted suite passes 24 checks. It exercises ciphertext, authorized download bytes, deletion ownership and retry, restore into an empty database, a pre-deletion snapshot, plaintext/tampered encryption rejection, missing production keys, key rotation, 207 documents, an early missing file, and interrupted/resumed backups.

The full API working-tree run passes 709 checks. The focused browser journey passes 8 checks. Lint, application/server typechecking, unit tests, and the separate typecheck of the three Batch 03 scripts pass. A broader optional script typecheck also exposed pre-existing errors in the existing browser suite; those unrelated errors have not been repaired or counted as a passing check. The full runtime browser suite passes 1,120 checks. The optional broader browser-script typecheck produces the same 17 diagnostics on the baseline and this tree.

Preservation comparison: all 334 source records remain; 322 source records outside this batch are unchanged; all previous batch records and prior rulings are preserved. The original checkout and Batch 01/02 checkouts remain clean at their prior commits. The verified return bundle is before-batch-03.bundle at f902a8e41b973f62a96ca6c39067c33ae0fb61a2.

## Commit blocker — my work-order declaration error

The normal pre-commit hook refused because three already-declared files need control:true: webapp/scripts/db-restore.ts, webapp/scripts/rotate-encryption.ts, and webapp/vercel.json. I omitted those flags before freezing the uncommitted work order. The original frozen file and hook refusal are retained in evidence. I have asked Adam for the narrow metadata correction and have not made it or bypassed the hook. No successful Batch 03 commit or exact-commit review package exists yet.

After that correction is authorized: update only those flags and the matching snapshot/hash, run the normal commit hook, then build and independently validate the full exact-commit review package. Acceptance and publication remain separate.

## Hosting verification and limits

A read-only Vercel API query reports the project’s team on Pro. Vercel documents that Pro supports per-minute cron schedules and at least the configured 300-second function duration: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/functions/configuring-functions/duration . The new five-minute continuation has not been deployed or observed in production. Production encryption configuration and a live recovery rehearsal remain release work, not claims established by local tests.
