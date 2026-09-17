# The sloppy-mistakes audit — how a run goes

Written 16 Sep 2026 after FAILURES.md P86 and P87: three audits run from
memory, each reported as thorough, each missing what the next one found. An
audit is a system, not a sitting. Nothing in it depends on what anyone
remembers.

## The files

- `inventory.ts` — builds `inventory.json` from the repository: every product
  file with its exact line count and its area. Excluded files are listed with
  the reason. `--buckets N` splits the inventory into N buckets of roughly
  equal lines under `runs/<day>/buckets.json`.
- `prompt.md` — the reader's instruction, verbatim. Each reader gets it
  unchanged plus its bucket, its prior findings and its report path.
- `rulings.md` — Adam's rulings on wording that stays. Readers may not flag
  them. A ruling is added the day it is given.
- `findings-<day>.md` — each audit's list, numbered, with Adam's ruling beside
  each item as he gives it. The next audit's first job is this file.
- `findings-open.md` — GENERATED from the fix ledger (below): every item from
  every run with its status and what was done about it. Nobody edits it; the
  commit step refuses a copy that differs from the ledger. The 16 Sep working
  list it replaced is kept unchanged as `sources/findings-open-2026-09-16.md`.
- `coverage-check.ts` — the gate. Reads every report under `runs/<day>/`,
  compares it to the inventory, and refuses the audit if any file is missing
  or short, any finding lacks a part, or any prior item is unmarked. Prints
  the fraction.
- `runs/<day>/bucket-N.json` — one report per reader: files with lines read,
  the prior findings re-verified, the new findings.

## A run

1. `bun run docs/audit/inventory.ts --buckets 7` — the inventory and the
   buckets for today.
2. One reader per bucket, in a fresh context, given `prompt.md` with the three
   blocks filled from `buckets.json` and the previous `findings-<day>.md`.
   Readers do not write code; they write `runs/<day>/bucket-N.json`.
3. `bun run docs/audit/coverage-check.ts` — must print "coverage check
   passed". If it does not, the missing or short files go back to a reader;
   nothing is reported until it passes.
4. Every finding is re-opened at its file and line by the operator before it
   is written into `findings-<day>.md`. A finding the file does not support is
   dropped with a note.
5. The report to Adam is `findings-<day>.md`, grouped by area, the fraction on
   the first line. His rulings are written beside the items and into
   `rulings.md`.

## What "thorough" means here

Every file in the inventory, read whole, by someone who did not write it,
with the line count stated and checked by a script. A count of findings is
reported only with the fraction read beside it.

## Repairs — the fix ledger (17 Sep 2026, FAILURES.md P88–P91)

Everything above finds defects. This part records repairs, so that a fix is a
record rather than a chat message, is not done twice, and is not quietly
undone later. Codex reviewed the design in four rounds, then rejected the
first build (revision 1) with 19 findings; this is revision 2, and Codex's
review is kept at `batches/0/codex-review-r1.md`.

What it promises: it DETECTS a regression that a recorded assertion covers,
and on Adam's Mac it refuses a release he has not accepted. It does not
promise that a past fix can never be disturbed. It is procedural:
`git push --no-verify`, or a session using Adam's administrator login, goes
around it, and NOTHING ON GITHUB CHECKS ADAM'S ACCEPTANCE — the GitHub
workflow runs the guard and replays the recorded assertions, which is a
different thing. It stops a careless session, not a determined one.

### The rule

Every product fix — from the audit or not — needs Adam's acceptance of its
exact reviewed version. **Go authorizes the work. It does not accept the
result.** Only a push made purely of record files (FAILURES.md, the ledger,
rulings, batch folders) passes without acceptance, and only if it is nothing
more than records: the gate decides that from the files in the push, and a
"records" push that deletes the ledger, rewrites history, touches a batch file
frozen at Go, or changes an accepted fix's protection is treated as a product
change.

### The files

