# Event map — text verification record

The event map's gate (`docs/event-map.py`) proves every cited section EXISTS in
its form. It cannot prove the section's text answers the event — a cell can
point at a correctly-titled provision that says the wrong thing, and the gate
passes it. This file records the slower check: reading the full text of every
cited provision against its event, form by form.

Method: for each event, the cited provisions' complete text is extracted from
each master; forms whose extracted text is byte-identical are grouped and read
once, with the identity proven by comparison, not assumed. Scope is stated as a
fraction per tranche. Verdicts are the reviewer's reading; findings quote the
text they rest on.

## Tranche 1 — events 1–11 (rows in docs/event-map.md order) — 17 August 2026

**88 of 88 cells read (11 events × 8 forms). 87 verified. 1 finding.**

| # | event | verdict |
|---|---|---|
| 1 | The company establishes a new protected series | ok — 3.1 (consent; unanimous in multi forms), 3.5, 1.9 answer it in all 8 |
| 2 | A protected series acquires an asset | ok — 1.10, 8.2, 8.4, 8.5 answer it in all 8 |
| 3 | A protected series buys or sells real property | ok — 8.3 plus the statement-of-authority section (5.8/5.9/5.7 by form) |
| 4 | An asset moves between the company and a series | **FINDING 1** — see below |
| 5 | Someone disputes whether an asset is associated | ok — 8.2, 8.5, 3.3 answer it in all 8 |
| 6 | A company creditor pursues a series asset | ok — 3.3, 8.2, 8.5 answer it in all 8 |
| 7 | A protected series is dissolved and wound up | ok — 3.4 plus 11.1–11.2 / 14.1–14.2 by form |
| 8 | A protected series is asked to merge or convert | ok — 3.2(c) recites the bar in all 8; 5.4/5.5 add company-merger consent in the multi forms |
| 9 | The company sells substantially all of its assets | ok — 5.4(a) sole-member consent / 5.4(c)–5.5(c) all-member consent / 5.3 agency in the member-managed single forms |
| 10 | The company is dissolved and wound up | ok — 1.7 plus 11.3–11.5 / 14.3–14.5 by form; S-corp forms add the strictly-pro-rata sentence |
| 11 | The company has no members for 90 days | ok — 10.3/12.3 continuation-on-termination in all 8 |

### FINDING 1 — event 4's multi-form cells omit the approval clause

The cells for `mul scp mbr mbs` read `1.10 8.2 8.5` — the record-keeping side
only. But the provision that most directly governs the act itself is the
approval clause, and all four multi-member forms have one:

> **5.4(b) / 5.5(b):** "**cause any Associated Asset to become an Associated
> Asset of the Company or of a different Protected Series** — the consent of a
> Majority in Interest;"

A manager (or member) moving an asset between cells needs that consent before
the records questions in 8.2(c) ever arise, and a reader consulting the map for
this event would not find the consent requirement. The single-member forms are
correctly record-only: their 5.4 (sgl/sgs) has no re-association clause, and a
sole member's consent to their own act is not a meaningful gate.

**Fixed 17 August 2026, approved by Adam:** event 4's cells are now
`1.10 8.2 8.5 5.4` for `mul scp` and `1.10 8.2 8.5 5.5` for `mbr mbs`;
the four single-form cells stay `1.10 8.2 8.5`. Gate re-run, passes.

## Tranche 2 — events 12–22 — 17 August 2026

**88 of 88 cells read (11 events × 8 forms). 88 verified, 0 findings.**
30 of the 88 are `none` cells; every one carries its reason in the note, and
the three that are GAPs awaiting Adam's decision were already marked as such
in the map (13 administrative dissolution / reinstatement; 18 single-member
bankruptcy; 19 single-member charging-order silence).

| # | event | verdict |
|---|---|---|
| 12 | The company misses its annual report | ok — 1.9 filing duty in all 8 |
| 13 | The company is administratively dissolved | ok — `none` ×8, marked GAP in the map |
| 14 | The registered agent changes or resigns | ok — 1.6, 1.9 in all 8 |
| 15 | A member dies | ok — TOD section (4.6/4.11/4.5) plus 10.1, 10.3, 12.1 in multi forms; 9.3 adds the eligible-shareholder limit in S forms |
| 16 | A member becomes incapacitated | ok — incapacity section plus the dissolution section's no-dissolution sentence, all 8 |
| 17 | A member divorces | ok — Involuntary Transfer definition + 10.4 option in multi forms; `none` with reason in single forms |
| 18 | A member files bankruptcy | ok — 2.8/2.9, 11.1–11.3, 10.4 in multi forms; `none` ×4 marked GAP |
| 19 | A creditor obtains a charging order | ok — 10.6 in multi forms; `none` ×4 with the s. 605.0503(4) decision flagged |
| 20 | A member wants to sell to an outsider | ok — 10.1, 10.3, 10.5 in multi forms; 9.3 in single S forms; `none` with reason in sgl/sgm |
| 21 | A member gives an interest to family | ok — 10.2 in multi forms; `none` with reason in single forms |
| 22 | A member wants to withdraw | ok — 13.1 in multi forms; `none` with reason in single forms |

Remaining: events 23–66 (44 events, 352 cells) in tranches 3–6.
