# Batch zero, revision 2 — independent review

Reviewed commit: `d0e3689fad8c655037e5e0233dda1014c1ddf043`, branch `audit/batch-0`.
Compared with revision 1: `180623bbd4dbac3a8d4c4a33e0f81f48e1dcf937`.
Batch base: `82abf541a6643981d93d41bc5d8b6da169897971`.
Review date: 17 September 2026.

Recommendation: **withhold acceptance**. Of the original 19 findings, **12 corrected, 7 partly corrected, 0 wholly uncorrected**. There are also newly reproduced failures described below. This recommendation does not record a rejection or acceptance on Adam's behalf.

Evaluation criteria: preserve the audit's original records; require Adam's acceptance for changes that weaken controls; keep independent defects separate while linking true duplicates; bind evidence to the intended commit, suite and run; isolate review execution; and make the evidence claims match what was actually demonstrated. A passing demonstration alone is insufficient when another reachable path contradicts the requirement.

## All 19 original findings

| # | Result | Evidence and remaining work |
|---|---|---|
| 1 | **Partly corrected** | Ledger deletion, history erasure, and ordinary changes to frozen batch files are now rejected. However, changing a batch's status to `rejected` makes the frozen-file protection disappear, and removing an item's decision dependency passes the records-only gate without acceptance. Reproductions A and B below. |
| 2 | **Corrected** | The acceptance hook matches the whole message. Both original conditional/hypothetical commands record nothing; the exact command records one acceptance. The separate numeric rejection bug below does not reopen this original acceptance-prefix finding. |
| 3 | **Corrected** | The Dropbox publisher refuses differing documents without a qualifying acceptance. Identical destination bytes are a no-op. Independent disposable demonstration wrote zero files in the refused case. |
| 4 | **Corrected** | The false claim that GitHub checks acceptance is removed. The limitations now expressly say it does not. |
| 5 | **Corrected** | The runner and release gate use a mandatory minimum independent of a batch's shortened list. A fixture package omitting mandatory checks is refused. The new partial-package failure below concerns the omitted review site, not omission of those checks. |
| 6 | **Corrected** | An occupied port is refused; the review checks that its own child owns the port. Independently reproduced. |
| 7 | **Corrected** | Tests run in a checkout of the exact commit, a final tracked-file drift check runs, and the review build is retained. The dirty working-tree demonstration tests the committed version. The retained site's bytes are not separately hashed, which limits protection against later package modification. |
| 8 | **Corrected** | All 44 rejected-replacement flags and notes are retained and shown in both the list and generated work orders. Exhaustively compared, not sampled. |
| 9 | **Partly corrected** | Canonical 127 and duplicate 228 cannot be claimed by separate batches. But grouping operates on whole items and blocks independent parts, including 17's two different fixes and 100's Review-row fix versus duplicate 112's dead-code defect. Reproduction C. |
| 10 | **Partly corrected** | The specified decision dependencies now exist and aliases inherit them during authorization. They can still be removed without acceptance, and the ruling queue omits inherited dependencies. Reproductions B and D. |
| 11 | **Partly corrected** | Build environment sanitization and disposable local file storage are corrected. Browser isolation patches only `browser.newPage`; the existing Clients-tab `newContext().newPage()` path escapes it. Reproduction E. |
| 12 | **Partly corrected** | Suite, label, full commit and strict Boolean results are checked. The stored run identifier is ignored, so evidence from another run of the same commit passes. Reproduction F. |
| 13 | **Partly corrected** | Declared test helpers are overlaid and ordinary before-run logs are saved. However, the supplied demonstration deletes the log it says it retained and reports no failure detail; its revision-1 counterpart never reaches the helper scenario. The required causal evidence remains incomplete. See I. |
| 14 | **Corrected** | Working-tree scope includes untracked files, the control-path list is expanded, and the guard runs again after generated outputs are staged. The untracked-file demonstration now refuses. |
| 15 | **Corrected** | The original quotation-plus-live-use reproduction now refuses: exceptions remove the permitted context, rather than subtracting a whole-file count. Approved replacement exemptions are now limited to their declared file. This remains textual checking, not semantic location verification. |
| 16 | **Corrected** | Release bookkeeping shares the standing acceptance/rejection lookup, asks the actual remote about main, and separately records Git publication, deployment and Dropbox evidence. The acceptance-then-rejection reproduction refuses. The newly found rejection parser defect is described separately in G. |
| 17 | **Corrected** | Item 38 now distinguishes a disregarded sole-owner LLC from one taxed as an S corporation; item 145 says “can appear”; item 100 is split. This verifies the requested internal correction, not a new legal audit. |
| 18 | **Corrected** | A unique short commit resolves immediately to a full SHA and matching review package. The stored acceptance and later lookup use the full SHA. Independently tested. |
| 19 | **Partly corrected** | Parsed observations, real exits and simulated packages are distinguished, and disabling a check inside a declared file is now tested. Some red-before rows fail for unrelated reasons, retained evidence is deleted, and the claim that only one push bypasses the hook remains false. See I. |