- `ledger.json` — the only record. 334 source records (267 + Codex's 67, under
  Codex's own numbers N1.01–N4.11), none ever removed. Each keeps Codex's
  verdict on the DEFECT and, separately, on the proposed REPLACEMENT — a
  confirmed defect is not an approved fix, and a rejected replacement is
  printed as rejected in the list and in every work order. Each has the item
  it is a second sighting of, what it waits on (a second sighting inherits its
  main record's waits), and one or more PARTS, because one finding can hold
  complaints that close at different times. A part runs open → assigned →
  implemented → accepted → released. Item and batch history are append-only.
- `ledger-build.ts` + `verdicts.json` — seed the ledger by script from the
  auditors' own files, validating every id against Codex's own statuses. It
  can be reseeded only while nothing has been authorized or accepted.
- `batches/<id>/batch.json` — written BEFORE Go: the items, each one's narrow
  scope, the exact words to replace and the words Adam approved, every file
  the batch may touch, the test-only files a new check needs, any check it
  removes on purpose. Frozen at Go by hash. A change is the next revision,
  approved again; earlier revisions stay on record.
- `batch.ts` — authorize, implemented, released, reject, ruling. Work is
  claimed BY DEFECT: a main record and its second sightings cannot be in two
  batches at once. "released" uses the release gate's own acceptance lookup (a
  later rejection stops it), asks the REMOTE what its main is, and records the
  push, the live site and the Dropbox copies as three separate facts.
- `guard.ts` — the commit step, run on the first AND the final index. Fails
  closed if the ledger is gone. Replays every accepted fix against the files
  (found fresh each run); a permitted leftover sentence is matched at its
  exact place and everything else is a relapse. For a batch it refuses an
  undeclared file (new and unstaged ones included), an undeclared change to a
  check, hook or setting, a check that disappears from a suite unnamed, and —
  in a wording file — any difference from what the declared replacements
  produce. Code files cannot be judged line by line; they are left, in those
  words, to Adam's complete-diff review.
- `../../webapp/scripts/audit-assert.ts` — replays what a text search cannot:
  text on a rendered page, a generated Word document, a named behaviour check.
  Results are matched by suite, label and commit; a check missing from its own
  suite's results counts as failed. The browser is kept to this machine.
- `../../webapp/scripts/audit-review.ts` — checks the exact commit out into
  its own folder and runs EVERYTHING from there: the mandatory checks (a batch
  cannot shorten the list), the build, the site. It runs a behaviour fix's
  check on the tree before the fix, carrying the declared test-only files,
  and keeps that run's full output. It hashes the Dropbox folder before and
  after, confirms the checkout is still the commit, keeps the built site in
  the package (`~/.fpsllc/reviews/`), and `--serve` shows those same bytes
  later. The server it starts must be its own child, owning its port, and
  must report itself offline, or nothing opens.
- `accept.ts` and `.claude/hooks/accept-prompt.sh` — Adam's acceptance. It is
  the WHOLE message, `Accept A, revision 1, 3f9c2ab`, optionally followed by
  `Go`; anything added records nothing and the session is told to say so. The
  commit is resolved at once to its full identity and must have a review
  package. Recorded in `~/.fpsllc/acceptances.jsonl`, outside the repository.
- `release-check.ts` — the one release gate, used by `.githooks/pre-push` and
  by `publish-docs.ts`. It judges the COMPLETE difference a push would
  introduce against the package Adam reviewed.
- `publish-docs.ts` — the only writer of the Dropbox copies: the committed,
  reviewed files, for an accepted commit, with no exception. Documents whose
  bytes already match are not written.
- `ledger-print.ts` — the readable list, a batch's work order (with earlier
  fixes in the same files marked DO NOT DISTURB), and the rulings queue.
- `demo.ts` — plants each fault in a disposable copy and shows the refusal.
  Each row says how it was measured; no row shows an exit code it did not have.

### One batch

1. On main: write `batches/<id>/batch.json` and its readable `.md`. Adam edits
   the wording, names the model, says Go.
2. `batch.ts authorize <id>` proves every "before" sentence is in its file at
   the base, freezes the batch, assigns the items. Commit and push: records
   only. Assignment is on main before work starts.
3. `git checkout -b audit/batch-<id>` — a LOCAL branch. It is not pushed:
   a pushed branch makes Vercel build a preview, and the server treats any
   Vercel deployment as production (`isProd: !!process.env.VERCEL`).
4. The model works from `ledger-print.ts order <id>`, then
   `batch.ts implemented <id>`, and commits (the guard runs, twice).
5. `cd webapp && bun run scripts/audit-review.ts <id>` — checks, package, site.
   Codex reviews the package's diff against the work order.
6. Adam looks, then his whole message is `Accept <id>, revision <n>, <commit>`
   — or he rejects, and then NOTHING in the batch is released; the rest is
   reissued as the next revision.
7. Release: fast-forward main to the accepted commit and push (the gate runs),
   `publish-docs.ts` if Word documents changed, then
   `batch.ts released <id> <commit> --deployed "…" --documents "…"` and a
   records-only push.
