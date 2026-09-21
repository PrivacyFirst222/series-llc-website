# Batch 23 office UI and restoration entry evidence

## Result

The identical final `webapp/scripts/batch23-office-check.ts` harness:
- Baseline 3577d25: `red-final-v4.log`, 20/40 pass; 20 intended failures (16 office error/retry states, 4 restoration-entry states); no setup/runtime failure.
- Corrected tree: `green-final-v2.log`, 40/40 pass.
- Targeted ESLint and application TypeScript check: clean (`lint-final.log`, `typecheck-final-v2.log`).

The harness bundles the actual AdminDashboard, ServiceFulfillDialog, OrdersInProgress, and S-election questionnaire using installed esbuild, then operates Chromium against an ephemeral loopback fixture. Every API response is fake test data. Browser isolation blocks nonlocal destinations. No provider/account service is contacted.

Covered: failed email-list retrieval, failed individual-email retrieval, explicit Retry and successful recovery, successful-empty history, cached history failure, failed EIN detail retrieval, genuinely missing TIN after success, pending loading, cached EIN failure, all 21 assistant rows and progress preservation. The recovery scenario opens the actual S-election form with a pre-restore local draft containing both joint owners' stale last-four hints; it verifies truthful action/status, cleared hints, both required number prompts, retained nonsensitive answers, fresh numbers retained in page memory, and no SSN written to browser storage.

## Visual reading

Inspected 8/8 final browser screenshots in `green-final/` (four states, desktop and 375px) and 2/2 recovery-email screenshots. Office errors and Retry controls are visible; new retry targets are at least 44px high. Recovery email instructions match the new portal button and fit both widths. Email rendering uses the actual helper output retained by the recovery backend test and UTF-8, without clicking its link.

Existing limitations preserved: the email dialog's long heading crowds the mobile close icon; the S-election form has horizontal overflow at 375px. The latter is visibly identical in baseline `red-final/s-election-recovery-narrow.png` and final counterpart apart from corrected SSN placeholders. This scoped check does not certify the entire form's mobile layout.

## Instrumentation and intermediate work

The product's `sandbox=""` email iframe stays unchanged. Installed Playwright injects `if (navigator.serviceWorker)` when service workers are blocked; in that sandbox the probe raises a SecurityError. The exact error and anonymous injected stack are retained in both final logs as a separate instrumentation assertion; any other browser error fails. `playwright-service-worker-source.txt` records the installed source. Neither browser isolation nor iframe protection was weakened.

Intermediate logs are retained. Early harness errors were corrected, not counted as product reproductions: an assumption that initial-refetch Retry must remain visible instead of becoming Loading; a missing fixture `sElection.reason`; mistaking input values/placeholders for innerText; selecting the reopen button during the closing dialog's animation. The final exact harness was rerun red and green after these corrections. The first standalone email preview omitted the UTF-8 content type; `recovery-email-render-v2.log` is the corrected render. The temporary percent-encoded output directory created by using URL.pathname was removed after replacing it with fileURLToPath; no product file was affected.

Product source reading before edits: 2/2 files, 1,152/1,152 baseline lines. Governing approved proposal quoted in SOURCES.md. No ledger, batch work order, package wiring, Git state, dependencies or publishing commands were changed by this worker.
