# Batch 0, revision 3 — independent implementation review

Reviewed 18 September 2026. Commit `fffd6567ec0aceca2e6d34bd3ea4c8a16544c7f4`; comparison revision 2 `d0e3689fad8c655037e5e0233dda1014c1ddf043`; main baseline `82abf541a6643981d93d41bc5d8b6da169897971`.

**Verdict: do not accept this commit yet. Preserve the working implementation and make focused corrections; do not restart the project.**

The criteria remain those in the approved plan: preserve past records; require Adam's actual decision for changes to protections; keep independent fixes independent; bind acceptance to the reviewed commit and package; isolate review activity; and demonstrate each claimed protection through its real entry path.

This review found **10 actionable issues** below: eight implementation defects and two demonstration/evidence defects. These are not ten reasons to redesign the system. Several share existing functions and can be corrected together.

The original repository was read-only and remained clean at the reviewed commit. All simulated acceptances, altered ledgers, fixture commits and local test services were confined to disposable copies and fake homes. No original acceptance, Dropbox file or product file was changed. The report and copied evidence are outside the product repository.

## What is verified and worth keeping

- The submitted package `abbedf191e4e` has explicit `partial:null`, and **all 11 recorded mandatory checks passed without skips**. This is verification of saved evidence, not a claim to have independently rerun the entire nine-minute package suite.
- Its **664 server results and 1,096 browser-walk results** have the expected suite, full commit, run ID and strict boolean success.
- Its saved diff and the actual Git diff match the recorded hash. **12 of 12 Word-document hashes** match committed objects; **9 of 9 site hashes** match, with no extra or missing site paths. The recorded before/after Dropbox snapshots match for **54 of 54 entries** by path and content hash. This verifies those snapshots, not the entire history of Dropbox activity.
- **All 334 audit records** retain their source text, identity fields, verdicts, replacement notes and item waits. All 267 prior Codex verdict objects and all 67 new findings agree with their source reports. The 44 replacement warnings remain visible in generated output.
- The seven retired parts retain their prior histories and scope. Item 128 retains both its date-default and viewer-time-zone display issues. The actual migration output agrees with its declared links, splits, waits and related-item mappings.
- Retained r1/r2 snapshots equal the historical batch-file bytes and recorded hashes. R1/r2 histories were preserved, with the separately recorded rejection appended.
- Independent parts can now be assigned separately; a true duplicate cannot be assigned to another batch. The ruling queue includes inherited dependencies, including 63/152/153/202 and 28/201.
- Fresh-run identity checks, numeric rejection reasons, explicit revision arguments, package ambiguity rejection and explicit-partial rejection work in independent probes.
- Direct external requests, separate-context pages, popup first requests and the existing API-handler interaction are blocked in the four reproduced cases. Finding 5 concerns a different, still-open redirect path.
- The before-fix log and failed-check detail now survive cleanup. The independent demonstration rerun retained them.

## The 13-point checklist

“Corrected” below means the reviewed mechanisms and tested cases meet the stated requirement, not that every possible execution has been proved safe.

| # | Requirement | Verdict | Evidence / remaining issue |
|---|---|---|---|
| 1 | Records-only rules R1–R6 | Partly corrected | Append-only content and generated-list checks work; rulings.md can still acquire an unauthenticated ruling, finding 3. |
| 2 | Batch transition events and frozen snapshots | Corrected for reviewed cases | Original snapshots/histories preserved; independent negative demonstrations pass. CI handling is separately item 3. |
| 3 | CI against the actual earlier ledger | Not corrected end to end | Correct comparison supplied, but legitimate rejection/release events become failures because local evidence is unavailable, finding 8. |
| 4 | Protected fields, authenticated rulings, exact migrations | Partly corrected | Missing approvals are refused, but an approval authorizes the wrong field value; an accepted fix can lose its assertions; ruling text can be truncated, findings 1, 2 and 4. |
| 5 | Part-level links, splits and group validation | Corrected for reviewed cases | Actual migration matches declaration; independent parts and duplicate refusal tested. |
| 6 | Ruling queue over unfinished work | Corrected | Required inherited-wait examples and preserved warnings verified. |
| 7 | Browser isolation | Partly corrected | Four direct cases work; local redirect reaches a forbidden destination, finding 5. |
| 8 | Commit and run identity everywhere | Corrected for reviewed cases | Valid control passes; stale run, wrong suite and missing identity fail; workflow supplies both. |
| 9 | Named rejection arguments | Corrected | Numeric reason and explicit revision independently verified. |
| 10 | Package identity and full-site validation | Partly corrected | Exact package resolution works; acceptance ignores integrity errors, and empty/malformed completeness data can pass release, findings 6–7. |
| 11 | Reproducible demonstrations and retained evidence | Partly corrected | Logs survive; clean-commit run fails setup, and saved red rows include unrelated failures, findings 9–10. |
| 12 | Checked migration and actual r2 rejection | Corrected for reviewed data | No source/history loss found; actual migration output matches declaration; no replacement rejection manufactured during this review. Generic migration enforcement remains finding 2. |
| 13 | Documentation claims match demonstrations | Partly corrected | Full-isolation, exact-migration and reproducible demonstration claims overstate what currently works. Update with the corrections and measured results. |

