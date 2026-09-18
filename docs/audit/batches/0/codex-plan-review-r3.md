# Codex's reviews of the revision-3 plan (17 Sep 2026)

Kept as provenance: the plan for revision 3 was reviewed by Codex twice before
Adam's Go, and built to the approved version. Adam's rule of 17 Sep 2026:
"Codex needs to review and approve all of your plans."

## Round 1 — consolidated corrections to the first revision-3 plan

Codex required, in summary (the full text is in the session record):

1. Records-only exception: choose the smaller complete solution, Option A
   (retain, close the demonstrated bypasses with explicit rules) or Option B
   (remove for ledger, ruling and batch changes). Verify the generated list
   against the unchanged ledger. Do not exempt arbitrary edits to FAILURES.md.
2. A: an append-only rejection event plus a matching external rejection
   record is sufficient, provided the event is newly appended, the record
   applies to the right batch and revision, the local gate refuses when the
   external evidence is unavailable, released→rejected stays forbidden, a
   later revision lifts the current-file rule only when it is itself valid,
   and inserting a higher revision number removes nothing. Complete transition
   table; event vocabulary matching batch.ts. Do not claim GitHub enforces
   transitions: give CI the earlier ledger, or describe CI accurately.
3. B: protect item- and part-level waits and links, including the containing
   parts (delete-and-recreate); one explicit reviewed migration mechanism;
   a wait is satisfied by a ruling, not deleted; a ruling must represent
   Adam's actual decision.
4. C: 112 → 100:unused-code correct; 201→28, 167→136, 228→127, 96→90 exact;
   do not reunite 95's parts; support a canonical link per part; 211→178 and
   188–193→187 are broader than exact duplicates — split or declare bundles;
   validate targets and cycles.
5. D: build the queue from unmetWaits; ruling 63 lists 63, 152, 153, 202 and
   ruling 28 lists 28, 201; count each part once; say whether the queue covers
   all unfinished work.
6. E: cover contexts, popups and existing route handlers; disable service
   workers; page routes take precedence over context routes; demonstrate four
   cases with mocked sinks.
7. F: require run identity; update producers, consumers and the workflow.
8. G: named rejection arguments; positive controls.
9. H: partial packages fail at readiness, acceptance and release; complete
   site-file comparison; bind acceptance to the package's identity.
10. I: demonstrations must reach the intended failure; retain logs outside
   deleted directories; C15 must preserve before-server.log and the detail.
11. Reseeding must be a checked migration; do not manufacture a rejection
   from Codex's recommendation.
12. Return one complete amended plan.

## Round 2 — corrections to the amended plan

1. Record additions can change controls: rulings.md is an audit control and
   needs Adam's ruling record; FAILURES.md may keep a narrow append-only
   informational exception, stated as such; distinguish administrative events
   from control migrations; an external record must identify the decision
   and its scope.
2. The browser route order was backwards: use a shared routing wrapper so the
   isolation decision precedes every handler; demonstrate with the real
   handler order, including an external request to a **/api/** path, and
   distinguish "aborted" from "rewritten to the local API".
3. CI must not fall back to HEAD^: fetch the history, compare the actual
   before and after commits, define pull-request and new-branch cases, refuse
   or report when the baseline is unavailable.
4. Of the 25 historical links, 18 are shared-defect links; 184↔171, 212↔194,
   258↔118 are related findings, not duplicates; 89→65, 164→128, 256→245 and
   259→120 need part-level links or declared bundles.
5. The migration and revision rules must permit the actual upgrade: replace
   batch.json only when introducing the valid next revision and retain the
   old definition; define the bootstrap migration; keep rulings a prefix;
   keep old parts and histories in provenance; apply event names
   prospectively; replay multiple events consistently.
6. Package identity must reach every consumer, including publish-docs.ts;
   regeneration creates a new package with no acceptance; show Adam the
   exact package-selection command; --serve must allow selecting a package.

## Verdict — approval with five implementation details

"I approve proceeding with Option A after Adam's Go, with the implementation
requirements below incorporated into the checklist. This is approval of the
implementation plan, not acceptance of the finished system or permission to
publish."

1. Materialize revisions/r1.json and r2.json from their actual historical
   definitions, verified against their recorded hashes; authenticate new
   decisions prospectively only.
2. The commit guard must permit the Go-authorized migration to be committed
   and tested before acceptance; the publishing gate must still refuse it
   without owner approval; demonstrate the full sequence in a disposable copy
   and test the initial publication against main's actual baseline.
3. resolvePackage must support explicit package selection before acceptance
   (--serve --package <id>); acceptance-based resolution for publication and
   bookkeeping; retain the manifest, completeness and partial-package rules.
4. Preserve all of item 128's scope (device-clock defaults AND viewer-zone
   display) as explicit parts or a declared bundle.
5. "Append-only" means the prior content is an unchanged prefix and additions
   come after it; still a limited informational exception.

Completion standard: report the exact commit and package id, each checklist
result and its evidence, any failed, skipped or incomplete check, the
complete changed-file list, and any unresolved limitation. Do not call the
implementation accepted because the plan was approved or demonstrations
passed.
