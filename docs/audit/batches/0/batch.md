# Batch 0 — the fix ledger itself

Authorized by Adam's "Go" on 17 Sep 2026, for batch zero only. Accepting it
authorizes no product fix. No product page, email, agreement, price or
customer-facing sentence changes in this batch.

## What it installs

- The ledger: 334 source records built by script from the auditors' own files
  (267 + Codex's 67), validated id by id against Codex's own statuses.
  12 dropped, 15 optional, 32 corrected replacements, 4 Codex disputes not
  adopted (the Form 2553 deadline), 37 second sightings linked to a main
  record (11 of them Codex's), 37 open items waiting on Adam's ruling.
- The guard in the commit step; the release gate in a new push hook and in
  the Dropbox publisher; Adam's acceptance from chat or a terminal, recorded
  outside the repository; the review command and its isolated, self-proving
  offline site; the assertion runner in the GitHub check.
- Two changes to existing controls: the Word generator no longer writes to
  Dropbox (it did so at every local commit that touched a master), and a
  change to the Instructions master now sets off Word regeneration.
- The two check suites write their results by label (three lines each). No
  check was added, removed or altered.

## Evidence (in evidence/)

- demo.md — 29 demonstrations in a disposable copy with a throwaway remote
  and a simulated acceptance: the valid change and the valid release pass;
  each planted fault is refused for its own stated reason.
- assertions.md — a page, a Word document and a named check: passing, failing,
  and failing when no results are supplied.
- dropbox.md — the Word generator run for real; all 54 Dropbox files identical
  before and after, by path and content hash. Also found: the generator is not
  byte-stable, which is why release copies the committed files.
- accept-hook.md — the chat hook on six messages.
- The review package for the exact commit is outside the repository, in
  ~/.fpsllc/reviews/, with every check's command, exit code and output.

## What it does not do — read before trusting it

1. It is procedural. `git push --no-verify`, a session using Adam's
   administrator login, or a process that sets FPSLLC_HOME to a folder with a
   forged acceptance goes around it. The GitHub check is detection afterwards.
2. In a code file the guard cannot tell an authorized change from an
   unrelated one. It blocks undeclared files and undeclared changes to
   checks; the rest is Adam's complete-diff review, with Codex's beside it.
3. The frozen batch hash lives in the ledger, inside the repository. It
   catches an accidental edit. A deliberate rewrite of both is caught only by
   Adam's review of the complete diff and his acceptance of the exact commit.
4. Page assertions open public pages only. A fix behind a sign-in is protected
   by a source assertion or by a named check in the browser walk.
5. The ledger records "accepted" only at release, from the acceptance file; an
   acceptance cannot be written into the commit it accepts.
6. In the demonstrations the guard was run directly and setup commits used
   --no-verify, because the disposable copy has no installed packages. The
   real commit of this batch went through the real commit step, guard
   included; every push in the copy went through the real push hook.
7. Batch zero was authorized on its own branch, because the system did not
   exist on main. From batch A on, authorization is a records-only push to
   main before the branch is cut, so no item can be claimed twice.
8. Releasing to main still deploys the live site automatically (Vercel).
