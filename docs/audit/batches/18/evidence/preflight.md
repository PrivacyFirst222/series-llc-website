# Batch 18 precommit verification — not a release package

The source changes are prepared on codex/batch-18, based on a500e3c5f4e85e89e7b5b8664004cae01f619c53. No implementation commit, acceptance, release or external publication has occurred. The original repository and Batch 16 checkout are untouched. A verified complete-history return-point.bundle is retained in the enclosing folder. This checkout has no remote.

## Passing checks
- Typecheck, lint, existing unit suite and fact ledger.
- Four new checks: all eight OA forms plus consent with literal brackets, pipes and line breaks; unfilled template failure; office suite/apartment lines; English input before business writes, including multipart text and credential exceptions.
- 1,302 browser checks passed in the standalone precommit rehearsal. The new English-character refusal and correction probes passed; no new browser failure remains.
- 741 API checks against a fresh disposable database. The running server reported offline true and every external integration false before the suite started.
- Prior ledger guard: 334 source records; 213 existing fixes replay; no out-of-scope file.
- Proposed revision 2 assertion projection: no static failures. This does not authorize revision 2.
- Twelve Word outputs generated locally; provision, event, structure, citation, cross-reference and formatting controls passed. Dropbox was not updated.
- All twelve Word documents rendered. Page counts unchanged; 220 page images byte-identical to baseline, all 17 changed pages inspected. Updated reference paragraphs fit without clipping or extra pages.
- Portal Manual remains 37 pages. Sample client agreement tables and consent pages were rendered, extracted and visually checked; literal client data stays inside its cells.

## Remaining gate
Revision 1 was frozen before the new citation checks and all assemblers ran. Its reference assertions need the corrections in revision-2-correction.md. Adam's actual rejection is required; no record has been fabricated. After that: authorize the prepared revision 2, mark implemented, commit through normal hooks, then run the full mandatory review on the exact commit. Publication remains deferred.

The standalone browser run is a precommit rehearsal, not commit-bound release evidence. The full mandatory review will repeat it after the corrected revision is committed. Earlier failed probes are not counted as passes: the browser test initially used an exact label missing the required-field marker, old certificate assertions expected a hyphen, and an entity-escaping probe caught double encoding. Those are corrected; the passing logs record reruns.

## Revision 2 continuation — 20 September 2026

Adam explicitly instructed: "Reject Batch 18 revision 1; proceed with revision 2." The pending-decision paragraph above is historical. Both frozen snapshots and all histories are retained. Revision 2 is implemented. The guard passes all 334 records and 231 recorded fixes across 203 product files.

The first implementation commit cf2280b exposed a test-transport gap: the before-fix runner copies e2e.ts, not its new batch18-check helper. The four required regressions now reside in the copied suite itself and use the old tree's actual assemblers, summaries and running API. No product fix is copied into the old tree. A focused rerun observed all four defects on a500e3c and all four passes after the fix: the old assembler prints a planted unresolved slot; all eight old forms split client pipes into extra columns; suites/apartments disappear; unsupported input is not rejected with the English-input message. The complete observations are retained in before-after-observations.json. A fresh full review will bind the corrected tests and product to their final commit.