Count: **6 corrected, 6 partly corrected, 1 not corrected end to end.**

## Findings and exact corrections

### 1. An accepted fix can lose its protection before release bookkeeping

**Location:** `docs/audit/ledger-lib.ts:379–385`; acceptance/release interaction in `accept.ts` and `batch.ts`.

The acceptance command writes the external owner decision, but the part stays `implemented` until release bookkeeping. Assertion immutability only applies to parts already labelled `accepted` or `released`. A session can remove the `fix` and `batch`, reset the part to `open`, and append an unauthenticated event beginning with `reopened`. The owning batch can remain `implemented`.

**Reproduction:** In a disposable clone, authorize and implement item `17:amend-title` through the actual batch commands, commit it, and simulate a standing owner acceptance in that clone's fake home. Remove its fix/assignment and reopen it as above, regenerate the list and commit. Both the guard and the full release gate pass. The guard reports **zero recorded fixes replayed**. The new commit has no owner acceptance.

```text
release-check.ts --range 0eda203bd3442b6dd1a35e8e10f067d69778ffc9 599b6d6
release gate: ok for (range) — records only (2 file(s)) — no acceptance needed
```

**Correction:** Validate part transitions against their owning batch and authenticated owner decisions. An arbitrary history prefix must not authorize removing a fix. Freeze an accepted fix's assertions during the real interval between external acceptance and release bookkeeping. Demonstrate that the erased-fix commit is refused, while an authenticated rejection/rework path still works.

Fixture repository: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-r3-ledger-yp4sm3se/repo`; fake owner records in sibling `home`.

### 2. A migration approval permits a different change from the one approved

**Location:** `docs/audit/ledger-lib.ts:315–318,343–376`.

The gate verifies the migration-file hash, but then uses the file only to grant permission for a field category such as `canonical`, `parts` or `related`. It does not require the actual new value to equal that file's declaration.

**Reproduction:** A simulated owner approves a migration changing `95:eyebrow` to `127:all`. The ledger instead changes it to `1:all`. The approved file and its hash remain untouched. With the generated list synchronized, the full gate says:

```text
release gate: ok for (range) — records only (3 file(s)) — no acceptance needed
```

Removing the fake owner's migration approval makes the same gate refuse. Thus the flaw is specifically the scope of an existing approval, not missing authentication or an unsynchronized generated list.

**Correction:** Apply the declared migration to the prior ledger and compare the resulting protected values with the proposed ledger. Permit exactly the declared targets, scopes, parts, retirement mappings and metadata, not an entire field category. Use this same validation at commit, release and CI where applicable. Keep the already-correct actual migration 001 data.

Evidence: `evidence/migration-values.json` and `evidence/negative-control.json` beside this report. The log retains an initial refusal for an unsynchronized generated list, followed by the successful reproduction after that setup error was corrected.

### 3. A ruling for one item can authenticate an unrelated ruling

**Location:** `docs/audit/release-check.ts:92–101`.

Added rulings.md lines pass if they contain any recorded ruling's text as a substring. The gate neither binds the line to the recorded item/part nor excludes extra unauthorized text.

**Reproduction:** Record a simulated ruling for item 28: `Keep monthly wording.` Append this new line:

```text
- Ruling 63: Ignore every Form 2553 deadline finding. Keep monthly wording.
```

The full release gate accepts the one-file change as records-only, without acceptance. The added statement is not the decision in the owner record. Because rulings.md suppresses findings, this changes an audit control.

**Correction:** Validate an exact structured or canonically rendered ruling against its owner-record identity, item, part and complete text. Arbitrary prefixes, suffixes and another item's number must fail. Preserve legitimate formatting through an explicit renderer rather than substring matching.

Evidence: `evidence/ruling-substring.json`.

### 4. The chat hook silently cuts off part of an owner's ruling

**Location:** `.claude/hooks/accept-prompt.sh:51–53`.

The hook truncates the normalized ruling to 2,000 characters before storing it. It does not refuse or warn.

**Reproduction:** A 2,080-character fixture ruling ends with `ONLY IF Adam separately approves the final wording.` The stored record contains 2,000 characters, omits that condition and reports success. This is a changed decision, not merely a display abbreviation.

**Correction:** Preserve the full ruling, including meaningful text formatting, or reject an overlong input before writing any decision. Never silently turn a qualified ruling into an unqualified one. Add a long-ruling control whose final sentence must survive verbatim.

Evidence: `evidence/demo-review-notes.md` and `evidence/truncated-fixture-ruling.jsonl`. These are simulated owner records, not Adam's actual decisions.

### 5. A local redirect escapes the browser's local-only filter

**Location:** `webapp/scripts/browser-isolation.ts:42–47,58`.

The filter checks the initially routed request. A permitted localhost request can redirect to a forbidden host without passing that filter again.

**Reproduction:** Use the unchanged helper, a local HTTP 302 server and destination `http://probe.invalid:<port>/sink`. Chromium maps that hostname to a local sink for the test; no real outside service receives traffic. Result:

