# Batch 24 browser worker: governing source before product edits

Read full baseline OrdersInProgress.tsx: 733/733 lines, with smaller file reads replacing the truncated whole-file display. Scoped evidence also reopened the application payload, actual route persistence, and office assistant consumer. The only product file edited by this worker is OrdersInProgress.tsx.

Approved batch.md B3-01:
> Seed protected-series EIN membership count as one company owner; retain parent membership count for parent EINs and explicit saved client answers; verify submission, storage and office display.

Agreement source, templates-oa-multi.md §4.2:
> Each Protected Series is wholly owned by the Company as provided in Section 3.6.

Agreement §3.6(a):
> The Company owns all of the protected-series transferable interests of each Protected Series, as provided in s. 605.2303(1)-(3), Florida Statutes. Every distribution made by a Protected Series is made to the Company.

Baseline OrdersInProgress member-count input:
> defaultValue={(detailsFor ? einDrafts[detailsFor.id] : undefined)?.memberCount ?? String(Math.max(1, data.members.length))}

Its onSubmit carries `memberCount: num("memberCount") || undefined`; routes-portal.ts copies `memberCount: d.memberCount` into stored details; ServiceOrdersSection renders `["Number of members", String(d.memberCount ?? "—")]`.

The new default is one for a series, otherwise the parent count (existing minimum-one fallback). Explicit draft answers retain precedence. The count-dependent explanatory branch uses the same default rather than falling back to the parent's count. Its separate existing S-package tax-classification inference is unchanged, outside this finding.

The browser harness separately renders the exact approved Terms/FAQ and timing copy from batch.md, edited by the parent/timing workers:
> The S corporation election package is not refundable once you submit your details. We generate and deliver the completed package to your client portal when the required details and issued EIN are available.

> The deadline is two months and 15 days from the date the LLC is formed. The exact deadline date may differ based on holidays and weekends, so you should not put off filing it.

USER WALK — EIN applicant and office:
1. Client opens the protected series' EIN application and sees one member by default; the parent EIN opens with its own three members.
2. Client certifies/submits; explicit saved count changes survive close and browser reload.
3. Office opens Fulfill EIN and reads the submitted member count in the IRS assistant.
Expects: no parent-member leakage into the company-owned series and no override of explicitly entered answers.