## Reproduced remaining and new failures

Paths below are relative to `/Users/adam/Documents/Claude Projects/Series LLC Website`. No reproduction modified that original repository.

### A. A changed status bypasses frozen-batch protection

Locations: `docs/audit/ledger-lib.ts:270`, `docs/audit/guard.ts:76`, `docs/audit/release-check.ts:58`.

In a disposable clone on a non-batch records branch, changed only batch 0 revision 2's ledger status to `rejected`, without a rejection history event, and changed its frozen `requiredChecks` to an empty list. The existing frozen hash remained unchanged. The ordinary guard returned 0. After a local fixture commit, the release check from d0e3689 to that commit returned 0:

> release gate: ok for (range) — records only (2 file(s)) — no acceptance needed

The fake acceptance directory was empty. The gate accepts the new status as a reason to skip checking the previously frozen file. This establishes a control weakening, not an actual remote publication. The mandatory minimum would still apply to a subsequent product release, so this proof does not claim that every mandatory check was disabled.

Correction: validate batch status transitions against the prior ledger. A rewritten status must not, by itself, cancel a protection established by Go. Preserve frozen revisions and require the defined rejection/supersession evidence before exempting them.

Evidence clone: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/fpsllc-r2-review-s1ph9sfz/repo`.

### B. An owner's decision requirement can disappear as “records only”

Locations: `docs/audit/ledger-lib.ts:244`, `docs/audit/release-check.ts:72`.

Removed item 28's `waitsOn: ["ruling:28"]`, regenerated the list, and committed only those two files in a disposable clone. Both guard and release check returned 0, with no acceptance supplied. The release message was again “records only (2 file(s)) — no acceptance needed.”

Correction: treat removal or weakening of decision dependencies as a control change. Resolve a dependency through a recorded ruling rather than silently deleting it. Apply the same preservation principle to canonical relationships that prevent duplicate work.

Evidence commit: `4205f3c3a14d4e56b850cc8fa586c2202ad72f34` in `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-r2-ledger-ma55x_l4/repo`.

### C. True duplicates are blocked, but different defects are wrongly tied together

Locations: `docs/audit/ledger-lib.ts:286`, `docs/audit/batch.ts:57`, `docs/audit/guard.ts:164`.

Two independent reproductions:

1. Authorizing `17:amend-title` in one batch prevents `17:contact-wording` in another, with a “same defect” refusal. These are deliberately separate parts.
2. Authorizing `100:review-rows` succeeds, but its guard demands item 112. The revised verdict places 112 with `100:unused-code`, not Review rows.

Correction: give aliases a canonical part, and perform claim/completeness checks on that defect group. Do not require unrelated parts of an item to be fixed together.

### D. The ruling queue hides some of the work a decision unblocks

Locations: `docs/audit/ledger-print.ts:89`, `docs/audit/ledger-lib.ts:299`.

Current queue says ruling 63 unblocks only 63. Actual authorization also blocks 152, 153 and 202 on that ruling. Ruling 28 likewise blocks 201, which is omitted from the queue. Thus the “most-blocking first” ranking and displayed scope are wrong.

Correction: build the queue from the same resolved dependencies authorization uses, deduplicated by item and part. This is a presentation defect, not a publishing bypass.

### E. An existing browser-context path escapes the network filter

Locations: `webapp/scripts/behavioral.ts:803`, `:2385`, `:2398`.

Only `browser.newPage` is wrapped with the nonlocal-request filter. The Clients-tab walk creates a BrowserContext and then uses `ctx.newPage`, which does not pass through the wrapper. A safe Playwright probe with a mocked request sink confirmed that the direct page is blocked while the context-created page reaches the sink. No external request was sent in the probe.

Correction: install the policy on every BrowserContext, covering its pages and popups; test this actual context-creation route. Sanitized backend/Smarty settings reduce exposure but do not make the stated blanket browser isolation true. This review did not demonstrate any real external write.

### F. A result from an old run of the same commit satisfies a current assertion

Location: `webapp/scripts/audit-assert.ts:38`.

Wrong suite, wrong commit and non-Boolean results now refuse. A result with the correct commit/suite/label but a stale run ID still passes when `CHECK_RUN_ID` identifies the current run. The reader never checks `run`.

Correction: pass the expected run ID to the assertion reader and require equality in addition to suite, commit, label and strict Boolean status. The supplied revision-2 package itself has matching run IDs; this is a demonstrated future-path defect, not an allegation that its results are stale.

### G. A numeric rejection reason is interpreted as a revision

Locations: `.claude/hooks/accept-prompt.sh:53`, `docs/audit/accept.ts:41`.

With a simulated acceptance for A revision 1, the valid batch-wide chat command `Reject A: 2` was forwarded positionally as `reject A 2`. The CLI recorded rejection of revision 2, with an empty reason. `standingAcceptance(..., "A", 1)` still returned the original acceptance.

Correction: pass revision and reason as separate named or structured arguments; do not infer an omitted revision from numeric reason text. Add positive controls for numeric-only reasons and explicit revision rejections.

Evidence directory: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-accept-r2-9hekmzya`.

