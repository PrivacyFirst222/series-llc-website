# Batch 26 — final two internal statutory-note corrections

Adam approved both explained changes: **“Go. Approve all”**. Approval permits implementation, verification and local commit. Publication, integration and acceptance remain deferred. This continues the completed Batch 25 commit in a separate local checkout with no remote.

## Objective ledger — 6 requirements

1. Original-articles manager-managed notice is distinguished from the amendment-specific 90-day proviso.
2. Consenting-person liability requires both an unlawful distribution and failure to comply with s. 605.04091; preserve company-type distinctions.
3. Include the express allocation exception and separate knowing-recipient liability; retain the two-year action limit.
4. Change only the two approved summaries; preserve other notes, legal masters, public wording, prior rulings and existing fixes.
5. Freeze exact replacements before editing; replay them through the existing guard and demonstrate they fail on the baseline and pass after the correction.
6. Ordinary hooked local commit and full exact-commit review; no publication or Dropbox writes.

## Governing sources read before editing

Read all 590/590 lines of chapter-605-notes.md. Read 3/3 complete named statutory sections (605.0103, 605.0406 and 605.04091) from Online Sunshine's browser-rendered 2026 Florida Statutes on 21 September 2026. This is not a fresh verification of every historical statement or statute in the 590-line notes file.

Section 605.0103(4)(b)4:
> Declaration in its articles of organization that it is manager-managed in accordance with s. 605.0201(3)(a); however, if such a declaration has been added or changed by an amendment or amendment and restatement of the articles of organization, notice of the addition or change may not become effective until 90 days after the effective date of such amendment or amendment and restatement;

Section 605.0406(1):
> Except as otherwise provided in subsection (2), if a member of a member-managed limited liability company or manager of a manager-managed limited liability company consents to a distribution made in violation of s. 605.0405 and, in consenting to the distribution, fails to comply with s. 605.04091, the member or manager is personally liable to the company for the amount of the distribution which exceeds the amount that could have been distributed without the violation of s. 605.0405.

Section 605.0406(2):
> To the extent the operating agreement of a member-managed limited liability company expressly relieves a member of the authority and responsibility to consent to distributions and imposes that authority and responsibility on one or more other members, the liability in subsection (1) applies to the other members and not the member that the operating agreement relieves of authority and responsibility.

Section 605.0406(3):
> A person who receives a distribution knowing that the distribution violated s. 605.0405 is personally liable to the limited liability company, but only to the extent that the distribution received by the person exceeded the amount that could have been properly paid under s. 605.0405.

Section 605.0406(5):
> An action under this section is barred unless commenced within 2 years after the distribution.

Sources:
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0103.html
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0406.html
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.04091.html

The exact before/after text and continuing regression assertions are in batch.json. The note remains an internal summary, not an exhaustive substitute for the statute. No customer document is regenerated for this edit.

## USER WALK — developer consulting internal statutory notes
1. Opens chapter-605-notes.md to check manager-managed notice or distribution liability.
2. Reads the original-articles/amendment distinction and both conditions for consenting-person liability.
3. Follows the statute references for the full rule and exceptions.
Expects: the internal summary no longer supplies either incorrect shortcut. Visitors, clients and office users see no screen or document change.

## Return point

Base commit: b5eb58497f8e6f79aa847b224cc0b797bf7c8e29. An external Git bundle preserves the complete baseline history. The prior Batch 25 checkout is unchanged. No remote is configured in this checkout.
