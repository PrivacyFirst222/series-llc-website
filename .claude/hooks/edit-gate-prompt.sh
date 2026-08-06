#!/bin/bash
# Edit gate control: a message from Adam starting with "Go"/"go" opens the
# gate (creates the flag); ANY other message closes it (removes the flag).
# Authorization is therefore single-grant and revoked by the next message.

INPUT=$(cat)

if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  FLAG="$CLAUDE_PROJECT_DIR/.claude/.edit-approved"
else
  FLAG="$(cd "$(dirname "$0")/.." && pwd)/.edit-approved"
fi

PROMPT=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('prompt',''))" 2>/dev/null)

if printf '%s' "$PROMPT" | grep -qiE '^[[:space:]]*go([[:space:]!.,]|$)'; then
  touch "$FLAG"
else
  rm -f "$FLAG"
fi

exit 0
