# Batch 23 — current registered-agent notice recipient

Approved item 4, B5-RENEWAL-OLD-EMAIL. Product changes are limited to `webapp/server/renewals.ts` and `webapp/server/ra-office.ts`; the regression harness is `webapp/server/batch23-notices-check.ts`.

## Reading and implementation

Read both edited product files whole before editing: renewals.ts 170/170 lines; ra-office.ts 74/74 lines; total 244/244. The complete original files and the source promise at email.ts:187–199 are retained in sources-before.md. The promise is that confirmation makes the address the one where documents and notices are sent, and that an unconfirmed change changes nothing.

At each notice send, resolve the current clients.email through the order's client_id. This covers the renewal notice, resignation-due notice, declined-payment notice, renewal receipt, resignation receipt, and newly uploaded or existing resignation-copy email. Historical orders.contact_email is never rewritten. Existing Square customer/payment metadata remains outside this notification-only change.

Recipient lookup failures stay inside the original failure-handling boundary. An initial notice retains notice_pending/error for retry, and a receipt failure does not reverse a confirmed payment.

## Authoritative red and green

The identical harness against baseline 3577d25 produced 6/23 passing and 17 intended failing assertions (red-final.log). Against the repair it produced 23/23 passing (green-final.log). Assertion labels match exactly between runs.

The actual portal request/confirmation route and actual office override route change the address. Every notification order is created before the change; subsequent real jobs/routes use the current account address. An unconfirmed pending address still receives notices at the previous confirmed address. Historical order emails remain unchanged. Resignation PDF attachment bytes are checked, including resend of an already stored copy. Missing-recipient failure, retry after repair, confirmed-payment preservation and no outside network requests are covered.

The fixture proves E2E_OFFLINE with all integrations inactive before enabling its mock-only mail transport. Mail goes only to the intercepted Resend endpoint; no real provider or customer is contacted. The database and storage are temporary and removed after the run.

## Other evidence and limits

The focused typecheck passed (typecheck-final.log); targeted lint passed (lint.log). The parent runs the complete mandatory checks. Initial retained red.log used the wrong admin cookie and is not product-defect evidence; red-validated-fixture.log corrected that before product editing. Initial typecheck.log contains two harness typing errors subsequently corrected. Those preliminary files are kept for transparency and are superseded by the final logs above.

These are offline route/job reproductions with real SQL and storage. They do not prove delivery by a live mail provider. fixture-stderr.log includes the deliberately caught missing-recipient receipt error; the assertion proves the paid record remains charged.
