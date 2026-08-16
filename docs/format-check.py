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

    # Pagination. None of this was measured until 16 August, which is why four
    # separate regressions shipped: the 1.15 line spacing dropped to single,
    # every heading's space-below became 0, keepLines went from 0 paragraphs to
    # all of them, and page breaks were empty paragraphs that opened each
    # exhibit one blank line down. Every check passed through all four.
    styles = z.read("word/styles.xml").decode("utf8", "replace") if "word/styles.xml" in names else ""
    line_rule = re.search(r'<w:pPrDefault>.*?w:line="(\d+)".*?</w:pPrDefault>', styles, re.S)
    # Count paragraphs that START a page rather than break markers, so the two
    # idioms cannot double-count a paragraph carrying both. In docs/source/ the
    # Owner's Manual has 8: six pageBreakBefore on the PART dividers, and two
    # break runs — before CONTENTS and before the disclaimer that follows it.
    page_breaks = sum(
        1 for p in paras
        if "<w:pageBreakBefore/>" in p or re.search(r'w:type="page"', p)
    )
    # Space below a heading, taken from the headings themselves rather than the
    # profile, so a document hand-checked once stays checkable.
    heading_afters = []
    for p in body_paras:
        ps = [int(s) for s in re.findall(r'<w:sz w:val="(\d+)"/>', p)]
        if ps and max(ps) > body_sz:
            m = re.search(r'<w:spacing[^/]*w:after="(\d+)"', p)
            heading_afters.append(int(m.group(1)) if m else -1)  # -1 = inherits

    # A paragraph whose every run is bold is a heading standing on its own, and
    # what it introduces is the paragraph after it. Without keepNext it strands
    # at the foot of a page — s. 8.5 on page 9 of SMMEMS, found by Adam reading
    # the document, not by any check here. This is the static half of that: it
    # cannot see a page, but it can see a heading that is free to be left behind.
    # Table cells are excluded: a bold header cell is bold-only too, and it
    # cannot strand — its row carries cantSplit and the header repeats on every
    # page. Counting them reported 12 in SMMEMS where 3 provisions were at risk.
    #
    # And a bold-only paragraph is only at risk when what follows it is BODY
    # text. A contents entry is followed by another contents entry, and a table
    # of contents in which every line keeps with the next is one unbreakable
    # block — the manual's 32 chapter entries are why this rule is "followed by
    # something that is not itself a heading" rather than "is bold".
    outside_tables = re.sub(r"<w:tbl>.*?</w:tbl>", "", doc, flags=re.S)
    seq = [p for p in re.findall(r"<w:p[ >].*?</w:p>", outside_tables, flags=re.S)
           if "<w:t" in p]

    def bold_only(p):
        texts = [r for r in re.findall(r"<w:r[ >].*?</w:r>", p, flags=re.S) if "<w:t" in r]
        return bool(texts) and all("<w:b/>" in r for r in texts)

    stranded = 0
    for idx, p in enumerate(seq):
        nxt = seq[idx + 1] if idx + 1 < len(seq) else None
        if (
            bold_only(p)
            and nxt is not None
            and not bold_only(nxt)
            and "<w:keepNext/>" not in p
            # A paragraph that starts its own page cannot be left at the foot
            # of the previous one.
            and "<w:pageBreakBefore/>" not in p
        ):
            stranded += 1

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
        "line_spacing": int(line_rule.group(1)) if line_rule else 240,
        "widow_control": count(r"<w:widowControl/>"),
        "page_breaks": page_breaks,
        # 0 would mean every heading sits flush against its text.
        "headings_with_space_below": sum(1 for a in heading_afters if a != 0),
        "bold_only_without_keepnext": stranded,
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
        m = measure(path)
        if b is None:
            # No baseline is not a reason to check nothing. Stranding and a
            # disabled widow control are absolute faults — they need no
            # original to compare against — and the Statement of Authorized
            # Representative, which has no original, was the one document in
            # the set where a pagination defect could ship unmeasured.
            absolute = []
            if m["bold_only_without_keepnext"]:
                absolute.append(
                    f"stranding: {m['bold_only_without_keepnext']} bold-only heading(s) "
                    "with no keepNext"
                )
            if re.search(r'<w:widowControl w:val="(0|false)"',
                         zipfile.ZipFile(path).read("word/document.xml").decode("utf8", "replace")):
                absolute.append("widow control: explicitly disabled somewhere")
            if absolute:
                failed.append(name)
                print(f"FAIL  {name} — no baseline, but:")
                for a in absolute:
                    print(f"        {a}")
            else:
                print(f"PART  {name} — no baseline entry; pagination checked, formatting not")
            continue
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

        # Pagination. Exact, not toleranced: line spacing is one number for the
        # whole document and 240 (single) instead of 276 (1.15) is a different
        # document, not a drifted one.
        if b.get("line_spacing") and m["line_spacing"] != b["line_spacing"]:
            problems.append(
                f"line spacing: {m['line_spacing']/240:.2f} lines, "
                f"baseline {b['line_spacing']/240:.2f}"
            )
        # Every paragraph carries widowControl or inherits Word's default. A
        # document that switches it OFF is the failure this catches.
        if re.search(r'<w:widowControl w:val="(0|false)"',
                     zipfile.ZipFile(path).read("word/document.xml").decode("utf8", "replace")):
            problems.append("widow control: explicitly disabled somewhere")
        # Page breaks are added by us, so the baseline floor is what the master
        # asks for; losing them silently is how the exhibits ran together.
        if b.get("page_breaks", 0) and m["page_breaks"] < b["page_breaks"]:
            problems.append(f"page breaks: {m['page_breaks']}, baseline {b['page_breaks']}")
        # 0 headings with space below = every heading flush against its text,
        # which is exactly what shipped in all eight agreements.
        if m["headings"] and not m["headings_with_space_below"]:
            problems.append("headings: every one sits flush against the text below it")
        # Absolute, not relative to a baseline: the originals are not the
        # authority here, since this is a fault they can have too. One free
        # heading is one that can be left at the foot of a page.
        if m["bold_only_without_keepnext"]:
            problems.append(
                f"stranding: {m['bold_only_without_keepnext']} bold-only heading(s) "
                "with no keepNext — free to be left at the foot of a page"
            )

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
