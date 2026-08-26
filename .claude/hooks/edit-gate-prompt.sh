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

# Every transition is logged with what caused it, so a mystery close can be
# diagnosed from the record instead of guessed at.
GLOG="$(dirname "$FLAG")/gate-blocked.log"
logit() {
  printf '%s  gate-%s  %.60s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$PROMPT" >>"$GLOG" 2>/dev/null || true
}

# Harness-authored turns (background-task notices, system reminders) are not
# messages from Adam and must not revoke his authorization. Leave the flag
# exactly as it is. Only turns Adam actually typed open or close the gate.
# Matched structurally — the <task-notification> tag — as well as by prefix,
# because the payload's exact framing has varied.
if printf '%s' "$PROMPT" | grep -qE '^\[SYSTEM NOTIFICATION|<task-notification>|^<<autonomous-loop'; then
  logit "held (harness turn)"
  exit 0
fi

# Adam opens the gate with "Go". Historically that only counted at the START of
# a message — but his habit is to quote a passage, answer it, and put the Go
# last, which failed closed and cost a round trip on 26 Aug 2026. A trailing Go
# now counts too: the message's final word, ignoring trailing "." "!" and ",",
# must be "go". Deliberately NOT matched: "go?" (a question is not an
# instruction) and "no-go" (no word boundary). Known limit: a message that
# genuinely ends with the word go — "I'd rather not go" — opens the gate.
LASTWORD=$(printf '%s' "$PROMPT" | tr '\n' ' ' | sed -e 's/[.!,]*[[:space:]]*$//' | awk '{print tolower($NF)}')

if printf '%s' "$PROMPT" | grep -qiE '^[[:space:]]*go([[:space:]!.,]|$)' || [ "$LASTWORD" = "go" ]; then
  logit "OPENED"
  touch "$FLAG"
else
  if [ -f "$FLAG" ]; then logit "CLOSED by"; fi
  rm -f "$FLAG"
fi

exit 0
