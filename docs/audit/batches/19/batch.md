# Batch 19, revision 2

Adam: “Go. Approve all”. This applies to the clarified scope: preserve the manager-managed Articles sentence used by the office; remove only the unused member-managed alternative. Leave review item 12 (finding 109) unchanged as recommended after his question.

14 approved review units, 16 parts, 15 source records. Publication remains deferred until all batches. No acceptance is recorded.

Governing source for item 2: Adam: “That is the language that will be added to the articles of a manager managed LLC. But we do that in the office”. Existing filing sentence retained verbatim: “Pursuant to Florida Statutes Section 605.0407, the company is or will be manager-managed.”

The office continues copying that sentence from the filing sheet into the Articles. No legal text or policy is rewritten. Formation cleanup does not remove the portal operating-agreement ownership or contribution features. The historical office summary may still display old percentage data. No database cleanup.

USER WALK — Client completing the formation order:
1. Opens the order form and sees only applicable screens in the sidebar.
2. Chooses formation/conversion, management and agent options; progress counts those screens.
3. Reaches Certify & sign at 100%, continues to payment, and sees the real payment confirmation afterward. Saved drafts and Back/Edit navigation still work.
Expects: accurate progress; no fictitious submission screen; unchanged required fields and checkout.

USER WALK — Office preparing a manager-managed filing:
1. Opens the paid order and its filing sheet.
2. Copies the existing manager-managed provision into the Articles.
3. Reads the client's exact-name instruction and acknowledgment in the order summary.
Expects: the approved language and consent remain available; no duplicated consent flag.

## Verification
Complete existing mandatory review, earlier assertions, browser order journeys and exact stored-payload comparisons. Add red-before-fix checks for progress and canonical exact-name consent. Static assertions protect the recorded housekeeping deletions. Remove only the three obsolete formation-percentage unit assertions named in batch.json; existing portal ownership tests remain. Code changes within declared files require full-diff review.

## Revision 2 authorization and correction

Adam explicitly directed: “Reject Batch 19 revision 1; proceed with revision 2.” Revision 1 is retained as rejected, with its original frozen snapshot. Revision 2 excludes finding 104: the address component's blur callback is used by the operating-agreement questionnaire to check owner addresses. Member email and phone fields also remain because the formation form uses them to prefill and reuse people. No original audit finding is rewritten.

The one-line facts-ledger dependency correction removes only the obsolete location pointing to the deleted submission screen. No fact or approved wording changes. Finding 113's assertion now matches the actual comment whitespace.
