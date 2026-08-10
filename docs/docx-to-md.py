#!/usr/bin/env python3
"""Convert a .docx into markdown.

Used ONCE per document, to import something authored in Word into the repo as a
master. After that the markdown is authoritative and md-to-docx.py generates the
Word file — never the other way round. See docs/README.md.

Resolves numbering.xml so automatic list numbers survive as literal text, and
carries the running header and footer into front matter, because a lossy import
promoted to master loses that content permanently.

    python3 docs/docx-to-md.py <input.docx> <output.md>
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _text_of(part_xml):
    """All visible text of a header/footer part, space-joined."""
    if not part_xml:
        return ""
    root = ET.fromstring(part_xml)
    return " ".join(t.text.strip() for t in root.iter(W + "t") if t.text and t.text.strip())


def load_numbering(z):
    """numId -> {ilvl: (fmt, start)} so numbered paragraphs keep their numbers."""
    try:
        root = ET.fromstring(z.read("word/numbering.xml"))
    except KeyError:
        return {}
    abstract = {}
    for a in root.findall(W + "abstractNum"):
        aid = a.get(W + "abstractNumId")
        levels = {}
        for lvl in a.findall(W + "lvl"):
            ilvl = int(lvl.get(W + "ilvl", "0"))
            fmt = lvl.find(W + "numFmt")
            start = lvl.find(W + "start")
            levels[ilvl] = (
                fmt.get(W + "val") if fmt is not None else "decimal",
                int(start.get(W + "val")) if start is not None else 1,
            )
        abstract[aid] = levels
    numbering = {}
    for n in root.findall(W + "num"):
        nid = n.get(W + "numId")
        ref = n.find(W + "abstractNumId")
        if ref is not None:
            numbering[nid] = abstract.get(ref.get(W + "val"), {})
    return numbering


def runs_text(node):
    """Text of a paragraph or cell, carrying bold and italic through."""
    out = []
    for r in node.iter(W + "r"):
        bold = r.find(W + "rPr/" + W + "b") is not None
        ital = r.find(W + "rPr/" + W + "i") is not None
        txt = "".join(t.text or "" for t in r.iter(W + "t"))
        if not txt:
            if r.find(W + "br") is not None:
                out.append("\n")
            continue
        if bold and ital:
            txt = f"***{txt}***"
        elif bold:
            txt = f"**{txt}**"
        elif ital:
            txt = f"*{txt}*"
        out.append(txt)
    # Word splits a styled phrase across runs; rejoin so "**a****b**" reads "**ab**"
    return "".join(out).replace("******", "").replace("****", "").strip()


ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"]


def marker(fmt, n):
    if fmt == "bullet":
        return "-"
    if fmt == "lowerLetter":
        return f"{chr(96 + n)}."
    if fmt == "upperLetter":
        return f"{chr(64 + n)}."
    if fmt == "lowerRoman":
        return f"{ROMAN[n - 1] if n <= len(ROMAN) else n}."
    if fmt == "upperRoman":
        return f"{(ROMAN[n - 1] if n <= len(ROMAN) else str(n)).upper()}."
    return f"{n}."


def para_md(p, numbering, counters):
    style = p.find(W + "pPr/" + W + "pStyle")
    name = style.get(W + "val") if style is not None else ""
    text = runs_text(p)
    if not text:
        return ""
    m = re.match(r"Heading(\d)", name or "")
    if m:
        return "#" * min(int(m.group(1)) + 1, 6) + " " + re.sub(r"\*+", "", text)
    if (name or "").lower().startswith("title"):
        return "# " + re.sub(r"\*+", "", text)

    numpr = p.find(W + "pPr/" + W + "numPr")
    if numpr is not None:
        nid_el = numpr.find(W + "numId")
        ilvl_el = numpr.find(W + "ilvl")
        nid = nid_el.get(W + "val") if nid_el is not None else None
        ilvl = int(ilvl_el.get(W + "val")) if ilvl_el is not None else 0
        fmt, start = numbering.get(nid, {}).get(ilvl, ("bullet", 1))
        key = (nid, ilvl)
        if fmt == "bullet":
            return "  " * ilvl + "- " + text
        counters[key] = counters.get(key, start - 1) + 1
        # deeper levels restart when an outer level advances
        for k in list(counters):
            if k[0] == nid and k[1] > ilvl:
                del counters[k]
        return "  " * ilvl + marker(fmt, counters[key]) + " " + text
    return text


def table_md(tbl):
    rows = []
    for tr in tbl.findall(W + "tr"):
        cells = []
        for tc in tr.findall(W + "tc"):
            joined = " ".join(filter(None, (runs_text(p) for p in tc.findall(W + "p"))))
            cells.append(joined.replace("|", "\\|"))
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    for r in rows[1:]:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def convert(path):
    with zipfile.ZipFile(path) as z:
        numbering = load_numbering(z)
        root = ET.fromstring(z.read("word/document.xml"))
        names = z.namelist()
        header = _text_of(z.read("word/header1.xml") if "word/header1.xml" in names else b"")
        footer = _text_of(z.read("word/footer1.xml") if "word/footer1.xml" in names else b"")

    body = root.find(W + "body")
    parts, blank, counters = [], False, {}
    for child in body:
        if child.tag == W + "p":
            md = para_md(child, numbering, counters)
            if md:
                parts.append(md)
                blank = False
            elif not blank:
                parts.append("")
                blank = True
        elif child.tag == W + "tbl":
            parts += ["", table_md(child), ""]
            blank = True

    front = []
    if header:
        front.append(f"<!-- page-header: {header} -->")
    if footer:
        front.append(f"<!-- page-footer: {footer} -->")
    doc = re.sub(r"\n{3,}", "\n\n", "\n".join(parts)).strip() + "\n"
    return ("\n".join(front) + "\n\n" if front else "") + doc


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    with open(dst, "w") as f:
        f.write(convert(src))
    return 0


if __name__ == "__main__":
    sys.exit(main())
