# Batch 0 — the fix ledger itself (revision 2)

Authorized by Adam's "Go" on 17 Sep 2026, for batch zero only. Accepting it
authorizes no product fix. Revision 1 (commit 180623b) was REJECTED by Adam
the same day on Codex's review: 19 findings, kept here as codex-review-r1.md.
Revision 2 corrects all 19 the way Codex's "smallest correction" lines say.

No product page, email, agreement, price, sentence or server file changes.

## The 19 findings and what changed

1. Records-only exemption: the guard and the gate fail closed on a missing
   ledger; batch files are frozen from Go; batch history is append-only; an
   accepted fix's protection cannot change in a records push. (Rows C1–C4.)
2. Acceptance is the whole message; anything added records nothing and says
   so. (C5.)
3. The Dropbox publisher has no exception; identical bytes are not written.
   (C6.)
4. The false claim that the GitHub check catches an unaccepted release is
   removed from every file that made it. (C7.)
5. A mandatory list of checks lives in the gate; a batch cannot shorten it.
   (C8.)
6. The review server must be this command's own child, owning its port.
   (C9.)
7. Everything runs from an isolated checkout of the exact commit; the built
   site is kept and served later as the same bytes. (C10.)
8. Codex's verdict on each proposed replacement is kept and printed — 44
   confirmed defects carry a rejected replacement. (C11.)
9. Work is claimed by defect. (C12.)
10. Items 27 (split), 28, 38 and the four Form 2553 items now wait on Adam;
    second sightings inherit waits. (C13.)
11. One sanitized build environment; the browser is kept to this machine;
    uploaded test files land inside the review's own checkout, which is
    deleted afterwards. (A setting to move that folder was tried and dropped:
    the backup and restore checks read the same folder, and changing them is
    product work that does not belong in this batch.)
12. Results are matched by suite, label and commit. (C14.)
13. The before-fix run carries declared test-only files and keeps its full
    output with what each failing check got. (C15.)
14. New unstaged files count; the control list is longer; the guard runs
    again on the final index. (C16.)
15. A permitted leftover is matched at its exact place. (C17.)
16. Release bookkeeping shares the gate's acceptance lookup and records the
    push, the live site and Dropbox separately. (C18.)
17. The notes on items 38 and 145 are corrected; item 100 is split.
18. An acceptance is stored as the one full commit it names. (C19.)
19. Each demonstration row says how it was measured; none shows an exit code
    it did not have; a check disabled inside a DECLARED file is refused. (C20.)

## Evidence (in evidence/)

- red-before-revision-2.md — Codex's reproductions, written before the fixes
  and run against revision 1: they come out NOT AS REQUIRED, as they must.
- demo.md — the same rows, and the original ones, against revision 2.
- assertions.md, dropbox.md, accept-hook.md — as in revision 1; accept-hook.md
  is rerun against the new hook.
- The review package for the exact commit is outside the repository, in
  ~/.fpsllc/reviews/, with every check's command, folder, exit code and output.

## What it does not do — read before trusting it

1. It is procedural. `git push --no-verify`, a session using Adam's
   administrator login, or a process that sets FPSLLC_HOME to a folder with a
   forged acceptance goes around it. Nothing on GitHub checks Adam's
   acceptance; the workflow there runs the guard and the recorded assertions.
2. In a code file the guard cannot tell an authorized change from an
   unrelated one. It blocks undeclared files, undeclared control changes and
   unnamed removed checks; the rest is Adam's complete-diff review.
3. The frozen batch hash lives in the ledger, inside the repository. A
   deliberate rewrite of both is caught only by Adam's review of the complete
   diff and his acceptance of the exact commit.
4. Page assertions open public pages only. A fix behind a sign-in is protected
   by a source assertion or a named check in the browser walk.
5. A red before-fix result shows that the named check fails before the fix
   and what it got. Whether that failure IS the reported defect is for the
   reviewer to read in the kept output; no script can decide it.
6. The check-removal rule reads check labels from the server checks and counts
   call sites in the browser walk; a check rewritten to assert less is not
   detected by it.
7. "Released" records that the remote's main contains the commit. The live
   site and the Dropbox copies are recorded only if evidence is given, and as
   "not recorded" otherwise.
8. In the demonstrations, setup commits skip the commit step (the disposable
   copy has no installed packages) and one setup push, which creates the
   throwaway remote, skips the push hook. Rows marked "simulated" use fixture
   check results. The real commit of this batch goes through the real commit
   step, guard included.
9. Batch zero is authorized on its own branch, because the system does not
   exist on main. From batch A on, authorization is a records-only push to
   main before the branch is cut.
10. Releasing to main still deploys the live site automatically (Vercel).
