# Batch 15 — owner decisions, voting, transfers and manager authority

Adam approved all 15 review units with “Go - Approve all” after confirming that a 60% owner cannot override unanimous approval. Implementation only; acceptance and publication remain separate. Base: 47fc704, the tested but not yet accepted Batch 14 implementation. No earlier batch is marked accepted or released by this work.

## Governing sources read before edits

- Four multi-member masters, §6.2: “Upon the approval of a Majority in Interest”; §2.9 (manager-managed) / §2.10 (member-managed) defines this as “more than fifty percent (50%) of the Percentage Interests then held by Members”. Non-admitted transferee interests are excluded.
- All four multi-member forms §12.1: “only with the written consent of **all** Members” except TOD and permitted family transferees. §4.11 requires a written agreement to be bound plus “written consent of a Majority in Interest of the Members other than the deceased Member”. §10.2 separates family transfer from admission.
- Single-member S form §10.1 is Admission; §12.1 is Amendments. The generic admission-section label avoids a wrong variant reference.
- Member-managed forms §5.8: “has no authority beyond that expressly conferred by this Agreement or by a Majority in Interest”. It also states the Administrative Member is not a manager.
- Multi-member §5.4(f)/§5.5(f): debt “in excess of $[THRESHOLD] in a single transaction or series of related transactions, or guarantee the obligation of any person” requires “the consent of **all Members**”. The separate express-written-instrument rule for cross-series guarantees remains.
- All four multi-member §13.2: failure to obtain the required vote to approve or reject, continuing for 60 days after written notice; initiating member at least 25%; subsection (e) excludes unanimous-consent matters where the Act expressly permits withholding consent. No assertion that every unanimous decision triggers the clause.
- 2026 Online Sunshine, opened in the browser in this review conversation: s.605.0202(5) addresses filed information that “became inaccurate due to changed circumstances”; s.605.2107(1)(i) permits varying “the manner in which a series limited liability company approves establishing a protected series”; s.605.2201(1) sets the unanimous default; s.711.502 begins “Only individuals” and excludes tenants in common; s.605.0502(1)(c) says the transferred economic interest does not entitle its recipient to management.
- Full source reading before editing: owners-manual.md 536/536 lines; oa-instructions.md 75/75 lines. The approved passages were checked against the referenced agreement sections. Other known audit findings remain pending in their assigned batches; this is not a full legal recertification of the Manual.

## Scope and consistency

17 source items, 17 parts, 15 review units. Exactly declared replacements in eight product source files; fact ledger update; generated Word outputs and API bundle. Matching Manual passages on deadlock and administrative authority, and transfer-help text in the Instructions/Manual, are corrected together. No operating-agreement master changes; all governance rules stay as approved. No installation, live data work, publication or Dropbox writes.

USER WALK — client completing the operating-agreement questionnaire:
1. Opens the owner and optional-provision questions for the company.
2. Reads the capital-call, beneficiary, joint-ownership and deadlock explanations.
3. Chooses options under the agreement's existing percentage-vote, admission and deadlock rules.
Expects: help matches the generated agreement and warns that editing owners does not change state filings.

USER WALK — owner using the Manual and Instructions:
1. Opens the generated Word documents.
2. Finds the manager placeholders, borrowing/guarantee rules, TOD eligibility and deadlock explanation.
3. Fills the correct blank and follows the same rules explained in the portal.
Expects: no headcount voting, false guarantee threshold, absolute no-authority claim or claim that unequal ownership defeats deadlock.

USER WALK — formation customer comparing management structures:
1. Opens Management structure in the order form.
2. Expands the explanation of manager-managed companies.
3. Reads the distinction between an economic transferee and an admitted member.
Expects: receipt of an economic interest alone is not described as conferring management rights.

## Verification

Exact replacement guards for every change; native Word text assertions; full mandatory type/lint/unit/fact/document/control/API/browser checks; offline visual checks of the changed portal help; rendered Word page inspection. The prior ledger, parts, rulings and agreement sources will be compared to the base. All content changes are reproduced verbatim below.


## Item 124

webapp/src/content/oaLearnMore.tsx

Before:
```text
A majority of the owners can approve a "capital call." Every owner must then contribute
```
After:
```text
Owners holding more than 50% of the ownership interests held by members can approve a
          "capital call." Every owner must then contribute
```

webapp/src/pages/portal/OAQuestionnaire.tsx