### H. A partial review without a review site can be accepted by the gate

Locations: `webapp/scripts/audit-review.ts:163`, `:184`, `:187`; `docs/audit/release-check.ts:91`; `docs/audit/accept.ts:34`.

Using `--only` with all nine callable checks causes the runner to add its two automatic checks, satisfying all eleven mandatory names, while skipping site creation. The package remains explicitly partial. Neither acceptance nor release rejects that partial marker or requires the saved review site.

Confirmed using the actual revision-2 gate in a disposable clone: copied the real manifest, changed its `partial` field to all nine callable names, provided a simulated acceptance, and provided no site directory. The gate returned 0. This fixture tests gate branching; it is not a claim that the supplied real package is partial, or that all nine checks were independently rerun for this probe.

Correction: reject partial packages in readiness, acceptance and release; require the saved site. Record and verify its file hashes if the promise is that later review serves exactly the tested bytes.

Evidence directory: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-r2-partial-proof-rx_9jh42`.

### I. Some demonstration claims still exceed their evidence

Locations: `docs/audit/batches/0/evidence/red-before-revision-2.md:45`, `:58`; `docs/audit/demo.ts:130`, `:259`, `:345`, `:353`, `:361`; `docs/audit/batches/0/evidence/demo.md:3`, `:60`.

Three separate corrections are needed:

1. Red-before C4 and C1b fail because an earlier row changed the remote and Git rejects a non-fast-forward push. C15 and rows 25–27 stop at revision 1's dirty-tree refusal. These rows do not independently reproduce the defects they are meant to demonstrate. Reset fixtures between cases and ensure each probe reaches its target behavior.
2. Two unconditional cleanup pushes bypass the hook, in addition to the initial setup push. The header says every other push uses it. These are safe disposable-remote operations; label them accurately.
3. C15 only detects the phrase “before-fix output kept.” The cited log is inside the directory the demonstration deletes. The displayed failed assertion also says “(no detail recorded).” Copy the complete relevant log and useful failure evidence into retained demonstration evidence before cleanup. Ordinary review log-retention code has improved; this is a failure to deliver the promised demonstration evidence.

## Positive verification and limits

- Independent disposable rerun: **52/52 demonstrations**, exit 0. Passing the script does not resolve the counterexamples above.
- Actual supplied package: **11/11 checks** have exit 0 and are not skipped; diff hash matches; **12/12 Word-document hashes** match the commit.
- Saved server results: **664 rows**; saved walk results: **1,096 rows**. All report Boolean true and the package's correct suite, commit and run identity.
- Dropbox snapshots: **54 entries**, matching paths and content hashes before/after. This verifies the saved evidence; no generation against real Dropbox was performed during this review.
- Saved review site exists: **9 files**, including its index, JavaScript and CSS.
- Exhaustive record comparison: **334/334 IDs and original finding texts retained**, **267/267 prior assessment objects match**, **67/67 new findings preserved**, **44/44 replacement warnings appear in both required outputs**. Counts remain 307 open, 15 optional, 12 dropped.
- Revision-1 batch hash/base/model/history are preserved, with rejection appended and revision 2 separately indexed.
- This is a revision review, not a repeat full-product or statutory audit. The complete nine-minute review suite was not rerun wholesale; its saved outputs were inspected, the complete demonstration was rerun, and targeted independent probes were executed.
- The known procedural limits of local hooks/admin permissions are not presented as new findings.
- The original repository remained clean at d0e3689. No original product, audit, acceptance or publishing files were edited; no real acceptance/rejection or publication was performed. All fixture writes and commits stayed in disposable directories.

Independent demonstration log: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-demo-r2-gb177shz/rerun.log`.
