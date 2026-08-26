#!/bin/bash
# Regenerates every Word document from its master markdown.
#
# The markdown in this repo is the master for the eight operating agreements and
# the Owner's Manual. The .docx files are OUTPUT — regenerated here and never
# edited by hand. Anything typed into a Word file is lost on the next run.
#
# Everything is generated into a staging directory first and measured against
# docs/format-baseline.json, which is taken from the hand-formatted originals in
# docs/source/. If any document comes out less formatted than its original,
# NOTHING is copied anywhere and this script fails. That check exists because a
# generator once preserved every word, silently discarded the typography, and
# wrote the result straight into Dropbox twice.
#
# Invoked three ways:
#   - the git pre-commit hook, whenever a master is staged
#   - Claude, via the exact-match allowlist in edit-gate-pretool.sh
#   - by hand: .claude/hooks/update-word-docs.sh
#
# Takes no arguments, so there is nothing to inject.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GEN="$ROOT/docs/md-to-docx.py"
CHECK="$ROOT/docs/format-check.py"
OUT_REPO="$ROOT/docs/word"
OUT_DROPBOX="/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT_REPO"

# master markdown | Word filename
DOCS=(
  "webapp/server/templates-oa-single.md|SMMMDE - FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx"
  "webapp/server/templates-oa-multi.md|FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-s.md|FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx"
  "webapp/server/templates-oa-member.md|FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-member-s.md|FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx"
  "webapp/server/templates-oa-single-s.md|SMMMS - FPSLLC Operating Agreement - Manager-Managed Single Member (S Corporation) - DRAFT.docx"
  "webapp/server/templates-oa-member-single.md|SMMEMDE - FPSLLC Operating Agreement - Member-Managed Single Member (Disregarded) - DRAFT.docx"
  "webapp/server/templates-oa-member-single-s.md|SMMEMS - FPSLLC Operating Agreement - Member-Managed Single Member (S Corporation) - DRAFT.docx"
  "docs/owners-manual.md|Series LLC Owners Manual - REVISED DRAFT.docx"
  "docs/statement-of-authorized-representative.md|FPSLLC Statement of Authorized Representative - FORM.docx"
  "docs/oa-instructions.md|FPSLLC Operating Agreement Instructions - DRAFT.docx"
)

count=0
for entry in "${DOCS[@]}"; do
  src="${entry%%|*}"
  name="${entry##*|}"
  if [ ! -f "$ROOT/$src" ]; then
    echo "MASTER MISSING: $src" >&2
    exit 1
  fi
  python3 "$GEN" "$ROOT/$src" "$STAGE/$name"
  count=$((count + 1))
done

# Provision gate. Runs first, because it answers the question that comes before
# "is this well drafted": should this provision exist at all. Every numbered
# provision must have a row in docs/oa-map.md naming who it binds and who
# benefits, and a covenant that benefits nobody fails. Change a provision and
# its hash changes, so its row resets and must be re-annotated — a covenant
# cannot be reworded without restating who it is for.
echo "mapping the provisions"
if ! python3 "$ROOT/docs/provision-map.py" --check; then
  echo "update-word-docs: UNMAPPED OR UNJUSTIFIED PROVISION — nothing written" >&2
  echo "  run: python3 docs/provision-map.py --update, then annotate the new rows" >&2
  exit 1
fi
python3 "$ROOT/docs/provision-map.py" --diff

# The result, not the diff. A diff shows what was done; it cannot show what was
# left behind, because what was left behind did not change. This prints the
# current full text of every provision that differs from HEAD and of the
# provision on either side, because stranded text lands on an untouched
# neighbour — which is exactly how a deleted s. 9.5 left an S corporation
# savings clause hanging off "Change in Circumstances". Nothing here fails; it
# is text to read, and it is the only step in this file addressed to a reader.
echo "reading back the changed provisions"
python3 "$ROOT/docs/provision-map.py" --result

# Structural gate. Whether the document still holds together as a document:
# articles and sections in order with no gaps and no reuse, lettered paragraphs
# unbroken, every internal Section/Article/Exhibit reference resolving inside the
# SAME form, no provision cut off mid-sentence, definitions alphabetical and
# defined once. A reader assumes all of this and therefore never checks it.
# --selftest runs first and breaks each invariant on purpose: a check nobody has
# watched fail is not known to work.
echo "checking the masters hold together"
if ! python3 "$ROOT/docs/structure.py" --selftest; then
  echo "update-word-docs: A STRUCTURAL CHECK IS DEAD — nothing written" >&2
  exit 1
fi
if ! python3 "$ROOT/docs/structure.py"; then
  echo "update-word-docs: STRUCTURAL DEFECT — nothing written" >&2
  exit 1
fi

# Event gate. Everything above reads the document and asks whether what is there
# is sound. This starts from the world — 63 things that happen to a real company —
# and asks whether each form answers them, because the fault that leaves no trace
# is the ABSENCE. A missing provision produces no text, no diff and no failing
# check, and every high-value catch Adam made this month was a question about
# something that was not on the screen. Silence about an event is allowed and must
# carry a written reason; a provision that answers no event fails.
echo "answering the events"
if ! python3 "$ROOT/docs/event-map.py" --selftest; then
  echo "update-word-docs: AN EVENT CHECK IS DEAD — nothing written" >&2
  exit 1
