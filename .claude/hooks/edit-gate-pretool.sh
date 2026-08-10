#!/bin/bash
# Edit gate: blocks file-modifying tool calls unless Adam's go-flag is present.
# The flag is created when Adam sends a message starting with "Go"/"go"
# (see edit-gate-prompt.sh) and removed by any other message.
#
# Fails CLOSED: if anything in this script errors, the tool call is blocked.
# A gate that silently stops blocking is worse than one that blocks too much.

INPUT=$(cat)

if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  ROOT="$CLAUDE_PROJECT_DIR"
else
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  ROOT="$(dirname "$ROOT")"
fi
FLAG="$ROOT/.claude/.edit-approved"
LOG="$ROOT/.claude/gate-blocked.log"

# Tell Adam. stderr reaches Claude only, so a block is otherwise invisible to
# him: notify on screen and keep a record he can scroll.
notify() {
  local what="$1"
  local detail="$2"
  local stamp
  stamp="$(date '+%Y-%m-%d %H:%M:%S')"
  printf '%s  %s  %s\n' "$stamp" "$what" "$detail" >>"$LOG" 2>/dev/null || true
  # Strip anything that could break out of the AppleScript string, and keep it short.
  local safe
  safe="$(printf '%s' "$detail" | tr -d '"\\`$\n' | cut -c1-120)"
  osascript -e "display notification \"${what}: ${safe}\" with title \"Claude edit gate\" subtitle \"blocked — send a message starting with Go to allow\"" \
    >/dev/null 2>&1 || true
}

# Gate open: allow everything.
if [ -f "$FLAG" ]; then
  exit 0
fi

TOOL=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit)
    FILE=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
    notify "$TOOL" "$FILE"
    echo "BLOCKED by Adam's edit gate: no authorization for file changes. Explain to Adam exactly what you plan to change and list every assumption, then WAIT for him to reply with a message starting with 'Go'. His 'Go' opens the gate; any other message from him closes it." >&2
    exit 2
    ;;
  Bash)
    CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

    # ---- Standing exception -------------------------------------------------
    # Regenerating the Word documents from their masters must never wait for a
    # "Go": a master change and its Word output have to stay in lockstep.
    # Matched against the WHOLE command, never a substring, so nothing can be
    # appended, chained, or interpolated onto it.
    case "$CMD" in
      ".claude/hooks/update-word-docs.sh"|\
      "bash .claude/hooks/update-word-docs.sh"|\
      "$ROOT/.claude/hooks/update-word-docs.sh")
        exit 0
        ;;
    esac
    # -------------------------------------------------------------------------

    # Shell commands that can create/modify/delete files or repo state.
    if printf '%s' "$CMD" | grep -qE '(>>|[^-=]>[^&]|\btee\b|\bsed\b[^|]*-i|\bcp\b|\bmv\b|\brm\b|\bmkdir\b|\btouch\b|\bchmod\b|\bln\b|python[0-9.]* -c|python[0-9.]* <<|<<[[:space:]]*'\''?(EOF|PYEOF|CHUNK)|git[[:space:]]+(add|commit|push|checkout|reset|rm|mv|restore|clean)|bunx? (install|add|remove)|npm (install|i|add|remove))'; then
      notify "Bash" "$CMD"
      echo "BLOCKED by Adam's edit gate: this shell command can modify files or repo state. Explain the exact planned changes and every assumption, then WAIT for Adam to reply with a message starting with 'Go'." >&2
      exit 2
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
