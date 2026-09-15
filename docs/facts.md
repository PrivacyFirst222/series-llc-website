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
- where: webapp/src/components/forms/florida-llc/sections/StepSubmissionPayload.tsx — `Owner&rsquo;s Manual`
- retired: `titling manual`
- retired: `ledger forms`
- retired: `Ledger forms`
- retired: `maintenance guide`

### The $125 a new company pays the state
- value: `$100 for the Articles plus $25 to designate the registered agent; a conversion skips both unless it changes its agent`
- where: webapp/src/components/forms/florida-llc/sections/StepFilingPath.tsx — `filing fee for the Articles and Registered Agent`
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
