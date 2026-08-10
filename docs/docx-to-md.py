#!/usr/bin/env python3
"""Convert a .docx into readable, diffable markdown.

The .docx in docs/source/ is authoritative. This produces a text mirror so the
content can be grepped, diffed in review, and read without Word. Driven by
docs/sync.ts; see docs/README.md.

    python3 docs/docx-to-md.py <input.docx> <output.md>
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


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


def para_md(p):
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
    if p.find(W + "pPr/" + W + "numPr") is not None:
        return "- " + text
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
        root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    parts, blank = [], False
    for child in body:
        if child.tag == W + "p":
            md = para_md(child)
            if md:
                parts.append(md)
                blank = False
            elif not blank:
                parts.append("")
                blank = True
        elif child.tag == W + "tbl":
            parts += ["", table_md(child), ""]
            blank = True
    return re.sub(r"\n{3,}", "\n\n", "\n".join(parts)).strip() + "\n"


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    header = (
        f"<!-- Converted from docs/source/{os.path.basename(src)} for diffing and search.\n"
        f"     The .docx in docs/source/ is authoritative; edit that, then run\n"
        f"     `bun run docs:sync`. Do not hand-edit this file. -->\n\n"
    )
    with open(dst, "w") as f:
        f.write(header + convert(src))
    return 0


if __name__ == "__main__":
    sys.exit(main())
