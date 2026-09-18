# Corrective batch 0-repair, revision 1

Adam authorized this work with “go” on 18 September 2026 after approving a
verified return point, a separate clone, disposable customer data and isolated
integrations. This authorizes the ten corrections in codex-review-r3.md only.
It does not record rejection or acceptance of batch 0 revision 3, authorize any
product finding, integrate changes into the original checkout, or publish.
The base remains 82abf54 so the final package includes the complete unpublished
batch-zero change. The repair comparison is fffd656. Existing batch records
and frozen snapshots remain untouched.

## Governing requirements, before implementation

These verbatim corrections from the reviewed handoff determine success:

1. “Protect externally accepted fixes while their parts still say implemented; require authenticated part/batch transitions before removing assertions.”
2. “Enforce the exact declared migration values, not permission for a field type.”
3. “Match rulings.md to the complete owner decision and its item/part; no substring-based authentication.”
4. “Preserve complete ruling text or refuse overlong input before recording.”
5. “Block redirects from local requests to forbidden destinations before contact.”
6. “Require explicit partial:null and a valid nonempty complete site manifest.”
7. “Refuse all package integrity errors before recording acceptance.”
8. “In CI, distinguish unavailable local decision evidence from an invalid transition; continue to require that evidence in the local gate.”
9. “Make the complete demonstration run from a clean committed tree.”
10. “Repair the causal red cases: reset remotes between pushes, exercise the actual old browser mechanism and retain compatible harness versions.”

Each gets a reproduction against the unchanged earlier implementation and a
positive control where meaningful. Missing imports and unrelated refusals do
not count as the intended failure. This file will record measured results.

USER WALK — Adam reviewing the repair:
1. Opens the single review package and sees its exact commit, complete diff and ten-item result list.
2. Opens the preserved site using its package id; checks run against disposable data.
3. Reviews the independent reproductions and decides whether to accept.
Expects: the original checkout and owner decisions are preserved; nothing live changes.

USER WALK — a future implementer recording or releasing a fix:
1. Uses the declared batch, complete owner ruling and exact approved migration.
2. Runs the guards and complete review against one committed revision.
3. Attempts release only after Adam accepts that exact package.
Expects: altered approvals, weakened records and incomplete packages are refused; valid paths still work.

## Implementation and verification boundaries

The repair preserves every original batch record and all 334 source items.
A recorded fix is protected from implementation onward, and a part cannot
claim release while its owning batch remains implemented. Migration checks
compare exact structural values, new-part initial state and retained history.
Rulings use complete canonical entries and lossless chat transport. CI skips
only external decision evidence. Acceptance now refuses every site-integrity
error, including absent explicit completeness and empty or malformed manifests.

The HTTP harness refuses all redirects, URL escapes and unsupported
`route.fetch`; normal HTML, JSON, binary data, POSTs and multiple cookies have
positive controls. It is not an operating-system network sandbox or a
WebSocket guarantee. Existing product callers need no HTTP redirects.

The shorter demonstration passed 76/76 before the full clean-commit sequence.
The repaired historical harness reproduced eight failures on r2 (3/11 already
passed); the same 11 scenarios passed against the repair. These use simulated
owner decisions and check results in disposable clones, clearly labeled in
the logs. They do not claim product checks ran. The full review performs those
checks separately. The r3 regression run yielded 14/35 before the repair;
its 21 failed cases include the demonstrated bypasses and false refusals.
The corrected code passed the corresponding 35 cases before final packaging.

An independent read-only browser reviewer exercised cookies, POST bodies,
continue/fallback overrides and redirects against local sinks. No HTTP escape
was found. An independent ledger reviewer found two additional state variants
within findings 1–2; both were added to the permanent regression suite.

No acceptance or rejection by Adam is fabricated in this working clone.
Only disposable demonstrations write simulated decisions. Publication remains
unapproved. All generated evidence and final package paths will be collected
in the external handoff after the clean-commit run completes.

Preparation correction before the first repair commit: the cumulative scope
initially omitted unchanged `batches/0/extra-assertions.json`, which the earlier
batch had covered through its own-folder rule. The guard caught this omission.
The initial uncommitted work-order draft is retained as
`evidence/precommit-scope-draft.json`; the preparation record was rebuilt from
the untouched committed ledger, with that control explicitly declared, then
reauthorized and marked implemented under the same Go. No committed history
or owner decision changed.
