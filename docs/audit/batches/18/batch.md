# Batch 18 revision 2 — approved document output and references

Adam: "Go. Approve all" after directing item 17 to reject non-English letters at entry. Implements 16 review units (18 ledger records); optional items 7/243 and 10/251 stay unchanged. No publication, acceptance, Dropbox copy, or Batch 16 changes are authorized. Base and return-point bundle are retained outside this checkout.

Governing text: docs/README.md: "The markdown in this repository is the master. Word files are output." Every change below is derived from the approved Batch 18 review and the current source; agreement operative provisions are unchanged.

## Input policy
English A-Z and a-z, numbers, spaces, line breaks and standard punctuation are accepted. Accented letters, non-Latin scripts and emoji are refused with a visible field error before continuing and by the API before business writes. English typographic quotation marks, dashes, bullets and ellipses remain valid punctuation. Passwords and opaque authentication/payment tokens are not document text. Do not transliterate names or silently replace characters with question marks.

## Document safety
Encode client text before template interpolation; decode it only after Markdown structure has been parsed. Literal brackets cannot be mistaken for template slots, and pipes/newlines cannot add table columns/rows. Unresolved template slots/markers stop assembly. Test all eight forms, consent and actual rendered output.

## Verification
Preserve every prior assertion. Run focused failure/positive controls, full mandatory review, actual API input rejections, actual form input checks, document extraction and visual inspection. The fact check compares the masters' Florida and Internal Revenue Code citation sets and the Manual's Florida citation coverage. Word generation stays local. Review package and complete diff are prepared after a normal hooked commit.

## Revision history

Adam explicitly instructed: "Reject Batch 18 revision 1; proceed with revision 2." His decision was recorded outside the repository using accept.ts, then copied into the ledger using batch.ts. Revision 1 and its frozen snapshot remain on record as rejected. Revision 2 corrects the citation assertions described in evidence/revision-2-correction.md. Item 42 also checks removal of the old 2025 URLs, rather than only presence of their shared URL prefix. The approved scope and input policy remain unchanged.

## Approved wording substitutions

### 42 — webapp/src/pages/FAQ.tsx

Before:
```text
https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605ContentsIndex.html&StatuteYear=2025&Title=%2D%3E2025%2D%3EChapter%20605
```
After:
```text
https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605ContentsIndex.html
```

### 42 — webapp/src/pages/WhatIs.tsx

Before:
```text
https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605ContentsIndex.html&StatuteYear=2025&Title=%2D%3E2025%2D%3EChapter%20605
```
After:
```text
https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605ContentsIndex.html
```

### 132 — webapp/server/validation.ts

Before:
```text
(§605.2202).
```
After:
```text
(s. 605.2202, Fla. Stat.).
```

### 132 — webapp/server/routes-portal.ts

Before:
```text
(§605.2202).
```
After:
```text
(s. 605.2202, Fla. Stat.).
```

### 132 — webapp/src/components/forms/florida-llc/stepValidation.ts

Before:
```text
§605.2202 requires it in every series name.
```
After:
```text
s. 605.2202, Fla. Stat., requires it in every series name.
```

### 132 — webapp/src/components/forms/florida-llc/sections/StepSeries.tsx

Before:
```text
(&sect;605.2202).
```
After:
```text
(s. 605.2202, Fla. Stat.).
```

### 210 — webapp/server/routes-admin.ts

Before:
```text
`${kindTitle} - ${day} — ${llcName}`
```
After:
```text
`${kindTitle} (${day}) — ${llcName}`
```

### 235 — webapp/server/templates-oa-member-s.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013).*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 1361, 1362, 1366, 1377, 1378.*
```

### 235 — webapp/server/templates-oa-member-single-s.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.501, 711.512, Fla. Stat. Code references: sections 1361, 1362, 1378.*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.50, 711.501, 711.512, Fla. Stat. Internal Revenue Code sections: 1361, 1362, 1378.*
```

