#!/bin/bash
# Adam's acceptance of a finished batch, recorded from his own chat message
# (17 Sep 2026; docs/audit/README.md). "Go" authorizes the work. It does not
# accept the result: that takes a message naming the batch, the revision and
# the exact commit he reviewed —
#
#     Accept A, revision 1, 3f9c2ab          (add "Go" at the end to let the
#     Reject A, item 8: the sentence is wrong  session release it in the same turn)
#
# The record is appended OUTSIDE the repository (~/.fpsllc/acceptances.jsonl),
# where no commit can rewrite it; docs/audit/release-check.ts reads it before
# any push or Dropbox copy. `bun run docs/audit/accept.ts` writes the same
# record from a terminal. Harness-authored turns are ignored, as in the Go
# hook. Procedural, not absolute: a session with Adam's permissions could
# write this file itself.
INPUT=$(cat)
printf '%s' "$INPUT" | python3 -c '
import json, sys, re, os, datetime
try:
    prompt = json.load(sys.stdin).get("prompt", "")
except Exception:
    sys.exit(0)
if re.match(r"^\[SYSTEM NOTIFICATION|^<<autonomous-loop", prompt) or "<task-notification>" in prompt:
    sys.exit(0)
home = os.environ.get("FPSLLC_HOME") or os.path.join(os.path.expanduser("~"), ".fpsllc")
at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
rec = None
m = re.match(r"^\s*accept\s+(?:batch\s+)?([A-Za-z0-9][A-Za-z0-9-]*)[\s,]+(?:revision|rev|r)\s*(\d+)[\s,]+(?:commit\s+)?([0-9a-fA-F]{7,40})\b", prompt, re.I)
if m:
    rec = {"kind": "accept", "batch": m.group(1), "revision": int(m.group(2)), "commit": m.group(3).lower(), "at": at, "source": "chat"}
else:
    m = re.match(r"^\s*reject\s+(?:batch\s+)?([A-Za-z0-9][A-Za-z0-9-]*)(?:[\s,]+(?:revision|rev|r)\s*(\d+))?[\s,:]*(.*)", prompt, re.I | re.S)
    if m:
        rec = {"kind": "reject", "batch": m.group(1), "revision": int(m.group(2)) if m.group(2) else None, "commit": None, "note": m.group(3).strip()[:500], "at": at, "source": "chat"}
if rec:
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, "acceptances.jsonl"), "a") as f:
        f.write(json.dumps(rec) + "\n")
' 2>/dev/null
exit 0
