# Batch 24 — EIN applications and S-election wording

Adam approved items1 and3 and revised item2, then said Go. This is implementation authorization only; publication remains deferred.

## Governing owner instruction

> 2.  Just say that the deadline is two months and 15 days from the date the LLC is formed.  The exact deadline date may differ based on holidays and weekends so you shouldn’t put off filing it.
>
> I agree with the rest.  Go

Approved polished deadline text:

> The deadline is two months and 15 days from the date the LLC is formed. The exact deadline date may differ based on holidays and weekends, so you should not put off filing it.

Approved refund text in both Terms and FAQ:

> The S corporation election package is not refundable once you submit your details. We generate and deliver the completed package to your client portal when the required details and issued EIN are available.

## Governing sources

- IRS Publication509(2026), https://www.irs.gov/publications/p509, Saturday, Sunday, or legal holiday: timely on the “next day that isn’t a Saturday, Sunday, or legal holiday.” IRS/DC holiday dates differ from the Federal Reserve banking calendar; use the IRS rule for this calculation.
- routes-portal.ts2416–2423: `if (!merged.ein)` returns `awaitingEin: true, documentId: null`; package generation follows only with EIN.
- templates-oa-multi.md §4.2: “Each Protected Series is wholly owned by the Company as provided in Section 3.6.”


## B1-N01

Correct Terms and FAQ delivery explanation while preserving the no-refund cutoff; the S package waits for required details and issued EIN.

Historical finding quotation (historical not-approved label retained):

Terms of Service, Add-on refunds; also FAQ “What is the refund policy?” (FAQ.tsx:69). — `webapp/src/content/terms.md:77`
Reads: **(f) Add-on services.** Each add-on service is refundable until we begin work on it. The S corporation election package is not refundable once you submit your details, because the completed package is generated and delivered to your client portal at that moment.
Claims: Submitting S-election questionnaire details immediately generates and delivers the completed package.
True: routes-portal.ts:2396–2403 explicitly saves answers with an EIN pending, returns awaitingEin:true and documentId:null, and does not build the PDF. Batch13 authorizes this supported waiting state. FAQ.tsx:69 repeats the same immediate-delivery explanation. This differs from prior39, which concerns who can buy the package.
Proposed replacement (not approved): **(f) Add-on services.** Each add-on service is refundable until we begin work on it. The S corporation election package is not refundable once you submit your details. We generate and deliver the completed package to your client portal when the required details and issued EIN are available.
Rechecked by codex-reader-5: Terms77/FAQ69 claim immediate PDF delivery. Actual routes-portal2396–2404 returns awaitingEin true and documentId null when no issued EIN. Replacement preserves the existing refund cutoff and corrects only false delivery rationale. Prior39 concerns purchase eligibility and differs.


## B1-N04

Use Adam's general deadline wording in questionnaire and generated package without a computed due date; correct internal IRS weekend/DC-holiday deadline rollover and preserve formation start and service preparation limits.

Historical finding quotation (historical not-approved label retained):

Client portal, S-election questionnaire filing deadline and late-election warning; shared Form2553 deadline helper. — `webapp/src/lib/form2553Timing.ts:38`
Reads: return toISO(addDays(endOfTwoMonths, 15));
Claims: The raw two-month-plus15day calendar result is the final IRS filing deadline, including weekends and legal holidays.
True: Actual helper returns2026-03-15(Sunday) for a company formed2026-01-01 and declares the election late onMonday03-16. IRS Publication509(2026), “Saturday, Sunday, or legal holiday”, generally moves the tax-act due date to the next nonweekend/nonlegal-holiday day; the root reader opened that rule and the Form2553 entry in the same publication. Preserve owner63’s formation-date starting point: this finding concerns only the ending-day adjustment. Primary source reading and quotation retained in evidence/primary-irs-deadline-read.md.
Proposed replacement (not approved): After computing the ordinary two-month-plus15day deadline, advance it past Saturdays, Sundays and applicable IRS/DC legal holidays. Use that adjusted date consistently for deadline display, the late decision and the preparation runway; keep the owner-approved formation-date starting point.
Rechecked by codex-reader-5: Independently imported real form2553Timing helper; Jan1 deadline is SundayMar15 and nextMondayMar16 is late. Read full relevant helper30–89 and root primary-irs-deadline-read.md. Root current IRS Publication509 evidence establishes weekend/holiday timely-nextday rule; rollover is independent of owner63 startdate decision and65-day purchase cutoff. Proposed adjustment correct, retaining5-day service runway separately.


