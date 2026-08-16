#!/usr/bin/env python3
"""Generate a .docx from a master markdown file, in the house typography.

The markdown in this repo is the master. Word files are OUTPUT — regenerated
every time a master changes, and never edited by hand. See docs/README.md.

The typography is not invented here. It is measured from the hand-formatted
originals preserved in docs/source/, and docs/format-check.py refuses to let a
generated file regress below that baseline. Two profiles:

  manual     Georgia 11pt, justified, 14pt chapter heads, 20pt part dividers,
             bullets, indented numbered items, set-off blocks, page-number footer
  agreement  Times New Roman 12pt, justified, centered title block,
             13pt Heading 1 article heads

Markdown the masters use:

  <!-- titlepage ... -->  title page lines, "size|text|after=NNN" (manual)
  [[contents]]            expands to a table of contents built from the headings
  # X                     part divider (manual) / document title (agreement)
  ## X                    chapter (manual) / article heading (agreement)
  ### X                   sub-heading
  - x                     bullet
  1. x                    indented numbered item (manual)
  > x                     set-off block (manual)
  | a | b |               table
  [[pagebreak]]           page break

    python3 docs/md-to-docx.py <input.md> <output.docx>
"""
import os
import re
import sys
import shutil
import zipfile
import tempfile

NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

# Twips. Measured from docs/source/ — see the module docstring.
PROFILES = {
    "manual": {
        "font": "Georgia",
        "accent": "0D2E55",     # navy — part dividers, chapter heads, contents
        "body_sz": 22,          # 11pt
        "small_sz": 21,         # 10.5pt, set-off blocks
        "table_sz": 20,         # 10pt
        # Each PART divider starts a fresh page in the hand-set original (six
        # pageBreakBefore in docs/source/), and the markdown carries no
        # [[pagebreak]] to say so — so the generated manual ran the parts
        # together from the day it took over.
        "h1_starts_page": True,
        "h1": dict(sz=40, before=0, after=320, accent=True),    # PART divider
        "h2": dict(sz=28, before=320, after=160, accent=True),  # chapter
        "h3": dict(sz=24, before=200, after=80),               # sub-heading
        "body_after": 160,
        "default_after": 200,   # docs/source/ docDefaults
        "item_ind": 432,
        "quote_ind": 504,
        "footer_page_numbers": True,
        # The manual's title page comes from the titlepage block, so no heading
        # in the body is ever centered.
        "center_before_rule": False,
        "toc": dict(head_sz=32, part_sz=22, entry_sz=20, entry_ind=432),
    },
    "agreement": {
        "font": "Times New Roman",
        "accent": None,         # the originals are black throughout
        "body_sz": 24,          # 12pt
        "small_sz": 22,
        "table_sz": 22,
        # after=200, not 0. In docs/source/ an ARTICLE heading carries
        # before=240 and NO after, so it inherits the docDefault of 200; this
        # generator wrote an explicit 0 instead and every heading in all eight
        # agreements sat flush against the text beneath it.
        "h1": dict(sz=28, before=240, after=200, center=True),
        "h2": dict(sz=26, before=240, after=200),
        "h3": dict(sz=24, before=240, after=200, center=True),
        "body_after": 160,
        "default_after": 200,   # docs/source/ docDefaults
        "item_ind": 0,
        "quote_ind": 432,
        # The hand-formatted originals carry no footer. Adding one would be an
        # unrequested change to a signed instrument's appearance.
        "footer_page_numbers": False,
        # An agreement's h1 is its cover caption, not a divider: it must not
        # start a page.
        "h1_starts_page": False,
        # An agreement opens with a centered caption block; the first horizontal
        # rule ends it, and every ARTICLE heading after that is left-aligned.
        "center_before_rule": True,
        "toc": None,
    },
}


