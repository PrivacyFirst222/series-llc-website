#!/bin/bash
# Edit gate: blocks file-modifying tool calls unless Adam's go-flag is present.
# The flag is created when Adam sends a message starting with "Go"/"go"
# (see edit-gate-prompt.sh) and removed by any other message.

INPUT=$(cat)

if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  FLAG="$CLAUDE_PROJECT_DIR/.claude/.edit-approved"
else
  FLAG="$(cd "$(dirname "$0")/.." && pwd)/.edit-approved"
fi

# Gate open: allow everything.
if [ -f "$FLAG" ]; then
  exit 0
fi

TOOL=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit)
    echo "BLOCKED by Adam's edit gate: no authorization for file changes. Explain to Adam exactly what you plan to change and list every assumption, then WAIT for him to reply with a message starting with 'Go'. His 'Go' opens the gate; any other message from him closes it." >&2
    exit 2
    ;;
  Bash)
    CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
    # Shell commands that can create/modify/delete files or repo state.
    if printf '%s' "$CMD" | grep -qE '(>>|[^-=]>[^&]|\btee\b|\bsed\b[^|]*-i|\bcp\b|\bmv\b|\brm\b|\bmkdir\b|\btouch\b|\bchmod\b|\bln\b|python[0-9.]* -c|python[0-9.]* <<|<<[[:space:]]*'\''?(EOF|PYEOF|CHUNK)|git[[:space:]]+(add|commit|push|checkout|reset|rm|mv|restore|clean)|bunx? (install|add|remove)|npm (install|i|add|remove))'; then
      echo "BLOCKED by Adam's edit gate: this shell command can modify files or repo state. Explain the exact planned changes and every assumption, then WAIT for Adam to reply with a message starting with 'Go'." >&2
      exit 2
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
