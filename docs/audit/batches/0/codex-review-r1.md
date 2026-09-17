# Batch 0 implementation review — reject revision 1

Reviewed 17 September 2026. Advisory verdict for Adam: **REJECT revision 1 at 180623bbd4dbac3a8d4c4a33e0f81f48e1dcf937.** Preserve the ledger work, correct the failures below, and issue a new package. This report is not Adam's acceptance or rejection instruction.

Repository: /Users/adam/Documents/Claude Projects/Series LLC Website. Baseline: 82abf541a6643981d93d41bc5d8b6da169897971.
Review package: /Users/adam/.fpsllc/reviews/0-r1-180623b/.

The criteria are unchanged: Adam reviews every fix before publication; approval identifies the actual reviewed version; fixes and decisions remain traceable; duplicate work is prevented; recorded regression checks continue running; product facts have one authority.

## Scope and evidence

- **41 of 41 changed-file diffs reviewed.** This includes exhaustive machine comparisons for the large generated records, not a claim that every one of the 29,516 physical lines in all changed files was independently read as source prose.
- **334 of 334 finding records compared exhaustively**: all 267 original records and all 67 new findings.
- **67 of 67 new findings read in full as parsed fields** and compared against the four supplied bucket reports.
- **63 of 63 disputed-item verdicts**, all 11 new duplicate links, all 25 new ruling flags, and both part splits reviewed against the supplied source findings and audit assessments.
- **29 of 29 demonstration rows examined and independently rerun** in a disposable clone.
- All new executable audit/runner files were read whole. Existing large e2e/behavioral suites were reviewed through their complete changed hunks and relevant supporting ranges, not reread whole.
- Original HEAD and clean working tree verified before and after. No original repository files or ~/.fpsllc files were modified. No actual push, live deployment, real Dropbox publication, or original-tree generator/demo run occurred.
- Reproductions used disposable repositories, simulated acceptance files, a fake Dropbox directory and, for one test, a temporary local fake API that was stopped afterwards.

### What passed

The package's diff is byte-for-byte the requested Git diff and its SHA matches. All 12 packaged Word hashes match Git objects at the reviewed commit. All ten saved check entries report exit 0, no skipped suite; their log paths exist. Structured server results contain 664 true results; browser results contain 1,096 true results; the assertion log reports three passing assertions. The two Dropbox manifests each contain 54 files and match by paths and content hashes.

The source snapshot equals the original working list at 82abf54 byte-for-byte. All 267 original text/tag/area/housekeeping values and all 267 Codex assessment notes/statuses were preserved. All 67 new findings preserve every supplied finding field in the ledger representation. There are 334 unique expected IDs. The generated working list exactly matches the renderer.

These successes do not prove the release safeguards below work.

## Findings, most consequential first

### 1. P1 — The records-only exemption can delete the ledger or weaken its protections without acceptance

Locations: docs/audit/release-check.ts:45–55; docs/audit/guard.ts:40–41; docs/audit/ledger-lib.ts:194–200, 235–249.

Reproduced in the disposable clone:
- Delete only ledger.json: staged guard exits 0 with “no ledger yet — nothing to guard”; release gate exits 0 with “records only … no acceptance needed”.
- Change implemented batch 0's requiredChecks to just typecheck: release gate again permits the records-only change without acceptance.
- Remove a released fix's assertions and append an ordinary ruling record: ledgerRegressions returns no error.
- Erase batch history: ledgerRegressions returns no error.

The check only compares ledgers when both exist, protects batch.json only for batches previously marked accepted/released, and permits assertion changes based on new in-repository ruling/reopening text. It does not protect batch history as an append-only prefix.

Smallest correction: fail closed when an established ledger disappears; protect authorized and implemented batch definitions; make weakening verification/approval controls require explicit reviewed authorization rather than the records-only path; enforce append-only batch history as well as part history. Keep an explicit, narrow initialization case.

### 2. P1 — Conditional or hypothetical wording is recorded as unconditional acceptance

Location: .claude/hooks/accept-prompt.sh:28–30.