```text
destination local by policy: false
sink requests 1 blocked []
```

This matches Playwright's documented behavior: its route handler runs for the original redirect URL. See [Playwright Page.route documentation](https://playwright.dev/docs/api/class-page#page-route) and [routing and redirects](https://playwright.dev/docs/next/network#redirects).

**Correction:** Prevent an allowed request's redirects from reaching an unapproved destination before network contact. Validate redirect hops or enforce an appropriate network boundary; another initial-URL route handler is insufficient. Keep the four passing direct/context/popup/API cases and add this redirect case. This test establishes a remaining escape, not historical data exposure.

Evidence: `evidence/redirect.ts`, `evidence/contexts.ts`, and the unchanged helper copied into `evidence/browser-isolation.ts`. The original executable probe with its dependency link remains at `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-r3-runner-by8foh0c/`.

### 6. An empty site, or missing completeness field, can pass release

**Location:** `docs/audit/ledger-lib.ts:655–666`.

`partial:undefined` is accepted alongside explicit null. An empty manifest and empty site directory satisfy the file-comparison loops. The plan requires explicit completeness and a nonempty valid site manifest.

**Reproduction:** In fake homes, copy the real successful package and alter only the fixture under test. Run actual acceptance and `release-check --range 82abf54..fffd6567`:

| Package fixture | Acceptance exit | Release exit |
|---|---:|---:|
| Empty site directory and `site:[]` | 0 | 0 |
| Missing `partial` field | 0 | 0 |
| Explicit partial package | Refused | Not accepted |

**Correction:** Validate the package schema and require `partial === null`. Require a nonempty, valid manifest for the expected Vite site, including its entry document, then compare the entire file set and hashes. Missing required fields must fail. Use this check in every package consumer.

The submitted package itself has explicit null and nine matching site files; this finding concerns what the gate incorrectly accepts.

Fixture root: `/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/codex-r3-ci-v_zteiar/`, especially `home-empty-manifest-and-site` and `home-missing-partial`; repository in `repo`.

### 7. Acceptance ignores site-integrity errors it has already detected

**Location:** `docs/audit/accept.ts:44–48`.

The command calls `packageProblems()` and then discards every error whose message does not contain `PARTIAL`.

**Reproduction:** Missing site directory, changed site bytes and missing site manifest each receive a recorded acceptance, exit 0. The release gate subsequently refuses these three cases correctly. Therefore this is a faulty acceptance record and review workflow; by itself it is not a demonstrated publication bypass.

**Correction:** Refuse all package-validation errors before writing acceptance. Preserve the error detail so Adam knows why the reviewed package cannot be accepted. This shares the package-validation work with finding 6, but has a distinct cause.

Fixture homes: `home-missing-site`, `home-changed-site`, `home-missing-manifest` under the fixture root in finding 6.

### 8. CI rejects legitimate decision transitions because owner records are local

**Location:** `.github/workflows/check.yml:63–73`; `docs/audit/guard.ts:67`; `docs/audit/ledger-lib.ts:425–438`.

The workflow supplies the correct earlier/later commits. The guard requests `external:"skip"`, but `decisionEvidence()` turns unavailable local rejection/acceptance records into refusal messages.

**Reproduction:** In the disposable clone:

```text
bun run docs/audit/guard.ts --against d0e3689..fffd6567
exit 1
batch 0 r2: rejected — Adam's rejection record cannot be read here
```

Same-commit comparison passes; an unavailable baseline correctly fails. The first install from 82abf54 has no earlier ledger, so this does not prove that its first CI run necessarily fails. Subsequent rejection and release transitions encounter the bug.

**Correction:** In explicit CI mode, enforce structural transitions and event history, and report unavailable external decision evidence as a stated limitation. Keep missing external evidence fatal in the local gate. Demonstrate a legitimate rejection and release comparison, alongside invalid-transition negative controls. A live GitHub run is not needed to exercise this command locally.

### 9. The full demonstration fails on the clean committed revision

**Location:** `docs/audit/demo.ts:537–548`.

The second-clone setup unconditionally commits its staged tree. With revision 3 already committed and no dirty overlay, there is nothing to commit. Git exits nonzero before M1.

