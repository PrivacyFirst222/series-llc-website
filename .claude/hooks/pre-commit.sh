#!/bin/bash
# Git pre-commit hook (installed as a one-line shim at .git/hooks/pre-commit,
# which git does not version — the logic lives here so it IS versioned).
#
# Every change to a master markdown regenerates the Word documents and stages
# them in the same commit. A master can never be committed without its Word
# counterpart, whether or not anyone remembers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Never commit code that fails the fast checks. A red full-check was once
# committed and pushed because reading the result had decayed into a
# formality (P50); machinery does not decay. The full e2e suite stays CI's
# job on every push — these three run in ~15s.
echo "pre-commit: lint + typecheck + unit tests"
if ! (cd "$ROOT/webapp" && bun run lint >/dev/null 2>&1); then
  echo "pre-commit: LINT FAILED — commit refused. Run: cd webapp && bun run lint" >&2
  exit 1
fi
if ! (cd "$ROOT/webapp" && bun run typecheck >/dev/null 2>&1); then
  echo "pre-commit: TYPECHECK FAILED — commit refused. Run: cd webapp && bun run typecheck" >&2
  exit 1
fi
if ! (cd "$ROOT/webapp" && bun run test >/dev/null 2>&1); then
  echo "pre-commit: UNIT TESTS FAILED — commit refused. Run: cd webapp && bun run test" >&2
  exit 1
fi

MASTERS=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '^(webapp/server/templates-oa-.*\.md|docs/owners-manual\.md|docs/statement-of-authorized-representative\.md)$' || true)

if [ -n "$MASTERS" ]; then
  echo "pre-commit: master document changed, regenerating Word files"
  echo "$MASTERS" | sed 's/^/  /'

  if ! "$ROOT/.claude/hooks/update-word-docs.sh"; then
    echo "pre-commit: Word generation FAILED — commit aborted" >&2
    exit 1
  fi

  git add "$ROOT/docs/word"
  echo "pre-commit: docs/word staged"
fi

# The production API is the committed webapp/api/index.mjs: Vercel creates the
# serverless function only because that file is in the repo (P45 — untracking
# it deleted the API), and esbuild compiles everything under webapp/server/
# into it, the OA masters included (--loader:.md=text). So any staged change
# under webapp/server/ rebuilds the bundle and stages it in the same commit —
# the committed copy can no longer drift from source (AUD-001).
SERVER_CHANGED=$(git diff --cached --name-only --diff-filter=ACMD \
  | grep -E '^webapp/(server/|package\.json)' || true)

if [ -n "$SERVER_CHANGED" ]; then
  echo "pre-commit: server source changed, rebuilding api/index.mjs"
  if ! (cd "$ROOT/webapp" && bun run build:api >/dev/null); then
    echo "pre-commit: api bundle build FAILED — commit aborted" >&2
    exit 1
  fi
  git add "$ROOT/webapp/api/index.mjs"
  echo "pre-commit: webapp/api/index.mjs staged"
fi