Before:
```text
<span>Include — a majority can require contributions, up to an annual cap</span>
```
After:
```text
<span>Include — owners holding more than 50% of the ownership interests held by members can require contributions, up to an annual cap</span>
```

## Item 125

webapp/src/content/oaLearnMore.tsx

Before:
```text
Your beneficiary becomes a voting member only if the other owners
          consent, the same rule that applies to lifetime transfers. Either way, the money flows
```
After:
```text
Your beneficiary becomes a voting member only after signing an agreement to be bound
          and obtaining written consent from owners holding more than 50% of the ownership
          interests held by the remaining members. A permitted family transferee needs the
          same admission approval, excluding the transferring owner. Other new members need
          every member's written consent and a signed agreement to be bound. Permission to
          transfer an interest and admission as a voting member are separate requirements.
          Either way, the money flows
```

docs/oa-instructions.md

Before:
```text
— death does not bypass the same controls that govern lifetime transfers.
```
After:
```text
— the same admission threshold applies to a permitted family transferee, excluding the transferring owner; other new members need every member's written consent and a signed agreement to be bound. Permission to transfer an interest is separate from admission as a voting member.
```

docs/owners-manual.md

Before:
```text
but becomes a voting member only with the consent of a majority in interest of the other members — death does not bypass the controls that govern lifetime transfers, and family is treated no differently.
```
After:
```text
but becomes a voting member only after delivering a signed agreement to be bound and obtaining written consent from owners holding more than 50% of the ownership interests held by the remaining members. A permitted family transferee needs the same admission approval, excluding the transferring owner; other new members need every member's written consent and a signed agreement to be bound. Permission to transfer an interest and admission as a voting member are separate requirements.
```

## Item 126

webapp/src/pages/portal/OaOwnersSections.tsx

Before:
```text
shareholder; s. 12.1 admits only an eligible one.
```
After:
```text
shareholder; the admission section admits only an eligible one.
```

webapp/src/pages/portal/OaOwnersSections.tsx

Before:
```text
Section 12.1 admits only an eligible shareholder.
```
After:
```text
admission section admits only an eligible shareholder.
```

## Item 130

webapp/src/pages/portal/OaOwnersSections.tsx

Before:
```text
                            JTWROS

```
After:
```text
                            Joint tenants with right of survivorship

```

## Item 135

webapp/src/pages/portal/OAQuestionnaire.tsx

Before:
```text
You'll list the owners by name on the next screen. Owners are never filed with the
                State, so this can differ from what you told us when the company was formed.
```
After:
```text
You'll list today's owners by name on the next screen. We list members of a
                member-managed company in the Articles as authorized members. In a
                manager-managed company, we list managers; an owner who is also a manager
                appears in that role. Changing these answers does not update the state filing.
                If information in your filed Articles is no longer accurate, arrange the
                appropriate amendment or other permitted correction as well.
```

webapp/server/routes-portal.ts

Before:
```text
// starting point: members are never filed with the Division (server/filing.ts
// has no member field), so nothing about the formation record fixes it. An
```
After:
```text
// starting point: member-managed filings list members as AMBR, and an owner
// who is also a manager may appear as MGR. Current answers do not amend that
// public filing; inaccurate filed information needs an appropriate correction. An
```

webapp/server/routes-portal.ts

Before:
```text
  // The owners are an answer, not a reading of the formation record. Members
  // are never filed with the Division — server/filing.ts has no member field —
  // so the intake list is where the list starts, not what it is fixed to.
```
After:
```text
  // The owners are a current answer, not a fixed reading of the formation
  // record. Member-managed filings list AMBRs; these answers do not update
  // that public filing or remove the duty to correct inaccurate filed facts.
```

## Item 136

webapp/src/pages/portal/OrdersInProgress.tsx

Before:
```text
Florida lets the company establish a protected series only with the consent of
              <strong> all members</strong> (s. 605.2201(1)), and Section 3.1 of your agreement
              requires it.
```
After:
```text
Florida's default rule requires <strong>every member's consent</strong> to
              establish a protected series (s. 605.2201(1)). An operating agreement can
              change that approval rule (s. 605.2107(1)(i)); Section 3.1 of your agreement
              keeps unanimous consent.
```

## Item 167

webapp/src/pages/portal/OrdersInProgress.tsx

Before:
```text
  // s. 605.2201(1) and Section 3.1 require the consent of all members before a
  // series is established, and the designation filed with the state is signed
```
After:
```text
  // Section 3.1 retains unanimous consent to establish a series. The statutory
  // default in s. 605.2201(1) may be varied under s. 605.2107(1)(i). The
  // designation filed with the state is signed
```