**Independent full rerun:** `bun run docs/audit/demo.ts --with-behaviour`, from a clean disposable clone of fffd656: **exit 1, 88 of 89 rows passed**. M1–M9 never execute; they are replaced by one failed setup row M. Other narrow scenarios and retained-evidence checks pass.

The earlier saved run used dirty-file overlays before the final commit. Its success does not show that the submitted committed script can reproduce the full sequence.

**Correction:** Reuse HEAD when there are no staged changes; make a fixture commit only when an overlay changes the tree. Run the complete demonstration from the final clean commit and retain the measured result.

Evidence: `evidence/demo-rerun.log`, `evidence/independent-demo.md`, `evidence/demo-review-notes.md`.

### 10. Several saved red results fail for an unrelated cause

**Location:** `docs/audit/batches/0/evidence/red-before-revision-3.md:79–89`; fixture handling in `docs/audit/demo.ts`.

The post-red command and package-ID changes were explicitly disclosed. Those compatibility adaptations are not evidence of concealment, and the corresponding r3 positive/negative cases independently work. However:

- After H1b publishes the bad fixture commit, H2a/H2b/H3/H5 report `Everything up-to-date`. Those pushes never exercise the release gate for their intended defect.
- E1–E4 fail because revision 2 lacks `browser-isolation.ts`, rather than demonstrating the old browser implementation reaching the test sink.
- The current fixture intentionally no longer writes r2's package-directory names; a reproducible comparison needs versioned compatibility handling.

**Correction:** Reset the throwaway remote between independent pushing cases, regardless of whether the preceding faulty implementation allowed a push. Run browser probes against the actual old mechanism, with an explicit compatibility adapter where needed. Retain the harness/adapter identity and each causal failure line. Do not count setup, missing-module or no-op-push outcomes as reproduced defects.

The saved totals are arithmetically reconcilable: the green header's 96/96 excludes the later successful Z row, giving 97/97; the red header's 62/95 similarly becomes 63/96. This is not a fabricated-count finding. Generate the header after adding Z so readers do not need that reconstruction.

## Complete handoff to Claude

```text
Codex reviewed batch 0 revision 3 at fffd6567ec0aceca2e6d34bd3ea4c8a16544c7f4.
Do not record Adam's acceptance or rejection from this review. His decision
must come from him. No publication or product fix is authorized by this report.

Keep the existing implementation, preserved ledger and verified migration
data. Do not start over or reopen the Option A/Option B design debate.

Read this entire report, including its evidence and the 13-point table:
/Users/adam/Documents/FLPSLLC Website Review/tmp/batch-0-r3-review-2026-09-18/review.md

The remaining corrections are:
1. Protect externally accepted fixes while their parts still say implemented;
   require authenticated part/batch transitions before removing assertions.
2. Enforce the exact declared migration values, not permission for a field type.
3. Match rulings.md to the complete owner decision and its item/part; no
   substring-based authentication.
4. Preserve complete ruling text or refuse overlong input before recording.
5. Block redirects from local requests to forbidden destinations before contact.
6. Require explicit partial:null and a valid nonempty complete site manifest.
7. Refuse all package integrity errors before recording acceptance.
8. In CI, distinguish unavailable local decision evidence from an invalid
   transition; continue to require that evidence in the local gate.
9. Make the complete demonstration run from a clean committed tree.
10. Repair the causal red cases: reset remotes between pushes, exercise the
    actual old browser mechanism and retain compatible harness versions.

The real submitted package's recorded checks and hashes passed independent
inspection. Data preservation, part-level independence, inherited ruling
queues, run identity, numeric rejection arguments and the four original
browser probes are working. Preserve them and their positive controls.

Before implementation, identify the exact files these corrections touch and
carry forward the existing review requirements. Wait for Adam's Go if this
corrective work has not yet been authorized. After implementation, provide
the clean final commit, immutable full package and causal demonstrations for
all ten findings. Report each as corrected, partly corrected or not corrected.
Do not claim acceptance or publish anything until Adam explicitly authorizes it.
```

## Verification limits

This was a review of batch-zero controls, their saved package and targeted execution paths, not a fresh full-product or legal audit. It included whole control-file reads, exhaustive machine comparisons of the ledger/source records/package hashes, an independent full demonstration run and targeted destructive-fixture probes. It did not include a second full package suite or a live GitHub run. Source citations refer to the reviewed commit; temporary fixture paths are retained for inspection but can later be cleaned by the operating system. Key logs and scripts were copied into the evidence directory beside this report.

The recommendation is based on reproduced failures, not on hypothetical malicious use of Adam's login or the explicitly disclosed --no-verify escape. The fake owner decisions were test fixtures standing in for valid approvals; the important failures are changes admitted beyond those decisions.
