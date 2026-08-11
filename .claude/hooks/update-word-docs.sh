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

# The gate. Measured against the originals; a regression stops everything here,
# before a single file has been replaced.
echo "checking $count documents against docs/source/"
if ! python3 "$CHECK" "$STAGE"/*.docx; then
  echo "update-word-docs: FORMATTING REGRESSION — nothing written" >&2
  exit 1
fi

for entry in "${DOCS[@]}"; do
  name="${entry##*|}"
  cp "$STAGE/$name" "$OUT_REPO/$name"
  if [ -d "$OUT_DROPBOX" ]; then
    cp "$STAGE/$name" "$OUT_DROPBOX/$name"
  fi
done

if [ -d "$OUT_DROPBOX" ]; then
  echo "regenerated $count Word documents -> docs/word/ and Dropbox"
else
  echo "regenerated $count Word documents -> docs/word/ (Dropbox not mounted)"
fi
