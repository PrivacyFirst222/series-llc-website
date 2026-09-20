# Approved scope

The original audit records are preserved verbatim. Batch 20 implements the thirteen approved cleanup units and records two already-addressed billing findings without changing that code. Notification options stay unchanged under Adam's recorded ruling.

The initial exact replacements are retained in approved-edits.json; final-source.patch includes the subsequent test-fixture correction. The company-isolation check now saves and compares the complete real asset object, using key-order-independent deep equality because database JSON serialization reorders object keys. Its original check label and isolation expectation are retained. Prior assertions passed against a read-only projection before assignment. No real ledger status was changed by that projection.

The source of truth for each cleanup was the current consumer and implementation, opened before changing it. Applied migration 1 in db.ts stays byte-identical; comments inside it are historical. No attempt is made to certify the original audit's unsupported count of eleven comments. All existing runtime check labels remain, and no assertion is deleted.
