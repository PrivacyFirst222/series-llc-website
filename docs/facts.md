# Fact ledger

Every product fact that lives in more than one place, with its one true value
and every place it lives. `bun run docs/facts-check.ts` reads this file and
fails when any place disagrees with the value, when a retired wording is still
found anywhere a client or the office can read, when an agreement's colophon
does not list exactly the sections its own body cites, or when a portal rate
limit is charged before the request's checks.

This file exists because three audits in three days (13–15 Sep 2026) each
found facts fixed in one place and left wrong in the others (FAILURES.md P85).
When a fact changes, change it here first, then everywhere the ledger names.

Format: `- where: <path> — ` followed by the exact text that must appear in
that file. `- retired:` names a wording that must not appear anywhere in the
scanned set; add ` in <path prefix>` to confine the ban to matching files.

### Price of an additional series
- value: `$50 — $25 to prepare and the $25 state filing fee`
- where: webapp/src/pages/Pricing.tsx — `cost $50 each`
- where: docs/owners-manual.md — `new $50 ($25 to prepare and the $25 state fee)`
- where: docs/owners-manual.md — `Each costs $50 through us`
- where: docs/owners-manual.md — `A fresh series costs $50`
- retired: `fresh series costs $25`
- retired: `new $25, new exhibit`
- retired: `Each is a $25 online filing`

### The deliverables
- value: `filed Articles and Designations, the form Operating Agreement, the Series LLC Owner's Manual`
- where: webapp/src/pages/Pricing.tsx — `Comprehensive Series LLC Owner's Manual`
- where: webapp/src/pages/HowItWorks.tsx — `a comprehensive Series LLC Owner's Manual`
- where: webapp/src/content/terms.md — `the Series LLC Owner's Manual`
- retired: `titling manual`
- retired: `ledger forms`
- retired: `Ledger forms`
- retired: `maintenance guide`

### The $125 a new company pays the state
- value: `$100 for the Articles plus $25 to designate the registered agent for a new LLC; an existing LLC pays no new Articles fee, and pays a separate $25 state change-of-agent fee if it appoints our service`
- where: webapp/src/components/forms/florida-llc/sections/StepFilingPath.tsx — `a separate $25 state change-of-agent fee applies`
- where: webapp/src/components/forms/florida-llc/sections/StepName.tsx — `filing fee for the Articles and Registered Agent`
- where: webapp/src/pages/Pricing.tsx — `filing fee for the Articles and Registered Agent`
- where: webapp/src/pages/FAQ.tsx — `filing fee for the Articles and Registered Agent`
- retired: `$125 Articles filing fee`
- retired: `no $125 Articles fee`
- retired: `No $125 Articles filing fee`
- retired: `no $125 Articles of Organization filing fee`

### Who signs the Articles and the Statement when the client appoints us
- value: `Caitlin Kirwan, Manager of FLORIDA PROTECTED SERIES, LLC - PS 1`
- where: webapp/server/filing.ts — `name: "Caitlin Kirwan", title: "Manager", company: "FLORIDA PROTECTED SERIES, LLC - PS 1"`
- where: docs/README.md — `Caitlin Kirwan, Manager of FLORIDA PROTECTED SERIES, LLC - PS 1`
- retired: `AR_SIGNER_NAME`
- retired: `AR_SIGNER_TITLE`

### The Series Exhibit's manager row
- value: `Same as Company Manager`
- where: webapp/server/templates-oa-multi.md — `| Protected Series Manager | Same as Company Manager |`
- where: webapp/server/templates-oa-s.md — `| Protected Series Manager | Same as Company Manager |`
- where: webapp/server/templates-oa-single.md — `| Protected Series Manager | Same as Company Manager |`
- where: webapp/server/templates-oa-single-s.md — `| Protected Series Manager | Same as Company Manager |`
- where: webapp/server/templates-new-series.md — `| Protected Series Manager | Same as Company Manager |`
- retired: `[PS MANAGER]`
- retired: `[Same as Company Manager / NAME]`
- retired: `unless its Series Exhibit names someone else`
- retired: `unless a Series Exhibit names someone else`

### The Series Exhibit's heading
- value: `SERIES EXHIBIT PS-1, PS-2, and so on`
- where: webapp/server/oa.ts — `## SERIES EXHIBIT PS-${n}`
- where: webapp/server/templates-new-series.md — `## SERIES EXHIBIT PS-[N]`
- where: webapp/server/templates-oa-multi.md — `each numbered PS-1, PS-2`
- where: docs/oa-instructions.md — `(PS-1, PS-2, and so on)`
- where: docs/owners-manual.md — `(PS-1, PS-2, …)`
- retired: `## SERIES EXHIBIT ${n}`

