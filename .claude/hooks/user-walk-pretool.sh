#!/bin/bash
# User walk: no file may change unless the proposal Adam approved with "Go"
# contains a walk-through of the feature from the user's seat — what they
# open, what they tap, what they type, what they see, and what result they
# reasonably expect (Adam, 6 Sep 2026: "It should walk through what buttons
# the user would click, what fields they would complete, and what results
# they would reasonably expect to get").
#
# Required in the proposal (the assistant text between Adam's previous typed
# message and his "Go"), at least once:
#
#   USER WALK — <who, in what real situation>:
#   1. Opens … and sees …
#   2. Taps … / types … into …
#   3. …
#   Expects: <the result they would reasonably expect>
#
# Three or more numbered steps and an "Expects:" line. A change nobody uses
# still needs the block, saying so. The hook can only demand that the walk
# exists; whether it is honest is Adam's judgment from the proposal.
#
# Runs beside the edit gate on the same tool calls, only while the gate is
# open. Fails CLOSED: any error in this script blocks the call.

INPUT=$(cat)

if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  ROOT="$CLAUDE_PROJECT_DIR"
else
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  ROOT="$(dirname "$ROOT")"
fi
FLAG="$ROOT/.claude/.edit-approved"
LOG="$ROOT/.claude/gate-blocked.log"

# Gate closed: the edit gate has already blocked; nothing to add.
[ -f "$FLAG" ] || exit 0

notify() {
  local detail="$1"
  printf '%s  user-walk  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$detail" >>"$LOG" 2>/dev/null || true
  local safe
  safe="$(printf '%s' "$detail" | tr -d '"\\`$\n' | cut -c1-120)"
  osascript -e "display notification \"${safe}\" with title \"Claude user-walk hook\" subtitle \"blocked — the proposal has no USER WALK\"" \
    >/dev/null 2>&1 || true
}

# Which calls change files: the same detection as the edit gate.
TOOL=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null) || exit 2
case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit)
    FILE=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
    # The failure record never waits for anything.
    case "$FILE" in */FAILURES.md|FAILURES.md) exit 0 ;; esac
    ;;
  Bash)
    CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
    case "$CMD" in
      ".claude/hooks/update-word-docs.sh"|"bash .claude/hooks/update-word-docs.sh"|"$ROOT/.claude/hooks/update-word-docs.sh") exit 0 ;;
    esac
    CMD_SCAN=$(printf '%s' "$CMD" | sed -E 's/[0-9]*>&[0-9]+//g; s/[0-9]*>[[:space:]]*\/dev\/null//g')
    if ! printf '%s' "$CMD_SCAN" | grep -qE '(>>|[^-=]>[^&]|\btee\b|\bsed\b[^|]*-i|\bcp\b|\bmv\b|\brm\b|\bmkdir\b|\btouch\b|\bchmod\b|\bln\b|python[0-9.]* -c|python[0-9.]* <<|<<-?[[:space:]]*['"'"'"]?[A-Za-z_]+|git[[:space:]]+(add|commit|push|checkout|reset|rm|mv|restore|clean|merge)|bunx? (install|add|remove)|npm (install|i|add|remove))'; then
      exit 0
    fi
    ;;
  *) exit 0 ;;
esac

TRANSCRIPT=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null)
if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  notify "no transcript to check"
  echo "BLOCKED by the user-walk hook: the conversation transcript could not be read, so the proposal cannot be checked. Fails closed." >&2
  exit 2
fi

RESULT=$(python3 - "$TRANSCRIPT" <<'PYEOF'
import json, re, sys
path = sys.argv[1]
typed = []   # (index, text) of messages Adam typed
texts = []   # (index, text) of assistant text blocks
i = 0
with open(path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = o.get("type")
        m = o.get("message") or {}
        c = m.get("content")
        if t == "user" and isinstance(c, str) and c.strip():
            s = c.strip()
            if not (s.startswith("[SYSTEM NOTIFICATION") or "<task-notification>" in s or s.startswith("<<autonomous-loop")):
                typed.append((i, s))
        elif t == "assistant" and isinstance(c, list):
            for x in c:
                if isinstance(x, dict) and x.get("type") == "text" and x.get("text", "").strip():
                    texts.append((i, x["text"]))
        i += 1

def is_go(s):
    if re.match(r"^\s*go([\s!.,]|$)", s, re.I):
        return True
    last = re.sub(r"[.!,]*\s*$", "", s.replace("\n", " ")).split()
    return bool(last) and last[-1].lower() == "go"

go_idx = None
prev_idx = -1
for k in range(len(typed) - 1, -1, -1):
    if is_go(typed[k][1]):
        go_idx = typed[k][0]
        prev_idx = typed[k - 1][0] if k > 0 else -1
        break
if go_idx is None:
    print("NOGO"); sys.exit(0)

proposal = "\n".join(t for (idx, t) in texts if prev_idx < idx < go_idx)
blocks = re.split(r"(?=USER WALK)", proposal)
ok = 0
for b in blocks:
    if not b.startswith("USER WALK"):
        continue
    steps = len(re.findall(r"^\s*\d+\.\s+\S", b, re.M))
    expects = re.search(r"^\s*Expects:\s*\S", b, re.M) is not None
    if steps >= 3 and expects:
        ok += 1
print("OK %d" % ok if ok else "MISSING")
PYEOF
) || { notify "transcript check failed"; echo "BLOCKED by the user-walk hook: the transcript check errored. Fails closed." >&2; exit 2; }

case "$RESULT" in
  OK*) exit 0 ;;
  NOGO)
    # The edit gate is open but no Go is on record — inconsistent; block.
    notify "gate open with no Go in the transcript"
    echo "BLOCKED by the user-walk hook: no 'Go' from Adam is on record in the transcript." >&2
    exit 2
    ;;
  *)
    notify "$TOOL"
    echo "BLOCKED by the user-walk hook: the proposal Adam approved has no USER WALK. Before any file changes, the proposal must walk the feature from the user's seat — 'USER WALK — <who, in what situation>:' then three or more numbered steps of what they open, tap, type and see, and an 'Expects:' line with the result they would reasonably expect — one block per person the change touches. Restate the proposal with the walk and WAIT for Adam's Go." >&2
    exit 2
    ;;
esac
