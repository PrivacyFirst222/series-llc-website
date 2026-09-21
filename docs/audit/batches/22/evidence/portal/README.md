# Batch22 portal component evidence

Approved scope: B3-02 certification reset, B3-03 truthful email result, B3-05 support100 owners.

Source requirements from Adam's approved proposal:
- "Reset the certification whenever the form closes or a different application opens. Preserve the saved answers, but require a fresh certification for the displayed application."
- "Wait for the email service’s response. If the confirmation cannot be sent, keep retry available and display: 'We could not send the confirmation link. Please try again.'" Handle the old-address warning failure separately.
- Support up to100 owners consistently; prevent owner101 and explain the limit before unsupported entry.

Read before edits: OrdersInProgress.tsx728/728 lines; AccountCard.tsx199/199; OAQuestionnaire.tsx907/907; OaOwnersSections.tsx492/492. Related answer types, assets card, API helper, draft storage and browser isolation helper also read in full. No legal master or policy edited here.

`batch22-portal-check.ts` bundles the actual React components using esbuild, loads product CSS with only the remote-font import omitted, and exercises them in isolated Chromium against an ephemeral loopback API fixture. It does not contact live APIs, email providers, storage or client records. API-boundary/save/render-PDF checks run independently in server/batch22-check.ts.

Final red: `bun run webapp/scripts/batch22-portal-check.ts --source /path/to/audit-repair-group-1-2026-09-20/repo` (unchanged baseline53327cf).
Final green: `BATCH22_EVIDENCE_DIR=../evidence-portal bun run webapp/scripts/batch22-portal-check.ts`.

`red-final.log`:17/24 pass,7 intended failures: certification retained on same reopen/other application and enabled submit; failed old-address notice undisclosed; owner100 could append101, lacked capacity explanation, and suggestions could append101. The other17 positive controls already passed baseline. `green-final.log`:24/24 pass.

`harness-setup-first.log` retains a setup failure caused by the initial bundle fixture not defining import.meta.env. It is not counted as a defect reproduction. Other logs are intermediate runs before screenshot refinements; final logs use the same harness on baseline and repaired source.

Six screenshots show desktop and375px layouts for confirmation-send failure with retry, separate old-notice warning, and owner100 limit. These are component fixtures using real product CSS and system fallback fonts, not a live deployment.

React skill checklist applied: scoped derived certification state; hooks unconditional; no new dependency; owner limits shared with backend; capacity and warning messages have status semantics; existing draft answers preserved. Only four declared components and the focused script edited by the portal agent.
