# Batch 07 — Registered agent payment, renewal and cancellation

Authorization: Adam, 19 September 2026: “Go. Implement the changes”. This approves implementation of all 15 review units (19 records), including optional 45/144, with the decisions below. Acceptance/publication are separate. Return point 00628225d59793891b00ab4aebe23468b104cdbd remains in the untouched Batch 06 clone and ../return-point.bundle.

## Governing sources quoted before implementation

- Adam: “Keep it annual billing. Add that if they change resident agents mid year, no refund is given”.
- Adam: “Don’t have a prepaid card warning unless they try using one to purchase a package where we serve as resident agent.”
- Adam: “If they don’t check the automatic renewal and leave a card on file, we won’t serve as resident agent”.
- Adam: “If a credit card is declined, they should be able to use a different card right away. Even if they use the same card, maybe a bank error, why make them wait 2 days.” Customer retry is immediate; scheduled automatic retries remain spaced.
- Adam: “Start when Agent appointment takes effect”.
- Adam: “We will resign on the due date if they cancel on time but don’t replace us”.
- Adam: “Just state that the $99 represents state fees and processing fees without giving a breakdown”. This replaces the earlier full-annual-fee characterization for timely cancellation without replacement proof. No renewal service is sold in that case.
- After Adam requested email, the reviewed correction was: “We will email you a copy of the resignation and mail the notice required by Florida law.” Adam then gave Go.
- 2026 s.605.0115(2), Online Sunshine, opened whole in browser: “must promptly mail a copy”. Subsection (3): termination on the 31st day after filing, or earlier state filing of a replacement. Filing/submission and effectiveness are distinct. https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0115.html
- 2026 s.605.0213(8)-(9), opened whole: $85 resignation filing for an undissolved LLC, $25 for a dissolved LLC. Client explanation gives no false uniform state-fee breakdown. https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0213.html
- Square delayed capture, opened in browser: “autocomplete to false to get payment approval, but not charge the payment source”. Capture only after eligible-card storage succeeds; cancel authorization on ineligible card/save failure. https://developer.squareup.com/docs/payments-api/take-payments/card-payments/delayed-capture
- Square retry guidance, opened in browser: “Wait at least 24 hours before retrying.” This is guidance for card-on-file retries, not a two-day customer lockout. https://developer.squareup.com/docs/cards-api/manage-card-on-file-declines
- Square charge/store guide, opened in browser: card details stay with Square; Web Payments SDK tokenizes. https://developer.squareup.com/docs/web-payments/sca-charge-and-store-card-on-file

## Objective ledger (15/15 review units)

1 Annual billing; no midyear-agent-change refund; timely cancellation/no proof produces one $99 resignation charge on renewal date, not another year or monthly proration.
2 Client-facing cancellation timing explicitly says notice >=30 days, replacement proof by renewal date.
3 No upfront prepaid warning; attempted prepaid use rejected only for our RA purchases.
4 Consent plus successful eligible-card storage before paid RA fulfillment; ordinary checkout remains available for other-agent purchases.
5 Consent errors map back to Registered agent.
6 Office shows permission separately from unknown card state.
7 Company-specific cancellation display; no account-level cancellation chip on RA tab.
8 Readable card-storage failures.
9 Notice 60 days before renewal, cancellation cutoff 30 days, automatic charge 15 days. A late/failed notice blocks automatic charge and creates an office issue, not a fabricated sent date.
10 Attempts counted once; stable identity on retry after uncertainty; immediate customer payment with eligible card; no concurrent manual/automatic duplicate charge or false extra retry promise.
11 Receipts say received for client payments; resignation receipts never promise another year.
12 Formation completion date and renewal date survive replacement uploads.
13 Office records actual appointment-effective date, including existing LLCs. No default from upload time or old company formation. Anniversary is calendar-based, with leap-day clipping.
14 Notice pending until required email/link work succeeds; failures retried, successful email submission distinguished from delivery.
15 Terms general provisions apply to each provider, service-specific provisions to relevant provider. Read all 182 lines of Terms before edits; section references reviewed in the same full document.

## Operational workflow

State filings are performed by the office, as formation filings already are. The daily job creates a resignation task on the due date; it never invents submission. Office records actual submission, uploads the resignation copy for the client's portal/email, records mailed statutory notice, and records the state's filing date to calculate effectiveness. Replacement proof is retained with the company and ends future renewal billing. The client is shown actual status. No automatic Sunbiz filing API is assumed.

USER WALK — client purchasing agent service:
1. Selects our agent service and agrees to automatic renewal and keeping a card with Square.
2. Enters card details in Square's secure payment fields; an attempted prepaid card is refused with a specific message.
3. Completes payment only with an eligible saved card. A decline offers immediate retry or another card.
Expects: no completed service order without consent/card, no two-day customer lockout, no duplicate charge.

USER WALK — client cancelling:
1. Opens Registered agent service under the correct company and reads its actual renewal date.
2. Gives notice at least 30 days before renewal and emails replacement proof by renewal.
3. If proof is missing at renewal, sees a $99 resignation charge and resignation status, rather than a new paid year.
Expects: annual billing, no midyear replacement refund, email copy plus statutory mailed notice, accurate filing/effective dates.

USER WALK — office managing the appointment:
1. Opens the company's order and records the actual agent appointment-effective date.
2. Reads company-specific card consent, card issues, renewal and cancellation dates, and due resignation tasks.
3. Records verified replacement proof or the actual resignation submission, uploads its copy, records mailed notice and state filing date.
Expects: replacement uploads do not reset dates; pending tasks are not represented as completed filings.

All user decisions above are retained. No test-data cleanup, legal-master edits, acceptance, integration or publication is authorized here. Code changes receive full-diff review; assertions cover recorded regressions, not every possible defect.

## Verification notes

- The card gateway requires `SQUARE_APPLICATION_ID` in addition to the existing Square access token and location ID. The review deliberately disconnects all external services. No live or real-sandbox payment, real email, or state filing is claimed by these tests.
- Synthetic provider tests exercise the real payment functions through intercepted Square HTTP requests, including lost capture responses, concurrent submissions, and prepaid cancellation before capture. Real-command offline routes also verify failures and immediate retry.
- The office can record cancellation received by email with its supporting reference. Statutory mailing is an office action recorded separately from the emailed PDF; a database task is never called a submitted resignation.
- API webhook recovery resumes known completed agent payments through the same persisted attempt; uncertain payments retain their identity.

The staged guard correctly refused the first commit attempt: `docs/facts.md` was declared as content, although the system classifies it as a control. The optional new fact-ledger entry was removed; existing ledger facts remain true. The frozen work order, hash, and authorization were preserved. The new policy is recorded in Adam's authenticated ruling 28, the shared billing constants, the Terms, and this batch's durable assertions. No gate or approval record was weakened.
