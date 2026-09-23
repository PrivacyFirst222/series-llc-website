# Batch 39 — approved Group C verification repairs

Adam approved all five Group C proposals (items 25–29). This authorizes implementation and verification, not acceptance or publication. Product wording and business rules stay unchanged.

## 25. Decision records: preserve the eleven existing rulings in the repository

Eleven decisions are in the external ruling file but absent from the repository’s ruling entries. A future auditor can reopen matters you already settled.

Approved correction: Copy the exact authenticated records through the existing ruling mechanism; regenerate the list. Identify the ten retained decisions and the approved example wording without altering those choices or inventing new acceptance events.

Prior decision: All eleven external records were reopened. Items: 8, 15, 22, 34, 38, 139, N2.14, 232, 236, N2.02 and 242. No repeat ruling is requested.

Verification: Compare text byte-for-byte to the external records; check generated display and future audit intake respects the decisions.

Source docs/audit/batches/27/batch.md:1
> # Batch 27 — recover approved Batches 11, 12 and 16

## 26. Tracking display: distinguish protected retained wording from a repair

Three items you rejected appear simply implemented because the work implemented assertions that protect the unchanged wording.

Approved correction: Show an explicit owner-retained disposition alongside the existing technical lifecycle status. Preserve the assertions. Prefer a reviewed disposition annotation over adding a new lifecycle state throughout every gate.

Prior decision: Batch 31 rulings on deed wording, effective-date wording and the FAQ filing description remain binding.

Verification: The list distinguishes repaired text, owner-retained text with protections, and genuinely open work. No accepted assertion or history changes.

Source docs/audit/ledger-print.ts:33
>   out.push("A status reads: open → assigned (to a batch) → implemented → accepted (by Adam, by exact commit) → released.");

## 27. Tracking history: attach verifiable implementation commits

The generated list prints an empty commit for implemented fixes. The command intentionally fills that field only at release, so this is more than a forgotten value.

Approved correction: Add append-only implementation receipts referencing the already-created commit, work-order hash and package. Display that separately from release. Verify ancestry and scope; do not try to store a commit’s own hash inside itself or rewrite old protected fix objects.

Prior decision: Preserves the distinction between implemented, accepted and released.

Verification: Correct receipts resolve; wrong commits, mismatched work orders and forged release implications are refused. The list no longer prints a blank commit as if recorded.

Source docs/audit/batch.ts:108
>     part.status = "implemented";

## 28. Audit history: retain the reason a proposed cleanup was rejected

One Claude finding about legacy fallback code was adjudicated outside the repository and never received an internal record.

Approved correction: Import an informational adjudication with the original source ID and the existing reason the blanket removal was unsafe. Leave the fallback code intact. Use the checked intake/migration path, not a manual edit of the generated list.

Prior decision: This records the cross-review’s decision; it does not approve the rejected cleanup or pretend Adam made a new ruling.

Verification: The source item appears once, links to its adjudication, and cannot accidentally become an authorized code-removal task.

Source docs/audit/ledger.json:1
> {

## 29. Combined-release tracking: record which earlier batches shipped together

The current released command requires acceptance for a particular batch. A single combined release would otherwise leave earlier included batches looking unshipped.

Approved correction: Add a reviewed combined-release receipt that links the final accepted commit/package to the exact included batch revisions and active parts. Verify work-order hashes, preserved/superseded fixes and each batch’s required checks before inclusion; verify remote/deployment/document evidence after publication. Keep individual acceptance history truthful. Do not fabricate separate historical acceptances or require thirty sequential releases.

Prior decision: Adam chose publication together at the end. This is a control change requiring review, not permission to weaken the release gate.

Verification: Reject unaccepted packages, omitted checks, nonancestor commits, mismatched batches and missing publication proof; show the final receipt accurately without marking unpublished predecessors as previously released.

Source docs/audit/batch.ts:118
>   const { acc, why } = standingAcceptance(commit, b.id, b.revision);

## USER WALK — reviewer
1. Runs the review from the candidate.
2. Sees the exact tested source and distinct run identities.
3. Opens representative forms and mutation logs.
Expects: correct output passes, each deliberately broken protection fails for its stated reason; historical missing evidence is not invented.


## Revision 2 and evidence limits

Revision 1 was rejected under Adam's standing authorization for needed revisions.
The mandatory suite's synthetic ledger replaced real items but retained their new
tracking references. Revision 2 declares the fixture correction and makes the
38 new tracking probes part of every full mandatory ledger-control run. The
revision-1 failure is retained in the outer implementation directory; it is not
reported as a passing run.

Before/after reading: 420 blank commit labels become zero; the three Batch 31
items explicitly say owner-retained; eleven authentic rulings are appended;
the unsupported legacy cleanup has one informational adjudication. All 444
preexisting Item records and every preexisting batch record remain identical.

39 historical implementation receipts have full matching ancestral packages.
Batch 0 revision 3 and 0-repair revision 1 do not have qualifying packages here;
the display says unrecorded rather than inventing evidence. Batch 39 cannot
carry its own implementation commit in this commit: its receipt can be added
as later bookkeeping once this review package exists.

Combined publication tests use actual local Git hooks and document bytes with
simulated owner acceptance and a mocked Vercel API response. They prove refusals
and receipt binding, not a live deployment. No actual combined release receipt
or new acceptance has been created. Group D remains unapproved.

## USER WALK — the next operator
1. Opens the generated list and sees retained wording, implementation evidence,
   and publication separately.
2. Builds the final combined package with required tracking and combined-release
   checks; Adam reviews and accepts that exact package once.
3. After separately authorized publication, records the observed remote,
   production deployment and document bytes through the combined command.
Expects: no made-up historical acceptance and no earlier batch falsely said to
have been published before the combined release.

Historical render compatibility was retained: old ledgers without tracking metadata still produce their archived report bytes. The audit-mechanism suite passes 69/69 after this correction.
