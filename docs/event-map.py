#!/usr/bin/env python3
"""Gate docs/event-map.md, and report what no event reaches.

The provision map runs from the document outward: for each provision, who is it
for. This runs from the world inward: for each event that happens to a real
company, what governs it in each form. The two catch different things, and the
second catches the one I cannot see on my own — the **absence**. A missing
provision produces no text to read, no diff, and no failing check. Every
high-value catch Adam made this month was a question about something that was not
on the screen.

The gate:

  1. Every cell names sections that exist IN THAT FORM, or says `none`. A
     section number that resolves in the multi-member document proves nothing
     about the single-member one, so each column is resolved against its own
     master.
  2. `none` requires a reason in the note column. Silence about an event has to
     be a decision someone wrote down, not an oversight nobody noticed.
  3. TODO fails.

Then two reports, which do not fail:

  gaps          every `none` cell and every note marked GAP, listed in full
  unreached     every numbered provision in each form that no event names,
                as a raw count over the total. A provision no event reaches is
                either boilerplate or something nobody needs; the map cannot
                tell which, and neither can a count that has been filtered.

    python3 docs/event-map.py            # gate, then both reports
    python3 docs/event-map.py --quiet    # gate only
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP_PATH = os.path.join(HERE, "event-map.md")

FORMS = {
    "sgl": "webapp/server/templates-oa-single.md",
    "mul": "webapp/server/templates-oa-multi.md",
    "scp": "webapp/server/templates-oa-s.md",
    "mbr": "webapp/server/templates-oa-member.md",
    "mbs": "webapp/server/templates-oa-member-s.md",
}
COLUMNS = ["event", "source", "sgl", "scp", "mul", "mbr", "mbs", "note"]
SECTION_RE = re.compile(r"^\*\*(\d+\.\d+[A-Z]?)\s+([^*]+?)\*\*", re.M)


def sections_of(rel):
    text = open(os.path.join(ROOT, rel)).read()
    return {m.group(1): m.group(2).strip().rstrip(".") for m in SECTION_RE.finditer(text)}


def rows():
    """Every data row of the table, as a dict keyed by the header cells."""
    header, out = None, []
    for line in open(MAP_PATH):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        if len(cells) != len(header):
            raise SystemExit(f"event-map: row has {len(cells)} cells, header has {len(header)}:\n  {line}")
        out.append(dict(zip(header, cells)))
    if header is None:
        raise SystemExit("event-map: no table found")
    missing = [c for c in ("event", "source", "note") if c not in header]
    missing += [c for c in FORMS if c not in header]
    if missing:
        raise SystemExit(f"event-map: table is missing column(s): {', '.join(missing)}")
    return out


def main():
    quiet = "--quiet" in sys.argv
    known = {code: sections_of(rel) for code, rel in FORMS.items()}
    table = rows()
    problems, named = [], {code: set() for code in FORMS}

    for row in table:
        event = row["event"]
        for code in FORMS:
            cell = row[code]
            if not cell or "TODO" in cell:
                problems.append(f'"{event}" — {code} is unanswered')
                continue
            if cell.lower() == "none":
                if not row["note"]:
                    problems.append(f'"{event}" — {code} says none with no reason given')
                continue
            refs = cell.split()
            bad = [r for r in refs if not re.fullmatch(r"\d+\.\d+[A-Z]?", r)]
            if bad:
                problems.append(f'"{event}" — {code} cell is not a section list: {" ".join(bad)}')
                continue
            for r in refs:
                if r not in known[code]:
                    problems.append(f'"{event}" — {code} names Section {r}, which that form does not contain')
                else:
                    named[code].add(r)

    for p in problems:
        print("  " + p)
    if problems:
        print(f"\n{len(problems)} problem(s) in the event map.", file=sys.stderr)
        return 1

    # A provision no event reaches is a provision nobody asked for. Adding one is
    # therefore expensive: name the event it answers, or delete it. Article 2 is
    # exempt — a definition answers no event by itself, it supplies a word to the
    # provisions that do, and the last row of the map says so.
    orphaned = []
    for code in FORMS:
        for s in set(known[code]) - named[code]:
            if not known[code][s].startswith('"'):
                orphaned.append(f"  {code}  Section {s} {known[code][s]} — no event in the map reaches it")
    for o in sorted(orphaned):
        print(o)
    if orphaned:
        print(f"\n{len(orphaned)} provision(s) answer no event. Add the event, or delete the "
              "provision.", file=sys.stderr)
        return 1

    print(f"  ok    {len(table)} events, each answered in all five forms")

    if quiet:
        return 0

    silent = [(r["event"], code) for r in table for code in FORMS if r[code].lower() == "none"]
    flagged = [r["event"] for r in table if "GAP" in r["note"]]
    print(f"\n  {len(silent)} form-events the agreements say nothing about, "
          f"of {len(table) * len(FORMS)}:")
    for event, code in silent:
        print(f"    {code}  {event}")
    print(f"\n  {len(flagged)} marked GAP — an absence nobody has ruled on:")
    for event in flagged:
        print(f"    {event}")

    print("\n  provisions no event reaches:")
    for code in FORMS:
        unreached = sorted(set(known[code]) - named[code],
                           key=lambda s: (int(s.split(".")[0]), int(re.sub(r"[A-Z]", "", s.split(".")[1]))))
        print(f"    {code}  {len(unreached)} of {len(known[code])}")
        for s in unreached:
            print(f"         {s} {known[code][s]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
