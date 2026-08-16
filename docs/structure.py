#!/usr/bin/env python3
"""The invariants a reader assumes without checking, checked.

Nobody reads an agreement asking whether the sections run in order, whether
Section 7.4 still exists, or whether the definitions are still alphabetical.
Those are assumed, which is exactly why a break in one survives a careful read:
the eye supplies what it expects. Fifteen provisions were deleted from these
forms in a single evening, and every deletion is a chance to leave a hole in the
numbering, a cross-reference pointing at nothing, or a definition marooned out of
sequence.

The provision map answers "should this provision exist"; the drafting lint
answers "is this sentence a covenant"; this answers "does the document still hold
together as a document". None of the three reads for meaning.

  article      ARTICLE headings run 1..N with no gap and no number used twice
  section      within each article, sections run .1..N with no gap and no reuse,
               and no provision sits under an article heading that is missing
  paragraph    lettered paragraphs beginning a line run (a), (b), (c)... in
               order, with none skipped and none repeated
  xref         every "Section N.N", "Article N" and "Exhibit X" resolves inside
               the SAME form — the forms differ from one another, so a reference
               that resolves in the multi-member document proves nothing about
               the single-member one
  fullstop     every provision ends in a full stop. A provision that ends mid-air
               has had something cut off it
  defined      Article 2 definitions stay in alphabetical order, and no term is
               defined twice. Adam moved 2.9 to 2.2 by hand to restore the
               alphabet; this keeps it restored

    python3 docs/structure.py                       # every master
    python3 docs/structure.py --selftest            # break each invariant, watch it fire
    python3 docs/structure.py path/to/master.md     # one
"""
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MASTERS = [
    "webapp/server/templates-oa-single.md",
    "webapp/server/templates-oa-multi.md",
    "webapp/server/templates-oa-s.md",
    "webapp/server/templates-oa-member.md",
    "webapp/server/templates-oa-member-s.md",
    "webapp/server/templates-oa-single-s.md",
    "webapp/server/templates-oa-member-single.md",
    "webapp/server/templates-oa-member-single-s.md",
]

PROVISION_RE = re.compile(
    r"^\*\*(\d+\.\d+[A-Z]?)\s+([^*]+?)\*\*(.*?)(?=^\*\*\d+\.\d+[A-Z]?\s|^## |\Z)",
    re.M | re.S,
)
ARTICLE_RE = re.compile(r"^#+\s*ARTICLE\s+(\d+)", re.M | re.I)
EXHIBIT_RE = re.compile(r"^#+\s*EXHIBIT\s+([A-Z])\b", re.M | re.I)
DEFINITION_RE = re.compile(r'^\*\*(\d+\.\d+[A-Z]?)\s+"([^"]+)"', re.M)

# A reference, and only a reference. "s. 605.2301" is a statute, not Section
# 605.2301 of this agreement, and section 1362 of the Code is neither.
SECTION_REF_RE = re.compile(
    r"\bSections?\s+((?:\d+\.\d+[A-Z]?)(?:\s*(?:,|;|and|or|through|to)\s*(?:Sections?\s+)?\d+\.\d+[A-Z]?)*)"
)
ARTICLE_REF_RE = re.compile(r"\bArticles?\s+(\d+)\b")
EXHIBIT_REF_RE = re.compile(r"\bExhibit\s+([A-Z])\b")

# Text that ends a provision cleanly. The bracket covers "[Reserved.]" and the
# colon covers a provision that introduces a list carried in the next block.
CLEAN_END = (".", ".”", '."', ".)", ".]", ":", "]")


def major(section):
    return int(section.partition(".")[0])


def minor(section):
    return int(re.sub(r"[A-Z]", "", section.partition(".")[2]))


def strip_tail(body):
    """Drop trailing whitespace, horizontal rules and comments before testing the end."""
    return re.sub(r"(?:\s|-{3,}|<!--.*?-->|\*|_)+$", "", body, flags=re.S)


