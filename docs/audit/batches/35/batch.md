# Batch 35 — two release-review blockers

Owner authorization: “Go. Fix both items”. This authorizes implementation and review preparation, not acceptance or publication.

Governing requirements, verbatim: “Preserve document-cleanup intents so abandoned objects and superseded packages remain eligible for cleanup after a restore.” “Preserve or explicitly reconcile pending card-update identity and state without restoring taxpayer questionnaire secrets.” “Continue checking exact archived assertions, owner approvals, rejection/restoration and final ownership.” Source: sealed codex-release-review-2026-09-22/FINDINGS.md, RR-01 and RR-02.

## Objectives and scope
1. Back up both durable workflow tables in the same consistent snapshot. Recover pending card identity and encrypted request, reset the vanished worker lease, and validate its decryption before restore writes. Preserve existing taxpayer-secret exclusions.
2. Refuse older complete dumps missing required workflow tables. Restart an incomplete pre-upgrade job as a new consistent snapshot; do not invent missing rows or delete historical backups.
3. Replay initial assignments, implementations and rejected revisions before the first replacement. Preserve every existing history, assertion and external decision requirement.
4. Demonstrate both failures before the fix, the repaired workflows, tampering refusals, and the full real publication range. Run all mandatory checks and prepare a package against real remote main.

## User walks
Recovery operator: restores a complete snapshot into an empty database; cleanup runs from restored intents; client reopens the card-update dialog and retries the same attempt. Expects: abandoned staged files removed, the pending request has the same identity, taxpayer questionnaire secrets stay absent.
Release reviewer: opens the full-range package; sees all unpublished changes and passing checks; decides whether to accept. Expects: the gate follows the recorded history without rewriting it; no publication before acceptance and authorization.

Return point: ../return-point.bundle at c91b101. No sample-data cleanup, product wording changes, provider calls, or publication included.

## Verification before commit
- Both causal failures reproduced on c91b101 before changing product/control code (controls-red.json and runtime-red.jsonl).
- Final focused workflow checks: complete backup into a separate empty database; cleanup plus abandoned-stage recovery; committed replacement cleanup; encrypted pending card identity and cleared lease; authenticated retry with a simulated lost Square response and stable idempotency keys; competing attempt refused; completed attempt not repeated; taxpayer questionnaire secrets absent; older dumps and unreadable requests refused before rows; old incomplete job starts a fresh snapshot.
- Synthetic lifecycle regression cases: 17/17; ordinary first fix, cancelled assignment, assigned baseline, released first fix, and missing/forged/reordered events, snapshots and assertions. Synthetic decisions are confined to the test fixtures.
- Existing mandatory control suite: 39/39. Existing unpublished lifecycle suite: 91/91. Lint, application typecheck and control-script typecheck passed.
- Both the real full-range guard and direct ledger comparison requiring real external owner records pass against ba8b8a6..c91b101 using the repaired controls. The final committed range will be rechecked in the handoff evidence.
- All 417 prior records, prior batches and rulings remain identical to c91b101. Two new findings and Batch 35 added; no prior repair assertions rewritten.
- Return-point bundle verified. Original project remains at e405da4 with its pre-existing FAILURES.md modification; Batch 34 remains clean at c91b101.

Full package checks, red-before-fix reruns, package identity and final commit are recorded outside the repository in the final handoff, avoiding a self-referential review commit. No acceptance or publication was recorded. Provider retries use a fake response boundary; no live Square call or production restoration is claimed.
