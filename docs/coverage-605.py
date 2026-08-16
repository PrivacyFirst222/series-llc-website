#!/usr/bin/env python3
"""Gate docs/coverage-605.md against the whole of Chapter 605.

The provision map runs from the document. The event map runs from the world.
This runs from the statute, and catches the one thing neither of the others can:
a section of the Act **nobody ever considered**. An unconsidered provision leaves
no trace at all — not in the document, not in any event anyone thought to list —
so the only way to find it is to enumerate the chapter and answer for each
section in turn. That is why the denominator is hard-coded here rather than
derived: 191 sections, read from the statutory text on Online Sunshine through
the browser on 15 August 2026, the same reading recorded in
webapp/server/chapter-605-notes.md.

The gate: every one of the 191 has exactly one row, no row names a section the
chapter does not contain, each disposition comes from the fixed vocabulary, each
row carries a note, a `varied` row cites at least one of our sections, and every
section cited resolves in at least one master. The report lists every row marked
GAP — an absence nobody has ruled on.

    python3 docs/coverage-605.py            # gate, then the GAP report
    python3 docs/coverage-605.py --selftest # break the map, watch the gate fire
    python3 docs/coverage-605.py --quiet    # gate only
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP_PATH = os.path.join(HERE, "coverage-605.md")

MASTERS = [
    "webapp/server/templates-oa-single.md",
    "webapp/server/templates-oa-multi.md",
    "webapp/server/templates-oa-s.md",
    "webapp/server/templates-oa-member.md",
    "webapp/server/templates-oa-member-s.md",
    "webapp/server/templates-oa-single-s.md",
]

DISPOSITIONS = {"non-variable", "varied", "relied", "n/a"}

# Chapter 605 in full, in statutory order. Read from
# leg.state.fl.us on 15 August 2026.
CHAPTER = [
    "605.0101",
    "605.0102",
    "605.0103",
    "605.0104",
    "605.0105",
    "605.0106",
    "605.0107",
    "605.0108",
    "605.0109",
    "605.0110",
    "605.0111",
    "605.0112",
    "605.01125",
    "605.0113",
    "605.0114",
    "605.0115",
    "605.0116",
    "605.0117",
    "605.0118",
    "605.0119",
    "605.0201",
    "605.0202",
    "605.0203",
    "605.0204",
    "605.0205",
    "605.0206",
    "605.0207",
    "605.0208",
    "605.0209",
    "605.0210",
    "605.0211",
    "605.0212",
    "605.0213",
    "605.0214",
    "605.0215",
    "605.0216",
    "605.0301",
    "605.0302",
    "605.0303",
    "605.0304",
    "605.0401",
    "605.0402",
    "605.0403",
    "605.0404",
    "605.0405",
    "605.0406",
    "605.0407",
    "605.04071",
    "605.04072",
    "605.04073",
    "605.04074",
    "605.0408",
    "605.04091",
    "605.04092",
    "605.04093",
    "605.0410",
    "605.0411",
    "605.0501",
    "605.0502",
    "605.0503",
    "605.0504",
    "605.0601",
    "605.0602",
    "605.0603",
    "605.0701",
    "605.0702",
    "605.0703",
    "605.0704",
    "605.0705",
    "605.0706",
    "605.0707",
    "605.0708",
    "605.0709",
    "605.0710",
    "605.0711",
    "605.0712",
    "605.0713",
    "605.0714",
    "605.0715",
    "605.0716",
    "605.0717",
    "605.0801",
    "605.0802",
    "605.0803",
    "605.0804",
    "605.0805",
    "605.0806",
    "605.0901",
    "605.0902",
    "605.0903",
    "605.0904",
    "605.0905",
    "605.0906",
    "605.0907",
    "605.0908",
    "605.0909",
    "605.09091",
    "605.0910",
    "605.0911",
    "605.0912",
    "605.0913",
    "605.1001",
    "605.1002",
    "605.1003",
    "605.1004",
    "605.1005",
    "605.1006",
    "605.1021",
    "605.1022",
    "605.1023",
    "605.1024",
    "605.1025",
    "605.1026",
    "605.1031",
    "605.1032",
    "605.1033",
    "605.1034",
    "605.1035",
    "605.1036",
    "605.1041",
    "605.1042",
    "605.1043",
    "605.1044",
    "605.1045",
    "605.1046",
    "605.1051",
    "605.1052",
    "605.1053",
    "605.1054",
    "605.1055",
    "605.1056",
    "605.1061",
    "605.1062",
    "605.1063",
    "605.1064",
    "605.1065",
    "605.1066",
    "605.1067",
    "605.1068",
    "605.1069",
    "605.1070",
    "605.1071",
    "605.1072",
    "605.1101",
    "605.1102",
    "605.1103",
    "605.1104",
    "605.1105",
    "605.1106",
    "605.1107",
    "605.1108",
    "605.2101",
    "605.2102",
    "605.2103",
    "605.2104",
    "605.2105",
    "605.2106",
    "605.2107",
    "605.2108",
    "605.2201",
    "605.2202",
    "605.2203",
    "605.2204",
    "605.2205",
    "605.2206",
    "605.2301",
    "605.2302",
    "605.2303",
    "605.2304",
    "605.2305",
    "605.2401",
    "605.2402",
    "605.2403",
    "605.2404",
    "605.2501",
    "605.2502",
    "605.2503",
    "605.2601",
    "605.2602",
    "605.2603",
    "605.2604",
    "605.2605",
    "605.2606",
    "605.2607",
    "605.2608",
    "605.2701",
    "605.2702",
    "605.2703",
    "605.2704",
    "605.2801",
    "605.2802",
]


def our_sections():
    found = set()
    for rel in MASTERS:
        text = open(os.path.join(ROOT, rel)).read()
        found |= {m.group(1) for m in re.finditer(r"^\*\*(\d+\.\d+[A-Z]?)\s", text, re.M)}
    return found


def rows(path=None):
    header, out = None, []
    for line in open(path or MAP_PATH):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        if len(cells) != len(header):
            raise SystemExit(f"coverage-605: row has {len(cells)} cells, header has {len(header)}:\n  {line}")
        out.append(dict(zip(header, cells)))
    for col in ("section", "title", "disposition", "our sections", "note"):
        if header is None or col not in header:
            raise SystemExit(f"coverage-605: table is missing the '{col}' column")
    return out


def check(path=None):
    table = rows(path)
    known = our_sections()
    problems = []

    listed = [r["section"] for r in table]
    for s in CHAPTER:
        if listed.count(s) == 0:
            problems.append(f"s. {s} has no row — the chapter has {len(CHAPTER)} sections "
                            "and the map must answer for every one")
        elif listed.count(s) > 1:
            problems.append(f"s. {s} has {listed.count(s)} rows")
    for s in listed:
        if s not in CHAPTER:
            problems.append(f"s. {s} is not a section of Chapter 605")

    for r in table:
        where = f"s. {r['section']}"
        if r["disposition"] not in DISPOSITIONS:
            problems.append(f"{where} — disposition '{r['disposition']}' is not one of "
                            + ", ".join(sorted(DISPOSITIONS)))
        if not r["note"]:
            problems.append(f"{where} — no note; a disposition without a reason records nothing")
        refs = r["our sections"].split()
        if r["disposition"] == "varied" and not refs:
            problems.append(f"{where} — marked varied but cites nothing that varies it")
        for ref in refs:
            if not re.fullmatch(r"\d+\.\d+[A-Z]?", ref):
                problems.append(f"{where} — '{ref}' is not a section number")
            elif ref not in known:
                problems.append(f"{where} — cites Section {ref}, which no master contains")

    return table, problems


# Each entry breaks the map one way and names what the gate must say. A check
# nobody has watched fail is not known to work — and the first attempt at the
# duplicate-row mutation below split a row in half instead of duplicating it,
# which the gate caught for a different reason and would have been recorded as a
# pass. So a mutation that leaves the file unchanged fails here, and each
# expectation names the specific message rather than merely a non-zero exit.
MUTATIONS = [
    ("a section of the chapter loses its row",
     lambda t: re.sub(r"^\| 605\.0503 .*\n", "", t, count=1, flags=re.M),
     "605.0503 has no row"),
    ("a row for something that is not in the chapter",
     lambda t: t + "| 605.9999 | Invented. | relied |  | nothing |\n",
     "not a section of Chapter 605"),
    ("a section answered twice",
     lambda t: t + "| 605.0503 | Charging order. | varied | 10.6 | duplicate |\n",
     "has 2 rows"),
    ("a disposition outside the vocabulary",
     lambda t: t.replace("| 605.0503 | Charging order. | varied |", "| 605.0503 | Charging order. | probably |", 1),
     "is not one of"),
    ("a disposition with no reason",
     lambda t: re.sub(r"^(\| 605\.0503 \| Charging order\. \| varied \| 10\.6 \|)[^|]*\|", r"\1  |", t, count=1, flags=re.M),
     "no note"),
    ("varied, but nothing varies it",
     lambda t: t.replace("| 605.0503 | Charging order. | varied | 10.6 |", "| 605.0503 | Charging order. | varied |  |", 1),
     "cites nothing that varies it"),
    ("a citation to a provision since deleted",
     lambda t: t.replace("| 605.0503 | Charging order. | varied | 10.6 |", "| 605.0503 | Charging order. | varied | 10.97 |", 1),
     "which no master contains"),
]


def selftest():
    import tempfile
    base = open(MAP_PATH).read()
    target = os.path.join(tempfile.mkdtemp(), "coverage-605.md")
    failures = 0
    for label, mutate, expect in MUTATIONS:
        text = mutate(base)
        if text == base:
            print(f"  VOID  {label} — the mutation changed nothing, so it proved nothing")
            failures += 1
            continue
        open(target, "w").write(text)
        try:
            _, problems = check(target)
        except SystemExit as e:
            problems = [str(e)]
        if any(expect in p for p in problems):
            print(f"  ok    {label}")
        else:
            print(f"  MISS  {label} — broke it and the gate said: {problems[:1] or 'nothing'}")
            failures += 1
    if failures:
        print(f"\n{failures} of {len(MUTATIONS)} checks did not fire.", file=sys.stderr)
        return 1
    print(f"  {len(MUTATIONS)} checks each caught the defect it exists for")
    return 0


def main():
    quiet = "--quiet" in sys.argv
    if "--selftest" in sys.argv:
        return selftest()
    table, problems = check()
    for p in problems:
        print("  " + p)
    if problems:
        print(f"\n{len(problems)} problem(s) in the coverage map.", file=sys.stderr)
        return 1

    counts = {d: sum(1 for r in table if r["disposition"] == d) for d in sorted(DISPOSITIONS)}
    print(f"  ok    {len(table)} of {len(CHAPTER)} sections of Chapter 605 answered  ("
          + ", ".join(f"{d} {n}" for d, n in counts.items()) + ")")

    if quiet:
        return 0
    gaps = [r for r in table if "GAP" in r["note"]]
    print(f"\n  {len(gaps)} sections of the Act marked GAP — an absence nobody has ruled on:")
    for r in gaps:
        print(f"    s. {r['section']}  {r['title']}")
        print(f"      {r['note']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