def check(path):
    text = open(path).read()
    name = os.path.basename(path)
    provs = [(m.group(1), m.group(2).strip(), m.group(3)) for m in PROVISION_RE.finditer(text)]
    articles = [m.group(1) for m in ARTICLE_RE.finditer(text)]
    exhibits = {m.group(1).upper() for m in EXHIBIT_RE.finditer(text)}
    sections = [p[0] for p in provs]
    problems = []

    # --- article numbering ---------------------------------------------------
    seen = []
    for a in articles:
        if a in seen:
            problems.append(f"{name}  ARTICLE {a} appears twice")
        seen.append(a)
    nums = sorted({int(a) for a in articles})
    if nums:
        for want in range(1, nums[-1] + 1):
            if want not in nums:
                problems.append(f"{name}  ARTICLE {want} is missing — the articles jump over it")

    # --- section numbering ---------------------------------------------------
    for s in sorted({s for s in sections if sections.count(s) > 1}):
        problems.append(f"{name}  Section {s} is used by two provisions")
    by_article = defaultdict(set)
    for s in sections:
        by_article[major(s)].add(minor(s))
    for art in sorted(by_article):
        if str(art) not in articles:
            problems.append(f"{name}  Section {art}.x exists with no ARTICLE {art} heading above it")
        have = by_article[art]
        for want in range(1, max(have) + 1):
            if want not in have:
                problems.append(f"{name}  Section {art}.{want} is missing — Article {art} skips it")

    # --- lettered paragraphs -------------------------------------------------
    # Only letters that BEGIN a line are paragraph labels. "(b)" mid-sentence is
    # a cross-reference and "section 1362(f)" is a statute.
    for section, heading, body in provs:
        letters = re.findall(r"^(?:\*\*)?\(([a-z])\)", body, re.M)
        if not letters:
            continue
        expected = [chr(ord("a") + i) for i in range(len(letters))]
        if letters != expected:
            problems.append(
                f"{name}  Section {section} lettered paragraphs run "
                f"({') ('.join(letters)}) — expected ({') ('.join(expected)})"
            )

    # --- cross-references ----------------------------------------------------
    known_sections, known_articles = set(sections), set(articles)
    for m in SECTION_REF_RE.finditer(text):
        for ref in re.findall(r"\d+\.\d+[A-Z]?", m.group(1)):
            if ref.startswith("605."):
                continue
            if ref not in known_sections:
                problems.append(f"{name}  refers to Section {ref}, which this form does not contain")
    for m in ARTICLE_REF_RE.finditer(text):
        if m.group(1) not in known_articles:
            problems.append(f"{name}  refers to Article {m.group(1)}, which this form does not contain")
    for m in EXHIBIT_REF_RE.finditer(text):
        if m.group(1).upper() not in exhibits:
            problems.append(f"{name}  refers to Exhibit {m.group(1)}, which this form does not contain")

    # --- provisions that stop mid-air ---------------------------------------
    for section, heading, body in provs:
        end = strip_tail(body)
        if not end:
            problems.append(f"{name}  Section {section} {heading} has no text")
        elif not end.endswith(CLEAN_END):
            problems.append(f"{name}  Section {section} does not end in a full stop: \"...{end[-60:]}\"")

    # --- definitions ---------------------------------------------------------
    defs = DEFINITION_RE.findall(text)
    terms = [t for _, t in defs]
    for t in sorted({t for t in terms if terms.count(t) > 1}):
        problems.append(f'{name}  "{t}" is defined twice')
    for (sa, a), (sb, b) in zip(defs, defs[1:]):
        if a.lower() > b.lower():
            problems.append(f'{name}  definitions out of alphabetical order: {sa} "{a}" precedes {sb} "{b}"')

    return problems


# Each entry breaks one invariant in a real master and names the words the check
# must say about it. A check nobody has watched fail is not known to work: the
# first version of this file passed every master while three of its checks
# were dead, and the mutations that "proved" them had silently changed nothing.
# So a mutation that leaves the text identical is a failure here, not a pass.
MUTATIONS = [
    ("article missing", lambda t: t.replace("## ARTICLE 7", "## ARTICLE 8", 1),
     "ARTICLE 7 is missing"),
    ("article twice", lambda t: t.replace("## ARTICLE 7", "## ARTICLE 6", 1),
     "appears twice"),
    ("article heading deleted", lambda t: re.sub(r"^## ARTICLE 16[^\n]*\n", "", t, count=1, flags=re.M),
     "no ARTICLE 16 heading"),
    ("section number reused", lambda t: t.replace("**7.2 ", "**7.1 ", 1),
     "used by two provisions"),
    ("section number skipped", lambda t: re.sub(r"^\*\*7\.2\s", "**7.9 ", t, count=1, flags=re.M),
     "Section 7.2 is missing"),
    ("lettered paragraph skipped", lambda t: t.replace("\n(c) Within forty-five", "\n(d) Within forty-five", 1),
     "lettered paragraphs run"),
    ("reference to a deleted section", lambda t: t.replace("Section 4.1", "Section 4.97", 1),
     "Section 4.97"),
    ("reference to a missing article", lambda t: t.replace("Article 12", "Article 19", 1),
     "Article 19"),
    ("reference to a missing exhibit", lambda t: t.replace("Exhibit A", "Exhibit Q", 1),
     "Exhibit Q"),
    ("provision cut off mid-sentence",
     lambda t: re.sub(r"^(\*\*9\.1[^\n]*\n)", r"\1\nThis sentence stops mid\n", t, count=1, flags=re.M),
     "does not end in a full stop"),
    ("term defined twice", lambda t: t.replace('**2.5 "Company"', '**2.5 "Act"', 1),
     "is defined twice"),
    ("definitions out of alphabetical order", lambda t: t.replace('**2.5 "Company"', '**2.5 "Zebra"', 1),
     "alphabetical"),
]


def selftest():
    import tempfile
    source = os.path.join(ROOT, "webapp/server/templates-oa-multi.md")
    base = open(source).read()
    workdir = tempfile.mkdtemp()
    target = os.path.join(workdir, os.path.basename(source))
    failures = 0
    for label, mutate, expect in MUTATIONS:
        text = mutate(base)
        if text == base:
            print(f"  VOID  {label} — the mutation changed nothing, so it proved nothing")
            failures += 1
            continue
        open(target, "w").write(text)
        if any(expect.lower() in p.lower() for p in check(target)):
            print(f"  ok    {label}")
        else:
            print(f"  MISS  {label} — broke it and the check said nothing")
            failures += 1
    if failures:
        print(f"\n{failures} of {len(MUTATIONS)} checks did not fire.", file=sys.stderr)
        return 1
    print(f"  {len(MUTATIONS)} checks each caught the defect it exists for")
    return 0


def main():
    if "--selftest" in sys.argv:
        return selftest()
    paths = [a for a in sys.argv[1:] if not a.startswith("--")]
    paths = paths or [os.path.join(ROOT, m) for m in MASTERS]
    total = 0
    for p in paths:
        found = check(p)
        total += len(found)
        for f in found:
            print("  " + f)
        if not found:
            print(f"  ok    {os.path.basename(p)}")
    if total:
        print(f"\n{total} structural problem(s) — the document no longer holds together.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
