#!/bin/bash
# Adam's acceptance of a finished batch, from his own chat message
# (docs/audit/README.md). "Go" authorizes the work. It does not accept the
# result: that takes a message that is NOTHING BUT the acceptance —
#
#     Accept A, revision 1, 3f9c2ab          optionally followed by:  Go
#     Reject A, revision 1: the sentence is wrong
#
# Revision 2 (Codex's review of revision 1, finding 2): revision 1 matched the
# beginning of the message and ignored the rest, so "Accept A, revision 1,
# 3f9c2ab only if Codex finds no problems. Do not release yet." was recorded
# as an unconditional acceptance. Now the WHOLE message must be the command.
# Anything added — a condition, an explanation, a quotation — records nothing,
# and this hook says so on its standard output, which the session is shown, so
# Adam is told rather than left believing he accepted.
#
# The record itself is written by docs/audit/accept.ts, which resolves the
# commit to its full identity and refuses if no review package exists for it.
# It is kept OUTSIDE the repository (~/.fpsllc/acceptances.jsonl).
# Procedural, not absolute: a session with Adam's permissions could write that
# file itself. Harness-authored turns are ignored, as in the Go hook.
INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PARSED=$(printf '%s' "$INPUT" | python3 -c '
import json, sys, re
try:
    prompt = json.load(sys.stdin).get("prompt", "")
except Exception:
    sys.exit(0)
if re.match(r"^\[SYSTEM NOTIFICATION|^<<autonomous-loop", prompt) or "<task-notification>" in prompt:
    sys.exit(0)
text = prompt.strip()
ID = r"([A-Za-z0-9][A-Za-z0-9-]*)"
m = re.fullmatch(r"accept\s+(?:batch\s+)?" + ID + r"\s*,?\s+(?:revision|rev|r)\s*(\d+)\s*,?\s+(?:commit\s+)?([0-9a-fA-F]{7,40})\s*[.!]?(?:\s+go\s*[.!]?)?", text, re.I)
if m:
    print("accept\x1f%s\x1f%s\x1f%s" % (m.group(1), m.group(2), m.group(3).lower()))
    sys.exit(0)
m = re.fullmatch(r"reject\s+(?:batch\s+)?" + ID + r"(?:\s*,?\s+(?:revision|rev|r)\s*(\d+))?\s*[:.,-]?\s*(.*)", text, re.I | re.S)
if m:
    print("reject\x1f%s\x1f%s\x1f%s" % (m.group(1), m.group(2) or "", " ".join(m.group(3).split())[:500]))
    sys.exit(0)
if re.match(r"\s*accept\s+(?:batch\s+)?[A-Za-z0-9-]+\s*,?\s+(?:revision|rev|r)\s*\d+", text, re.I):
    print("unclear")
' 2>/dev/null)
case "$PARSED" in
  accept*)
    IFS=$'\x1f' read -r _ B R C <<<"$PARSED"
    (cd "$ROOT" && bun run docs/audit/accept.ts accept "$B" "$R" "$C" --source chat 2>&1) | sed 's/^/[acceptance hook] /'
    ;;
  reject*)
    IFS=$'\x1f' read -r _ B R N <<<"$PARSED"
    if [ -n "$R" ]; then (cd "$ROOT" && bun run docs/audit/accept.ts reject "$B" "$R" "$N" --source chat 2>&1) | sed 's/^/[acceptance hook] /'
    else (cd "$ROOT" && bun run docs/audit/accept.ts reject "$B" "$N" --source chat 2>&1) | sed 's/^/[acceptance hook] /'; fi
    ;;
  unclear)
    echo "[acceptance hook] NOT RECORDED: an acceptance must be the whole message — \"Accept <batch>, revision <n>, <commit>\", optionally followed by \"Go\". This message adds other words, so nothing was recorded. Tell Adam."
    ;;
esac
exit 0
