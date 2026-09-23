# Batch 36 — office work queues

Source: Adam requested “one more tab at the top to hold completed orders” and “use the third row for work that happens once the articles and series designations are both filed”. The approved proposal identifies this as the third column. Authorization: “Go. Implement this”.

## Objective ledger — 7 requirements
1. Add Completed Orders top tab, retaining access to details and documents.
2. Active board: New Orders, With The State, Post-Filing Items.
3. Post-filing means formation/designation filing complete, with an ordered deliverable still owed.
4. All documents/services delivered moves automatically to Completed Orders, including direct completion after filings.
5. New purchases by existing clients return to green New Orders as before.
6. Search and pagination reach all orders. Filter queues before applying page limits. Associate services to the correct company, not the current page's newest company.
7. Loading or errors must not falsely mark orders complete; refresh both views after fulfillment.

USER WALK — office opening today's work:
1. Opens Formations & Service Orders and sees only unfinished work.
2. Records filed documents and sees remaining services under Post-Filing Items.
3. Finishes those services and finds the order under Completed Orders.
Expects: no completed backlog hiding work; complete history remains available.

USER WALK — office locating an old completed order:
1. Opens Completed Orders.
2. Searches by company, contact name or email, or changes page.
3. Opens the order and sees its record; a later purchase returns the company to green New Orders.
Expects: every order remains reachable, with no completion inferred from unloaded services.

Implementation is isolated from the sealed Batch 35 package. This authorization does not publish anything or approve unrelated Claude review findings.

Revision 1 was superseded under Adam's standing authorization for necessary revisions. Revision 2 adds docs/facts.md to the declared files so its old Complete-column assertions follow the approved new workflow. No requirement, product decision, or test was removed.

Revision 3 declares the Batch05/10 controlled-response browser fixtures: add work_stage and board_order_id, move completion loading/error checks into Completed Orders, and assert the new count/pagination wording. All prior substantive date, service, error and record-access checks remain.

Revision 4 includes the third nonempty controlled Office board fixture, Batch02, in that same API-shape update. Its assertions are unchanged. An inventory of all scripts mocking /api/admin/orders found no other nonempty board fixture.
