#!/bin/bash
# Regenerates every Word document from its master markdown.
#
# The markdown in this repo is the master for the five operating agreements and
# the Owner's Manual. The .docx files are OUTPUT — regenerated here and never
# edited by hand. Anything typed into a Word file is lost on the next run.
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
OUT_REPO="$ROOT/docs/word"
OUT_DROPBOX="/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement"

mkdir -p "$OUT_REPO"

# master markdown | Word filename
DOCS=(
  "webapp/server/templates-oa-single.md|FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx"
  "webapp/server/templates-oa-multi.md|FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-s.md|FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx"
  "webapp/server/templates-oa-member.md|FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx"
  "webapp/server/templates-oa-member-s.md|FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx"
  "docs/owners-manual.md|Series LLC Owners Manual - REVISED DRAFT.docx"
)

count=0
for entry in "${DOCS[@]}"; do
  src="${entry%%|*}"
  name="${entry##*|}"
  if [ ! -f "$ROOT/$src" ]; then
    echo "MASTER MISSING: $src" >&2
    exit 1
  fi
  # Generate into the repo first. md-to-docx.py writes to a temp file and only
  # moves it into place after verifying the archive, so a failure here cannot
  # truncate an existing document.
  python3 "$GEN" "$ROOT/$src" "$OUT_REPO/$name"
  if [ -d "$OUT_DROPBOX" ]; then
    cp "$OUT_REPO/$name" "$OUT_DROPBOX/$name"
  fi
  count=$((count + 1))
done

if [ -d "$OUT_DROPBOX" ]; then
  echo "regenerated $count Word documents -> docs/word/ and Dropbox"
else
  echo "regenerated $count Word documents -> docs/word/ (Dropbox not mounted)"
fi
