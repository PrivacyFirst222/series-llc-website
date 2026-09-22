# Batch 28 verification

Implementation remains local and unaccepted. No publication or integration is performed by these tests.

## Targeted evidence

- `red/runtime.json`: the eleven named assertions fail against unchanged commit 00663979fc6559eda50d3de9317f42a52de46953 with only the test file copied in. Each label has its observed result. These are expected failures; the fixture itself exits successfully after recording them.
- `green/runtime.json`: eleven named assertions pass against the implementation. Tests use real Hono routes, a fresh PGlite database, disposable storage and a local Dropbox mirror. The environment proof must report offline before fixtures are created.
- `browser/browser.json`: twenty-three assertions using actual portal/office components in Chromium. Most API responses are controlled local fixtures. One complete authenticated browser-to-route-to-database round trip verifies actual card persistence, unchanged renewal date and no payment; broader persistence and failure paths are covered by the server tests. The SDK-contract probe substitutes a local Square object, verifying STORE intent without contacting Square. Desktop and narrow screenshots accompany the results.

A01 restores to an empty database after simulated primary storage loss, including a deleted document whose mirror file is still present. It also refuses a missing independent journal. The baseline demonstrates a revived deleted document.

A09 injects a storage failure and actual database trigger failures on INSERT documents and UPDATE service_orders. Failed transactions preserve the prior usable package and clean up staged storage. Successful replacement preserves the original fulfillment clock, encrypts the new package, associates its company, retires the prior copy, and refuses a stale second replacement. The baseline's UPDATE failure leaves a second client-visible document.

A10 covers missing consent, unauthenticated and foreign-company requests, prepaid rejection, replay, concurrent pending updates, stale completed replay, unchanged anniversary, and lost provider response. The production Square path runs with a fetch double accepting only /v2/cards; its retry payload remains identical even after account details change. No Payments endpoint is called.

## Limits

Email acceptance is not inbox delivery. Square and Dropbox provider transport is not exercised against live accounts. The independent deletion journal must survive separately; loss or corruption of that journal requires recovery and is refused, not treated as an empty deletion history. Previously completed test-data backups are not cleaned up. No legal master wording is changed in this batch.

## Work-order correction recorded

`proposed-revision-2.json` preserves the eleven approved product repairs. It declares the two obsolete 61/60-day test labels replaced by accurate 71/70-day labels, and updates the old item 194 fixture from a 30-day reminder/cancellation gap to the approved 40-day gap. Item 194 becomes the fifteenth tracked entry, preserving its exact prior fix through the existing replacement workflow. Its helper file is explicitly declared. No existing revision snapshot is edited. The proposal is retained as evidence. Revision 2 is now authorized and implemented under Adam’s standing revision instruction, with normal external decision records.

## Full command outcomes

`full-check.log`: complete check command exit 0, including 759 server assertions, unit checks, lint, typecheck, facts and document-consistency checks.

`broad-walk.log`: complete behavioral command exit 0; main walkthrough 1,307/1,307, all supplemental suites successful, Batch 28 browser 23/23.

`guard-pending-revision.log`: historical expected refusal when the work order was revision 1 and fixes were assigned. Four messages concern already-approved replacements awaiting their implemented records; the other three concern the omitted timing-test declarations. The proposed revision and in-memory static replay are separate from actual authorization.

The actual revision-2 guard subsequently passed: 375 records, 349 recorded fixes across 215 product files.
