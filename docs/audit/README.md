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

## Repairs — the fix ledger (17 Sep 2026, FAILURES.md P88–P92)

Everything above finds defects. This part records repairs, so that a fix is a
record rather than a chat message, is not done twice, and is not quietly
undone later. Codex reviewed the design in four rounds, rejected the first
build (revision 1, 19 findings) and the second (revision 2: 12 corrected, 7
partly, 9 new reproductions), then reviewed the plan for this revision twice
and approved the plan before Adam's Go. The implementation review then found
ten defects. Corrective batch `0-repair` continues that work in a separate
clone; it does not infer acceptance or rejection of revision 3. Its scope and
evidence are in `batches/0-repair/`. Earlier reviews are kept under `batches/0/`
(`codex-review-r1.md`, `codex-review-r2.md`, `codex-plan-review-r3.md`).

What it promises: it DETECTS a regression that a recorded assertion covers,
and on Adam's Mac it refuses a release he has not accepted. It does not
promise that a past fix can never be disturbed. It is procedural:
`git push --no-verify`, or a session using Adam's administrator login, goes
around it, and NOTHING ON GITHUB CHECKS ADAM'S ACCEPTANCE — the GitHub
workflow runs the guard against the ledger of the commit being replaced and
replays the recorded assertions, which is a different thing. It stops a
careless session, not a determined one.

### The rule

Every product fix — from the audit or not — needs Adam's acceptance of its
exact reviewed version. **Go authorizes the work. It does not accept the
result.** Only a push made purely of record files passes without acceptance,
and only if it obeys the records rules, each of which fails closed:

- **R1** `FAILURES.md` is append-only: what was already written is an
  unchanged prefix, and the addition comes after it. That is all this proves
  — the file is read by no script and controls nothing; what an appended
  entry says is not checked. An informational exception, stated as such.
- **R2** `findings-open.md` equals what the ledger in the same push renders.
- **R3** `rulings.md` is an audit control (a ruling there suppresses
  findings): a line may be added only if it carries a ruling Adam recorded
  himself. `batch.ts ruling` appends a canonical entry naming the exact item,
  optional part and complete JSON-escaped text; no substring match is accepted.
  Existing content must remain an unchanged prefix.
- **R4** `ledger.json` keeps every invariant below in strict mode.
- **R5** `batches/<id>/batch.json` is replaced only by the valid next
  revision; every revision's snapshot (`revisions/r<n>.json`) is retained and
  matches its frozen hash. `batch.md`, `evidence/*` and `codex-*.md` are
  informational.
- **R6** Nothing else is a record path.

Two kinds of change are told apart in code. An ADMINISTRATIVE EVENT is
validated and may be records only: a batch moving by its transition table, a
ruling Adam actually made satisfying a wait, a snapshot being retained. A
CONTROL MIGRATION — changing a wait, a link, the set of parts, an accepted
fix's assertions — is never records only: it happens only inside a migration
file Adam approved by record, or inside a commit he accepts as a product
change.

### What the ledger may never do

- **Batches move only by events.** `authorized` → `implemented` → (`accepted
  by Adam`, `released`), or `authorized`/`implemented` → `rejected by Adam`.
  Released and rejected are final. A status reached any other way, or with
  no event, is refused. A new revision needs the one before it on record as
  rejected. The events that stand for Adam's decision need his record outside
  the repository: a rejection record after the batch was authorized; a
  standing acceptance of the released commit AND package. The GitHub guard
  cannot read those records and says so; it never assumes them.
- **An item is immutable**: its text, tag, area, source, verdicts, related
  items, waits, set of parts, each part's scope, link and waits, and an
  recorded fix's assertions from implementation onward. A part's state must
  match its owning batch and retained work order; a session-written reopening
  cannot discard its fix. An authenticated rejection can reopen unfinished
  work. A wait is satisfied by a ruling, never edited. A
  part can be replaced only by a migration, which keeps the old part under
  `retiredParts` with its whole history.
- **A migration** is a file, `migrations/<id>.json`, declaring the exact
  change per item; `ledger-build.ts --migrate <id>` applies it and refuses
  unless everything undeclared is identical afterwards. The guard and release
  gate independently compare the exact declared values, including sibling
  parts and complete retirement records; approval of one link permits only
  that link. Newly created parts start open with their migration history.
  The ledger records it
  as a ruling carrying the file's hash. Records only if Adam's whole message
  "Approve migration <id>" was recorded for that exact file; otherwise it
  ships inside a commit he accepts. Migration 001 moved every second-sighting
  link to a PART of its main record and split seven compound findings.
