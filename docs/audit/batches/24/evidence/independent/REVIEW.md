# Independent Batch24 review

Verdict: no remaining material blocker found within the three approved findings and reviewed changes. This is a focused implementation review, not a new whole-product audit or acceptance/publication authorization.

## Exact tree reviewed

Repository: `/Users/adam/Documents/FLPSLLC Website Review/audit-repair-group-4-2026-09-20/repo`

HEAD/baseline: `81a7290cc77d13c42685a57d9d37f5103cf6d4c4`. These are uncommitted Batch24 changes on that baseline; this is not a certification of a later commit. `reviewed-files.json` records each exact source SHA-256 and line count. `reviewed-diff.patch` captures the compared tracked changes (new untracked harnesses are bound separately by their file hashes).

Diff SHA-256: `24396ff0961b2de6f7efce18a9e9f343b14233f6707275481e568a1fba548873`.

Actual timing helper tested SHA-256: `d43702e2022e17188a75866a6fce46cca72c6d11537cbbc4ee3a67f1bb6bb094`.

## Reading and scope

Read baseline source whole through file tools: form2553Timing.ts113/113, s-election.ts342/342, OrdersInProgress.tsx733/733; total1,188/1,188 lines. Then read every changed hunk in those files, both new harnesses whole (EIN142/142; timing29/29), and changed Terms/FAQ/facts and prior-test hunks. Terms/FAQ/facts were diff-reviewed, not represented as whole-file readings. Read Batch24 batch.md and batch.json. Parsed the ledger claims and snapshot independently.

The work order and retained r1 snapshot are byte-identical. The repository's canonical frozenHashOf for both matches the ledger: `1d78d4e027065defe1da3f5e3005561bb35ab66d38afa30076a7a7cb2a06828b`. Exactly B1-N01, B1-N04 and B3-01 are assigned to Batch24; its record is authorized. The baseline commit resolves.

## Findings checked

- Terms and FAQ use the approved refund/delivery wording. Submission still ends refund eligibility, while delivery waits for required answers and issued EIN.
- Series EIN seed is1; parent company seed retains its membership count and minimum1 fallback. Explicit saved draft values retain nullish precedence. The count-dependent hint reads the same default. The separate parent-S-election tax-classification inference is unchanged and outside this repair.
- All timing messages and responsibility acknowledgment omit the computed deadline. Both normal and record-copy package instructions use the approved general wording; actual IRS form formation/effective dates remain.
- The internal deadline formula retains the IRS month-end arithmetic and now advances weekends/IRS/DC holidays. Friday observance, DC Emancipation Day, adjacent-year New Year, and inauguration's Sunday-only substitution agree with the independently opened sources below.
- The five-calendar-day preparation runway, formation ordering and issued-EIN guard remain. No purchase-route change;65-day eligibility remains outside the diff.
- All prior Batch13 emitted labels and timing-unit literal labels remain. One intermediate renamed unit label was raised and restored; its assertion now checks the owner-approved rule instead of an exact displayed date.

## Independent execution and evidence review

I executed the independent Python calendar oracle against the actual repaired TypeScript helper. All365 formation dates whose raw deadline falls in2026 matched;118 raw deadlines required adjustment. The oracle uses Python calendar.monthrange and the static12-date IRS2026 holiday list, not the implementation's recurring-holiday formulas. Full cases and source/helper identity are in calendar-results.json.

Reproduce from the repository root:

```sh
python3 ../evidence-independent/calendar-oracle.py --repo "$PWD" > ../evidence-independent/calendar-results.json
```

I parsed the implementation agents' retained focused logs and independently compared their labels: timing baseline12/35 versus repaired35/35; browser baseline13/27 versus repaired27/27. Labels match between each red/green pair and are unique. `evidence-check.json` records counts and log hashes. The timing and browser harness sources were reviewed; I did not independently rerun those two complete suites. Parent performs the mandatory exact-commit review.

## Primary sources opened independently

- IRS Publication509(2026), Saturday, Sunday, or legal holiday; Legal holidays; Form2553: https://www.irs.gov/publications/p509 . Its2026 list includes April16 DC Emancipation Day and July3 observed Independence Day. This is the IRS/DC calendar, not the Federal Reserve banking calendar.
- Instructions for Form2553, When To Make the Election: https://www.irs.gov/instructions/i2553 . Checked the day-before-corresponding-day rule and missing-day month-end rule. The January7 example gives the unadjusted arithmetic, not a determination that a particular Saturday is the final deadline.
- DC Code1-612.02(a)–(c): https://code.dccouncil.gov/us/dc/council/code/sections/1-612.02 . Checked recurring holidays, Friday/Monday observance and the inauguration exception.

## Limits

Calendar verification covers recurring IRS/DC holidays. It does not establish state-specific extensions, disaster relief or extraordinary closures. Source/legal reading here confirms the approved rollover mechanism; it does not reopen the owner's formation-start ruling. No live IRS filing or mail delivery was exercised. I reviewed the agents' PDF/screenshot inspection reports, not every image independently. No repository file was edited by this reviewer; only this outside-repository evidence folder was written. No git write, install or publication occurred.
