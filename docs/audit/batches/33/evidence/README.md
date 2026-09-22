# Batch 33 evidence

`red.log` runs the new focused checks before product edits: 17/23 passed, with four blank/whitespace field cases, first/last-name error precedence, and unused EIN flag failing for the intended reasons. HMAC acceptance/refusal controls already passed; this is comparison hardening, not a demonstrated signature bypass.

`green.log`: 23/23 pass after implementation, without a server or network. The test imports the real two validators, the actual Square verification function and the renewal email generator. It supplies a fixture-only HMAC key in memory; production secrets are neither read nor used. Unknown HTTP access throws.

The full exact-commit review additionally runs actual form back/forward navigation with a required first-name check on Your information, exact final-button selection on the common and batch walks, all existing API/browser checks, and the focused Batch33 checks. Final exact-commit evidence and package identity are retained outside the repository in the review package.

All 398 prior ledger item objects were compared with the batch base and remain unchanged. The applied database migration SQL is unchanged. No agreement, Manual, Instructions, fee constant, renewal timing constant or production deployment setting changes.