- **A ruling** enters the ledger only from Adam's record: his whole message
  "Ruling 28: …" (or "Ruling 27, part retention: …"), or
  `accept.ts ruling` in his terminal, then `batch.ts ruling` copies it. The
  chat hook preserves internal whitespace, newlines and the full text; it
  does not truncate a long decision or discard a condition at its end.
- **Work is claimed by defect.** A second sighting links to a part of its
  main record; the defect group is that part and everything pointing at it.
  One item's independent parts can be in different batches; a batch that
  takes one place of a defect must take every open place of it.

### The files

- `ledger.json` — the only record. 334 source records (267 + Codex's 67, under
  Codex's own numbers N1.01–N4.11), none ever removed. Each keeps Codex's
  verdict on the DEFECT and, separately, on the proposed REPLACEMENT — a
  confirmed defect is not an approved fix, and a rejected replacement is
  printed as rejected in the list and in every work order. Each has what it
  waits on and one or more PARTS, because one finding can hold complaints that
  close at different times; a part may link to the part of another item it is
  a second sighting of, and inherits that part's and item's waits. A part runs
  open → assigned → implemented → accepted → released. Every history is
  append-only.
- `ledger-build.ts` + `verdicts.json` — seed the ledger by script from the
  auditors' own files, validating every id against Codex's own statuses;
  `--migrate <id>` applies a declared migration, checked.
- `migrations/<id>.json` — each structural change ever made, as declared.
- `batches/<id>/batch.json` — written BEFORE Go: the items, each one's narrow
  scope, the exact words to replace and the words Adam approved, every file
  the batch may touch, the test-only files a new check needs, any check it
  removes on purpose. Frozen at Go by hash and retained as
  `revisions/r<n>.json`. A change is the next revision, approved again.
- `batch.ts` — authorize, implemented, released, reject, ruling. "released"
  uses the release gate's own acceptance lookup (a later rejection stops it),
  the package Adam's acceptance names, asks the REMOTE what its main is, and
  records the push, the live site and the Dropbox copies as three separate
  facts. "reject" and "ruling" copy Adam's records; nothing is manufactured.
- `guard.ts` — the commit step, run on the first AND the final index. Fails
  closed if the ledger is gone. Enforces everything under "What the ledger
  may never do" against the last commit, reading Adam's records; permits a
  Go-authorized migration so it can be committed and tested. Replays every
  accepted fix against the files (found fresh each run); a permitted leftover
  sentence is matched at its exact place and everything else is a relapse.
  For a batch it refuses an undeclared file (new and unstaged ones included),
  an undeclared change to a check, hook or setting, a check that disappears
  from a suite unnamed, and — in a wording file — any difference from what
  the declared replacements produce. Code files cannot be judged line by
  line; they are left, in those words, to Adam's complete-diff review.
  `--against <before>..<after>` is the GitHub form: the same rules between two
  commits, with the checks that need Adam's records reported as unavailable.
  Their absence does not itself fail CI; malformed transitions still fail,
  and the local gate still refuses without the required owner record.
- `../../webapp/scripts/browser-isolation.ts` — every browser the check
  scripts open has service workers blocked and aborts every request to
  another machine before any HTTP handler runs, in every context, popups
  included. All HTTP redirects are refused before a second request; the
  current walkthrough needs none. API forwarding uses `localFetch` with the
  same rule. URL overrides are checked, synthetic redirects are blocked,
  and `route.fetch` is explicitly unsupported. Native forwarding preserves
  binary responses, multiple cookies and string/Buffer request bodies;
  explicit header overrides replace the original headers. These are HTTP
  controls, not an operating-system network sandbox or a WebSocket guarantee.
  A lint rule refuses a bare `page.route` in that folder.
- `../../webapp/scripts/audit-assert.ts` — replays what a text search cannot:
  text on a rendered page, a generated Word document, a named behaviour check.
  A result counts only from the same suite, label, commit AND run; both
  identities are required arguments.
- `../../webapp/scripts/audit-review.ts` — checks the exact commit out into
  its own folder and runs EVERYTHING from there: the mandatory checks (a batch
  cannot shorten the list), the build, the site. It runs a behaviour fix's
  check on the tree before the fix, carrying the declared test-only files,
  and keeps that run's full output. Every package has an IDENTITY, is never
  overwritten, records whether the run was partial, and carries the manifest
  of the kept site. Acceptance, serving and release require explicit
  `partial: null`, a nonempty manifest with `index.html`, unique safe paths
  and the exact file set; symlinks are refused. Every package integrity error
  prevents acceptance. A partial run is never announced ready. `--serve <batch>
  --package <id>` shows a package before acceptance; without an id, only the
  package Adam's acceptance names. The server it starts must be its own
  child, owning its port, and must report itself offline, or nothing opens.
  A clone with no remote compares with the declared batch base and labels it
  an offline comparison baseline; it makes no claim about current remote main.
  A `codex/` branch also requires `FPSLLC_BATCH=<id>` to select its work order.
- `accept.ts` and `.claude/hooks/accept-prompt.sh` — Adam's records. Each is
  the WHOLE message: `Accept A, revision 1, 3f9c2ab` (optionally followed by
  `Go`), `Reject A, revision 1: reason`, `Ruling 28: text`, `Approve migration
  001-part-level-links`. Anything added records nothing and the session is
  told to say so. An acceptance names one package: with several for the same
  commit it refuses and prints the exact command. Recorded under `~/.fpsllc/`,
  outside the repository.
- `release-check.ts` — the one release gate, used by `.githooks/pre-push` and
  by `publish-docs.ts`. It judges the COMPLETE difference a push would
  introduce against the package Adam's acceptance names: full run, right
  commit and base, same diff, every mandatory check passed, the kept site
  exactly its manifest, the Word documents byte-for-byte.
- `publish-docs.ts` — the only writer of the Dropbox copies: the committed,
  reviewed files, for an accepted commit and its package, with no exception.
  Documents whose bytes already match are not written.
- `ledger-print.ts` — the readable list, a batch's work order (with earlier
  fixes in the same files marked DO NOT DISTURB), and the rulings queue, built
  from every unfinished part's unmet waits.
