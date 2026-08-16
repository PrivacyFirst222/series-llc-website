#!/bin/bash
# Regenerates every Word document from its master markdown.
#
# The markdown in this repo is the master for the five operating agreements and
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
  "webapp/server/templates-oa-single.md|FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx"
  "webapp/server/templates-oa-multi.md|FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-s.md|FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx"
  "webapp/server/templates-oa-member.md|FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-member-s.md|FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx"
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

# The gate. Measured against the originals; a regression stops everything here,
# before a single file has been replaced.
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

# The redline is derived from two masters rather than one, so it runs after the
# set is written. A stale redline is worse than none — it would show a
# difference that no longer exists.
echo "redlining the forms against each other"
python3 "$ROOT/docs/redline.py"
python3 "$ROOT/docs/redline.py" "$ROOT/webapp/server/templates-oa-multi.md" \
        "$ROOT/webapp/server/templates-oa-member.md" \
        "FPSLLC Redline - Manager-Managed vs Member-Managed Partnership.docx"
python3 "$ROOT/docs/redline.py" "$ROOT/webapp/server/templates-oa-s.md" \
        "$ROOT/webapp/server/templates-oa-member-s.md" \
        "FPSLLC Redline - Manager-Managed vs Member-Managed S Corporation.docx"
python3 "$ROOT/docs/redline.py" "$ROOT/webapp/server/templates-oa-member.md" \
        "$ROOT/webapp/server/templates-oa-member-s.md" \
        "FPSLLC Redline - Member-Managed Partnership vs S Corporation.docx"
python3 "$ROOT/docs/redline.py" "$ROOT/webapp/server/templates-oa-multi.md" \
        "$ROOT/webapp/server/templates-oa-single.md" \
        "FPSLLC Redline - Manager-Managed Multi-Member vs Single Member.docx"
REDLINES=(
  "FPSLLC Redline - Manager-Managed Partnership vs S Corporation.docx"
  "FPSLLC Redline - Manager-Managed vs Member-Managed Partnership.docx"
  "FPSLLC Redline - Manager-Managed vs Member-Managed S Corporation.docx"
  "FPSLLC Redline - Member-Managed Partnership vs S Corporation.docx"
  "FPSLLC Redline - Manager-Managed Multi-Member vs Single Member.docx"
)

# Dropbox second, and never fatal. -d is not enough: under a macOS privacy denial
# the directory tests as present and every write fails.
if [ -d "$OUT_DROPBOX" ]; then
  failed=0
  for entry in "${DOCS[@]}"; do
    name="${entry##*|}"
    cp "$STAGE/$name" "$OUT_DROPBOX/$name" 2>/dev/null || failed=$((failed + 1))
  done
  for name in "${REDLINES[@]}"; do
    cp "$OUT_REPO/$name" "$OUT_DROPBOX/$name" 2>/dev/null || failed=$((failed + 1))
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