Both of these were reproduced as acceptance records in a temporary acceptance directory:
- “Accept A, revision 1, 3f9c2ab only if Codex finds no problems. Do not release yet.”
- “Accept A, revision 1, 3f9c2ab is the command I would use; I am not accepting it.”

The regular expression matches only the beginning and ignores the qualification.

Smallest correction: require an unambiguous whole-message acceptance command, with narrowly specified optional suffixes. Reject conditions, explanations, quotations and trailing qualifications instead of ignoring them.

### 3. P1 — The Dropbox publisher has a no-acceptance exception

Location: docs/audit/publish-docs.ts:43–49, 64–70.

Documents last changed before the gate was introduced bypass the release check. With the reviewed commit represented as origin/main in a disposable clone and no acceptance file, the publisher copied all twelve Word documents into the fake Dropbox directory, announcing “12 reviewed Word documents”.

Being old or on origin/main does not prove the destination already contains those exact bytes or that Adam accepted this publication.

Smallest correction: require an explicit accepted baseline for first publication, or verify exact destination equality and perform no write. Remove the unconditional pre-gate publication exception.

### 4. P1 — CI does not detect the unaccepted releases it claims to detect

Locations: .github/workflows/check.yml:49–55; docs/audit/guard.ts:45–46, 63–65; docs/audit/README.md:60–64.

The workflow invokes guard.ts, not an acceptance verification. On main, batch-branch checks do not run, and its historical ledger comparison compares HEAD with the same checked-out ledger.

Reproduced: commit an unaccepted FAQ change on disposable main; the CI guard exits 0. This does not mean all possible tests pass, but a harmless unaccepted change is not detected as unaccepted.

Smallest correction: either add CI-verifiable approval evidence and compare the actual before/after revision, or remove the claim that bypassing the push hook will necessarily make CI red. Local procedural enforcement can remain explicitly limited.

### 5. P1 — A future batch may omit the guard and regression assertions

Locations: webapp/scripts/audit-review.ts:66–82, 129; docs/audit/release-check.ts:78–85.

The batch chooses the complete required-check set. An empty set becomes only dropbox-unchanged in the review package. The release gate accepts that nonempty set.

Reproduced with simulated acceptance and a package naming only a passing Dropbox snapshot: release passed with no guard or assertion results. Batch zero itself does include all expected checks; the flaw concerns later batches.

Smallest correction: require a mandatory minimum outside the editable batch list, including the guard and all recorded assertions plus the suites those assertions need. A batch may add checks, not disable the minimum.

### 6. P1 — A stale API can be mistaken for the newly isolated review server

Location: webapp/scripts/isolated-stack.ts:28–45.

The helper starts a child but accepts any healthy listener at the chosen port. It does not prove that the child owns the listener or check its failed startup.

Reproduced with a temporary fake offline API occupying the port: the helper returned success and reported a throwaway database, although the proof came from the fake server marked “WRONG SERVER”.

Smallest correction: use per-launch identity/nonce verification, detect child exit/bind failure, and allocate a free port. Do not accept an unrelated listener.

### 7. P1 — The reviewed commit is fixed, but the tested and displayed working tree is not

Location: webapp/scripts/audit-review.ts:25–36, 50–55, 127–139.

Cleanliness is checked once. Tests and builds then use the mutable checkout, while the package records the original commit. The saved browser run lasted about nine minutes. A concurrent edit or checkout change during that interval is not checked before the package is issued. The final review site and --serve-only also use the current checkout rather than a specified package commit.

No drift was established in this saved run.

Smallest correction: test/build/serve an isolated checkout of the exact commit. Preserve the reviewed build for inspection. At minimum, reject final HEAD/tree drift; that alone does not bind later site serving.

### 8. P1 — Forty-four rejected replacement proposals are hidden despite their defects being confirmed

Locations: docs/audit/ledger-build.ts:91; docs/audit/ledger-lib.ts:91; docs/audit/ledger-print.ts:44, 74–75.

