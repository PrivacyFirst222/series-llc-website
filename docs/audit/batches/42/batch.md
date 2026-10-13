# Batch 42 — third-series credit and two-series minimum

**This is an owner-requested feature, not an audit finding.** Source: Adam, 12 Oct 2026: "Forget the whole coupon code idea. Just make sure the third series credit works". The two-series minimum wording was approved by Adam ("Approve 1", 12 Oct 2026): "Add at least two series to continue." The lowercase joint heading is Adam's instruction "Lower case. Go" (12 Oct 2026). Authorization: Adam, 12 Oct 2026, "Go with option 1 followed by option 2. Go".

The three items are recorded by hand in `intakes/owner-third-series-credit-2026-10-12.json`, the same way the 22 Sep 2026 Completed Orders request was (Batch 36). No audit run produced them. Nothing here closes or reopens any prior audit finding.

## Objective ledger — 9 requirements
1. A paid package whose formation completes with exactly two series gets one credit toward a third.
2. The credit never expires and cannot be transferred. A training client never gets one.
3. The add-series window shows $0.00 while the credit is available; the portal says "1 included series remaining".
4. A credit-backed request costs $0, has no payment record, checkout or email, and goes straight to in progress where the office sees it on the board.
5. Two requests cannot use the same credit; a repeated identical request returns the same request.
6. The credit counts as used when the office fulfills the series, and never becomes available again.
7. Ordinary prices, the office's other screens and backups are unchanged; the backup includes and restores the credit table, and an older backup still restores.
8. An order needs at least two series (form and server), with the approved message.
9. The joint-holding heading in a new-series consent is lowercase.

Mapped to the named check "included third series credit" (39 checks: 1–7) and to the three replacement assertions in `batch.json` (8–9). The older checks that assumed one-series orders were updated as test support only, so they keep checking what they checked before.

## Older checks changed (test files only; no assertion weakened)
Running the full browser walk on the live site's code (c054050) showed seven walks already failing before this batch. The first full run of this batch also failed because the walks add one series and the form now needs two. Declared in `batch.json`, each with its reason:
- Needs two series now: `behavioral.ts`, `batch06-check.ts` (shared order fixture).
- Already failing on the live site: `batch01-walk.ts` (timing), `batch02-walk.ts`, `batch05-walk.ts` (the office upload is now two steps; one stale line about the removed unpaid-checkout row), `batch41-office-walk.ts` (test orders lacked a payment date; the steps for held item A2, the Unpaid checkouts tab, were removed on Adam's instruction "Yes. Trim it", 12 Oct 2026), and `ruling-scope-check.ts` (a control test whose temporary copy of the repository lacked the installed packages). `ruling-scope-check.ts` is a gate control; Adam sees it in the complete diff.
- Found after the first full run, also already failing on the live site: the offline test site cannot complete an office file upload since the 10 Oct 2026 upload rewrite (`offline-direct-upload.ts`, `browser-isolation.ts`, `behavioral.ts`); two walks that never paid their orders (`batch08-walk.ts`, `batch09-walk.ts`); fake servers that did not answer the new backups-attention request (`batch23-office-check.ts`, `batch28-portal-check.ts`, `chunk1-remaining-walk.ts`); a Manual check that looked for a check mark the renderer now draws as a shape (`batch25-manual-check.ts`); and a recovery check written before restored databases needed operator activation (`batch23-recovery-check.ts`). Adam sees each in the complete diff.
- `webapp/package.json` adds the entry point for the credit's checks and is declared as a control file.

## Not in this batch
The wording hook, `CLAUDE.md`, settings and `FAILURES.md` entries are released separately. The abandoned coupon work is not here.

USER WALK — a client whose formation just completed with two series:
1. Opens the portal and sees "1 included series remaining" in the services card.
2. Clicks Add a Protected Series, types the series name, and sees $0.00 and a Submit request button.
3. Clicks Submit request and sees the request listed as in progress, with no payment page.
Expects: the third series costs nothing, and the office sees the request on the board.

USER WALK — the office:
1. Opens Formations & Service Orders and sees the credit-backed series request.
2. Fulfils it by uploading the designation.
3. Returns to the client's portal and sees no credit remaining.
Expects: the credit is spent once, when the series is delivered.

USER WALK — a new customer ordering:
1. Opens the order form and reaches the Series step.
2. Adds one series and clicks Continue.
3. Sees "Add at least two series to continue."
Expects: cannot continue until a second series is added.