### What a protected series may not do (merge, convert, domesticate)
- value: `ss. 605.2602 and 605.2605–605.2607`
- where: webapp/server/templates-oa-multi.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-member.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-s.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-member-s.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-single.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-single-s.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-member-single.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: webapp/server/templates-oa-member-single-s.md — `except as ss. 605.2602 and 605.2605–605.2607, Florida Statutes, permit`
- where: docs/owners-manual.md — `(ss. 605.2602 and 605.2605–605.2607)`
- retired: `605.2602–.2604`
- retired: `605.2602–605.2604`
- retired: `single statutory channel provided in s. 605.2604`

### The board's column names
- value: `New Orders · With The State · Complete`
- where: webapp/src/pages/admin/OrderBoard.tsx — `"New Orders"`
- where: webapp/src/pages/admin/OrderBoard.tsx — `"With The State"`
- where: webapp/src/pages/admin/OrderBoard.tsx — `"Complete"`
- where: webapp/server/routes-admin.ts — `formed: "Complete"`
- retired: `formed: "Formed"`

### The edition label on every generated document
- value: `First Edition — August 2026`
- where: webapp/server/oa.ts — `"First Edition — August 2026"`
- where: docs/owners-manual.md — `First Edition — August 2026`
- where: docs/oa-instructions.md — `Instructions, First Edition — August 2026`
- where: webapp/server/templates-new-series.md — `Master [EDITION]`
- where: webapp/server/templates-statement-of-authorized-representative.md — `Master [EDITION]`
- retired: `Instructions v2`

### Where a change of transfer-on-death beneficiary is delivered
- value: `to the manager in the manager-managed forms; to the administrative member in the member-managed multi-member form; kept with the records in the member-managed single-member form`
- where: docs/oa-instructions.md — `to the administrative member in the member-managed multi-member form`
- where: webapp/src/content/oaLearnMore.tsx — `to the administrative member in
          the member-managed multi-member form`
- retired: `kept with the company's records when you are the only`

### The S corporation forms' limit on a death beneficiary
- value: `an eligible S corporation shareholder (§9.3(b))`
- where: docs/oa-instructions.md — `must be an eligible S corporation shareholder (§9.3(b))`
- where: docs/owners-manual.md — `subject on the S corporation forms to the eligible-shareholder rule`
- where: webapp/src/content/oaLearnMore.tsx — `eligible S corporation
          shareholder`
- where: webapp/server/templates-oa-s.md — `TOD beneficiary (eligible S corporation shareholder)`
- where: webapp/server/templates-oa-member-s.md — `TOD beneficiary (eligible S corporation shareholder)`
- retired: `TOD beneficiary (any person or entity)` in webapp/server/templates-oa-s.md
- retired: `TOD beneficiary (any person or entity)` in webapp/server/templates-oa-member-s.md

### What special terms may not vary on the S corporation forms
- value: `Article 8 (records), Article 9 (the tax rules that protect the S election), and the Act's non-variable provisions`
- where: webapp/server/templates-oa-s.md — `may not vary Article 8, Article 9, or non-variable provisions of the Act`
- where: webapp/server/templates-oa-member-s.md — `may not vary Article 8, Article 9, or non-variable provisions of the Act`
- where: webapp/server/templates-oa-single-s.md — `may not vary Article 8, Article 9, or non-variable provisions of the Act`
- where: webapp/server/templates-oa-member-single-s.md — `may not vary Article 8, Article 9, or non-variable provisions of the Act`
- where: webapp/server/templates-oa-s.md — `the provisions of Article 8, or the provisions of Article 9`
- where: webapp/server/templates-oa-member-s.md — `the provisions of Article 8, or the provisions of Article 9`
- where: webapp/src/pages/portal/OaOwnersSections.tsx — `Article 9 (the tax rules that protect the S election)`

### Who decides a series' place of business in the member-managed forms
- value: `a Majority in Interest (several owners); the Member (one owner)`
- where: webapp/server/templates-oa-member.md — `as determined by a Majority in Interest.`
- where: webapp/server/templates-oa-member-s.md — `as determined by a Majority in Interest.`
- where: webapp/server/templates-oa-member-single.md — `as determined by the Member.`
- where: webapp/server/templates-oa-member-single-s.md — `as determined by the Member.`
- retired: `as determined by a majority of the Members` in webapp/server/templates-oa-
- retired: `as determined by the Company.` in webapp/server/templates-oa-