- `demo.ts` — plants each fault in a disposable copy and shows the refusal.
  Each row says how it was measured; no row shows an exit code it did not
  have. Revision 3's rows were written first and run against revision 2
  (`batches/0/evidence/red-before-revision-3.md`), then after. That historical
  report contains invalid red cases identified in the r3 review; preserve it
  as history, not proof. `repair-check.ts --historical-only --against d0e3689`
  supplies the corrected package-directory and actual-inline-browser adapters.
  Every measured historical push resets the disposable remote first. The
  ordinary-page control already passes on r2 and is not called a reproduction.
  `demo.ts --batch 0-repair --with-behaviour` exercises the whole sequence,
  including an unchanged clean commit. Its final evidence-retention row is
  included before totals are calculated.
- `repair-check.ts` — the additional mandatory `ledger-controls` suite, run
  by both the review command and CI. It uses disposable clones and owner
  records. `--against <commit>` applies the same probes to earlier controls;
  fixture check results are explicitly simulated, never reported as a product
  test run. Browser probes use loopback sinks only.

### One batch

1. On main: write `batches/<id>/batch.json` and its readable `.md`. The plan
   goes to Codex in a text box first; Adam edits the wording, names the
   model, says Go.
2. `batch.ts authorize <id>` proves every "before" sentence is in its file at
   the base, freezes the batch, keeps its snapshot, assigns the items. Commit
   and push: records only. Assignment is on main before work starts.
3. `git checkout -b audit/batch-<id>` — a LOCAL branch. It is not pushed:
   a pushed branch makes Vercel build a preview, and the server treats any
   Vercel deployment as production (`isProd: !!process.env.VERCEL`).
4. The model works from `ledger-print.ts order <id>`, then
   `batch.ts implemented <id>`, and commits (the guard runs, twice).
5. `cd webapp && bun run scripts/audit-review.ts <id>` — checks, package, site.
   It prints the package id with the commit. Codex reviews the package's diff
   against the work order.
6. Adam looks (`--serve <id> --package <the id>`), then his whole message is
   `Accept <id>, revision <n>, <commit>` — or he rejects (`Reject <id>,
   revision <n>: reason`), and then NOTHING in the batch is released; the rest
   is reissued as the next revision.
7. Release: fast-forward main to the accepted commit and push (the gate runs),
   `publish-docs.ts` if Word documents changed, then
   `batch.ts released <id> <commit> --deployed "…" --documents "…"` and a
   records-only push.