### 235 — webapp/server/templates-oa-member-single.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.501, 711.512, Fla. Stat.*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.50, 711.501, 711.512, Fla. Stat.*
```

### 235 — webapp/server/templates-oa-member.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013).*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 704, 754, 6221, 6223, 6226.*
```

### 235 — webapp/server/templates-oa-multi.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013).*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 704, 754, 6221, 6223, 6226.*
```

### 235 — webapp/server/templates-oa-s.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013).*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 1361, 1362, 1366, 1377, 1378.*
```

### 235 — webapp/server/templates-oa-single-s.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.501, 711.512, Fla. Stat. Code references: sections 1361, 1362, 1378.*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.50, 711.501, 711.512, Fla. Stat. Internal Revenue Code sections: 1361, 1362, 1378.*
```

### 235 — webapp/server/templates-oa-single.md

Before:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.501, 711.512, Fla. Stat.*
```
After:
```text
*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.50, 711.501, 711.512, Fla. Stat.*
```

### 237 — docs/oa-instructions.md

Before:
```text
Series LLC User's Manual
```
After:
```text
Series LLC Owner's Manual
```

### 237 — webapp/src/pages/portal/ServicesCard.tsx

Before:
```text
Check the User's Manual
```
After:
```text
Check the Owner's Manual
```

### 241 — docs/owners-manual.md

Before:
```text
keep your email address current in the portal (your operating agreement and our terms both require current contact information)
```
After:
```text
keep your email address current in the portal so notices reach you
```

### 246 — docs/owners-manual.md

Before:
```text
Statutory citations verified against Official Florida Statutes: ss. 48.062, 605.0503, 605.2101–605.2802 (including 605.2201, 605.2202, 605.2301, 605.2401, 605.2404, 605.2602, 605.2605–605.2607), 711.50–711.512; Ch. 726;
```
After:
```text
Statutory citations verified against Official Florida Statutes: ss. 48.062, 220.02, 605.0302, 605.0410, 605.0503, 605.0602, 605.0714, 605.1103, 605.04074, 605.2101–605.2802, 711.50–711.512; former s. 212.031 (historical commercial-rent tax); Ch. 726;
```

### 247 — docs/owners-manual.md

Before:
```text
s. 6.1 of your agreement
```
After:
```text
Section 6.1 of your agreement
```

### 247 — docs/README.md

Before:
```text
on the five agreement masters
```
After:
```text
on the eight agreement masters
```

### 255 — docs/owners-manual.md

Before:
```text
§605.2301
```
After:
```text
s. 605.2301
```

### 255 — docs/owners-manual.md

Before:
```text
§605.2404
```
After:
```text
s. 605.2404
```

### 258 — webapp/server/templates-new-series.md

Before:
```text
## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N]
```
After:
```text
## ASSET SCHEDULE — ATTACHMENT TO SERIES EXHIBIT PS-[N] ([SERIES NAME])
```

### 261 — docs/README.md

Before:
```text
### How the Word files stay current
```
After:
```text
### Portal-only document

`webapp/server/templates-new-series.md` is the master for the unanimous consent, Series Exhibit and attached Asset Schedule generated in the client portal when another series is added. Its output is a client-specific PDF; it has no Word counterpart.

### How the Word files stay current
```

### 267 — webapp/server/templates-oa-single-s.md

Before:
```text
**7.2 Source Limitation.** Distributions in respect of a Protected Series shall be made **solely from the Associated Assets of that Protected Series, and solely to the Company**; distributions in respect of the Company shall be made solely from the Associated Assets of the Company, to the Member. Each distribution shall be recorded in the records maintained under Article 8, identifying its source.



```
After:
```text
**7.2 Source Limitation.** Distributions in respect of a Protected Series shall be made **solely from the Associated Assets of that Protected Series, and solely to the Company**; distributions in respect of the Company shall be made solely from the Associated Assets of the Company, to the Member. Each distribution shall be recorded in the records maintained under Article 8, identifying its source.


```

### 247 — docs/owners-manual.md

Before:
```text
[[contents]]



```
After:
```text
[[contents]]


```