def profile_for(md_path):
    """Which house typography a master gets.

    Both were measured from docs/source/: the manual is Georgia 11pt with page
    numbers, everything that sits alongside a signed agreement is Times New
    Roman 12pt without them. The Instructions and the Statement of Authorized
    Representative belong to the second group — they are handed to the client
    with the agreement and should not look like a different product.
    """
    name = os.path.basename(md_path)
    agreement_like = ("templates-oa-", "oa-instructions", "statement-of-authorized-representative")
    return "agreement" if any(k in name for k in agreement_like) else "manual"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def runs(text, P, sz=None, bold=False, italic=False, accent=False):
    """Markdown inline -> w:r elements, carrying bold, italic and the accent."""
    sz = sz or P["body_sz"]
    color = P.get("accent") if accent else None
    out = []
    for part in re.split(r"(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)", text):
        if not part:
            continue
        b, i = bold, italic
        if part.startswith("***") and part.endswith("***") and len(part) > 6:
            part, b, i = part[3:-3], True, True
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            part, b = part[2:-2], True
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            part, i = part[1:-1], True
        rpr = (
            "<w:rPr>"
            f'<w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
            + ("<w:b/>" if b else "")
            + ("<w:i/>" if i else "")
            + (f'<w:color w:val="{color}"/>' if color else "")
            + f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
            "</w:rPr>"
        )
        out.append(f'<w:r>{rpr}<w:t xml:space="preserve">{esc(part)}</w:t></w:r>')
    if not out:
        return f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/><w:sz w:val="{sz}"/></w:rPr></w:r>'
    return "".join(out)


def ppr(justify=False, before=None, after=None, ind_left=None, ind_right=None,
        center=False, keep_next=False, keep_lines=False, page_break_before=False,
        style=None, numbered=False):
    """Paragraph properties.

    keep_lines defaults OFF, which is what every document in docs/source/ does:
    the five agreements carry it on zero paragraphs and the Owner's Manual on
    171 of 526 — its list items and set-off blocks, never its body text. It is
    not widow and orphan control. keepLines forbids a paragraph to split AT ALL,
    so a long one that will not fit moves entire and leaves the rest of the page
    blank; widowControl is the setting that keeps a single line from being
    stranded, and it is applied to everything. Short things that read badly when
    broken — a bullet, a numbered item, a quoted block — pass keep_lines=True.
    """
    p = "<w:pPr>"
    if style:
        p += f'<w:pStyle w:val="{style}"/>'
    if numbered:
        p += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    # The page starts ON this paragraph. An empty paragraph carrying a break run
    # leaves its own paragraph mark at the top of the new page, so every exhibit
    # began one blank line down — which is what a page break in this document
    # used to be. The Owner's Manual original uses pageBreakBefore on the PART
    # heading itself; this is that idiom.
    if page_break_before:
        p += "<w:pageBreakBefore/>"
    if keep_next:
        p += "<w:keepNext/>"
    if keep_lines:
        p += "<w:keepLines/>"
    p += "<w:widowControl/>"
    sp = []
    if before is not None:
        sp.append(f'w:before="{before}"')
    if after is not None:
        sp.append(f'w:after="{after}"')
    if sp:
        p += "<w:spacing " + " ".join(sp) + "/>"
    if ind_left or ind_right:
        bits = []
        if ind_left:
            bits.append(f'w:left="{ind_left}"')
        if ind_right:
            bits.append(f'w:right="{ind_right}"')
        p += "<w:ind " + " ".join(bits) + "/>"
    if center:
        p += '<w:jc w:val="center"/>'
    elif justify:
        p += '<w:jc w:val="both"/>'
    return p + "</w:pPr>"


def para(text, P, **kw):
    sz = kw.pop("sz", None)
    bold = kw.pop("bold", False)
    italic = kw.pop("italic", False)
    accent = kw.pop("accent", False)
    return (
        f"<w:p>{ppr(**kw)}"
        f"{runs(text, P, sz=sz, bold=bold, italic=italic, accent=accent)}</w:p>"
    )


def page_break():
    """A standalone break. Kept only as the fallback below — see stamp_page_break."""
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def stamp_page_break(element):
    """Make `element` start a new page, by marking it rather than preceding it.

    Word puts an empty break-run paragraph's own mark at the top of the new
    page, so a document built that way opens every exhibit one blank line down.
    pageBreakBefore in the paragraph's own properties starts the page on the
    text. A table has no paragraph properties to stamp, so it falls back.
    """
    if "<w:pageBreakBefore/>" in element:
        return element  # already starts a page — a [[pagebreak]] before a PART
    if element.startswith("<w:p") and "<w:pPr>" in element:
        return element.replace("<w:pPr>", "<w:pPr><w:pageBreakBefore/>", 1)
    return page_break() + element


