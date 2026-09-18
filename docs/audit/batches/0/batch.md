# Batch 0 — the fix ledger itself (revision 3)

Authorized by Adam's "Go" on 17 Sep 2026, for batch zero only. Accepting it
authorizes no product fix. Revision 1 (commit 180623b) was REJECTED by Adam
on Codex's review (19 findings, codex-review-r1.md). Revision 2 (d0e3689) was
REJECTED by Adam's own message "Reject 0, revision 2" on Codex's review (12
corrected, 7 partly, 9 new reproductions A–I, codex-review-r2.md). The plan
for revision 3 went to Codex in a text box first: two rounds of corrections,
then approval with five implementation details (codex-plan-review-r3.md).
This is that plan, built.

No product page, email, agreement, price, sentence or server file changes.

## Codex's checklist and what changed (rows in evidence/demo.md)

1. Records only, closed: R1 FAILURES.md append-only (an informational
   exception, stated as such), R2 the readable list generated, R3 rulings.md
   authenticated against Adam's ruling records, R4 the ledger strict, R5
   batch files replaced only by the valid next revision with every
   revision's snapshot retained, R6 nothing else. (R1a, R1b, R1c, R3a, R3b.)
2. Batch status moves only by the transition table; the events "authorized",
   "implemented", "accepted by Adam", "released", "rejected by Adam" from now
   on, earlier history untouched; released and rejected are final; a
   rejection or release needs Adam's record outside the repository. Snapshots
   revisions/r1.json and r2.json are the files of 180623b and d0e3689 and
   match their recorded hashes. (A1a, A1b, A2, A3, M1.)
3. GitHub compares the ledger with the one at the commit being replaced —
   the push's previous tip, a pull request's base, or origin/main for a new
   branch — and fails if that commit cannot be read; it never uses HEAD^.
   Adam's records are not on GitHub, and the guard says so there.
4. Immutable item fields, parts, waits, links and accepted assertions; one
   migration mechanism (migrations/<id>.json, applied by
   `ledger-build.ts --migrate`, checked); a ruling enters the ledger only from
   Adam's record; a wait is satisfied, never deleted. (B1, B2, R3b.)
5. Part-level links (migration 001): 22 links kept to a main item's only
   part; 184↔171, 212↔194, 258↔118 made related, not linked; 65, 120, 128,
   164, 178, 187 and 256 split, their sightings linked to the specific part;
   95's eyebrow → 198, its title unlinked (waits on ruling 82); 112 →
   100:unused-code; retired parts kept with their history. Targets and
   cycles validated. (C1, C2a, C2b, C3, M2.)
6. The rulings queue from every unfinished part's unmet waits: 63 unblocks
   63, 152, 153, 202; 28 unblocks 28, 201. (D1, D2.)
7. Browser isolation by one shared wrapper: every context created with
   service workers blocked and an outside-request abort before any page;
   every handler in the walk and the assertion replay installed through it;
   a lint rule refuses a bare page.route in the scripts folder. Four probes
   with a mocked sink. (E1–E4.)
8. Run identity: the assertion replay requires --commit and --run and matches
   both; the workflow passes them. (F1, F2, F3.)
9. Rejection arguments named: "Reject A: 2" is batch A, no revision, reason
   "2". (G1, G2, G3.)
10. Package identity everywhere: a random id, never overwritten, partial
    marked and refused at acceptance and release, the kept site verified
    against its complete manifest, one shared resolver, ambiguity refused
    with the exact command, --serve --package. (H1a, H1b, H4a, H2a, H2b,
    H3, H6, H5.)
11. Demonstrations written first and run against revision 2
    (red-before-revision-3.md), then against revision 3 (demo.md); fixture
    resets counted in the header; C15's before-fix log retained and verified
    after cleanup (Z).
12. Migration 001 applied by the checked command; revision 2 rejected only
    from Adam's own message, in its own commit (937d9d8), before revision 3
    was authorized.
13. This file and README.md describe what the demonstrations show.

Also from Codex's second round: the isolation wrapper runs before every
handler regardless of registration order; the migration file is exact per
item; package identity reaches the publisher; the demonstration sequence M
runs the real revision-3 commit through guard, review, refused push,
simulated acceptance, permitted push, release record and bookkeeping push,
against main's real baseline, in a second clean clone.

## Evidence (in evidence/)

- red-before-revision-3.md — the revision-3 rows, run against revision 2
  before the fixes: NOT AS REQUIRED where they must be.
- demo.md — every row against revision 3.
- browser-isolation-probes.json — what the four probes recorded.
- before-fix-demo.log — the retained before-fix run (C15).
- demo-M-package.json, demo-M-files.txt — the package the M sequence built.
- The review package for the exact commit is outside the repository, in
  ~/.fpsllc/reviews/, with its id, every check's command, folder, exit code
  and output, and the kept site.

## What it does not do — read before trusting it

1. It is procedural. `git push --no-verify`, a session using Adam's
   administrator login, or a process that sets FPSLLC_HOME to a folder with a
   forged record goes around it. Nothing on GitHub checks Adam's acceptance,
   rejection, rulings or migration approvals; the workflow there runs the
   guard against the earlier ledger and the recorded assertions.
2. In a code file the guard cannot tell an authorized change from an
   unrelated one. It blocks undeclared files, undeclared control changes and
   unnamed removed checks; the rest is Adam's complete-diff review.
3. The frozen batch hash lives in the ledger, inside the repository. A
   deliberate rewrite of both is caught only by Adam's review of the complete
   diff and his acceptance of the exact commit.
4. FAILURES.md's append-only rule proves only that nothing already written
   was deleted or changed; what an appended entry says is not checked.
5. Page assertions open public pages only. A fix behind a sign-in is protected
   by a source assertion or a named check in the browser walk.
6. A red before-fix result shows that the named check fails before the fix
   and what it got. Whether that failure IS the reported defect is for the
   reviewer to read in the kept output; no script can decide it.
7. The check-removal rule reads check labels from the server checks and counts
   call sites in the browser walk; a check rewritten to assert less is not
   detected by it.
8. "Released" records that the remote's main contains the commit. The live
   site and the Dropbox copies are recorded only if evidence is given, and as
   "not recorded" otherwise.
9. In the demonstrations, setup commits skip the commit step (the disposable
   copy has no installed packages) and the pushes that create or reset the
   throwaway remotes skip the push hook; each is counted in the report's
   header. Rows marked "simulated" use fixture check results; the M rows use
   real ones. The real commit of this batch goes through the real commit
   step, guard included.
10. Batch zero is authorized on its own branch, because the system does not
    exist on main. From batch A on, authorization is a records-only push to
    main before the branch is cut.
11. Releasing to main still deploys the live site automatically (Vercel).
