#!/bin/bash
# Adam's decisions, from his own chat messages (docs/audit/README.md). "Go"
# authorizes the work. It does not accept the result, rule on an item, reject
# a revision or approve a migration: each of those takes a message that is
# NOTHING BUT the decision —
#
#     Accept A, revision 1, 3f9c2ab            optionally followed by:  Go
#     Reject A, revision 1: the sentence is wrong
#     Reject A: 2                              (every revision of A; the reason is "2")
#     Ruling 28: keep the monthly proration; build the billing
#     Ruling 27, part retention: keep it as written
#     Approve migration 001-part-level-links
#     Approve replacement A, revision 1
#
# Revision 2 (Codex's review of revision 1, finding 2): revision 1 matched the
# beginning of the message and ignored the rest, so "Accept A, revision 1,
# 3f9c2ab only if Codex finds no problems. Do not release yet." was recorded
# as an unconditional acceptance. Now the WHOLE message must be the command.
# Anything added — a condition, an explanation, a quotation — records nothing,
# and this hook says so on its standard output, which the session is shown, so
# Adam is told rather than left believing he decided.
# Revision 3 (Codex's review of revision 2, B and G): the rejection's batch,
# revision and reason are passed as NAMED arguments, so "Reject A: 2" is batch
# A, no revision, reason "2" — never revision 2. Rulings and migration
# approvals are recorded here too, because the ledger accepts them only from
# these records.
#
# The records are written by docs/audit/accept.ts, OUTSIDE the repository
# (~/.fpsllc/). Procedural, not absolute: a session with Adam's permissions
# could write that file itself. Harness-authored turns are ignored, as in the
# Go hook.
INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PARSED=$(printf '%s' "$INPUT" | python3 -c '
import json, sys, re, base64
try:
    prompt = json.load(sys.stdin).get("prompt", "")
except Exception:
    sys.exit(0)
if re.match(r"^\[SYSTEM NOTIFICATION|^<<autonomous-loop", prompt) or "<task-notification>" in prompt:
    sys.exit(0)
text = prompt.strip()
ID = r"([A-Za-z0-9][A-Za-z0-9-]*)"
m = re.fullmatch(r"accept\s+(?:batch\s+)?" + ID + r"\s*,?\s+(?:revision|rev|r)\s*(\d+)\s*,?\s+(?:commit\s+)?([0-9a-fA-F]{7,40})(?:\s*,?\s+package\s+([0-9a-fA-F]{6,32}))?\s*[.!]?(?:\s+go\s*[.!]?)?", text, re.I)
if m:
    print("accept\x1f%s\x1f%s\x1f%s\x1f%s" % (m.group(1), m.group(2), m.group(3).lower(), (m.group(4) or "").lower()))
    sys.exit(0)
m = re.fullmatch(r"reject\s+(?:batch\s+)?" + ID + r"(?:\s*,?\s+(?:revision|rev|r)\s*(\d+))?\s*[:.,-]?\s*(.*)", text, re.I | re.S)
if m:
    print("reject\x1f%s\x1f%s\x1f%s" % (m.group(1), m.group(2) or "", base64.b64encode(m.group(3).strip().encode()).decode()))
    sys.exit(0)
m = re.fullmatch(r"ruling\s+(?:(?:on\s+)?item\s+)?([0-9]+|N[0-9]\.[0-9]{2})(?:\s*,?\s+part\s+([A-Za-z0-9][A-Za-z0-9-]*))?\s*:\s*(.+)", text, re.I | re.S)
if m:
    print("ruling\x1f%s\x1f%s\x1f%s" % (m.group(1), m.group(2) or "", base64.b64encode(m.group(3).strip().encode()).decode()))
    sys.exit(0)
m = re.fullmatch(r"approve\s+replacement\s+" + ID + r"\s*,?\s+revision\s+([1-9]\d*)\s*[.!]?", text, re.I)
if m:
    print("replacement\x1f%s\x1f%s" % (m.group(1), m.group(2)))
    sys.exit(0)
m = re.fullmatch(r"approve\s+migration\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*[.!]?", text, re.I)
if m:
    print("migration\x1f%s" % m.group(1))
    sys.exit(0)
if re.match(r"\s*(accept\s+(?:batch\s+)?[A-Za-z0-9-]+\s*,?\s+(?:revision|rev|r)\s*\d+|ruling\s+|approve\s+(?:migration|replacement))", text, re.I):
    print("unclear")
' 2>/dev/null)
say() { sed 's/^/[acceptance hook] /'; }
case "$PARSED" in
  accept*)
    IFS=$'\x1f' read -r _ B R C P <<<"$PARSED"
    if [ -n "$P" ]; then (cd "$ROOT" && bun run docs/audit/accept.ts accept "$B" "$R" "$C" --package "$P" --source chat 2>&1) | say
    else (cd "$ROOT" && bun run docs/audit/accept.ts accept "$B" "$R" "$C" --source chat 2>&1) | say; fi
    ;;
  reject*)
    IFS=$'\x1f' read -r _ B R N <<<"$PARSED"
    N=$(python3 -c 'import base64,sys; sys.stdout.write(base64.b64decode(sys.argv[1]).decode())' "$N")
    if [ -z "$N" ]; then echo "[acceptance hook] NOT RECORDED: a rejection carries its reason — \"Reject <batch>[, revision <n>]: <reason>\". Tell Adam."
    elif [ -n "$R" ]; then (cd "$ROOT" && bun run docs/audit/accept.ts reject "$B" --revision "$R" --reason "$N" --source chat 2>&1) | say
    else (cd "$ROOT" && bun run docs/audit/accept.ts reject "$B" --reason "$N" --source chat 2>&1) | say; fi
    ;;
  ruling*)
    IFS=$'\x1f' read -r _ I P T <<<"$PARSED"
    T=$(python3 -c 'import base64,sys; sys.stdout.write(base64.b64decode(sys.argv[1]).decode())' "$T")
    if [ -n "$P" ]; then (cd "$ROOT" && bun run docs/audit/accept.ts ruling "$I" "$T" --part "$P" --source chat 2>&1) | say
    else (cd "$ROOT" && bun run docs/audit/accept.ts ruling "$I" "$T" --source chat 2>&1) | say; fi
    ;;
  replacement*)
    IFS=$'\x1f' read -r _ B R <<<"$PARSED"
    (cd "$ROOT" && bun run docs/audit/accept.ts approve-replacement "$B" --revision "$R" --source chat 2>&1) | say
    ;;
  migration*)
    IFS=$'\x1f' read -r _ M <<<"$PARSED"
    (cd "$ROOT" && bun run docs/audit/accept.ts approve-migration "$M" --source chat 2>&1) | say
    ;;
  unclear)
    echo "[acceptance hook] NOT RECORDED: a decision must be the whole message — \"Accept <batch>, revision <n>, <commit>\" (optionally followed by \"Go\"), \"Ruling <item>: <text>\", or \"Approve migration <id>\". This message adds other words, so nothing was recorded. Tell Adam."
    ;;
esac
exit 0