def table(rows, P):
    width = max(len(r) for r in rows)
    col = 9360 // width
    grid = "".join(f'<w:gridCol w:w="{col}"/>' for _ in range(width))
    body = []
    for ri, row in enumerate(rows):
        cells = []
        for ci in range(width):
            txt = row[ci] if ci < len(row) else ""
            if ri == 0 and txt and not txt.startswith("**"):
                txt = f"**{txt}**"
            cell_p = (
                f"<w:p>{ppr(after=40, before=40, keep_lines=True)}"
                f"{runs(txt, P, sz=P['table_sz'])}</w:p>"
            )
            cells.append(
                f'<w:tc><w:tcPr><w:tcW w:w="{col}" w:type="dxa"/>'
                '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>'
                '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tcMar>'
                f"</w:tcPr>{cell_p}</w:tc>"
            )
        # Header row repeats on every page and never splits.
        trpr = "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" if ri == 0 else "<w:trPr><w:cantSplit/></w:trPr>"
        body.append(f"<w:tr>{trpr}" + "".join(cells) + "</w:tr>")
    borders = "".join(
        f'<w:{e} w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        for e in ("top", "left", "bottom", "right", "insideH", "insideV")
    )
    return (
        "<w:tbl><w:tblPr>"
        '<w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
        f"<w:tblBorders>{borders}</w:tblBorders></w:tblPr>"
        f"<w:tblGrid>{grid}</w:tblGrid>" + "".join(body) + "</w:tbl>"
    )


def split_row(line):
    return [c.strip().replace("\\|", "|") for c in line.strip().strip("|").split("|")]


def title_page(block, P):
    """'<!-- titlepage ... -->' lines: 'ptsize|text', optional '|after=NNN' and
    '|accent'. Every line is bold italic, as in the hand-set original."""
    out = [para("", P, before=2400, after=120, center=True)]
    for raw in block.strip().split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        bits = [b.strip() for b in raw.split("|")]
        size = int(float(bits[0]) * 2)
        text = bits[1] if len(bits) > 1 else ""
        after, accent = 0, False
        for extra in bits[2:]:
            m = re.match(r"after\s*=\s*(\d+)", extra)
            if m:
                after = int(m.group(1))
            elif extra == "accent":
                accent = True
        out.append(para(text, P, center=True, before=0, after=after, sz=size,
                        bold=True, italic=True, accent=accent, keep_next=True))
    return "".join(out)


def contents(headings, P):
    """Table of contents generated from the document's own headings, so it can
    never drift from the chapters the way a hand-maintained list does."""
    t = P["toc"]
    out = [para("CONTENTS", P, sz=t["head_sz"], bold=True, after=240, keep_next=True,
                accent=True)]
    for level, text in headings:
        # An unnumbered chapter ("HOW TO USE THIS MANUAL") sits at part level in
        # the contents, as it does in the hand-set original.
        if level == 1 or (level == 2 and not re.match(r"^\d", text)):
            out.append(para(text, P, sz=t["part_sz"], bold=True, before=160, after=80,
                            keep_next=True, accent=True))
        elif level == 2:
            out.append(para(text, P, sz=t["entry_sz"], bold=True, before=0, after=40,
                            ind_left=t["entry_ind"]))
    return "".join(out)


