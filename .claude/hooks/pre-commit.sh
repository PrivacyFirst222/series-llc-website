#!/bin/bash
# Git pre-commit hook (installed as a one-line shim at .git/hooks/pre-commit,
# which git does not version — the logic lives here so it IS versioned).
#
# Every change to a master markdown regenerates the Word documents and stages
# them in the same commit. A master can never be committed without its Word
# counterpart, whether or not anyone remembers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

MASTERS=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '^(webapp/server/templates-oa-.*\.md|docs/owners-manual\.md)$' || true)

if [ -z "$MASTERS" ]; then
  exit 0
fi

echo "pre-commit: master document changed, regenerating Word files"
echo "$MASTERS" | sed 's/^/  /'

if ! "$ROOT/.claude/hooks/update-word-docs.sh"; then
  echo "pre-commit: Word generation FAILED — commit aborted" >&2
  exit 1
fi

git add "$ROOT/docs/word"
echo "pre-commit: docs/word staged"
