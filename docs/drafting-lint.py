#!/usr/bin/env python3
"""Catch the drafting faults Adam has already had to catch by reading.

Every check here exists because a defect reached a document and he found it, not
because it seemed like a good idea. They are mechanical, so they catch the
recurrence rather than the intention.

  hortatory     "should" and friends in a signed instrument — advice, not a
                covenant; education belongs in the manual
  duplicate     the same rule stated in two articles, which can drift apart and
                then have to be litigated
  reservation   a [Reserved.] with no instruction behind it — reserving a number
                protects cross-references in a SIGNED document; these are forms
  orphan-term   a term defined in Article 2 that nothing else uses
  cite          an s. 605.xxxx that chapter-605-notes.md has no entry for, so an
                invented citation cannot pass silently

    python3 docs/drafting-lint.py webapp/server/templates-oa-*.md
"""
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
NOTES = os.path.join(os.path.dirname(HERE), "webapp", "server", "chapter-605-notes.md")

HORTATORY = re.compile(
    r"\b(should|ought to|is recommended|are encouraged|may wish to|it is advisable|best practice)\b",
    re.I,
)

def sections(text):
    """(label, body) for each numbered provision."""
    out = []
    for m in re.finditer(r"^\*\*((?:\d+\.\d+[A-Z]?|\([a-z]\))[^*]*?)\*\*(.*?)(?=^\*\*|\Z)", text, re.M | re.S):
        out.append((m.group(1).strip(), m.group(2).strip()))
    return out


def norm(s):
    s = re.sub(r"[*_`]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


def check(path, notes_text):
    text = open(path).read()
    name = os.path.basename(path)
    problems = []

    # --- hortatory language -------------------------------------------------
    for i, line in enumerate(text.split("\n"), 1):
        if line.lstrip().startswith("<!--"):
            continue
        m = HORTATORY.search(line)
        if m:
            problems.append(f"{name}:{i}  hortatory '{m.group(0)}' — a form document binds or permits; it does not advise")

    # --- duplicate provisions ----------------------------------------------
    seen = defaultdict(list)
    for label, body in sections(text):
        for sent in re.split(r"(?<=\.)\s+", body):
            n = norm(sent)
            if len(n) > 120:
                seen[n].append(label)
    for n, labels in seen.items():
        if len(labels) > 1:
            problems.append(f"{name}  duplicate rule in {' and '.join(labels)}: \"{n[:70]}...\"")

    # --- dead reservations --------------------------------------------------
    for i, line in enumerate(text.split("\n"), 1):
        if "[Reserved.]" not in line:
            continue
        # Legitimate where the line IS the instruction to reserve, or carries
        # the optional-provision marker that the Instructions act on.
        if re.search(r'replace .{0,90}with .{0,24}\[Reserved\.\]', line, re.I):
            continue
        if "OPTIONAL" in line or "include only if" in line or "otherwise replace" in line:
            continue
        problems.append(
            f"{name}:{i}  [Reserved.] with no omission instruction behind it — "
            "reserving a number protects cross-references in a signed document; delete it and renumber"
        )

    # --- orphan defined terms ----------------------------------------------
    for m in re.finditer(r'^\*\*\d+\.\d+[A-Z]? "([^"]+)"', text, re.M):
        term = m.group(1)
        uses = len(re.findall(rf'\b{re.escape(term)}\b', text))
        if uses <= 1:
            problems.append(f"{name}  defined term \"{term}\" is never used — delete it and renumber")

    # --- citations with nothing behind them ---------------------------------
    for cite in sorted(set(re.findall(r"s(?:s)?\. (605\.\d+)", text))):
        if cite not in notes_text:
            problems.append(f"{name}  cites s. {cite}, which chapter-605-notes.md has no entry for — read it or drop it")

    return problems


def main():
    paths = sys.argv[1:]
    if not paths:
        print(__doc__)
        return 2
    notes = open(NOTES).read() if os.path.exists(NOTES) else ""
    if not notes:
        print("chapter-605-notes.md missing — citation check cannot run", file=sys.stderr)
        return 1
    total = 0
    for p in paths:
        found = check(p, notes)
        total += len(found)
        for f in found:
            print("  " + f)
        if not found:
            print(f"  ok    {os.path.basename(p)}")
    if total:
        print(f"\n{total} drafting problem(s). Fix them, or if one is deliberate, say so here.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
