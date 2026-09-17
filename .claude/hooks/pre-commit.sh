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
# The fact ledger (docs/facts.md): a fact fixed in one place and left wrong
# in another cannot be committed (FAILURES.md P85, 15 Sep 2026).
if ! (cd "$ROOT/webapp" && bun run ../docs/facts-check.ts); then
  echo "pre-commit: FACT LEDGER DISAGREES — commit refused. Run: cd webapp && bun run ../docs/facts-check.ts" >&2
  exit 1
fi

# The fix ledger's guard (docs/audit/guard.ts, 17 Sep 2026): every fix Adam
# has accepted is replayed against the staged files, the ledger's history is
# append-only, and on a batch branch nothing outside the batch's declared
# scope can be committed.
if ! (cd "$ROOT" && bun run docs/audit/guard.ts --staged); then
  echo "pre-commit: THE FIX LEDGER'S GUARD REFUSED — commit refused. Run: bun run docs/audit/guard.ts --staged" >&2
  exit 1
fi

# docs/oa-instructions.md joined this list on 17 Sep 2026: the generator has
# always built the Instructions, but a change to their master did not set it
# off, so the Word copy went stale (found by Codex reviewing the fix ledger).
MASTERS=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '^(webapp/server/templates-oa-.*\.md|docs/owners-manual\.md|docs/oa-instructions\.md|webapp/server/templates-statement-of-authorized-representative\.md)$' || true)

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
