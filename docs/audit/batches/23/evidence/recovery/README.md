# Batch 23 recovery and Articles evidence

Final harness: `webapp/server/batch23-recovery-check.ts`.

- Final green `green-final.log`: 25/25 passed.
- Identical final harness against clean archived baseline 3577d25: `red-expanded.log`, 8/25 passed; 17 intended defect assertions failed. Every row ran; no fixture/setup error contributed to these 17 failures.
- Initial red attempt in `red.log` had a fixture error because sessions are deliberately absent from backups. Fixed by authenticating with fresh sessions in the restored database; `red-final.log` then completed 23/23 probes before production edits (8 passed, 15 intended failures). The expanded final baseline was re-executed after adding two parent-review probes.
- A first shell attempted to write the test from the wrong current directory and wrote nothing. A first disposable archive extraction used a Python argument unavailable in the host Python; it failed before execution and the temporary directory was removed. Neither is counted as defect evidence.
- Existing local eslint binary checked all six edited/new product files plus the new check script: no diagnostics in lint.log. Existing TypeScript app check: no diagnostics in typecheck.log. An initial eslint invocation from repository root lacked webapp/eslint.config.js discovery; rerun from webapp passed. No dependency install/download.

The harness proves offline mode, runs real registered Hono routes with fixture sessions, uses disposable PGlite/storage/mirror directories, and replaces only the external mail transport with a fake accepting/refusing sink. Unexpected network destinations throw. Actual complete backup is restored into two empty databases: successful mail transport and refused transport. The latter reports restore success with failed notification counts, leaves the portal action available, and retries the email when the EIN arrives.

Both Articles signing paths preserve the old number, accept a correctly shaped replacement number, reject a malformed replacement without document writes, and expose the correct number in the office response. The office-generated Statement agrees with the replacement Articles.

S-election checks include never-generated pending packages; joint owners with both numbers missing; unchanged completed/cancelled/deleted/unstarted orders; current email recipient; no SSNs in messages; independent company isolation; exact missing-SSN validation; direct EIN-arrival recovery without a restore marker; successful full submission after re-entry; actual encrypted stored PDF envelope and authenticated PDF download. Temporary questionnaire secrets remain absent from backup; no old test backups were cleaned.

The browser agent separately exercises the actual portal recovery card/form and renders recovery-email.html, including stale browser-draft last-four hints. `green-final/restored-portal.json` is the real response retained from the restored fixture.

Scope limitation: a refused email is retryable on the later EIN-arrival event and the portal action remains available. This change does not add a new general email delivery/retry queue or alter previously completed document retention. Existing DB availability failures can still interrupt the restore procedure; the email-provider failure itself is handled separately and does not fail restoration.