## B3-01

Seed protected-series EIN membership count as one company owner; retain parent membership count for parent EINs and explicit saved client answers; verify submission, storage and office display.

Historical finding quotation (historical not-approved label retained):

Client portal, EIN application details for a protected series, Number of members. — `webapp/src/pages/portal/OrdersInProgress.tsx:545`
Reads:                 <Input name="memberCount" inputMode="numeric" autoComplete="off" aria-label="Number of members" defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.memberCount ?? String(Math.max(1, data.members.length))} />
Claims: The protected series has the parent company's number of owners.
True: routes-portal.ts:1853–1859 derives data.members from parent OA owners. OrdersInProgress.tsx:545 uses that count for a series EIN too, even though templates-oa-multi.md:120/132 give the Company the entire protected-series interest. Submitted memberCount persists at routes-portal.ts:2198 and reaches ServiceOrdersSection.tsx:328. Source-confirmed; not a claim of observed external IRS submission. The adjacent parent-S-package tax hint is recorded as residual prior N1.07 rather than another new defect.
Proposed replacement (not approved): For a protected-series EIN, derive the initial owner count from that series' ownership. For the company-owned series created by these agreements, prefill 1. Do not count the parent company's members as owners of its series.
Rechecked by codex-reader-5: Actual OrdersInProgress545 seed uses parent data.members and API1853–1859 obtains parent effectiveOwners;2198 persists supplied count; master3.6 gives Company entire series interest. Wrong series member-count seed is new. However portal taxhint547–549 infers series S treatment from parent package: same inference already covered by priorN1.07, whose replacement specifically says not to infer series treatment from parent package. Split into new member-count finding and residual priorN1.07 sighting. Avoid universal tax-classification advice; root IRS review required for any specific tax treatment. A generic entity-specific explanation is supported. Root narrowed this finding to owner count; no tax-classification replacement remains.


## Accumulated instructions — 8 of 8 addressed

1. Implement only the three presented findings; leave the other seven new findings open.
2. Use Adam’s general two-month-and15-day wording and holiday/weekend caution; no computed deadline in client questionnaire or package wording.
3. Correct internal weekend/IRS/DC holiday rollover so Monday is not prematurely labeled late; preserve the formation-date starting point, five-day service runway, 65-day purchase limit and issued-EIN requirement.
4. Preserve no-refund-after-details policy and accurately describe delayed package generation while EIN is pending.
5. Series owned by the company starts at one; parent application uses parent membership and explicit client answers remain respected. Separate tax-classification inference is outside this finding.
6. Keep prior fixes, histories and assertions; update affected date/output expectations to match the approved correction, retaining every prior test label.
7. Work in a separate clone, keep verified return point, run isolated negative/positive tests and inspect rendered output; install nothing.
8. Commit with ordinary hooks and run exact-commit full review. No acceptance, integration, push, Dropbox publication or old test-data cleanup.

## USER WALK — client reading refunds
1. Opens Terms or FAQ before purchasing an S-election package.
2. Reads that submitting details ends refund eligibility.
3. Submits details while the purchased EIN service is pending and sees answers saved rather than a promised completed package.
Expects: the same delivery explanation in both places and a completed package when the required details and issued EIN are available.

## USER WALK — client preparing Form2553
1. Opens the S-election questionnaire and enters the company formation date.
2. Reads the general deadline wording, weekend/holiday caution and instruction not to delay filing.
3. Downloads the completed package and sees consistent instructions; the service separately refuses insufficient preparation time without incorrectly claiming a still-timely election is already late.
Expects: no specific computed filing date presented as definitive and no reduction in the service preparation window.

## USER WALK — client obtaining a protected-series EIN
1. Opens Provide details securely on the protected series’ EIN order.
2. Sees Number of members initially1 because the parent company owns the series; a company EIN instead starts with the parent’s own member count.
3. Submits the application and the office reads the same count in its IRS assistant.
Expects: the series does not inherit its parent’s number of individual members, and explicitly entered saved answers are retained.

## Verification contract

Run the same focused harnesses against81a7290 and the repaired tree, keeping complete outputs and distinguishing setup failures from defect reproductions. Exercise real React components, actual EIN routes and office answers, calendar boundary/observed-holiday fixtures, no-exact-date questionnaire and package output, and rendered Terms/FAQ/PDF. Preserve all prior mandatory checks. The full review targets the local committed tree, with no remote or publication.