## Item 238

docs/oa-instructions.md

Before:
```text
to handle ministerial tasks, with no authority to decide anything on the members' behalf.
```
After:
```text
to handle ministerial tasks. The Administrative Member also has any additional authority expressly granted by the agreement or by owners holding a Majority in Interest; the role does not make that person a manager.
```

docs/owners-manual.md

Before:
```text
(a paperwork role, not a decision-making one).
```
After:
```text
(a paperwork role with any additional authority expressly granted by the agreement or by owners holding a Majority in Interest).
```

## Item 239

docs/oa-instructions.md

Before:
```text
If included, a majority of owners can require everyone to chip in more money (pro rata),
```
After:
```text
If included, owners holding more than 50% of the ownership interests held by members can require everyone to chip in more money (pro rata),
```

docs/owners-manual.md

Before:
```text
If you included it, a majority of owners can require everyone to contribute more money,
```
After:
```text
If you included it, owners holding more than 50% of the ownership interests held by members can require everyone to contribute more money,
```

docs/owners-manual.md

Before:
```text
with the Manager, or with a majority of the owners — never with the creditor.
```
After:
```text
with the Manager, or with owners holding a Majority in Interest — never with the creditor.
```

docs/oa-instructions.md

Before:
```text
the dollar amount of debt that may be incurred without the written consent of every owner:
```
After:
```text
the dollar amount of debt that may be incurred without the consent of every owner:
```

docs/owners-manual.md

Before:
```text
without the owners' written consent.
```
After:
```text
without the consent of every owner.
```

## Item 240

docs/owners-manual.md

Before:
```text
Establishing a protected series requires the affirmative vote or consent of **all members** of the company (s. 605.2201). This is a rule your operating agreement **cannot change** — s. 605.2107 puts it on the list of non-variable provisions.
```
After:
```text
Florida's default rule requires the affirmative vote or consent of **all members** to establish a protected series (s. 605.2201(1)). The statute allows an operating agreement to choose a different approval rule (s. 605.2107(1)(i)). Section 3.1 of your agreement retains unanimous consent.
```

docs/owners-manual.md

Before:
```text
how series are established (unanimous consent, per the statute),
```
After:
```text
how series are established (unanimous consent under Section 3.1, retaining the statutory default),
```

## Item 249

## Item 250

docs/owners-manual.md

Before:
```text
above it, no debt may be incurred and no guarantee given for anyone,
```
After:
```text
above it, no debt may be incurred without the consent of every owner. A guarantee of anyone's obligation, of any amount, may not be given
```

docs/oa-instructions.md

Before:
```text
Above this number, any one owner can refuse. Common choices:
```
After:
```text
Above this number, any one owner can refuse. A guarantee of anyone's obligation requires every owner's consent regardless of amount. A guarantee of one series' obligations by another series or by the company also requires the express written instrument specified in the agreement. Common choices:
```

## Item 253

docs/owners-manual.md

Before:
```text
Every form of the agreement lets each member register a transfer-on-death beneficiary
```
After:
```text
Every form of the agreement lets an individual member register a transfer-on-death beneficiary (an owner that is a company or trust cannot make this designation, nor can co-owners holding an interest as tenants in common)
```

## Item 265

docs/oa-instructions.md

Before:
```text
**[MANAGER NAME]** (manager-managed forms only) — the manager.
```
After:
```text
**[MANAGER NAMES]** (manager-managed forms only) — the initial manager or managers in the appointment. **[MANAGER NAME]** — the manager identified in each manager signature block.
```

## Item N2.25

docs/oa-instructions.md

Before:
```text
**(c) Deadlock Buy-Sell ("Shotgun") — §13.2.** For companies that can split 50/50 (two equal owners, or two equal factions), a deadlock otherwise has no exit short of a lawsuit to dissolve the company. The shotgun works like cutting a cake: after a 60-day deadlock, either substantial owner may name a single price for the whole company; the *other* side then chooses whether to buy or sell at that price. Naming the price honestly is self-enforcing — name it too low and you get bought out cheap; too high and you overpay. **Caution:** the mechanism favors the owner with more cash, since the poorer side may be forced to sell even at a fair price. To omit it, replace the text of §13.2 with "[Reserved.]". Omit it if ownership is not evenly split (a majority can always outvote a deadlock) or if the owners' finances are badly mismatched.
```
After:
```text
**(c) Deadlock Buy-Sell ("Shotgun") — §13.2.** A company can deadlock with equal or unequal ownership: a majority cannot override a decision requiring unanimous approval. Section 13.2 covers a failure to obtain the required vote to approve or reject a matter that continues for 60 days after written notice of the deadlock. It excludes matters requiring every member's consent where the Act expressly permits a member to withhold that consent. If you include it, an owner holding at least 25% may offer a single cash valuation for the company and all its series; the *other* owners then choose to buy the offering owner's interest or sell their own at their proportionate shares of that valuation. The mechanism can favor an owner with greater access to cash. Without an agreed exit mechanism, owners may need to negotiate a solution or ask a court for relief. To omit it, replace the text of §13.2 with "[Reserved.]". Unequal ownership alone is not a reason to omit it; consider the covered decisions and the owners' ability to fund a buyout.
```

