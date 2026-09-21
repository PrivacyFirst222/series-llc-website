# Batch24 timing evidence

Implemented B1-N04 after Batch24 authorization. Existing source read whole before editing: form2553Timing.ts113/113; form2553Timing.test.ts50/50; s-election.ts342/342; batch13-walk.ts68/68. Total4/4 files,573/573 lines. batch.md and PDF skill also read.

Governing owner wording: “The deadline is two months and 15 days from the date the LLC is formed. The exact deadline date may differ based on holidays and weekends, so you should not put off filing it.” Exported once as FORM2553_DEADLINE_NOTICE and reused in the questionnaire and both package variants. Responsibility acknowledgment states the rule without a calculated date. Internal deadline/display fields remain; five-calendar-day service runway, formation ordering, issued-EIN requirement and unrelated purchase rules remain.

## Independent source verification

- IRS Publication509(2026), https://www.irs.gov/publications/p509, sections Saturday, Sunday, or legal holiday; Legal holidays; Form2553: tax deadlines falling on weekends/DC legal holidays move to the next business day. Its2026 holiday list specifically includes April16 DC Emancipation Day and July3 observed Independence Day.
- Instructions for Form2553, https://www.irs.gov/instructions/i2553, When To Make the Election: read the two-month period/day-before-corresponding-day rule and no-corresponding-day month-end rule; the January7 example's rawMarch21 is not a statement that SaturdayMarch21,2026 is the final due date. ItemE/formation-start ruling remains unchanged.
- Official DC Code1-612.02, https://code.dccouncil.gov/us/dc/council/code/sections/1-612.02, subsection(a) recurring holidays; subsection(b)(1) Saturday-Friday and Sunday-Monday observance; subsection(c) inauguration: “When January 20th of any 4th year falls on Sunday” the next public-observance day is a holiday. Saturday inauguration has no preceding-Friday substitute. Tested that distinction.
- Official OPM holiday schedule, https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/, verified Saturday observance and2029 inauguration exception; IRS/DC is the implemented tax calendar, not Federal Reserve banking holidays.

Tool limitations: no browser was available through CUA or IAB. Official source pages were opened and read through the web tool. eCFR and USCode attempts failed, not relied on. IRS publication itself notes state-specific holidays; this bounded implementation covers recurring IRS/DC holidays, not location-specific state holidays, extraordinary closures or disaster relief. It therefore does not print a definitive due date to clients.

## Reproductions

Final identical harness run against read-only git archive81a7290 with existing node_modules symlink, then current tree: red12/35, green35/35. Stable labels compared equal and harness bytes compared identical. Red failures are23 intended deadline/wording failures; there are no setup failures in retained red.log. Actual filing and record-copy PDFs generated and extracted in both runs. Calendar fixtures cover Sunday/Saturday rollover, DC Emancipation, observed Friday, cross-year New Year, consecutive weekend/holiday, inauguration exception, ordinary days and month-end/leap arithmetic. Gate tests distinguish insufficient service runway from actual lateness and preserve the five-day rule.

Original timing unit suite:24 checks, zero failures. Retained original assertion labels while updating approved meaning/expectations; count now measured rather than hard-coded. Scoped ESLint and app TypeScript check both exited0 (logs retained). Batch13's prior formation/deadline-neutrality labels preserved; full Batch13 execution is part of parent's broader review.

## PDF visual review

Rendered both final PDFs with pdftoppm and opened every image: filing-package7/7 pages; record-copy6/6 pages,13/13 total. Approved general deadline paragraph fits cleanly on filing instruction page1 and record-copy page1. Filing instructions continue normally on page2; no new clipping, overlap or illegibility. All cover/form pages inspected; official Form2553 still carries actual formation/election dates and EIN, and record copy retains its warnings and masked SSNs. Text extraction verifies no March15/March16 computed deadline or DEADLINE heading in either package. These are fixture outputs, not published documents.

No repository writes outside the five declared owned files. No ledger edits, git writes, install, external messages or publishing.