def body_xml(md, P):
    header = None
    m = re.search(r"<!--\s*page-header:\s*(.+?)\s*-->", md)
    if m:
        header = m.group(1)
    tp = None
    m = re.search(r"<!--\s*titlepage\s*(.+?)-->", md, flags=re.S)
    if m:
        tp = m.group(1)
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)

    lines = md.split("\n")

    # Headings, collected first so [[contents]] can be built from them.
    headings = []
    for ln in lines:
        h = re.match(r"^(#{1,3})\s+(.*)$", ln.strip())
        if h:
            headings.append((len(h.group(1)), h.group(2).strip()))

    out, i = [], 0
    if tp:
        out.append(title_page(tp, P))
    seen_rule = False
    # A [[pagebreak]] marks the NEXT paragraph as starting a page, rather than
    # emitting a paragraph of its own; `emitted_at` is where that paragraph
    # landed, stamped on the following pass once we know it exists.
    pending_break, emitted_at = False, None

    while i < len(lines):
        if pending_break and emitted_at is not None and len(out) > emitted_at:
            out[emitted_at] = stamp_page_break(out[emitted_at])
            pending_break = False
        emitted_at = len(out)

        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            i += 1
            continue
        if stripped == "---":
            seen_rule = True
            i += 1
            continue
        if stripped == "[[pagebreak]]":
            pending_break = True
            i += 1
            continue
        if stripped == "[[left]]":
            i += 1
            continue
        if stripped == "[[contents]]":
            if P["toc"]:
                # In docs/source/ the contents sits on its own page: a break
                # before CONTENTS and another after the list. The markdown says
                # neither, so the generated manual ran the title page, the
                # contents and the disclaimer together.
                out.append(stamp_page_break(contents(headings, P)))
                pending_break, emitted_at = True, len(out)
            i += 1
            continue

        # Table
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
            r"^\|[-| :]+\|?$", lines[i + 1].strip()
        ):
            rows = [split_row(stripped)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            out.append(table(rows, P))
            # The originals close every table with an empty paragraph. Without
            # it whatever follows sits flush against the bottom border.
            out.append(para("", P, after=P["body_after"]))
            continue

        # Headings
        h = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if h:
            level, text = len(h.group(1)), h.group(2).strip()
            spec = P[f"h{level}"]
            center = spec.get("center", False) or (
                P["center_before_rule"] and not seen_rule
            )
            out.append(
                para(text, P, sz=spec["sz"], bold=True, keep_next=True,
                     before=spec["before"], after=spec["after"], center=center,
                     accent=spec.get("accent", False),
                     page_break_before=(level == 1 and P["h1_starts_page"]
                                        and (seen_rule or not P["center_before_rule"])))
            )
            i += 1
            continue

        # A wholly bold line inside the title block is a centered sub-title.
        if P["center_before_rule"] and not seen_rule and re.fullmatch(r"\*\*.+\*\*", stripped):
            # after=0 ran "(Member-Managed — Single Member / S Corporation)"
            # straight into "THIS OPERATING AGREEMENT"; it stays tight to the
            # heading above it (before=0) and breathes below.
            out.append(para(stripped, P, center=True, before=0, after=P["body_after"],
                            sz=P["h3"]["sz"], keep_next=True))
            i += 1
            continue

        # Set-off block
        if stripped.startswith("- ") is False and stripped.startswith("&gt; ") is False and stripped.startswith("> "):
            body = stripped[2:].strip()
            out.append(
                para(body, P, sz=P["small_sz"], after=80, keep_lines=True,
                     ind_left=P["quote_ind"], ind_right=P["quote_ind"],
                     keep_next=body.rstrip("*_ ").endswith(":"))
            )
            i += 1
            continue

        # Bullet
        if re.match(r"^[-*]\s+", stripped):
            out.append(
                para(re.sub(r"^[-*]\s+", "", stripped), P, numbered=True, after=80,
                     justify=True, keep_lines=True)
            )
            i += 1
            continue

        # Indented numbered item, and the manual's "[ ] " checklist lines
        if P["item_ind"] and (re.match(r"^\d+\.\s+", stripped) or stripped.startswith("[ ] ")):
            out.append(para(stripped, P, ind_left=P["item_ind"], after=80,
                            justify=True, keep_lines=True))
            i += 1
            continue

        # A paragraph that ends in a colon introduces the list, table, or block
        # that follows it. Left free it strands at the foot of a page with its
        # own content overleaf — "each Protected Series:" alone at the bottom,
        # the list on the next page. keepLines stops a paragraph splitting; only
        # keepNext holds it to what it introduces.
        out.append(
            para(
                stripped,
                P,
                justify=True,
                after=P["body_after"],
                # Strip emphasis markers first: a bold lead-in ends "**", not
                # ":", and those are the signature and exhibit headings most
                # likely to strand.
                keep_next=stripped.rstrip("*_ ").endswith(":"),
            )
        )
        i += 1

    # The last paragraph of the document is stamped here: the loop stamps on the
    # pass after the paragraph is emitted, and for the final one there is none.
    if pending_break and emitted_at is not None and len(out) > emitted_at:
        out[emitted_at] = stamp_page_break(out[emitted_at])

    sect = "<w:sectPr>"
    if header:
        sect += '<w:headerReference w:type="default" r:id="rIdHdr"/>'
    if P["footer_page_numbers"]:
        sect += '<w:footerReference w:type="default" r:id="rIdFtr"/>'
    sect += (
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"'
        ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return "".join(out) + sect, header


def styles_xml(P):
    heads = "".join(
        f'<w:style w:type="paragraph" w:styleId="Heading{n}">'
        f'<w:name w:val="heading {n}"/><w:basedOn w:val="Normal"/>'
        f'<w:pPr><w:keepNext/><w:keepLines/><w:widowControl/>'
        f'<w:spacing w:before="{P[f"h{n}"]["before"]}" w:after="{P[f"h{n}"]["after"]}"/></w:pPr>'
        f'<w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/><w:b/>'
        f'<w:sz w:val="{P[f"h{n}"]["sz"]}"/></w:rPr></w:style>'
        for n in (1, 2, 3)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:styles {NS}>"
        "<w:docDefaults><w:rPrDefault><w:rPr>"
        f'<w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}" w:cs="{P["font"]}"/>'
        f'<w:sz w:val="{P["body_sz"]}"/><w:szCs w:val="{P["body_sz"]}"/>'
        "</w:rPr></w:rPrDefault>"
        # Measured from docs/source/, which every original shares:
        #   <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
        # and NO keepLines. The 1.15 line spacing (276/240) is the house look and
        # was silently dropped when this generator took over; keepLines here made
        # every paragraph unsplittable, which is not widow control — it is what
        # pushes whole paragraphs onto the next page and leaves the ragged page
        # bottoms Adam found on 16 August. widowControl stays: Word defaults it
        # on, and stating it keeps a viewer that defaults it off honest.
        "<w:pPrDefault><w:pPr><w:widowControl/>"
        f'<w:spacing w:after="{P["default_after"]}" w:line="276" w:lineRule="auto"/>'
        '<w:jc w:val="both"/>'
        "</w:pPr></w:pPrDefault></w:docDefaults>"
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
        '<w:name w:val="Normal"/></w:style>'
        + heads
        + '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/>'
        '<w:basedOn w:val="Normal"/><w:pPr><w:keepLines/>'
        '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
        '<w:spacing w:after="80"/></w:pPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/>'
        '<w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>'
        '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>'
        "</w:styles>"
    )


NUMBERING = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f"<w:numbering {NS}>"
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'
    '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>'
    '<w:lvlText w:val="•"/><w:lvlJc w:val="left"/>'
    '<w:pPr><w:ind w:left="720" w:hanging="288"/></w:pPr>'
    '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>'
    "</w:lvl></w:abstractNum>"
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
    "</w:numbering>"
)


def footer_xml(P):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:ftr {NS}>"
        '<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>'
        f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
        '<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
        '<w:sz w:val="18"/></w:rPr>'
        '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
        f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
        '<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
        '<w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r>'
        f'<w:r><w:rPr><w:rFonts w:ascii="{P["font"]}" w:hAnsi="{P["font"]}"/>'
        '<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
        "</w:p></w:ftr>"
    )


