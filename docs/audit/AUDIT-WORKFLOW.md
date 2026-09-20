# Whole-product audit with checked ledger intake

This workflow is the discovery and reconciliation side of the existing fix ledger. It does not approve repairs, change prior decisions, or publish. A new run is pinned to a full Git commit and a unique directory; it does not overwrite the historical inventory or old audit reports.

## Run

From the candidate repository:

```
bun run docs/audit/audit-session.ts init /absolute/new/run-directory unique-run-id HEAD 7
bun run docs/audit/audit-session.ts read /absolute/run-directory reader-id webapp/src/pages/FAQ.tsx 1 100
bun run docs/audit/audit-session.ts check /absolute/run-directory
bun run docs/audit/audit-session.ts report /absolute/run-directory
bun run docs/audit/audit-import.ts /absolute/run-directory
bun run docs/audit/audit-import.ts /absolute/run-directory --apply
```

The read command's last two arguments are actual inclusive line bounds, up to 300 lines per call. Use the assignment's bounds; the sample above is not a promise that FAQ has 100 lines. Empty files use 0 0. Fresh reader contexts receive reader-N.md, assignment-N.json and the owner decisions. They write bucket-N.json and retain evidence. A separate reviewer verifies each finding; the report's reviewer identity is an attestation, not authentication.

The manifest reconstructs the original inventory from tracked files at the commit and adds explicit supplementary checks, rendering tools, scripts, styles and HTML. It records omitted inventory files with reasons. Stock widgets are excluded from full source reading; their rendered behavior remains in scope. Binary assets and dependencies are not line-counted. Word outputs are separately required render obligations. Generated API code is not read as authored source; verify build correspondence. The product-file denominator and supplementary denominator are reported separately at initialization, and the completion denominator includes both. The validator reconstructs assignments from the commit; editing a manifest cannot silently reduce the expected work.

All ledger parts are assigned exactly once, including dropped and optional findings. Reconciliation never rewrites the repair ledger's historical status. “Retained by owner” and “fixed” are different outcomes. Separate source findings can be sightings of one defect. Every new finding must declare whether it is new or belongs to a prior part, and a separate reviewer must attest the comparison and proposed replacement. There is no target number of findings.

Required evidence covers facts and decisions, statutory sources and dates, cross-references, user workflows, failures and retries, complete backup restoration, test expectations, each pair of agreement masters, each consent/Manual/Instructions comparison, each Word output and each ordinary/professional agreement PDF. The manifest lists these obligations individually. Runtime checks must use an owned verified offline stack, throwaway database and local sinks, with no real email/payment/storage calls. The runner itself never starts servers or triggers a generator. Statute sources must be opened on Online Sunshine; unavailable sources stay not verified. A URL alone is not a checked legal claim.

The completion gate requires exact nonnegative integer counts and source hashes, whole-file receipt coverage by the reporting reader, one report per bucket, exactly one reconciliation per prior part, evidence artifacts whose hashes still match, every required obligation verified, valid citations to the actual source line, explicit no-findings declarations, and separate finding/replacement rechecks. Incomplete runs can produce REPORT.md labeled INCOMPLETE but cannot be imported.

A passing gate proves submitted coverage and evidence satisfy the protocol; it cannot prove a model understood a sentence, a screenshot proves the right proposition, a reviewer is independent merely because their name differs, or all possible defects were found. The operator must inspect the evidence and challenge the expectations. This limitation is why a fresh reading and a separate source/runtime recheck are both required.

## Into the existing error tracker

Import defaults to preview. --apply appends only verified NEW findings as open records with stable AUD-<run>-<key> IDs, retained source text and proposed replacements. Existing findings, fixes, histories, rulings and batch identities are unchanged. A prior/regressed finding stays in the reconciliation report under its existing ID; it is not duplicated or silently reopened. Work on an existing implemented/released repair still follows the existing rejection/replacement rules.

Each import retains a hash-bound source file under docs/audit/intakes and an append-only auditImports reference in the ledger. The commit and release guards refuse missing/changed sources, duplicate runs or exact defect fingerprints, imported records that disagree with their source, and records with no valid intake. Semantic duplicates still require reviewer judgment. New intake is not a records-only publication exception. Intake files and reports must be explicitly declared in the applicable work order before commit. Import does not manufacture a Go, ruling, acceptance or release record. Proposed legal changes marked needs owner ruling get an explicit ruling wait.

Import never reseeds the ledger. findings-open.md is regenerated from it. All existing batch controls continue to apply. A crash after the retained source is written but before ledger/list writes leaves safe partial bookkeeping: inspect and recover that intake explicitly; rerunning will refuse to overwrite it.

## Completion and publication

The report lists every prior part and every new finding, exact source coverage, required evidence, and unknowns. The next step after a completed audit is Adam's review of findings and proposed fixes. Full release review must still bind the entire difference from the current published base to an immutable package, followed by Adam's acceptance and publication authorization. An audit completion message is neither.

## Verification of this mechanism

`bun run docs/audit/audit-session-check.ts` exercises positive and negative coverage, prior reconciliation, evidence and intake cases. It also uses the real initialization/check/read/report commands in a disposable directory. The existing mandatory ledger-controls suite runs it through repair-check.ts, alongside its previous protection and lifecycle checks. No live service is contacted.
