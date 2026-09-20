# Batch 20 revision 1

Adam: “Go - approve all”, approving the full Batch 20 proposal: thirteen cleanup units, two existing resolutions recorded (220 and 221), notification options preserved (187:notify-options). Twenty parts from seventeen source records are recorded by this batch; the notification decision remains an owner ruling rather than a claimed deletion.

Publication remains deferred. No acceptance is inferred. Full-history return point is the previous batch commit 29d7b470bcedcd03abe4842f171fb624f3e497ff.

## Governing behavior and preserved decisions

- The asset list is the source of truth: `members.forEach((m, i) => { m.contribution = capital.memberContributions[i] ?? "$0"; });` and `contributionToCompany: capital.memberContributions[0] ?? "$0"`. Remove obsolete questionnaire inputs, never these output fields or calculations.
- The portal uses `company.raRenewalDate` and `company.raCancellationRequestedAt`; account-level duplicates are removed. Existing tests move to the company endpoint, preserving the same behavioral expectations and their labels.
- Owner retained the notification options; existing `notify` requests, checkboxes and tests remain.
- Earlier billing work already removed the old prepaid-card email and renewed-query redirect. No replacement feature is added.
- Delivered encrypted EIN and S-election documents remain under client-controlled retention. The fourteen-day editing window and active-questionnaire purge remain.
- Applied database migrations, legal masters, Word files, prices and public policy are unchanged. No fake-data cleanup.

USER WALK — Client using the operating-agreement questionnaire:
1. Opens the selected company's questionnaire and sees saved owners and assets.
2. Edits assets and allocations, then generates the agreement.
3. Reads contribution amounts derived from the asset list.
Expects: identical calculations and saved answers, with obsolete invisible fields discarded.

USER WALK — Client checking registered-agent service:
1. Selects a company in the portal.
2. Reads that company's renewal date and cancellation status.
3. Uses the existing service actions.
Expects: company-specific facts and unchanged behavior; the internal refusal accurately describes a company that did not buy the service.

USER WALK — Office processing orders:
1. Searches or sorts either client tab.
2. Opens an order card and its service orders.
3. Uploads documents and uses existing notification options.
Expects: the same visible information and actions, without unused queries or unreachable rendering alternatives.

## Verification

No old test label is removed. Old account-field assertions query the company endpoint the portal actually uses; the dead blocked flag is replaced by an absence assertion while retaining management/template checks. A schema/capital regression probe demonstrates that old answer fields are stripped without changing actual assets and computed contributions. These named checks must expose their intended defects on the prior product. The full mandatory review, prior assertions, exact diff and preserved records must pass. Code within declared files is subject to complete-diff review.

## Instructions carried forward

6 of 6: implement the approved scope; acknowledge and preserve exclusions; do not request a second implementation confirmation; preserve previous fixes and rulings; verify and commit with the installed controls; defer acceptance and publication.
