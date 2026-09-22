# Narrow prerequisite for Batch 28

## Verified blocker

The unmodified baseline passes every static recorded assertion. The read-only probe in evidence/tracking-blockers.ts passes modified text to the real replayStatic function without editing source. Both proposed edits are refused:

1. Item 5, implemented in Batch 27, requires the literal prior Terms date (20 September 2026) and Privacy date (19 September 2026). Updating a policy date violates it.
2. N1.15, implemented in Batch 05, requires an entire 29-line source block to remain identical. Even adding an insertion-failure check violates it.

accept.ts:69, batch.ts:75, supersessionProblems and ledgerRegressions permit a replacement only when the prior fix is released. These batches are implemented and intentionally unpublished. A migration can add parts or links; it cannot alter either fix assertion. Marking a batch released without the actual accepted remote publication would falsify its history.

## Proposed correction — new reviewed control work, not a bypass

Extend the existing explicit replacement workflow to a fully implemented, frozen prior fix as well as a released fix. The supported prior states must be exactly implemented and released, never open, assigned, rejected or unbound. Preserve the old batch snapshot, assertions, model and complete history byte for byte, together with the prior state and owning batch revision. Bind replacement approval to the exact new work-order hash, using the existing external approval command. Reject stale or different prior fixes, swapped work orders, reused batch IDs and competing assignments.

While a successor is merely assigned, replay the prior assertions. After the approved successor is implemented, replay its assertions and keep the complete prior fix in the immutable archive. Rejecting the successor restores the exact prior state: implemented must return to implemented, not be falsely marked released. Repeated replacements must refer to the current successor, never an older ancestor. Existing remote-release records remain required only for truly released predecessors.

Both commit-time and publication guards must validate the same transitions. This creates no records-only exception: a replacement still requires acceptance of its exact commit and review package before publication. Existing released-fix replacement behavior and its tests must remain unchanged.

## Concrete Batch 28 replacements after that prerequisite

- Item 5: replace frozen historical date literals with checks that Terms and Privacy expose their actual approved revision dates. Update the displayed dates for this policy revision. Do not remove the Last updated labels or rewrite the original finding.
- N1.15: replace the frozen source-block assertion with runtime failure checks: old package remains accessible on storage failure, insertion failure and order-update failure; a failed new file/row is removed or durably queued for cleanup; successful replacement is company-scoped and encrypted; prior document retirement follows a successfully committed replacement; fulfilled_at is not extended by a re-edit. Preserve the original Batch05 record in the archive.

## Files for the prerequisite

Only docs/audit/ledger-lib.ts, accept.ts, batch.ts, their lifecycle/replacement fixtures, README.md and a dedicated control work order/evidence. The product repairs remain in Batch 28. No push, deployment or document publication is needed to build and review this correction.

## Required proof before using it

Run the actual commands and hooks in disposable copies with simulated decision records. Demonstrate both implemented and released predecessors; absent approval; altered approval hash; stale predecessor; old assertion enforced while assigned; successor implementation without acceptance refused on push; accepted successor permitted; records-only replacement refused; rejection restores each exact prior state; second replacement and second rejection; multi-commit comparison; immutable archive; and unchanged ordinary lifecycle behavior. Then run the mandatory ledger control suite and full review checks. Fixture approvals must never be copied to Adam's real records.

## Authorization boundary

Adam's current Go authorizes the eleven product repairs. It does not by itself authorize expanding the tracking system's protected-fix transition rules. This proposal asks for that additional scope. No tracking control, existing ledger record, acceptance or product source has been modified.