### Capital accounts
- value: `one capital account per Member in the two multi-member partnership forms; no sub-accounts anywhere`
- where: webapp/server/templates-oa-multi.md — `to the extent of their capital account balances`
- where: webapp/server/templates-oa-member.md — `to the extent of their capital account balances`
- where: docs/owners-manual.md — `capital accounts (multi-member partnership forms only; contribution records elsewhere)`
- retired: `capital sub-account`
- retired: `(and sub-accounts)`

### The day legal mail was received
- value: `typed by the office on upload; named in the client's email`
- where: webapp/server/email.ts — `We received legal mail on ${escapeHtml(opts.receivedOn)}`
- where: webapp/src/pages/admin/AdminDashboard.tsx — `Received on`
- retired: `We received legal mail today`

### The series consent for one owner
- value: `singular throughout`
- where: webapp/server/templates-new-series.md — `WRITTEN CONSENT OF THE SOLE MEMBER`
- where: webapp/server/templates-new-series.md — `**MEMBER:**`
- where: webapp/server/templates-new-series.md — `The Member, as protected-series manager`
- where: webapp/server/templates-new-series.md — `This consent shall be retained with the records of the Company.`

### The Statement of Authorized Representative says who manages
- value: `members (member-managed) or the manager or managers (manager-managed)`
- where: webapp/server/templates-statement-of-authorized-representative.md — `rests with its manager or managers`
- where: webapp/server/templates-statement-of-authorized-representative.md — `rest with its members`

### Requested formation effective dates (Adam, Batch 10)
- value: `Typical submission within one business day of completed order; estimated range uses next banking business day in Eastern time. Preserve the requested date; at filing use the closest permitted date if outside the range. Exact effective date is not guaranteed; no client follow-up for adjustment.`
- where: webapp/src/lib/calendar.ts — `We cannot guarantee an exact effective date.`
- where: webapp/src/components/forms/florida-llc/sections/StepEffectiveDate.tsx — `EFFECTIVE_DATE_NOTICE`
- where: webapp/src/components/forms/florida-llc/ReviewStep.tsx — `EFFECTIVE_DATE_NOTICE`
- where: webapp/server/filing.ts — `closestEffectiveDate`
- where: webapp/server/order-summary.ts — `Exact effective date is not guaranteed.`

## Batch 13 owner decisions — 19 Sep 2026

- First-year Form 2553 deadline wording: within 2 months and 15 days after the LLC is officially formed with the Florida Division of Corporations. A later effective date stated in the filed Articles controls over the earlier filing date. The portal asks for that later date only when stated in the Articles.
- Our filing package requires an issued EIN. If we were hired to obtain the company EIN, the client may submit encrypted questionnaire answers while it is pending; no filing PDF is generated until the EIN is issued. Self-applicants must enter the issued EIN. Never instruct the client to enter Applied For. This is our service policy; it is not a claim that the IRS offers no other filing procedure.
- A paid conversion order identifies an already-existing LLC: its EIN questionnaire is available before the protected-series filings finish. This status is company-specific.
- Clients fax or mail Form 2553 themselves; we prepare the package and do not file it.
- Impossible SSNs: middle group 00 and ending 0000 are rejected, alongside the existing length/area restrictions, on client and server.
- Owner retained the issued-EIN prerequisite (item 122) and the incomplete-SSN warning (N2.18). The dormant record-copy deadline uses neutral tense; no automatic redacted-copy replacement is restored.

## Batch 14 — agreement preparation (Adam approved 20 September 2026)

- A generated PDF does not establish adoption. The operating-agreement questionnaire asks whether an agreement has been adopted (written, oral or implied). Correcting an unused draft remains a first agreement; replacing an adopted agreement uses amended/restated. The client identifies a company-specific predecessor and confirms its effective date, or identifies an external or undated/date-unknown agreement. Never substitute generation time for the prior effective date.
- Portal badges say “Most recently generated” and “Earlier generated copy”. Generation order does not determine which agreement is legally in effect.
- Manager-managed agreement questionnaires support editing, adding and removing managers, with entity signer details carried with each manager. Preparing an agreement does not change state filing records.
- The series consent's blank contribution prints “None”; its exhibit adopter blocks have no additional Date line and its asset schedule has five blank rows, matching the masters. Consent member signatures retain Date lines. Its document title/footer is “Consent & Series Exhibit — [series name]”.
- The consent special-terms warning includes Article 9 for the selected company's S agreement and Article 8 for every form.

