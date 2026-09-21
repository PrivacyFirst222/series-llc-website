# Approved sources and reading scope — Batch 23 items 3 and 5

Adam: “5. Go. Approve all” approved the five-item Batch 23 proposal.

Item 3: “Carry the existing document number forward. If the office supplies a corrected number, validate and save that instead. Apply this consistently whether the client or our office signed the Articles.”

Item 5: “Mark the package as needing taxpayer numbers re-entered, show that action in the portal, and send an automatic email directing the client there. Also recognize this condition when the EIN arrives. Keep temporary taxpayer numbers excluded from backups.”

“No existing test-data backup cleanup” remains in scope.

Read before product edits: routes-admin.ts 1575/1575 lines; restore.ts 42/42; OrdersInProgress.tsx 731/731; ServicesCard.tsx 524/524. Read route implementation of S-election submission at routes-portal.ts 2256–2429, its stored-details contract 534–558 and submission schema 676–755; these supporting sections are not claimed as a whole-file reading. Governing project CLAUDE.md 441/441 and webapp/CLAUDE.md 206/206 read. No legal wording or statutory claim changed.

Consumer requirements: preserve saved Florida document number on Articles replacement; validate a provided correction before replacing documents; preserve statement consistency for service-signed Articles. After restore, missing temporary SSNs must not leave a saved S election claiming only an EIN is missing; preserve nonsensitive answers, explicitly ask for SSNs again, notify automatically, and regenerate only after actual re-entry. Finished/cancelled/deleted documents must not be reopened. No SSN in notifications or database backup.
