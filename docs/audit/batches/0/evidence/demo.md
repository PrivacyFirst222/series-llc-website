# Batch zero — the demonstrations

Run 2026-09-17T15:53:09.091Z in a disposable copy (/var/folders/2k/xc2djyxn081bmbwwn467__140000gn/T/fix-ledger-demo-FgtOYr) with a throwaway remote and a simulated acceptance file. Nothing here touched the real repository, GitHub or Adam's acceptances.

29 of 29 behaved as required. A row passes only when a valid step exits 0, or a planted fault exits non-zero AND prints its own stated reason.

| # | What was tried | Required | Exit | What it printed |
|---|---|---|---|---|
| 1 | an item that waits on Adam's ruling cannot be put in a batch | refused, for this reason: /waits on Adam's ruling on item 12/ | 1 | batch: REFUSED — item 12 waits on Adam's ruling on item 12 |
| 2 | a 'before' sentence that is not in the file, word for word, cannot be authorized | refused, for this reason: /must be proven present/ | 1 | batch: REFUSED — item 1: the words to replace are in webapp/src/pages/FAQ.tsx 0× at fd102e0, the batch says 1: "Drawn from real customer questions." — the "before" words must be proven present, exactly, before Go |
| 3 | the valid batch is authorized: frozen and assigned | passes | 0 | batch demo r1 authorized: 1 item(s) assigned, batch file frozen as 1701a520b0ad |
| 4 | a push made only of record files needs no acceptance | passes | 0 | release gate: ok for refs/heads/main — records only (3 file(s)) — no acceptance needed |
| 5 | a second batch cannot claim an item already assigned | refused, for this reason: /cannot be claimed twice/ | 1 | batch: REFUSED — item 1 (all) is assigned in batch demo — it cannot be claimed twice |
| 6 | an unrelated edit INSIDE a declared file | refused, for this reason: /differs from what the declared replacements produce/ | 1 | - webapp/src/pages/FAQ.tsx: differs from what the declared replacements produce. |
| 7 | an edit to a file the batch did not declare | refused, for this reason: /HowItWorks\.tsx: changed, but batch demo does not declare it/ | 1 | - webapp/src/pages/HowItWorks.tsx: changed, but batch demo does not declare it |
| 8 | a check switched off inside the check suite | refused, for this reason: /e2e\.ts: changed, but batch demo does not declare it/ | 1 | - webapp/server/e2e.ts: changed, but batch demo does not declare it |
| 9 | the batch file changed after Go | refused, for this reason: /not the one frozen at Go/ | 1 | - batch demo r1: the batch file is not the one frozen at Go (a changed batch is revision 2, approved again) |
| 10 | a missed copy: one place fixed, the second left | refused, for this reason: /retired wording is back in webapp\/src\/pages\/Contact\.tsx/ | 1 | - item 1: retired wording is back in webapp/src/pages/Contact.tsx (1×): "Drawn from real client questions about Florida's Protected Series LLC statute." |
| 11 | THE VALID CHANGE: both declared replacements, nothing else | passes | 0 | guard: ok — 334 records, 1 recorded fix(es) replayed across 173 product files, batch demo within its declared scope |
| 12 | release with NO acceptance from Adam | refused, for this reason: /no acceptance from Adam names commit/ | 1 | - no acceptance from Adam names commit 3e9aa12. This push changes 2 product or control file(s) (webapp/src/pages/Contact.tsx, webapp/src/pages/FAQ.tsx). Go authorizes the work; release needs "Accept <batch>, revision <n>, 3e9aa12". |
| 12a | …and the remote is unchanged by the refused push | remote main is still c7a1497 | 0 | remote main = c7a1497 |
| 13 | accepted, but a required check never ran | refused, for this reason: /required check "walk" did not run for this commit \u2014 missing counts as failed/ | 1 | - required check "walk" did not run for this commit — missing counts as failed |
| 14 | accepted, but a required check was skipped | refused, for this reason: /required check "walk" was skipped \u2014 skipped counts as failed/ | 1 | - required check "walk" was skipped — skipped counts as failed |
| 15 | accepted, but a required check failed | refused, for this reason: /required check "server" failed/ | 1 | - required check "server" failed (exit 1) |
| 16 | a change AFTER acceptance voids it | refused, for this reason: /no acceptance from Adam names commit/ | 1 | - no acceptance from Adam names commit 5dee5aa. This push changes 2 product or control file(s) (webapp/src/pages/Contact.tsx, webapp/src/pages/FAQ.tsx). Go authorizes the work; release needs "Accept <batch>, revision <n>, 5dee5aa". |
| 17 | an earlier, unreviewed commit riding along with an accepted one | refused, for this reason: /main has moved, or other commits would ride along/ | 1 | - Adam reviewed a change cut from 727c0bd; what is live is c7a1497 — main has moved, or other commits would ride along |
| 18 | THE VALID RELEASE: accepted commit, complete package, nothing riding along | passes | 0 | release gate: ok for refs/heads/main — accepted by Adam: batch demo, revision 1, commit 3e9aa12 (terminal, 2026-09-17T15:52) |
| 18a | …and only now is the remote at the accepted commit | remote main is 3e9aa12 | 0 | remote main = 3e9aa12 |
| 19 | the release is recorded against Adam's acceptance | passes | 0 | batch demo r1 recorded as released at 3e9aa12 |
| 20 | a 'records' push that also touches a page | refused, for this reason: /no acceptance from Adam names commit/ | 1 | - no acceptance from Adam names commit f8d2d97. This push changes 1 product or control file(s) (webapp/src/pages/HowItWorks.tsx). Go authorizes the work; release needs "Accept <batch>, revision <n>, f8d2d97". |
| 21 | the same push without the page change | passes | 0 | release gate: ok for refs/heads/main — records only (2 file(s)) — no acceptance needed |
| 22 | a LATER change restores the defect | refused, for this reason: /item 1: (the fixed wording is gone\|retired wording is back)/ | 1 | - item 1: the fixed wording is gone from webapp/src/pages/FAQ.tsx: "The questions people ask before forming a Florida Protected Series LLC, answered." |
| 23 | an accepted fix's protection quietly removed from the ledger | refused, for this reason: /an accepted fix's assertions changed with no ruling/ | 1 | - item 1 part all: an accepted fix's assertions changed with no ruling |
| 24 | a behaviour fix inside its declared files | passes | 0 | guard: ok — 334 records, 2 recorded fix(es) replayed across 173 product files, batch bug within its declared scope |
| 25 | the fix's check passes on the fixed tree (the server checks, run by the review command) | passes | 0 | server … passed (7s) |
| 26 | …and FAILS on the tree before the fix, at its own label | refused, for this reason: /red, as required: "demo: the health report carries the planted field" fails on/ | 1 | red, as required: "demo: the health report carries the planted field" fails on 9cd2c22, before the fix |
| 27 | a named check that also passes BEFORE the fix proves nothing, and the batch is not ready | refused, for this reason: /NOT PROVEN: "fresh database: server boots" PASSES on the tree before the fix/ | 1 | NOT PROVEN: "fresh database: server boots" PASSES on the tree before the fix — it does not detect the defect |

