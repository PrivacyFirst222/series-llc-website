# Batch 14 — approved implementation

Adam approved the other 16 review units, then said “Go” following clarification of item 5. Includes both optional corrections 138 and 257. Implementation only; package acceptance and publication remain separate. Base is committed Batch 13; pending separate Batch 11/12 work is not included.

## Governing sources read before editing
- Adam: “5. I don’t understand. The rest I approve”, followed by “Go”. Item 5 clarification: S-agreement consent warning adds Article 9; ordinary agreements retain Article 8 warning.
- 2026 Florida Statutes s. 605.2201(3): “A protected series is established when the protected series designation takes effect under s. 605.0207.” Read complete sections 605.2201, 605.0207, 605.2202 and 605.0102 on Online Sunshine. The latter includes oral and implied operating agreements in its definition.
- All eight masters' Series Exhibits and asset schedules: five blank asset rows; no separate Date line on exhibit adopter blocks; multi-member initial-assets row says “Member(s)”. Consent member signatures retain their Date lines.
- S-master special-terms limit: “may not vary Article 8, Article 9, or the provisions of the Act that cannot be varied”. Ordinary counterpart limits Article 8 and nonvariable statute provisions.
- Current generator incorrectly selects prior created_at across account; the agreement itself names the predecessor by its date. It already supports generic supersession when the date is unknown.

## Approved behavior
First versus amended/restated depends on the client's answer about adoption (written, oral or implied), never generation count. For amended/restated, client identifies a generated agreement of this company and confirms its effective date, or identifies an outside agreement/date, or chooses undated/date unknown. Unknown dates use the existing generic supersession recital. Generated status labels describe generation order only. Manager-managed forms permit editing, adding and removing managers with each entity's signer attached to that manager; formation records are not changed. Member-managed forms remain member-managed. Series consent uses the same edited manager list; amendments use the stored generated agreement inputs.

USER WALK — client correcting a draft or replacing an adopted agreement:
1. Opens the operating-agreement questionnaire for the selected company.
2. Answers whether the company has adopted an agreement, and identifies the predecessor if it has.
3. Updates answers and generates the PDF.
Expects: an unused draft remains a first agreement; adopted predecessor uses the client's selected company's effective date, never generation time. Badges identify generation order, not legal effect.

USER WALK — manager-managed company:
1. Opens the operating-agreement questionnaire and sees managers seeded from formation or saved answers.
2. Edits, adds or removes a manager; supplies each entity manager's human signer and title.
3. Saves, reopens and generates the agreement, then its series consent.
Expects: edited managers and their own signers appear consistently; state filing records remain unchanged.

USER WALK — client adding a series:
1. Opens Consent & Series Exhibit for the selected company's series order.
2. Sees the full filed name and extracted identifier, blank contribution explanation, and applicable Article 8/9 warning.
3. Chooses Prepare the consent and opens the PDF.
Expects: matching title/footer, None for blank contributions, five asset rows and master-matching exhibit signature/date presentation.

## Verification scope
17 review units, 18 parts, 17 source records. Real API and browser probes plus rendered consent/agreements, company isolation, save/reopen, all four consent management/member variants, and full mandatory review including before/after regression checks. No changes to the eight operating-agreement masters; no backup cleanup; no acceptance or publication.
