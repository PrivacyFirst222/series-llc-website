# Final candidate audit plan

This is the plan for the audit after these repairs. It is not a claim that the audit has run, that all defects are gone, or that launch is approved.

## Governing standard

Judge behavior against Adam's recorded decisions, the applicable product Terms, and verified provider contracts. The implementation and its tests are evidence to examine, not authorities for the expected answer. The $99 annual renewal remains chargeable after late notice even when replacement takes effect before renewal; payment does not extend an ended appointment, and a refund on that ground is discretionary.

Keep the existing canonical ledger, its historical decisions, the proposal's 27-topic mapping, and every retained report. One defect keeps one identity across sightings and audits. The 482-part prior inventory is a starting reconciliation list; the frozen candidate's inventory determines the actual denominator. Never call sightings or previously untested cases newly introduced bugs without comparing the relevant versions.

## 1. Freeze and make the scope inspectable

Finish repair verification, capture the full candidate commit and all relevant source/build hashes, and initialize a new run with `docs/audit/audit-session.ts` and `docs/audit/AUDIT-WORKFLOW.md`. Use the installed completion gate from the start. The run must include every authored product file, supplementary script/control, document source, generated-document obligation, prior ledger part and all P01–P12 requirements. Explain every inventory exclusion. No moving candidate during review.

Retain the frozen requirement matrix and exact named test expectations before execution. Each row identifies its governing quotation, actors, prerequisite state, action, expected database/provider/email/UI/document result, and failure/retry branches. Unknown requirements are recorded as unknown, never supplied from current code. The audit cannot pass with an unresolved required row.

## 2. Challenge the expected answers independently

A fresh reviewer derives the expected behavior from the decisions and Terms before reading implementation explanations or test assertions. Another reviewer checks those expectations against the governing source. Preserve both original readings and their disagreements. Different role names in the same session do not constitute independence.

Assign responsibilities by workflow: billing and appointment lifecycle; purchases and office fulfillment; account authorization and isolation; documents and retention; backup/recovery; public claims and legal/document consistency; audit controls and evidence. Use fresh reviewer contexts, each with the full contract for shared boundaries. More reviewers are not a substitute for this work.

For each reviewer conclusion, require a concrete counterexample search: which event order, second actor, previous service year, interrupted write, missing record, or stale screen would invalidate it? A reviewer cannot approve an assertion merely because it matches its implementation.

## 3. Exercise complete workflows and hostile transitions

Use verified isolated stacks, actual browser controls and temporary provider sinks. Record isolation before runtime writes. Count provider calls and distinct identities, not just successful HTTP responses.

- Billing: timely/late/no notice; scheduled charge before/after replacement; unpaid and paid prior years; original decline, allowed insufficient-funds retry, exhausted retry, voluntary manual retry; client/office/job/webhook resolution; unknown authorization/capture outcomes; concurrent resolvers; crashes at each persistence boundary; old-token dispatch after reservation release; legacy/restored reservations. Check balances, dates, attempts, notices, office controls and portal together.
- Correspondence: explicit events versus inferred first notices, immutable launch cutoff across deploy and restore, missing customer/card/consent, mail outage, receipt racing decline delivery, attempted-card identity after replacement, duplicate receipts and truthful dates. Provider delivery uncertainty must be reported rather than falsely claiming exactly-once email delivery.
- Recovery: source database destroyed; backups before a new client/service/purchase; pre- and post-commit interruption; committed replacements; held packages and explicit acknowledgment; verified ownership restoration; incorrect owner/hash/key; later client deletion; restore then delete; another backup and restore of held state; ordinary-document replacement/deletion during incomplete backup; bounded cleanup across more than one batch and late uploads after arbitrarily long delay.
- Office: more than one page of unpaid checkouts preceding a paid order; server counts/search/page boundaries; current and old client identity; actual payment moves a checkout between views; certificate deletion on the same board with immediate refresh; separate portal-purchased copies and deletion labels; normal renewal versus real attention conditions.
- Product-wide: authentication/session/email-change boundaries, cross-client/company reads and writes, every purchase and fulfillment path, operational jobs, legal mail, document creation/edit/delete, public/order/portal/office wording, terms/refund consistency, every required agreement/Manual/Instructions comparison and generated-document render.

Use the existing workflow's enumerated document and legal-source obligations. Confirm Georgia in the renderer, inspect actual pages, and distinguish LibreOffice rendering from Microsoft Word. Record actual production migration history and Square sandbox qualification separately; local simulation cannot establish either.

## 4. Prove that the controls detect the defect

Each regression test needs an independently justified expectation. Where a meaningful predecessor exists, run the same test against the old code and show the intended failed assertion. Otherwise inject the specific defect into a disposable copy. Preserve the test bytes, mutation diff and both results.

Mandatory control mutations: remove only wrong-item ruling protection while leaving completeness failures active; empty, truncate and corrupt owner-record fixtures; unavailable private records in CI; unsupported/malformed renderer versions; remove one assertion, duplicate one, add an unexpected one, and keep only one. Each must produce the intended refusal. No real owner-record mutations.

Require exact assertion identities per suite and phase. A matching total, exit zero, a screenshot file, or a reviewer attestation alone cannot close a requirement. Inspect what each artifact actually demonstrates. Log a check that passes on broken code as a defective check and repair it before relying on it.

## 5. Close findings without restarting an unbounded audit loop

Reproduce and classify every finding: old missed defect, regression introduced by a named repair, duplicate, incorrect expectation, evidence gap, or refuted claim. Record both code origin and first discovery; do not confuse them. For every escaped defect, identify the failed review obligation and examine the same failure pattern in neighboring workflows.

Keep a single disposition table with owner, requirement, reproduction, repair, distinguishing check, affected neighbors and independent verification. Fix and recheck only after that classification. A changed candidate invalidates its affected evidence; the final integrated candidate must rerun the required combined checks. Do not recycle previous-version passes as current evidence.

Track convergence using unique unresolved defects, unresolved required verification obligations, regressions introduced by repairs and invalidated evidence. Do not use declining headline counts or additional audit rounds as proof of completion.

## 6. Explicit stopping condition

The audit is clean only when all frozen coverage obligations are fulfilled, every known finding has an evidenced disposition, no release-blocking finding or required verification gap remains, all exact-set checks and targeted mutations pass, and a separate reviewer has verified the complete candidate and its evidence. Unresolved disagreements keep their rows open.

Produce one consolidated report and tracker: candidate identity, inventory denominator, per-requirement dispositions, exact failing/passing evidence, known limitations, and a bounded release-readiness conclusion. The completion hook verifies the record's structure and provenance; reviewers must still establish substantive correctness. A clean audit remains distinct from Adam's acceptance and publication authorization.
