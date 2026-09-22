# Batch 30 — explicit agreement selection

## Governing owner decisions
“Go. Approve all” approves the three presented repairs. Item3 correction: “The only tax classification for a series we permit is disregarded entity.” Approved wording: “We will apply for this protected series’ EIN as a disregarded entity.” No mention of the parent S election in that helper.

Existing Ruling N3.10: “generation order does not determine legal effect. No inferred adoption tracker.” The current amendment query uses `ORDER BY created_at DESC LIMIT 1`; the consent uses `savedOaAnswers`. Those are the two sources being replaced with the client's explicit selection. Existing clauses, voting thresholds, master text and tax law are not being rewritten.

## USER WALK — client amending an agreement
1. Opens Amend your operating agreement and selects a company agreement by its number and date.
2. Reviews the stored members/managers and confirms or corrects that agreement’s effective date.
3. Enters amendment text and generates the document.
Expects: the selected parties, even when a newer unused draft exists. If the required agreement is absent or not associated with the company, the form stops; it does not guess.

## USER WALK — client creating a series consent
1. Opens Consent & Series Exhibit and selects the agreement supplying the current parties.
2. Reviews members/managers and entity/joint signers, then confirms that they are current.
3. Generates the consent and exhibit using those stored parties.
Expects: unfinished questionnaire edits do not change the signatures. Reopening or changing selection requires a fresh confirmation.

## USER WALK — client requesting a protected series EIN
1. Opens the protected series EIN questionnaire.
2. Sees the approved disregarded-entity explanation.
3. Completes the existing questionnaire.
Expects: buying an S package for the parent never changes the series helper. Existing company and office behavior remains covered.

No acceptance, integration or publication is authorized by implementation Go. Necessary revisions within scope follow the standing instruction.