The source reports separately state defect status and replacement correctness. The builder drops replacementOk as a field; the working list suppresses the combined note for confirmed findings; work orders omit it entirely.

Affected confirmed items:
4, 5, 11, 13, 14, 23, 29, 39, 51, 56, 61, 68, 70, 85, 86, 94, 95, 115, 121, 125, 139, 140, 143, 146, 156, 161, 162, 171, 178, 180, 181, 207, 209, 212, 219, 235, 238, 239, 240, 241, 242, 245, 247, 265.

Examples: item 39's package-ordering replacement omits the 65-day restriction; item 209 retains the formation_order_id IS NULL fallback that the audit warned can misattribute orders across companies. Optional items 30, 45, 81 and 138 also lose replacement corrections in work orders.

Smallest correction: preserve and render replacementOk/replacementNote independently of defect status, and ensure final replacement guidance reaches every work order. Confirmation of a defect must not imply approval of its proposed fix.

### 9. P2 — Canonical and duplicate items can be assigned to separate batches

Locations: docs/audit/batch.ts:34–55; docs/audit/guard.ts:117–134; docs/audit/ledger-print.ts:14–18.

Reproduced: authorize item 127 in one batch, then its duplicate 228 in another. Both succeed. The checks compare literal item/part IDs; the later canonical check only collects open aliases and misses aliases already assigned elsewhere. Statuses are also independent rather than inherited.

Smallest correction: claim work using canonical defect/part identity. Model separate locations explicitly where they need different implementation work, but detect competing batches for the same defect. Map part-level aliases, particularly item 95's relationship to 198.

### 10. P2 — Owner-decision dependencies exist in prose but not in the gate

Locations: docs/audit/verdicts.json:39–42, 71, 108; docs/audit/ledger-build.ts:118; docs/audit/batch.ts:47.

Items 27, 28, 38 and 153 state that an owner decision or another item's ruling is required, but those dependencies are absent from their ledger waitsOn fields. extraWaits is empty and is not consumed by the builder.

Smallest correction: encode the stated waits and propagate them across duplicates. Split item 27 so its collection-channel wording can proceed separately from the retention decision.

### 11. P2 — Offline verification does not cover every frontend request or isolate local files

Locations: webapp/scripts/isolated-stack.ts:30, 48; webapp/scripts/audit-review.ts:78; webapp/src/lib/api.ts:1,16,27; webapp/src/components/forms/florida-llc/AddressAutocomplete.tsx:65–67; webapp/server/storage.ts:33,46,61.

The review build inherits VITE_BACKEND_URL, which can send browser requests to an external API rather than the verified offline server. No such URL was found in current local settings; this is a configuration gap, not a claim that this happened.

The behavioral build does not apply the review helper's Smarty-key override. A nonempty frontend Smarty key is present in local settings, so backend OFFLINE alone does not establish an offline browser walk. No claim is made here about actual historical requests.

DEV_PG_DIR isolates the database but local blobs still use the repository's normal .dev-data/blob directory, sharing/leaving generated files between runs.

Smallest correction: share one sanitized build environment across every review/test path, block or verify nonlocal browser requests, and supply a disposable local blob root alongside the disposable database.

### 12. P2 — A behavior assertion can pass from the wrong suite

Location: webapp/scripts/audit-assert.ts:34–40, 93–98.

Reproduced: a server assertion passes using only walk-results.jsonl with the same label. The result map ignores the assertion's suite.

Smallest correction: record and check suite, label, run and commit identity. Validate strict Boolean results. Existing saved suite labels do not overlap, so this did not invalidate the current sample assertions.

### 13. P2 — Automatic before-fix verification loses necessary support files and causal evidence

Location: webapp/scripts/audit-review.ts:93–109; webapp/server/e2e.ts:29–34; webapp/scripts/behavioral.ts:117–122.

Only the two suite entry files are copied onto the old tree. A newly imported test helper is absent; the test cannot load and the batch is refused. This fails safely but breaks a legitimate future workflow.

