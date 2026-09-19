# Batch 06 — registered agent appointment, consent and signature

Adam approved the complete ten-fix proposal with “Go - approve all”. Findings 51 and 71 share one repair; 11 records are assigned. Optional 74 and 76 remain unchanged. No price, legal master, tax treatment, customer/test-data cleanup, acceptance or publication is authorized.

## Governing sources read before implementation

2026 Florida Statutes, Online Sunshine (opened in the browser during the proposal):
- 605.0113(1)(b)1: “An individual who resides in this state and whose business address is identical to the address of the registered office”. https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.0113.html
- 605.0113(2): “The statement of acceptance must provide that the registered agent is familiar with and accepts the obligations of that position.”
- 605.2203(2): “Before delivering a protected series designation to the department for filing, a series limited liability company must agree with a registered agent specifying that the agent will serve as the registered agent in this state for that company and for each protected series of that company.” https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/Sections/0605.2203.html
- Current Terms 10(b): “Our sole obligations as registered agent are to accept service of process and official government correspondence directed to your LLC at that address, to post scanned copies to your client portal, and to send a notification email to the address on file.”
- Current form collects registeredAgentSuffix; payload includes it, acceptance and Review omit it. Existing Articles signature policy requires exact name matching apart from outer whitespace.
- Punctuation only: “a bank, or the Division” becomes “a bank or the Division”; the rest of Adam's warning is preserved.

## Objective and scope

1. Retain an existing individual or entity agent without impersonating that agent or promising a skipped acceptance screen (51/71).
2. Conversion authority includes the change of agent only when service selected (59).
3. Acceptance name and electronic signature match the complete entered individual name; both browser and server enforce it (62).
4. Address suggestion and copy-client handlers reject non-Florida addresses without corrupting an entered Florida address (69).
5. A newly appointed individual confirms Florida residence plus business/registered-office street address; a retained agent does not require the client to claim personal residency (70).
6. Mail promise covers service of process and official government correspondence (72).
7. Acceptance says familiar with and accepts obligations (73).
8. Remove only the comma after bank (75).
9. Retained agent agreement for the company and every protected series, including this order, is required and retained (N4.07).
10. Complete name, suffix included, stays consistent in intake, acceptance, Review and filing (N4.11).

The office Order Summary must record the exact applicable confirmation. Stored earlier wording is not retroactively represented as newly agreed wording. Editing the company, agent or series after confirming invalidates affected confirmation(s). Existing new-company choice remains self individual or our service; this batch adds entity choice only for retaining an existing agent.

USER WALK — client forming a new LLC as its own agent:
1. Opens Registered agent and selects personal service, reads the Florida-residency requirement, and enters the complete name and Florida business address.
2. Confirms the address and residence, then signs the next screen using that complete name.
3. Reviews the same full name including suffix before certification and submission.
Expects: mismatched names or non-Florida address copies are refused with useful explanations.

USER WALK — client adding series to an existing LLC:
1. Selects Keep the registered agent already on file, chooses individual or entity, and enters the agent exactly as recorded with the Division.
2. Confirms the existing record; no new-agent acceptance is shown.
3. At Certification confirms the existing agent agreed to serve the company and every protected series, including this order; or, if switching to our service, explicitly authorizes the agent change.
Expects: validation, Review, the submitted order and office information preserve the same agent and actual confirmations.

USER WALK — office preparing the filing:
1. Opens the order and its Order Summary.
2. Reads the individual or entity agent, the full name and address, and the confirmations the client actually made.
3. Prepares the appropriate designation or new-company filing without mistaking retained-agent information for a new signed acceptance.
Expects: no invented client signature or consent, and the company/series agreement recorded before filing.

Instructions retained (8/8): approved ten fixes only; optional 74/76 unchanged; exact screen names; no repeat permission; no test-data cleanup; preserve prior ledger protections; isolated tests and full review; commit locally without publication.
