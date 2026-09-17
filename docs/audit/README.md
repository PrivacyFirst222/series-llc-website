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