Conversely, any false result under the right label satisfies the red test. Full before-run stdout/stderr is discarded, and the JSONL writers omit expected/actual/error detail. A setup failure reaching that assertion is not distinguished from the intended defect.

Smallest correction: declare and overlay necessary test-only dependencies, excluding the product fix. Save complete before-run logs and expected/actual failure evidence, and review whether the intended defect caused the failure.

### 14. P2 — Scope enforcement misses untracked files, control files and late staging

Locations: docs/audit/guard.ts:77–84; docs/audit/ledger-lib.ts:205–209; .claude/hooks/pre-commit.sh:40, 55–60, 75–79.

Reproduced: a new untracked TSX file exists on batch 0's branch, yet the non-staged guard announces that the batch is within declared scope. Git diff omits untracked files. The review command's separate dirty-tree check blocks this particular file from a normal package; the staged guard catches it once staged.

CONTROL_PATHS omits webapp/vercel.json, Vite/ESLint/TypeScript config, docs/audit/verdicts.json, .claude/launch.json, docs/facts.md and formatting/coverage baseline data. These still require acceptance as non-record paths, but are not identified as control changes.

The pre-commit guard runs before Word generation and API rebuilding stage additional files. The final index is not guarded again.

Smallest correction: include untracked files in working-tree scope checks, identify all configuration/baseline controls, and rerun the guard after generated outputs are staged.

### 15. P2 — Retired-wording exceptions can mask a relocated bad occurrence

Location: docs/audit/ledger-lib.ts:277–282.

An allow entry checks total occurrence count and whether its context appears somewhere, not that each allowed occurrence is inside that context.

Reproduced with count 2: one allowed historical quotation plus one live false promise containing the retired text passes because the quotation context exists and the total remains two. Removing all approved after-sentences globally is also broader than a location-bounded exception.

Smallest correction: match and remove only the exact permitted contextual occurrences, enforce their counts/locations, then reject every remaining occurrence. Do not exempt a whole file or all global instances of an approved sentence by implication.

### 16. P2 — Release bookkeeping can contradict rejection and publication state

Location: docs/audit/batch.ts:68–79.

Reproduced: a simulated acceptance followed by a later rejection still lets batch.ts released mark batch 0 released. This path does not apply the release gate's later-rejection check.

It also equates containment in the local origin/main tracking ref with release, without evidence of deployment or Dropbox completion.

Smallest correction: share current acceptance/rejection validation and required state transitions with the release gate. Record Git publication, deployment and document-publication results separately; do not assert completion from a tracking ref alone.

### 17. P2 — One corrected verdict still confuses ownership count with tax classification

Location: docs/audit/verdicts.json:42.

Item 38 says “A single tax filing is still wrong for a sole owner,” although item 22 at line 37 explicitly identifies the sole-owner S-corporation exception. The correction is internally inconsistent.

Smallest correction: qualify the statement to a sole-owner disregarded LLC and retain the distinction from a sole-owner LLC taxed as an S corporation. Item 145's explanatory “appear before any state document” should say “can appear”; its proposed replacement itself accommodates both timings.

### 18. P2 — Acceptance stores a prefix rather than resolving the exact commit

Locations: docs/audit/accept.ts:16–18; .claude/hooks/accept-prompt.sh:28–30; docs/audit/release-check.ts:60,68–75.

Seven-character input is stored as a prefix and later matched with startsWith. The package checks do bind to a full SHA, so a simple changed commit with a different prefix is correctly refused. Nevertheless, the acceptance itself is not permanently resolved to one commit, and review directory names reuse the prefix.

No hash collision was generated in this review.

Smallest correction: accept a unique abbreviation as user input if desired, resolve it immediately to a full commit ID and existing package, and persist that identity.

### 19. P2 — Demonstration results overstate what some rows measured

Locations: docs/audit/demo.ts:55,119–122,191–192; docs/audit/batches/0/evidence/demo.md:5; docs/audit/batches/0/batch.md:53–56.

Row 25 manufactures its reported success status by finding a success line. Row 26 hardcodes exit 1. Their underlying subcheck observations are real, but the reported statuses are not actual process exits for those rows.