SETTINGS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f"<w:settings {NS}>"
    "<w:zoom w:val=\"bestFit\"/>"
    '<w:defaultTabStop w:val="720"/>'
    "<w:autoHyphenation/><w:consecutiveHyphenLimit w:val=\"2\"/>"
    '<w:hyphenationZone w:val="288"/>'
    '<w:characterSpacingControl w:val="doNotCompress"/>'
    "<w:compat><w:compatSetting w:name=\"compatibilityMode\""
    ' w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
    "</w:settings>"
)


def build(md_path, docx_path, title=None):
    P = PROFILES[profile_for(md_path)]
    md = open(md_path).read()
    body, header = body_xml(md, P)

    parts = {
        "rIdStyles": ("styles", "styles.xml"),
        "rIdNum": ("numbering", "numbering.xml"),
        "rIdSettings": ("settings", "settings.xml"),
    }
    if header:
        parts["rIdHdr"] = ("header", "header1.xml")
    if P["footer_page_numbers"]:
        parts["rIdFtr"] = ("footer", "footer1.xml")

    base = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(
            f'<Relationship Id="{rid}" Type="{base}{kind}" Target="{target}"/>'
            for rid, (kind, target) in parts.items()
        )
        + "</Relationships>"
    )
    ct = "application/vnd.openxmlformats-officedocument.wordprocessingml."
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'<Override PartName="/word/document.xml" ContentType="{ct}document.main+xml"/>'
        + "".join(
            f'<Override PartName="/word/{target}" ContentType="{ct}{kind}+xml"/>'
            for kind, target in parts.values()
        )
        + "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{base}officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:document {NS} {RNS}><w:body>{body}</w:body></w:document>"
    )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles_xml(P))
        z.writestr("word/numbering.xml", NUMBERING)
        z.writestr("word/settings.xml", SETTINGS)
        z.writestr("word/_rels/document.xml.rels", rels)
        if header:
            z.writestr(
                "word/header1.xml",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f"<w:hdr {NS}>"
                f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
                f'{runs(header, P, sz=18)}</w:p></w:hdr>',
            )
        if P["footer_page_numbers"]:
            z.writestr("word/footer1.xml", footer_xml(P))

    # Only replace the target once the result is a readable archive holding a
    # non-trivial document — a failed generation must not truncate a real file.
    with zipfile.ZipFile(tmp.name) as z:
        if z.testzip() is not None or len(z.read("word/document.xml")) < 500:
            os.unlink(tmp.name)
            raise SystemExit(f"generated docx failed verification: {docx_path}")
    shutil.move(tmp.name, docx_path)
    os.chmod(docx_path, 0o644)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