docs/owners-manual.md

Before:
```text
**Deadlock buy-sell, the "shotgun" (§13.2).** For a company that can split evenly, a deadlock otherwise has no exit short of suing to dissolve. If you included it: after a 60-day deadlock, one substantial owner names a single price for the whole company, and the *other* side chooses whether to buy or sell at that price. Naming the price honestly is self-enforcing — too low and you get bought out cheap, too high and you overpay. Two cautions: it favors whoever has more cash, and it prices the company and all of its series as one unit. If ownership is not evenly split, or the owners' finances are badly mismatched, you were better off omitting it.
```
After:
```text
**Deadlock buy-sell, the "shotgun" (§13.2).** A company can deadlock with equal or unequal ownership: a majority cannot override a decision requiring unanimous approval. Section 13.2 covers a failure to obtain the required vote to approve or reject a matter that continues for 60 days after written notice of the deadlock. It excludes matters requiring every member's consent where the Act expressly permits a member to withhold that consent. If you include it, an owner holding at least 25% may offer a single cash valuation for the company and all its series; the *other* owners then choose to buy the offering owner's interest or sell their own at their proportionate shares of that valuation. The mechanism can favor an owner with greater access to cash. Without an agreed exit mechanism, owners may need to negotiate a solution or ask a court for relief. Unequal ownership alone does not eliminate the need for a deadlock plan.
```

webapp/src/content/oaLearnMore.tsx

Before:
```text
If ownership can split evenly — two 50/50 owners, or two equal factions — the company
          can deadlock: no majority, no decision, no way forward.
```
After:
```text
A company can deadlock with equal or unequal ownership. A majority cannot override
          a decision requiring unanimous approval.
```

webapp/src/content/oaLearnMore.tsx

Before:
```text
After a deadlock lasts 60 days, any owner holding at least 25% may name a single
```
After:
```text
For a covered matter, after the failure to obtain the required vote to approve or
          reject it continues for 60 days after written deadlock notice, any owner holding
          at least 25% may name a single
```

webapp/src/content/oaLearnMore.tsx

Before:
```text
other side may be forced to sell even at a fair price.
```
After:
```text
other side may be forced to sell even at a fair price. Section 13.2 excludes matters
          requiring every member's consent where the Act expressly permits a member to
          withhold that consent.
```

webapp/src/content/oaLearnMore.tsx

Before:
```text
Owners with unequal percentages rarely need this provision — a majority can simply
          outvote a deadlock.
```
After:
```text
Unequal ownership does not eliminate deadlock on decisions requiring unanimous
          approval. Consider the covered decisions and the owners' ability to fund a buyout.
```

## Item N3.11

webapp/src/content/oaLearnMore.tsx

Before:
```text
Without a plan, the only exit
          is asking a court to dissolve the company. This provision builds in an exit.
```
After:
```text
Without an agreed exit mechanism, owners may need
          to negotiate a solution or ask a court for relief. This provision builds in an exit
          for the matters it covers.
```

## Item N4.08

webapp/src/components/forms/florida-llc/sections/StepManagement.tsx

Before:
```text
If a share later passes to a trust, a
            holding company, or a passive investor, the new owner inherits
            management authority — and the exposure — too.
```
After:
```text
If a transferee is admitted as a member of a
            member-managed LLC, the new member gains management rights and
            duties; receiving only an economic interest does not confer
            management authority.
```

## Revision 2 — formatting correction

Adam authorized: “Reject revision 1; proceed with revision 2”. Revision 1 remains in the ledger as rejected, with its immutable snapshot retained. Revision 2 restores the original italic emphasis on “other” in the Instructions and Owner’s Manual deadlock paragraphs. The visible wording and approved scope are unchanged.