Row 18 uses simulated successful check records and an empty document list. It proves gate branching, not full verification or document publication. Row 8 rejects an undeclared test file, not a disabled check inside an allowed test file. The statement that every push used the hook excludes an actual setup push using --no-verify.

Smallest correction: distinguish real command exit codes, parsed subcheck results and simulated package fixtures. Qualify each claim and add regression demonstrations for the failures above.

## Requirement-by-requirement assessment

| Requirement | Assessment |
|---|---|
| Acceptance distinct from Go | Present, but parser can invent unconditional acceptance: finding 2. |
| Exact revision/commit accepted | Package SHA checks work; prefix storage and mutable tested tree need findings 7/18. |
| Whole batch or nothing | Review checks all batch items implemented; rejection bookkeeping still fails: finding 16. |
| No Dropbox/site publication before acceptance | Normal product push is blocked; legacy Word exception fails: finding 3. Procedural bypass remains acknowledged. |
| One gate judges complete published difference | Normal existing-branch base/diff checks work; records exception fails: finding 1. |
| Assertions check results | Page/Word/named-check mechanisms exist; mandatory replay and suite identity fail: findings 5/12. |
| Shared facts remain in facts.md | No second fact authority introduced. Future mandatory checks still need finding 5. |
| Canonical defects and independent parts | Source links/splits preserved; allocation/status handling fails: finding 9. |
| Append-only history | Source and part-history checks exist; batch history and protection changes remain exposed: finding 1. |
| Fresh file discovery | New TSX discovered during replay, but working-tree scope misses untracked files: finding 14. |
| Guard blocks unapproved scope | Demonstrated for ordinary tracked cases; control coverage/staging gaps: finding 14. |
| Exact wording replacement scope | Demonstrated extra-line rejection works. No partial/doubled-replacement bypass was established; unchanged work can be committed before it is marked implemented. |
| Code scope explicitly left to review | Correctly documented; complete-diff review remains necessary. |
| Automatic red-before-fix test | Exists and demonstrated; support files and cause evidence incomplete: finding 13. |
| Dropbox unchanged by content | Saved 54-file before/after comparison passes; historical generator run not independently repeated. |
| Tampering tests in disposable copy | Confirmed; rerun also isolated. |
| Administrative exemption decided by paths | Implemented, but exempts active verification controls and ledger removal: finding 1. |

## Verdict overlay and source fidelity

All specified group counts match: 12 dropped, 15 optional, 32 corrected, four disputes not adopted, eleven additional duplicate links, 25 new ruling flags, two part splits. The 25 count is the implementation's count, not the older conversation's 26.

No source-fidelity discrepancies were found among all 334 records. The important defects are lost presentation of replacement corrections (finding 8), missing decision dependencies (finding 10), and item 38's inconsistent note (finding 17).

All twelve dropped and fifteen optional classifications are consistent with the supplied audit assessments, subject to their source-evidence limits. The 32 corrected notes were examined individually: item 38 needs substantive qualification; 27/28/38 need encoded waits; item 100 itself instructs a future split but still has one part, so must be split before partial work; item 145 needs “can” in its explanation. The eleven duplicate mappings are consistent with the supplied reports.

The four rejected deadline disputes (63,152,153,202) remain conditional on the product's supported election circumstances. IRS instructions distinguish the election effective date and the earliest owner/asset/business date for a first tax year. This review did not establish that every supported product path satisfies Claude's formation-date assumption. Preserve this as a scope/wording decision for Adam rather than calling the law independently settled. Source reopened: https://www.irs.gov/instructions/i2553 .

Both declared splits, item 17 and item 95, are preserved. Item 95's canonical connection to 198 needs part/location mapping rather than whole-item status inheritance.

## All 29 demonstration rows

Pass below means the narrow scenario is supported and reran, not complete-system certification.