## Batch 15 — voting, authority and transfers (Adam approved 20 September 2026)

- Majority in Interest means more than 50% of the Percentage Interests held by admitted members, not a majority by headcount. Capital calls use that vote; their existing annual cap and written-notice requirements remain.
- Under the multi-member forms, a TOD beneficiary or permitted family transferee needs a signed agreement to be bound and written Majority-in-Interest approval from the other members for admission. Other new members need all members' written consent. Permission to transfer and admission are separate; an economic transferee alone has no management authority.
- An Administrative Member performs ministerial tasks and may receive additional authority under the agreement or from a Majority in Interest; the role does not make that person a manager.
- Borrowing above the chosen threshold requires every member's consent. Guarantees require every member's consent at any amount; preserve the express written instrument required for guarantees of one series' obligations by another or by the company.
- Unanimous establishment approval is a variable statutory default under ss.605.2201(1) and 605.2107(1)(i); Section 3.1 of these agreements retains unanimity.
- Unequal ownership can still deadlock on unanimous decisions. Section 13.2 applies only to covered matters, after 60 days following written notice, with an initiator holding at least 25%; retain its statutory withholding-consent exclusion and cash-access warning. Negotiation remains possible without the optional mechanism.
- TOD designation is for qualifying individual ownership, not entity owners or tenants in common. S-form beneficiary restrictions remain.
- Formation Articles list AMBRs for member-managed companies and managers for manager-managed companies, including an owner serving in that role. Questionnaire answers do not update public filings. Correct inaccurate filed facts through the appropriate amendment or other permitted correction; ownership changes do not invariably require amended Articles.

## Batch 17 — asset records and statutory explanations (Adam approved 20 September 2026)

- Florida's enacted Part III is the Uniform Protected Series Provisions; public shorthand is Florida's protected series statute. The model-law name remains Uniform Protected Series Act.
- One Florida annual report covers the company and its protected series. That is not a promise of only one fee for every service. The filing office is the Florida Division of Corporations.
- The general association rule requires identifying, acquisition and transfer records. Standing allocation provisions do not guarantee that every asset is associated. The recorded-real-property-instrument exception has the giving-value and lack-of-knowledge qualifications stated in s.605.2301(2)(b).
- Administrative dissolution restricts activity to winding up; it does not automatically remove liability protections. Existing reinstatement fees remain.
- Documentary stamp tax: outside Miami-Dade, 70 cents per $100 or fraction of taxable consideration; Miami-Dade, 60 cents plus 45-cent surtax except an instrument transferring only a single-family dwelling. The $2,100 example is $300,000 taxable consideration at the outside-Miami-Dade rate.
- Document contributions, distributions, loans, repayments and legitimate expense reimbursements. Section 8.4 permits properly documented nominee holding; standing association rules are in Section 8.5, followed by Section 8.6.
- Company-level mergers and series-level outcomes are distinct under ss.605.2602–605.2607; internal notes must not apply the company merger channel directly to a series.
- Adam retained Batch 17 review items 6–9: state-count wording, the specified public liability explanations and the agreement creditor/recourse clauses. No frequency ranking is asserted for the Manual's conduct list.

### Batch 17 recordkeeping explanations
- where: webapp/src/pages/TheStatute.tsx — `To the extent the instrument favors someone who gives value without knowing that the signer lacked authority`
- where: docs/owners-manual.md — `Missing records can leave an asset non-associated.`
- where: docs/owners-manual.md — `it does not automatically remove its liability protections.`
- where: docs/owners-manual.md — `Miami-Dade charges 60 cents per $100 or fraction, plus a 45-cent surtax`


### Batch 18 — document text and current source references (Adam, 20 September 2026)
- Client business text uses English A-Z letters, numbers, spaces and standard punctuation; unsupported letters are refused before submission and by the API. Passwords and opaque tokens are not business text.
- Client brackets and table delimiters are preserved as text, never interpreted as template fields or table structure.
- The series consent has a portal-generated PDF and no Word counterpart.
- where: docs/README.md — `Its output is a client-specific PDF; it has no Word counterpart.`
- where: webapp/src/lib/englishText.ts — `Please use English letters (A–Z). Numbers, spaces and standard punctuation are also allowed. Replace the highlighted characters to continue.`
- where: docs/oa-instructions.md — `Series LLC Owner's Manual`
- where: docs/owners-manual.md — `keep your email address current in the portal so notices reach you`
