#!/usr/bin/env python3
"""Generate a .docx from a master markdown file.

The markdown in this repo is the master. Word files are OUTPUT — regenerated
every time a master changes, and never edited by hand. See docs/README.md.

Handles what the masters actually contain: ATX headings, bold/italic runs,
pipe tables, the [[pagebreak]] sentinel, `---` separators, and a
`<!-- page-header: ... -->` front-matter comment.

Writes to a temp file and only replaces the target once the result verifies as
a readable zip, so a crash cannot truncate an existing document.

    python3 docs/md-to-docx.py <input.md> <output.docx> ["Title"]
"""
import os
import re
import sys
import shutil
import zipfile
import tempfile

NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def runs(text):
    """Markdown inline -> w:r elements, carrying bold and italic."""
    out = []
    for part in re.split(r"(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)", text):
        if not part:
            continue
        b = i = False
        if part.startswith("***") and part.endswith("***") and len(part) > 6:
            part, b, i = part[3:-3], True, True
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            part, b = part[2:-2], True
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            part, i = part[1:-1], True
        pr = ""
        if b or i:
            pr = "<w:rPr>" + ("<w:b/>" if b else "") + ("<w:i/>" if i else "") + "</w:rPr>"
        out.append(f'<w:r>{pr}<w:t xml:space="preserve">{esc(part)}</w:t></w:r>')
    return "".join(out) or "<w:r/>"


def para(text, style=None, align=None):
    pr = ""
    if style or align:
        pr = "<w:pPr>"
        if style:
            pr += f'<w:pStyle w:val="{style}"/>'
        if align:
            pr += f'<w:jc w:val="{align}"/>'
        pr += "</w:pPr>"
    return f"<w:p>{pr}{runs(text)}</w:p>"


def page_break():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def table(rows):
    width = max(len(r) for r in rows)
    grid = "".join('<w:gridCol w:w="%d"/>' % (9360 // width) for _ in range(width))
    body = []
    for ri, row in enumerate(rows):
        cells = []
        for ci in range(width):
            txt = row[ci] if ci < len(row) else ""
            if ri == 0 and txt and not txt.startswith("**"):
                txt = f"**{txt}**"
            cells.append(
                '<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/></w:tcPr>%s</w:tc>'
                % (9360 // width, para(txt))
            )
        body.append("<w:tr>" + "".join(cells) + "</w:tr>")
    return (
        "<w:tbl><w:tblPr>"
        '<w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders>'
        + "".join(
            f'<w:{e} w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
            for e in ("top", "left", "bottom", "right", "insideH", "insideV")
        )
        + "</w:tblBorders></w:tblPr>"
        f"<w:tblGrid>{grid}</w:tblGrid>" + "".join(body) + "</w:tbl>"
    )


def split_row(line):
    return [c.strip().replace("\\|", "|") for c in line.strip().strip("|").split("|")]


def body_xml(md):
    header = None
    m = re.search(r"<!--\s*page-header:\s*(.+?)\s*-->", md)
    if m:
        header = m.group(1)
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)

    out, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()
        if not stripped or stripped == "---":
            i += 1
            continue
        if stripped == "[[pagebreak]]":
            out.append(page_break())
            i += 1
            continue
        if stripped == "[[left]]":
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[-| :]+\|?$", lines[i + 1].strip()):
            rows = [split_row(stripped)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            out.append(table(rows))
            continue
        h = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h:
            level = min(len(h.group(1)), 6)
            out.append(para(h.group(2), style=f"Heading{level}", align="center" if level == 1 else None))
            i += 1
            continue
        out.append(para(stripped))
        i += 1

    sect = "<w:sectPr>"
    if header:
        sect += '<w:headerReference w:type="default" r:id="rId1"/>'
    sect += (
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"'
        ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return "".join(out) + sect, header


STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f"<w:styles {NS}>"
    '<w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/>'
    "</w:rPr></w:rPrDefault></w:docDefaults>"
    + "".join(
        f'<w:style w:type="paragraph" w:styleId="Heading{n}">'
        f'<w:name w:val="heading {n}"/><w:basedOn w:val="Normal"/>'
        f"<w:pPr><w:keepNext/><w:spacing w:before=\"240\" w:after=\"120\"/></w:pPr>"
        f'<w:rPr><w:b/><w:sz w:val="{size}"/></w:rPr></w:style>'
        for n, size in ((1, 32), (2, 28), (3, 24), (4, 22), (5, 22), (6, 22))
    )
    + '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>'
    "</w:styles>"
)


def build(md_path, docx_path, title=None):
    md = open(md_path).read()
    body, header = body_xml(md)

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + (
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
            if header
            else ""
        )
        + "</Relationships>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + (
            '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
            if header
            else ""
        )
        + "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<w:body>{body}</w:body></w:document>"
    )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/_rels/document.xml.rels", rels)
        if header:
            z.writestr(
                "word/header1.xml",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f"<w:hdr {NS}>{para(header, align='center')}</w:hdr>",
            )

    # Only replace the target once the result is a readable archive holding a
    # non-trivial document — a failed generation must not truncate a real file.
    with zipfile.ZipFile(tmp.name) as z:
        if z.testzip() is not None or len(z.read("word/document.xml")) < 500:
            os.unlink(tmp.name)
            raise SystemExit(f"generated docx failed verification: {docx_path}")
    shutil.move(tmp.name, docx_path)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
