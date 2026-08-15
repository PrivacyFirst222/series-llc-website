#!/usr/bin/env python3
"""Redline one operating agreement master against another, as a Word document.

Compares the blank forms as they sit in the repository — placeholders and
alternative provisions intact — so every paragraph that differs is visible,
including the ones a generated document for a particular client would have
resolved away.

    python3 docs/redline.py                    # partnership -> S corporation
    python3 docs/redline.py OLD.md NEW.md "Output Name.docx"

Struck red text is in the first document only; underlined blue text is in the
second only. Changed paragraphs are diffed word by word; a provision present in
only one form appears as a whole struck or underlined block.

It reuses md-to-docx.py's typography so the redline reads like the agreements it
compares: Times New Roman 12pt, justified, no paragraph split across a page.
"""
import difflib
import importlib.util
import os
import re
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

_spec = importlib.util.spec_from_file_location("md2docx", os.path.join(HERE, "md-to-docx.py"))
md2docx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(md2docx)

P = md2docx.PROFILES["agreement"]
DELETE = "C00000"   # red
INSERT = "0645AD"   # blue

DEFAULT_PAIR = (
    "webapp/server/templates-oa-multi.md",
    "webapp/server/templates-oa-s.md",
    "FPSLLC Redline - Manager-Managed Partnership vs S Corporation.docx",
)


def paragraphs(path):
    """Every displayable paragraph, emphasis stripped.

    A redline is read for words. Leaving the markdown ** in would report a
    difference whenever only the bolding moved, which is noise in a document
    whose purpose is to show what actually changed.
    """
    out = []
    for raw in open(path).read().split("\n"):
        line = raw.rstrip()
        if not line or line.startswith("<!--") or line.startswith("[[") or line == "---":
            continue
        text = re.sub(r"\*\*|\*|`", "", re.sub(r"^#+\s*", "", line)).strip()
        if text:
            out.append({"text": text, "heading": raw.startswith("#")})
    return out


def run(text, *, colour=None, strike=False, underline=False, bold=False):
    if not text:
        return ""
    props = [f'<w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>']
    if bold:
        props.append("<w:b/>")
    if strike:
        props.append("<w:strike/>")
    if colour:
        props.append(f'<w:color w:val="{colour}"/>')
    if underline:
        props.append('<w:u w:val="single"/>')
    props.append(f'<w:sz w:val="{P["body_sz"]}"/><w:szCs w:val="{P["body_sz"]}"/>')
    return (f'<w:r><w:rPr>{"".join(props)}</w:rPr>'
            f'<w:t xml:space="preserve">{md2docx.esc(text)}</w:t></w:r>')


def para(runs_xml, *, after=None, justify=True):
    props = md2docx.ppr(justify=justify,
                        after=P["body_after"] if after is None else after,
                        keep_lines=True)
    return f"<w:p>{props}{runs_xml}</w:p>"


def word_diff(old, new):
    a, b = old.split(" "), new.split(" ")
    parts = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            parts.append(run(" ".join(a[i1:i2]) + " "))
        else:
            if i1 != i2:
                parts.append(run(" ".join(a[i1:i2]) + " ", colour=DELETE, strike=True))
            if j1 != j2:
                parts.append(run(" ".join(b[j1:j2]) + " ", colour=INSERT, underline=True))
    return "".join(parts)


def build(old_path, new_path, out_name):
    old, new = paragraphs(old_path), paragraphs(new_path)
    a = [p["text"] for p in old]
    b = [p["text"] for p in new]

    body = []
    stats = {"same": 0, "changed": 0, "only_old": 0, "only_new": 0}

    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            stats["same"] += i2 - i1
            for k in range(i1, i2):
                body.append(para(run(a[k], bold=old[k]["heading"])))
        elif tag == "replace":
            for n in range(max(i2 - i1, j2 - j1)):
                oi, ni = i1 + n, j1 + n
                if oi < i2 and ni < j2:
                    stats["changed"] += 1
                    body.append(para(word_diff(a[oi], b[ni])))
                elif oi < i2:
                    stats["only_old"] += 1
                    body.append(para(run(a[oi], colour=DELETE, strike=True)))
                else:
                    stats["only_new"] += 1
                    body.append(para(run(b[ni], colour=INSERT, underline=True)))
        elif tag == "delete":
            stats["only_old"] += i2 - i1
            for k in range(i1, i2):
                body.append(para(run(a[k], colour=DELETE, strike=True)))
        elif tag == "insert":
            stats["only_new"] += j2 - j1
            for k in range(j1, j2):
                body.append(para(run(b[k], colour=INSERT, underline=True)))

    head = [
        para(run("REDLINE", bold=True), after=60, justify=False),
        para(run(f"{os.path.basename(old_path)}  →  {os.path.basename(new_path)}"),
             after=60, justify=False),
        para(run("Struck red text appears in the first document only. Underlined blue text "
                 "appears in the second only. Both are the blank forms as filed in the "
                 "repository, with placeholders and alternative provisions intact."), after=60),
        para(run(f"{stats['same']} paragraphs identical · {stats['changed']} changed · "
                 f"{stats['only_old']} only in the first · {stats['only_new']} only in the second",
                 bold=True), after=320, justify=False),
    ]

    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document {md2docx.NS} {md2docx.RNS}><w:body>'
                + "".join(head + body)
                + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
                  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
                  "</w:sectPr></w:body></w:document>")

    base = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
    ct = "application/vnd.openxmlformats-officedocument.wordprocessingml."
    parts = {"rIdStyles": ("styles", "styles.xml"), "rIdSettings": ("settings", "settings.xml")}
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(f'<Relationship Id="{rid}" Type="{base}{kind}" Target="{target}"/>'
                      for rid, (kind, target) in parts.items())
            + "</Relationships>")
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package'
                     '.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
                     f'<Override PartName="/word/document.xml" ContentType="{ct}document.main+xml"/>'
                     + "".join(f'<Override PartName="/word/{target}" ContentType="{ct}{kind}+xml"/>'
                               for kind, target in parts.values())
                     + "</Types>")
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 f'<Relationship Id="rId1" Type="{base}officeDocument" Target="word/document.xml"/>'
                 "</Relationships>")

    out_path = os.path.join(ROOT, "docs", "word", out_name)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", md2docx.styles_xml(P))
        z.writestr("word/settings.xml", md2docx.SETTINGS)
        z.writestr("word/_rels/document.xml.rels", rels)
    with zipfile.ZipFile(tmp.name) as z:
        if z.testzip() is not None:
            raise SystemExit("redline: corrupt archive — nothing written")
    os.replace(tmp.name, out_path)

    print(f"  {out_name}")
    print(f"    {stats['same']} identical · {stats['changed']} changed · "
          f"{stats['only_old']} only in {os.path.basename(old_path)} · "
          f"{stats['only_new']} only in {os.path.basename(new_path)}")
    return out_path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        old, new, name = DEFAULT_PAIR
        build(os.path.join(ROOT, old), os.path.join(ROOT, new), name)
        return 0
    if len(args) != 3:
        print(__doc__)
        return 2
    build(args[0], args[1], args[2])
    return 0


if __name__ == "__main__":
    sys.exit(main())