| Row | Assessment and code path in demo.ts |
|---|---|
| 1 | Pass: unmet ruling blocks authorization, lines 73–74. |
| 2 | Pass: missing exact before-text refused, 77–78. |
| 3 | Pass: valid authorization freezes/assigns, 81. |
| 4 | Pass: ordinary records-only push, 82–83; does not cover malicious/dangerous records changes. |
| 5 | Pass: same literal item/part cannot be claimed twice, 86–88; aliases not tested. |
| 6 | Pass: extra edit inside replace file refused, 95–96. |
| 7 | Pass: undeclared tracked product file refused, 98–99. |
| 8 | Narrow pass: undeclared e2e file refused, 101–102; disabling a declared check not proved. |
| 9 | Pass: frozen batch mismatch refused, 104–105. |
| 10 | Pass: second retired-text copy remains and is detected, 107–108. |
| 11 | Pass: exact intended replacements pass staged guard, 111–112. |
| 12 | Pass: unaccepted ordinary product push refused, 127–128. |
| 12a | Pass: temporary remote actually unchanged, 129. |
| 13 | Pass: simulated package missing required record refused, 132–133. |
| 14 | Pass: simulated skipped required record refused, 134–135. |
| 15 | Pass: simulated failed required record refused, 136–137. |
| 16 | Pass: changed commit lacks matching acceptance, 140–141. |
| 17 | Pass: package base hides earlier riding-along commit and is refused, 144–147. |
| 18 | Narrow pass: simulated complete package permits push, 150; no document hash test. |
| 18a | Pass: temporary remote is now accepted commit, 151. |
| 19 | Pass: simple accepted/on-remote bookkeeping, 153; later rejection/completion not tested. |
| 20 | Pass: product file prevents records-only exemption, 154–155. |
| 21 | Pass: removing product change permits records-only push, 156–157. |
| 22 | Pass: restored retired FAQ wording refused, 159–160. |
| 23 | Pass: removed released assertion without ruling refused, 162–163; ruling/reopen escape not tested. |
| 24 | Pass: declared behavior-fix scope passes, 174–187. |
| 25 | Qualified: real server suite succeeds; displayed exit synthesized from success text, 191. |
| 26 | Qualified: named old-tree result is false; displayed exit hardcoded, 192. |
| 27 | Pass: irrelevant check also succeeds before fix and actual review fails as NOT PROVEN, 193. |

The separate six-message acceptance-hook fixture also reran as recorded, but missed the two false-acceptance examples above.

## Additional requested edge cases and limits

- FPSLLC_HOME redirection is real and explicitly disclosed. This review used it only in disposable tests. It is not protection against a process with Adam's permissions.
- New remote branches use merge-base with origin/main, not necessarily the current main tip. An ancestor branch can be treated as having no changes relative to itself. This is weaker than claiming every new preview is checked against today's production tree; no new content-publication bypass through this case was independently reproduced.
- Tags use the same generic diff path with no dedicated tag policy. Annotated tags introduce tag-object versus commit identity concerns. No tag-based acceptance bypass was reproduced.
- Product-changing force rewinds generally require acceptance under the range check; records-only rewinds/removals retain finding 1's problem. Main deletion has an explicit refusal.
- No true isolation from deliberate agent bypass is established or claimed. Direct publishing commands, altered local hooks/credentials and forged local records remain outside a hard enforcement boundary.
- The document-formatting log includes preexisting PART results for amendment and Statement baselines. A suite-level skipped:false is not proof every possible internal formatting comparison ran.
- Historical evidence such as the Word generator run was inspected, not independently recreated against real Dropbox. Matching snapshots establish matching recorded endpoints, not continuous observation of every filesystem write.
- Underlying statutes and all 267 original product defects were not independently re-audited in this implementation review.

## Smallest practical revision

Retain the ledger and valid checks. Close the records-only exemptions, make acceptance parsing exact, remove unaccepted Word publication, enforce mandatory regression checks, bind review execution to the actual commit/server, preserve replacement warnings, and fix canonical assignment and ruling dependencies. Add specific tests for each reproduced failure. Issue revision 2 with a fresh package; Adam alone decides whether to accept it.

