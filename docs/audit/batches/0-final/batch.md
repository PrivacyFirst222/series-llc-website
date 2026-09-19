# Finalization batch 0-final, revision 1

Authorized source: Adam, 19 September 2026: “Go—fix those two problems and prepare the final review package.”

The two governing corrections, quoted from the proposal Adam approved:
1. “Make the tests independent of your actual audit list.”
2. “Allow you to approve replacing an earlier fix.” “It must allow an explicitly approved replacement while keeping the old decision and its history—and continue blocking unapproved changes.”

Scope: N1 and N2 from Claude's review of a68979d. Continue that repair, preserve all its records and earlier controls. No product fixes, integration, owner acceptance, rejection, real remote push, or Dropbox publication. Prior batches stay in their actual state. Cumulative baseline: 82abf54; repair comparison: a68979d. Checkpoint: ../checkpoint/before-finalization-a68979d.bundle, verified before editing.

USER WALK — Adam approving a later replacement:
1. Reads the new work order showing the exact old fix, new assertions and complete scope.
2. Records “Approve replacement <batch>, revision <n>”; that freezes his approval to the work order's hash. This permits building, not publishing.
3. Reviews and accepts the resulting exact commit and full package in the usual way.
Expects: previous fixes and decisions retained; no substitute work order or unapproved publication.

USER WALK — the implementer:
1. Runs the normal tests after any number of real audit items have been assigned or released.
2. Authorizes a replacement batch only with matching owner evidence; the previous assertions still run until implementation.
3. Implements, reviews and releases the new batch; if rejected, restores the prior product behavior and previous assertions.
Expects: synthetic test records only in temporary clones; old history and snapshots unchanged; rejected attempts retained; unaffected parts still protected.

Acceptance criteria written before implementation:
- N1: mandatory regression probes work with real item 17 assigned and with the live item list absent; fixtures do not depend on any current open item.
- N2: absent, unrelated, stale or modified replacement approval refuses; approval binds batch, revision, full old Fix and full new work order.
- A full real-command replacement lifecycle succeeds: authorize, implement, guard, reviewed-package acceptance, local-remote release, later replacement; records-only publication of supersession refuses.
- Assignment continues replaying the prior assertions; implementation replays the approved new assertions; unrelated fixes remain enforced.
- Rejection of an assigned or implemented replacement restores the last released fix, while retaining the attempted replacement and all prior history.
- Archive edits, unbound free-form supersedes metadata, wrong targets and changed assertions refuse.
- Complete review and demonstration run at the final committed version, with disposable owner decisions and local remotes explicitly labeled. The original repository remains untouched.

## Verification before the final commit

The unchanged a68979d controls failed both causal reproductions: real item 17
assigned caused the mandatory harness to stop with “cannot be claimed twice”;
an exact approved replacement of a released fixture was refused by the same
claim rule. These were the intended failures, not missing-helper failures.
The repaired implementation passed 57/57 lifecycle cases, including actual
CLI and chat-hook entry points. Logs are retained under evidence/. Owner
approvals, packages and published fixes in these tests are explicitly simulated.

The new workflow freezes the complete work order with an external replacement
approval, retains the exact prior Fix and all histories, and uses a new batch.
Assignment still replays the old static and runtime assertions. Implementation
activates the approved new assertions. Rejection restores the prior released
fix while retaining the rejected attempt. Publication of a replacement needs
acceptance of the exact full package; unchanged cancellation bookkeeping does
not weaken protections. Historical batch records and all 334 real items stay
identical.

The full demonstration can now put its output in an external --evidence-dir
and retains its full review package there before deleting temporary clones.
This permits a clean-source run whose reviewed commit is also the final commit,
without committing generated evidence back into the already-tested version.
Final run results belong in the external FINAL-REVIEW.md handoff. No independent
review of this new version is claimed; the handoff includes a request for Claude.

Full-run correction: a review launched from an audit/batch-* branch exposed
a fixture branch inheritance failure after a replacement rejection. The
fixture now explicitly detaches before probing; its branch state is asserted.
A separate run of the complete mandatory control suite from an actual
audit/batch-0-final checkout checks that integration context before packaging.
The failed/interrupted runs remain in external final-evidence, not counted
as successful final verification.
