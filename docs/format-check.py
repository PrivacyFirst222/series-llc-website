#!/usr/bin/env python3
"""Refuse to ship a Word file that is less formatted than the one it replaces.

This exists because of a real failure. On 8 August 2026 the markdown masters
took over, and the generator that produced the Word files preserved every word
and silently discarded the typography — 165 justified paragraphs became 0,
171 keepLines became 0, Georgia became Times New Roman, the page-number footer
disappeared, and 34 chapter headings became plain body text. Nothing failed.
The pipeline checked that the file opened, not that it was any good, so two
generations of wrecked documents were written straight into Dropbox.

The hand-formatted originals in docs/source/ are the baseline. Every generation
is measured against them and must not regress.

    python3 docs/format-check.py --baseline      rebuild docs/format-baseline.json
    python3 docs/format-check.py <file.docx>...  check files (non-zero on regression)
"""
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(HERE, "source")
BASELINE = os.path.join(HERE, "format-baseline.json")

# A metric may fall to this fraction of the baseline before it counts as a
# regression. Content is edited over time, so exact equality is not the test —
# a collapse is.
TOLERANCE = 0.80


def measure(path):
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    doc = z.read("word/document.xml").decode("utf8", "replace")

    # Count opening tags rather than matched pairs: a paragraph inside a table
    # cell nests, and a non-greedy pair match silently undercounts it, which
    # pushes the density ratios above 100% and would hide a real regression.
    n_paras = len(re.findall(r"<w:p[ >]", doc))
    paras = re.findall(r"<w:p[ >].*?</w:p>|<w:p/>", doc, flags=re.S)
    body_paras = [p for p in paras if "<w:t" in p]

    def count(pat):
        return len(re.findall(pat, doc))

    fonts = re.findall(r'w:rFonts w:ascii="([^"]+)"', doc)
    primary = max(set(fonts), key=fonts.count) if fonts else ""

    # A heading is a paragraph set larger than the document's own body size.
    # An absolute point threshold is useless here: 12pt is a heading in the
    # manual and ordinary body text in the agreements.
    sizes = [int(s) for s in re.findall(r'<w:sz w:val="(\d+)"/>', doc)]
    body_sz = max(set(sizes), key=sizes.count) if sizes else 22
    headings = 0
    for p in body_paras:
        ps = [int(s) for s in re.findall(r'<w:sz w:val="(\d+)"/>', p)]
        if ps and max(ps) > body_sz:
            headings += 1

    footer = "word/footer1.xml" in names
    page_num = False
    if footer:
        page_num = "PAGE" in z.read("word/footer1.xml").decode("utf8", "replace")

    return {
        "paragraphs": n_paras,
        "justified": count(r'<w:jc w:val="both"/>'),
        "keep_lines": count(r"<w:keepLines/>"),
        "keep_next": count(r"<w:keepNext/>"),
        "body_size": body_sz,
        "headings": headings,
        "coloured_runs": count(r'<w:color w:val="(?!auto|000000)'),
        "italic_runs": count(r"<w:i/>"),
        "indented": count(r"<w:ind "),
        "tables": count(r"<w:tbl>"),
        "primary_font": primary,
        "page_numbers": page_num,
    }


def ratios(m):
    """Formatting density, so the check survives ordinary editing."""
    n = max(m["paragraphs"], 1)
    return {
        "justified_pct": m["justified"] / n,
        "keep_lines_pct": m["keep_lines"] / n,
        "headings_pct": m["headings"] / n,
    }


def build_baseline():
    out = {}
    for name in sorted(os.listdir(SOURCE_DIR)):
        if not name.endswith(".docx"):
            continue
        m = measure(os.path.join(SOURCE_DIR, name))
        m["ratios"] = ratios(m)
        out[name] = m
        print(f"baseline  {name}")
        print(
            f"          {m['paragraphs']} paras, {m['justified']} justified, "
            f"{m['keep_lines']} keepLines, {m['headings']} headings, "
            f"{m['primary_font']}, page numbers={m['page_numbers']}"
        )
    with open(BASELINE, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"\nwrote {BASELINE} ({len(out)} documents)")
    return 0


def check(paths):
    if not os.path.exists(BASELINE):
        print("no baseline — run: python3 docs/format-check.py --baseline", file=sys.stderr)
        return 1
    base = json.load(open(BASELINE))
    failed = []
    for path in paths:
        name = os.path.basename(path)
        b = base.get(name)
        if b is None:
            print(f"SKIP  {name} — no baseline entry")
            continue
        m = measure(path)
        r, br = ratios(m), b["ratios"]
        problems = []
        for key in ("justified_pct", "keep_lines_pct", "headings_pct"):
            if br[key] > 0 and r[key] < br[key] * TOLERANCE:
                problems.append(
                    f"{key}: {r[key]:.0%} of paragraphs, baseline {br[key]:.0%}"
                )
        if b["primary_font"] and m["primary_font"] != b["primary_font"]:
            problems.append(f"font: {m['primary_font']}, baseline {b['primary_font']}")
        if b.get("body_size") and m["body_size"] != b["body_size"]:
            problems.append(
                f"body size: {m['body_size']/2:g}pt, baseline {b['body_size']/2:g}pt"
            )
        if b["page_numbers"] and not m["page_numbers"]:
            problems.append("page numbers: absent, baseline present")
        if b["tables"] and m["tables"] < b["tables"] * TOLERANCE:
            problems.append(f"tables: {m['tables']}, baseline {b['tables']}")
        # Colour survived the XML checks the first time round and was only
        # caught by looking at a rendered page. It is measured now.
        for key, label in (("coloured_runs", "coloured runs"), ("italic_runs", "italics")):
            if b.get(key, 0) and m[key] < b[key] * TOLERANCE:
                problems.append(f"{label}: {m[key]}, baseline {b[key]}")
        if problems:
            failed.append(name)
            print(f"FAIL  {name}")
            for p in problems:
                print(f"        {p}")
        else:
            print(
                f"ok    {name}  ({r['justified_pct']:.0%} justified, "
                f"{r['keep_lines_pct']:.0%} keepLines, {m['headings']} headings, "
                f"{m['primary_font']} {m['body_size']/2:g}pt"
                + (", page numbers" if m["page_numbers"] else "")
                + ")"
            )
    if failed:
        print(
            f"\n{len(failed)} document(s) lost formatting against docs/source/. "
            "Nothing was written. Fix the generator or the master, then run again.",
            file=sys.stderr,
        )
        return 1
    return 0


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    if args[0] == "--baseline":
        return build_baseline()
    return check(args)


if __name__ == "__main__":
    sys.exit(main())
