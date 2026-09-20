# Audit mechanism revision 1

Owner authorization: “Ok. Create the audit mechanism and then use the new error tracking system. Hopefully that will be useful”. This authorizes building the previously proposed audit workflow and its tracking connection. It does not accept or publish it or authorize product repairs.

Governing requirements, quoted from the owner-approved plan: “exact coverage”; “Account for every original finding”; “Exercise the product”; “Inspect the delivered documents”; “Recheck every reported defect”. Existing ledger source: `for (const a of after.items) if (!before.items.some((i) => i.id === a.id)) out.push(...)` currently refuses every new record. The intake addition must preserve that refusal except for exact, retained, independently rechecked audit evidence imported as open work.

Scope: pin a run to a commit and hashes; exact whole-file receipts and reported coverage; one outcome for every prior part; owner decisions remain authoritative; required runtime, comparison and rendered-document evidence; source-backed findings with separate replacement review; one consolidated report; checked append-only import without rewriting original findings or approving repairs. Full reading remains a reader attestation: automation proves delivery and coverage, never comprehension. No tests or claims of human approval may be manufactured.

USER WALK — Adam reviewing an audit:
1. Opens the report and sees the exact commit, scope and completion fraction.
2. Sees each previous item reconciled and each new defect with evidence and a proposed fix.
3. Reviews proposed fixes before they enter implementation batches.
Expects: incomplete work cannot be called complete, retained decisions stay separate from defects, and duplicate imports are refused.

USER WALK — Auditor:
1. Initializes a fresh run from the committed candidate and receives assigned files and all prior parts.
2. Reads complete line ranges, records evidence, rechecks findings, and runs the completion gate.
3. Imports a completed checked report through the ledger intake command.
Expects: missing files, wrong counts, missing prior parts, unsupported findings and duplicate imports are refused; imported items start open and no publication occurs.

Instructions: 8 of 8 covered — frozen candidate; complete source reading; full prior reconciliation; runtime evidence; delivered-document review; owner rulings; verified findings and duplicate prevention; no fixes or publication without the separate owner workflow.