fi
if ! python3 "$ROOT/docs/event-map.py" --quiet; then
  echo "update-word-docs: THE EVENT MAP NO LONGER MATCHES THE FORMS — nothing written" >&2
  exit 1
fi

# Coverage gate. The event map runs from the world; this runs from the statute,
# and catches the one thing neither of the others can — a section of Chapter 605
# NOBODY EVER CONSIDERED. An unconsidered provision leaves no trace at all, so
# the only way to find it is to enumerate the chapter: all 191 sections, each
# with a disposition and a written reason. Four are marked GAP today.
echo "answering Chapter 605"
if ! python3 "$ROOT/docs/coverage-605.py" --selftest; then
  echo "update-word-docs: A COVERAGE CHECK IS DEAD — nothing written" >&2
  exit 1
fi
if ! python3 "$ROOT/docs/coverage-605.py" --quiet; then
  echo "update-word-docs: THE COVERAGE MAP NO LONGER MATCHES THE FORMS — nothing written" >&2
  exit 1
fi

# Consistency gate. The manual and the Instructions describe the agreements, so
# every section they cite is a claim about a file in this repo. Provisions get
# renumbered and deleted; the sentences around the numbers do not follow on their
# own. This resolves every reference and refuses a dangling one — it cannot read a
# sentence for meaning, which is the rule in CLAUDE.md and stays a human job.
echo "resolving the guidance documents' references"
if ! python3 "$ROOT/docs/docs-consistency.py"; then
  echo "update-word-docs: DANGLING REFERENCE — nothing written" >&2
  exit 1
fi

# Drafting gate. Every check here exists because a fault reached a document and
# Adam found it by reading. Runs before the formatting gate: no point measuring
# the typography of a document that says "should" in a covenant.
echo "linting the agreement masters"
if ! python3 "$ROOT/docs/drafting-lint.py" "$ROOT"/webapp/server/templates-oa-*.md; then
  echo "update-word-docs: DRAFTING PROBLEM — nothing written" >&2
  exit 1
fi

# Provenance gate. Adam's rule: the generator may fill a slot, choose an
# alternative the master spells out, omit a marked provision, or repeat a
# marked block — it may never compose a sentence. This regenerates all eight
# forms with sentinel inputs and requires every delivered paragraph to trace
# verbatim to its master. Zero divergence is tolerated.
echo "tracing every generated paragraph to a master"
if ! (cd "$ROOT/webapp" && bun run server/provenance.ts >/dev/null); then
  (cd "$ROOT/webapp" && bun run server/provenance.ts) 2>&1 | tail -30 >&2
  echo "update-word-docs: COMPOSED PROSE IN A GENERATED AGREEMENT — nothing written" >&2
  exit 1
fi

# The gate. Measured against the originals; a regression stops everything here,
# before a single file has been replaced. The pagination half of it is new on
# 16 August and its checks are broken on purpose first: the four faults it now
# measures — single spacing instead of 1.15, headings flush against their text,
# keepLines on every paragraph, and page breaks as empty paragraphs — all
# shipped in eight agreements precisely because nothing measured them, and a
# measurement that has never been watched fail would repeat that.
echo "breaking the pagination checks on purpose"
if ! python3 "$ROOT/docs/format-selftest.py"; then
  echo "update-word-docs: A FORMATTING CHECK IS DEAD — nothing written" >&2
  exit 1
fi
echo "checking $count documents against docs/source/"
if ! python3 "$CHECK" "$STAGE"/*.docx; then
  echo "update-word-docs: FORMATTING REGRESSION — nothing written" >&2
  exit 1
fi

# The repository is the deliverable; Dropbox is a convenience copy. Write every
# document to the repo FIRST and as a complete set, so a problem reaching Dropbox
# can never leave docs/word/ half old and half new. That happened once: macOS
# denied access to the Dropbox folder mid-loop, set -e aborted, and one of seven
# documents had been replaced.
for entry in "${DOCS[@]}"; do
  name="${entry##*|}"
  cp "$STAGE/$name" "$OUT_REPO/$name"
done
echo "regenerated $count Word documents -> docs/word/"

# Redlines are no longer generated. They were comparison documents between two
# masters, used once for review and never updated afterwards — so every run
# rewrote eight binaries nobody read, and all eight failed the format gate for
# heading stranding, which kept the one gate that has ever caught a real defect
# permanently red. Adam's call, 26 August 2026: delete them rather than carry
# them. docs/redline.py still exists and can be run by hand to compare two
# masters on demand; nothing regenerates its output automatically.

# Dropbox second, and never fatal. -d is not enough: under a macOS privacy denial
# the directory tests as present and every write fails.
if [ -d "$OUT_DROPBOX" ]; then
  failed=0
  for entry in "${DOCS[@]}"; do
    name="${entry##*|}"
    cp "$STAGE/$name" "$OUT_DROPBOX/$name" 2>/dev/null || failed=$((failed + 1))
  done
  if [ "$failed" -eq 0 ]; then
    echo "copied $count Word documents -> Dropbox"
  else
    echo "DROPBOX NOT UPDATED: $failed of $count could not be written." >&2
    echo "  docs/word/ is complete and current; only the Dropbox copies are stale." >&2
    echo "  Usually macOS privacy: grant the terminal access to the Dropbox folder." >&2
  fi
else
  echo "Dropbox folder not present — docs/word/ only"
fi
